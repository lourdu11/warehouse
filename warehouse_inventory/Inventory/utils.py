"""
inventory/utils.py

Key changes vs original:
  1. assign_bin() — filters by zone_type matching product.category → Category.zone_type,
     falls back to zone_id assignment if explicit zone exists.
  2. generate_grn_item_barcode() — per-GRNItem barcode (Option B).
     generate_grn_barcode() retained for backward compat (GRN-level scan).
  3. check_reorder() — uses product.effective_reorder_point.
  4. update_product_reorder_level() — safety stock and daily sales configurable.
  5. generate_putaway_plans() — FIXED: removed `not item.barcode_image` guard so
     every GRNItem always gets its own barcode written, never skipped.
  6. All helpers guarded against zero division and missing data.
"""
import io
import math
import base64
import logging

from django.db.models import Sum, Count, Q, F
from django.db import transaction
from django.conf import settings
from django.core.mail import send_mail

from .models import Inventory, PurchaseRequest, PurchaseOrder, Bin, Batch
from rbac.utils import notify_role

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# CONSTANTS  (move to settings.py for production)
# ─────────────────────────────────────────────

AVERAGE_DAILY_SALES = 10    # base units/day — static fallback
SAFETY_STOCK        = 20    # base units

LEAD_TIME_WEIGHT  = 0.6
RECURRENCE_WEIGHT = 0.4
# PRs above this amount go to Finance Director for approval
APPROVAL_THRESHOLD = 5000

PACKAGE_SHELF_POSITION = {
    "POUCH": 3,   # top    — lightweight
    "BOX":   2,   # middle — medium
    "BAG":   1,   # bottom — heavy
}


# ─────────────────────────────────────────────
# GRN BARCODE — GENERATE & DECODE
# ─────────────────────────────────────────────

def _encode_barcode_to_base64(value: str) -> str:
    """
    Internal helper: encode any string as a Code128 barcode PNG → base64.
    Returns empty string on failure.
    """
    try:
        import barcode
        from barcode.writer import ImageWriter

        code   = barcode.get("code128", value, writer=ImageWriter())
        buffer = io.BytesIO()
        code.write(buffer, options={
            "module_width":  0.8,
            "module_height": 15.0,
            "font_size":     8,
            "text_distance": 3,
            "quiet_zone":    2,
            "write_text":    True,
        })
        buffer.seek(0)
        return base64.b64encode(buffer.read()).decode("utf-8")
    except Exception as exc:
        logger.error("[_encode_barcode_to_base64] Failed for '%s': %s", value, exc)
        return ""


def generate_grn_barcode(grn) -> str:
    """
    Encodes grn_id (e.g. "GRN-0012") as a Code128 barcode PNG → base64.
    Stored on GRN.barcode_image after QC approval.
    Backward-compat: kept as GRN-level scan entry point.
    """
    return _encode_barcode_to_base64(grn.grn_id)


def generate_grn_item_barcode(grn_item) -> str:
    """
    Encodes grn_item_id (e.g. "GRN-ITM-0023") as a Code128 barcode PNG → base64.
    Allows workers to scan individual line items directly.
    Stored on GRNItem.barcode_image after QC approval.
    """
    return _encode_barcode_to_base64(grn_item.grn_item_id)


def decode_grn_barcode(scanned_value: str) -> str:
    """
    Decodes a scanned barcode value.
    Accepts GRN-level ("GRN-XXXX"), item-level ("GRN-ITM-XXXX"),
    and plan-level ("PAP-XXXX") codes.
    Returns the raw ID string.
    """
    value = scanned_value.strip().upper()
    if value.startswith("GRN-ITM-") or value.startswith("GRN-") or value.startswith("PAP-"):
        return value
    raise ValueError(
        f"Invalid barcode '{scanned_value}'. "
        "Expected GRN-XXXX, GRN-ITM-XXXX, or PAP-XXXX format."
    )


# ─────────────────────────────────────────────
# VENDOR SCORING
# ─────────────────────────────────────────────

def score_vendors_for_product(product):
    """
    Scores all vendors who have previously supplied this product.

    Lead time: uses VendorAgreementProduct.lead_time if set,
               falls back to vendor.lead_time.
    Recurrence: count of approved POs for this vendor + product.

    Returns list of dicts sorted by score descending:
    [{ vendor, effective_lead_time, po_count, score }, ...]

    If no PO history: all VAP vendors sorted by lead_time ascending.
    """
    from vendors.models import Vendor, VendorAgreementProduct

    vendor_stats = (
        PurchaseOrder.objects
        .filter(pr__product=product, pr__status="Approved")
        .values("vendor")
        .annotate(po_count=Count("po_id"))
    )

    if not vendor_stats.exists():
        vaps = (
            VendorAgreementProduct.objects
            .filter(mapped_product=product)
            .select_related("vendor")
        )
        results = []
        for vap in vaps:
            lt    = vap.lead_time or vap.vendor.lead_time or 99
            score = round(1 / lt, 4) if lt else 0
            results.append({
                "vendor":              vap.vendor,
                "effective_lead_time": lt,
                "po_count":            0,
                "score":               score,
            })
        if not results:
            for v in Vendor.objects.filter(is_active=True).order_by("lead_time"):
                lt    = v.lead_time or 99
                score = round(1 / lt, 4) if lt else 0
                results.append({
                    "vendor":              v,
                    "effective_lead_time": lt,
                    "po_count":            0,
                    "score":               score,
                })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    vendor_ids   = [s["vendor"] for s in vendor_stats]
    po_count_map = {s["vendor"]: s["po_count"] for s in vendor_stats}

    vendors    = {v.vendor_id: v for v in Vendor.objects.filter(vendor_id__in=vendor_ids)}
    vap_lt_map = {
        vap.vendor_id: vap.lead_time
        for vap in VendorAgreementProduct.objects.filter(
            mapped_product=product, vendor_id__in=vendor_ids
        )
        if vap.lead_time
    }

    max_po     = max(po_count_map.values()) or 1
    lead_times = [
        vap_lt_map.get(vid) or vendors[vid].lead_time or 99
        for vid in vendor_ids
        if vid in vendors
    ]
    min_lt = min(lead_times) if lead_times else 1

    scored = []
    for vid in vendor_ids:
        v = vendors.get(vid)
        if not v:
            continue
        lt       = vap_lt_map.get(vid) or v.lead_time or 99
        po_count = po_count_map[vid]
        lt_score  = (min_lt / lt) if lt else 0
        rec_score = po_count / max_po
        score     = round(
            lt_score * LEAD_TIME_WEIGHT + rec_score * RECURRENCE_WEIGHT, 4
        )
        scored.append({
            "vendor":              v,
            "effective_lead_time": lt,
            "po_count":            po_count,
            "score":               score,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


def get_best_vendor(product, preferred_vendor_id=None):
    if preferred_vendor_id:
        from vendors.models import Vendor, VendorAgreement
        try:
            vendor = Vendor.objects.get(vendor_id=preferred_vendor_id)
            if VendorAgreement.objects.filter(vendor=vendor, products=product, status="Approved").exists():
                return {"vendor": vendor, "score": 1.0}
        except Vendor.DoesNotExist:
            pass
    scores = score_vendors_for_product(product)
    return scores[0] if scores else None

# ─────────────────────────────────────────────
# PR / PO HELPERS
# ─────────────────────────────────────────────

def send_po_email(po: PurchaseOrder) -> None:
    """Non-blocking PO notification email to vendor."""
    try:
        send_mail(
            subject=f"Purchase Order {po.po_id}",
            message=(
                f"Purchase Order : {po.po_id}\n"
                f"Product        : {po.pr.product.product_name}\n"
                f"Quantity       : {po.order_quantity} {po.pr.product.base_unit}s "
                f"({po.order_cartons} {po.pr.product.purchase_unit}s)\n"
                f"Total Amount   : ₹{po.total_amount}\n"
            ),
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[po.vendor.email],
            fail_silently=True,
        )
    except Exception:
        logger.exception("PO email failed for %s", po.po_id)


def create_po_from_pr(pr: PurchaseRequest) -> PurchaseOrder:
    """Create a PurchaseOrder from an approved PR inside an active atomic block."""
    return PurchaseOrder.objects.create(
        pr             = pr,
        vendor         = pr.vendor,
        order_cartons  = pr.requested_cartons,
        order_quantity = pr.requested_quantity,
        total_amount   = pr.total_amount,
    )


# ─────────────────────────────────────────────
# REORDER CHECK
# ─────────────────────────────────────────────

def check_reorder(product, preferred_vendor_id=None):
    """
    Called after every stock change (inbound confirm and outbound).
    Uses product.effective_reorder_point (admin re_order > calculated reorder_point > 0).
    If stock <= threshold and no Pending PR → auto-creates PR.
    Reorder qty = effective_reorder_point × 2 (base units), rounded up to full cartons.
    """
    threshold = product.effective_reorder_point
    if not threshold:
        logger.debug("check_reorder skipped for %s: no reorder point set.", product.product_id)
        return

    total_stock = (
        Inventory.objects.filter(product=product)
        .aggregate(total=Sum("quantity"))["total"] or 0
    )

    if total_stock > threshold:
        return

    # ── Duplicate Prevention ──
    # Skip if there is an active PR (Pending, Finance, or Approved) that hasn't been fulfilled.
    # A PR is "in-flight" if it has no GRNs OR at least one GRN that is not yet COMPLETED.
    active_pr_exists = PurchaseRequest.objects.filter(
        product=product,
        status__in=["Pending", "Finance Pending", "Approved"]
    ).filter(
        Q(grns__isnull=True) | ~Q(grns__status="COMPLETED")
    ).distinct().exists()

    if active_pr_exists:
        logger.info("Reorder skipped for %s — active PR or open PO already in-flight.", product.product_id)
        return

    best = get_best_vendor(product, preferred_vendor_id)
    if not best:
        logger.warning("Reorder skipped for %s — no vendor available.", product.product_id)
        return

    vendor       = best["vendor"]
    carton_size  = float(product.conversion_factor) or 1
    if carton_size <= 0:
        carton_size = 1

    reorder_base_units = threshold * 2
    reorder_cartons    = math.ceil(reorder_base_units / carton_size)
    final_base_units   = reorder_cartons * carton_size
    total_amount       = reorder_cartons * float(product.carton_price)

    # ── Automation Logic ──
    # Auto-generated PRs start as Pending and require manager approval
    final_status = "Pending"

    with transaction.atomic():
        pr = PurchaseRequest.objects.create(
            product            = product,
            vendor             = vendor,
            requested_cartons  = reorder_cartons,
            requested_quantity = int(final_base_units),
            total_amount       = total_amount,
            recommended_vendor = vendor,
            recommended_score  = best["score"],
            chosen_score       = best["score"],
            vendor_warning     = False,
            status             = final_status,
            is_auto_generated  = True,
            created_by         = None,
        )

        # ── Automated Notification ──
        # Notify the manager with a low stock alert redirecting to the PR detail page
        notify_role(
            sender=None,  # System generated
            recipient_role_name="manager",
            notification_type="inventory",
            title=f"Low Stock Alert: {product.product_name}",
            message=f"Stock ({total_stock}) is below threshold ({threshold}). Click to review and approve Auto-PR {pr.pr_id}.",
            redirect_url=f"/purchase-requests?view_pr={pr.pr_id}"
        )

    logger.info(
        "Auto-PR %s created for %s | vendor %s | stock=%s threshold=%s cartons=%s",
        pr.pr_id, product.product_id, vendor.vendor_id,
        total_stock, threshold, reorder_cartons,
    )


# ─────────────────────────────────────────────
# BIN ASSIGNMENT  (zone-type aware)
# ─────────────────────────────────────────────

def assign_bin(product, quantity_units: int, exclude_bin_ids: list[str] | None = None) -> Bin:
    """
    Finds the best available bin for putaway.

    Real-world logic:
      1. Zone resolution: Product-specific zone OR Category-specific zone_type.
      2. Consolidation: Prioritize bins already containing this product (if not full).
      3. Capacity: All three (units, weight, volume) must pass.
      4. Strategy: ABC=A (fast-moving) → Nearest to dispatch; Others → Deep/Back.
      5. Exclusion: Avoid bins already picked in this session/loop.
    """
    package_type = getattr(product, "package_type", None)
    required_pos = PACKAGE_SHELF_POSITION.get(package_type) if package_type else None
    abc_class    = getattr(product, "ABC", None)

    unit_weight  = product.weight_kg  or 0
    unit_volume  = product.volume_cm3 or 0

    bins = Bin.objects.select_related("shelf__rack__zone")

    if product.zone_id:
        bins = bins.filter(shelf__rack__zone_id=product.zone_id)
    else:
        zone_type = _resolve_zone_type_from_category(product.category)
        if zone_type:
            bins = bins.filter(shelf__rack__zone__zone_type=zone_type)
        else:
            raise ValueError(
                f"Product '{product.product_name}' (Category: '{product.category}') has no zone "
                "assigned and its category has no zone_type mapping in the Category master. "
                "Please assign a zone to the product or create a Category entry with a zone_type."
            )

    if required_pos:
        bins = bins.filter(shelf__position=required_pos)

    # Exclude bins already filled in this loop or specifically requested for exclusion
    if exclude_bin_ids:
        bins = bins.exclude(bin_id__in=exclude_bin_ids)

    # ── CAPACITY FILTERING ────────────────────────────────────────────────────
    unit_weight = product.weight_kg or 0
    unit_volume = product.volume_cm3 or 0
    
    # We filter for at least ONE unit of space here
    bins = bins.filter(
        current_load__lt=F("capacity")
    )
    if unit_weight > 0:
        bins = bins.filter(current_weight_kg__lte=F("max_weight_kg") - unit_weight)
    if unit_volume > 0:
        bins = bins.filter(used_volume_cm3__lte=F("volume_cm3") - unit_volume)

    # ── SCORING / PRIORITIZATION ──────────────────────────────────────────────
    # 1. Consolidation Score: 100 points if the product is already in the bin
    # 2. Distance Score: Closer bins get better scores (inverted distance)
    
    candidates = list(bins)
    if not candidates:
        raise ValueError(f"No suitable bin found for product {product.product_id} in its assigned zone.")

    def score_bin(b: Bin):
        score = 0
        # Consolidation check
        if Inventory.objects.filter(product=product, bin=b, quantity__gt=0).exists():
            score += 100
        
        # Distance (ABC aware)
        dist = b.distance_from_dispatch or 999
        if abc_class == "A":
            score += (1000 - dist) # Closer is better
        else:
            score += dist          # Farther is better (keep front bins for A-items)
        
        return score

    candidates.sort(key=score_bin, reverse=True)
    return candidates[0]


def _resolve_zone_type_from_category(category_name: str) -> str | None:
    """
    Looks up zone_type for a category name.
    Returns None if category_name is blank or not found in Category table.
    """
    if not category_name:
        return None
    try:
        from vendors.models import Category
        cat = Category.objects.filter(name=category_name.strip().lower()).first()
        return cat.zone_type if cat else None
    except Exception as exc:
        logger.warning("_resolve_zone_type_from_category error: %s", exc)
        return None


# ─────────────────────────────────────────────
# PUTAWAY PLAN GENERATION  ← FIXED
# ─────────────────────────────────────────────

def generate_putaway_plans(grn):
    """
    Called by QCApproveGRN.
    For each accepted GRNItem:
      1. Generates per-item barcode unconditionally (FIX: removed `not item.barcode_image`
         guard that caused only the first item to get a barcode).
      2. Runs assign_bin() — zone-type aware.
      3. Creates PutawayPlan rows (splits across bins if needed).

    Does NOT update Inventory or Bin loads — that happens only when worker
    confirms each plan row via ConfirmPutawayPlanView.

    Returns list of created PutawayPlan instances.
    Raises ValueError (from assign_bin) if no bin available.
    """
    from .models import PutawayPlan, GRNItem

    items = grn.items.filter(
        qc_status="Completed", accepted_quantity__gt=0
    ).select_related("product", "batch")

    created_plans = []

    with transaction.atomic():
        for item in items:
            # ── FIX: always generate and write barcode, no guard ──────────────
            item_barcode = generate_grn_item_barcode(item)
            if item_barcode:
                GRNItem.objects.filter(pk=item.pk).update(barcode_image=item_barcode)
                item.barcode_image = item_barcode   # keep in-memory instance in sync
            else:
                logger.warning(
                    "Barcode generation failed for GRNItem %s — proceeding without it.",
                    item.grn_item_id,
                )

            # ── Putaway plan rows ─────────────────────────────────────────────
            remaining = item.accepted_quantity
            used_bins = []

            while remaining > 0:
                try:
                    bin_obj = assign_bin(item.product, remaining, exclude_bin_ids=used_bins)
                except ValueError:
                    # If we can't find ANY more bins, we must stop and leave the rest
                    logger.error("Out of space for %s during plan generation.", item.product_id)
                    break

                unit_weight = item.product.weight_kg or 0
                unit_volume = item.product.volume_cm3 or 0

                # Calculate actual capacity considering our already planned but not yet confirmed units in this loop
                # (Since we haven't confirmed, Bin.available_units won't change yet)
                fit_units  = bin_obj.available_units
                fit_weight = int(bin_obj.available_weight_kg / unit_weight) if unit_weight else remaining
                fit_volume = int(bin_obj.available_volume_cm3 / unit_volume) if unit_volume else remaining
                
                plan_qty = min(remaining, fit_units, fit_weight, fit_volume)

                if plan_qty <= 0:
                    # This bin is reported as available but can't fit even one unit
                    used_bins.append(bin_obj.bin_id)
                    continue

                plan = PutawayPlan.objects.create(
                    grn_item         = item,
                    product          = item.product,
                    vendor           = grn.vendor,
                    batch            = item.batch,
                    bin              = bin_obj,
                    planned_quantity = plan_qty,
                    quantity_placed  = 0,
                    status           = "Pending",
                )
                created_plans.append(plan)
                remaining -= plan_qty
                
                # If this bin is now full (theoretically), exclude it from next iterations of this loop
                if plan_qty >= min(fit_units, fit_weight, fit_volume):
                    used_bins.append(bin_obj.bin_id)

            if remaining > 0:
                logger.warning("Spillover: %d units of %s could not be assigned to any bin.", remaining, item.product_id)

    return created_plans


# ─────────────────────────────────────────────
# BARCODE LOOKUP
# ─────────────────────────────────────────────

def lookup_product_by_barcode(barcode: str):
    """Returns the Product instance matching barcode, or None."""
    from products.models import Product
    if not barcode:
        return None
    barcode = str(barcode).strip()
    try:
        return Product.objects.select_related("zone", "vendor").get(barcode=barcode)
    except Product.DoesNotExist:
        return None


# ─────────────────────────────────────────────
# BATCH HELPER
# ─────────────────────────────────────────────

def get_or_create_batch(vendor, product, batch_number,
                         manufactured_date=None, expiry_date=None):
    """
    Gets or creates a Batch uniquely identified by (vendor, product, batch_number).
    Returns (batch, created).
    """
    return Batch.objects.get_or_create(
        vendor       = vendor,
        product      = product,
        batch_number = batch_number,
        defaults     = {
            "manufactured_date": manufactured_date,
            "expiry_date":       expiry_date,
        },
    )


# ─────────────────────────────────────────────
# REORDER POINT CALCULATION
# ─────────────────────────────────────────────

def get_weighted_avg_lead_time(product) -> float:
    """
    Weighted average lead time across all vendors who have supplied this product,
    weighted by number of approved POs.
    Falls back to simple average from VendorAgreementProduct if no PO history.
    Falls back to 7 days if no data at all.
    """
    from vendors.models import VendorAgreementProduct

    vendor_stats = (
        PurchaseOrder.objects
        .filter(pr__product=product, pr__status="Approved")
        .values("vendor")
        .annotate(po_count=Count("po_id"))
    )

    if not vendor_stats.exists():
        vaps = VendorAgreementProduct.objects.filter(mapped_product=product)
        lead_times = [
            vap.lead_time or vap.vendor.lead_time
            for vap in vaps.select_related("vendor")
            if (vap.lead_time or vap.vendor.lead_time)
        ]
        return (sum(lead_times) / len(lead_times)) if lead_times else 7.0

    total_weight = sum(v["po_count"] for v in vendor_stats)
    if not total_weight:
        return 7.0

    weighted_sum = 0
    for stat in vendor_stats:
        vendor_id = stat["vendor"]
        po_count  = stat["po_count"]
        vap = (
            VendorAgreementProduct.objects
            .filter(mapped_product=product, vendor_id=vendor_id)
            .select_related("vendor")
            .first()
        )
        if vap:
            lt = vap.lead_time or vap.vendor.lead_time or 7
        else:
            lt = 7
        weighted_sum += lt * po_count

    return weighted_sum / total_weight


def calculate_reorder_point(product) -> tuple[int, float]:
    """
    Returns (reorder_point, avg_lead_time).
    reorder_point = (avg_daily_sales × avg_lead_time) + safety_stock
    """
    avg_lead_time = get_weighted_avg_lead_time(product)
    reorder_point = int(
        (AVERAGE_DAILY_SALES * avg_lead_time) + SAFETY_STOCK
    )
    return reorder_point, avg_lead_time


def update_product_reorder_level(product):
    """
    Updates product.reorder_point, avg_lead_time, avg_daily_sales.
    Safe to call even if product has no zone assigned.
    Does NOT overwrite admin-set re_order — that is the manual floor.
    """
    try:
        reorder_point, avg_lead_time = calculate_reorder_point(product)
        product.reorder_point   = reorder_point
        product.avg_lead_time   = avg_lead_time
        product.avg_daily_sales = AVERAGE_DAILY_SALES
        product.save(update_fields=["reorder_point", "avg_lead_time", "avg_daily_sales"])
    except Exception as exc:
        logger.warning("update_product_reorder_level failed for %s: %s",
                       product.product_id, exc)