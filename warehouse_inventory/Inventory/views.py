"""
inventory/views.py

Full inbound flow:
  Supervisor creates GRN → scans barcodes → adds items
  QC fills accepted/rejected per item → approves GRN
  QCApproveGRN → generates PutawayPlans + per-item barcodes (no inventory change yet)
  Inventory manager scans GRN barcode → sees full putaway plan
  Worker confirms each plan row → Inventory updated + StockMovement logged
  When all plans confirmed → GRN marked COMPLETED

Fixes vs original:
  - GRNItemCreateSerializer imported and used in SupervisorAddGRNItem
  - GRNItemQCSerializer import corrected
  - ConfirmPutawayPlanView: grn_item FK look-up uses grn_item__grn (not grn_item.grn)
  - ReassignPutawayBinView: notes uses request.user.username with safe fallback
  - ManualCreatePRView: requested_cartons cast to int before arithmetic
  - ProductStockView: guards against zero conversion_factor
  - QCApproveGRN: GRN lookup uses .get() with explicit status, error messages improved
  - All views use IsAuthenticated consistently (no bare APIView without permission_classes)
  - PutawayPlanSerializer imported from correct location
  - GRNBarcodeDecodeView: accepts both GRN-level and GRN-ITM-level barcodes
  - All select_related chains verified against actual model FK paths
"""

import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from products.models import Product
from .models import (
    ASN,
    ASNItem,
    Batch,
    Bin,
    GRN,
    GRNItem,
    Inventory,
    PurchaseOrder,
    PurchaseRequest,
    PutawayPlan,
    Rack,
    Shelf,
    StockMovement,
    Zone,
)
from .serializers import (
    ASNItemSerializer,
    ASNSerializer,
    BatchSerializer,
    BinSerializer,
    GRNCreateSerializer,
    GRNItemCreateSerializer,
    GRNItemQCSerializer,
    GRNItemReadSerializer,
    GRNReadSerializer,
    InventorySerializer,
    PRManagerEditSerializer,
    PurchaseOrderSerializer,
    PurchaseRequestSerializer,
    PutawayPlanSerializer,
    RackSerializer,
    ShelfSerializer,
    StockMovementSerializer,
    ZoneSerializer,
)
from .utils import (
    assign_bin,
    check_reorder,
    decode_grn_barcode,
    generate_grn_barcode,
    generate_putaway_plans,
    get_or_create_batch,
    lookup_product_by_barcode,
    score_vendors_for_product,
    APPROVAL_THRESHOLD,
    create_po_from_pr,
    send_po_email,
)
from rbac.utils import notify_role

logger = logging.getLogger(__name__)

# ZONE
# ─────────────────────────────────────────────

class ListZoneView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        zones = Zone.objects.all()
        return Response(ZoneSerializer(zones, many=True).data)


class CreateZoneView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = ZoneSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response(s.data, status=status.HTTP_201_CREATED)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class GetZoneView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, zone_id):
        return Response(
            ZoneSerializer(get_object_or_404(Zone, zone_id=zone_id)).data
        )


class UpdateZoneView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, zone_id):
        zone = get_object_or_404(Zone, zone_id=zone_id)
        s = ZoneSerializer(zone, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response(s.data)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class DeleteZoneView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, zone_id):
        zone = get_object_or_404(Zone, zone_id=zone_id)
        if Inventory.objects.filter(bin__shelf__rack__zone=zone).exists():
            return Response(
                {"error": "Cannot delete zone with existing inventory."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        zone.delete()
        return Response({"message": "Zone deleted."})


# ─────────────────────────────────────────────
# RACK  (auto-creates shelves + bins on save)
# ─────────────────────────────────────────────

class ListRackView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        racks = Rack.objects.select_related("zone").all()
        return Response(RackSerializer(racks, many=True).data)


class CreateRackView(APIView):
    """
    POST /api/inventory/racks/create/

    Single call creates:
      - 1 Rack
      - shelf_count Shelves  (divided equally across positions 1/2/3)
      - shelf_count × bin_count_per_shelf Bins  (all share rack-level dims)

    shelf_count must be divisible by 3.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = RackSerializer(data=request.data)
        if s.is_valid():
            try:
                rack = s.save()
            except Exception as exc:
                return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            shelf_count = rack.shelves.count()
            bin_count   = Bin.objects.filter(shelf__rack=rack).count()

            return Response(
                {
                    "message":         "Rack created with shelves and bins.",
                    "rack_id":         rack.rack_id,
                    "zone_id":         rack.zone_id,
                    "shelves_created": shelf_count,
                    "bins_created":    bin_count,
                    "bin_dimensions": {
                        "capacity":      rack.bin_capacity,
                        "max_weight_kg": rack.bin_max_weight_kg,
                        "volume_cm3":    rack.bin_volume_cm3,
                    },
                    "distance_from_dispatch": rack.distance_from_dispatch,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class GetRackView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, rack_id):
        rack = get_object_or_404(Rack.objects.select_related("zone"), rack_id=rack_id)
        data = RackSerializer(rack).data
        data["shelf_count_actual"]  = rack.shelves.count()
        data["bin_count_total"]     = Bin.objects.filter(shelf__rack=rack).count()
        data["bin_count_available"] = Bin.objects.filter(
            shelf__rack=rack, current_load__lt=F("capacity")
        ).count()
        return Response(data)


class UpdateRackView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, rack_id):
        rack = get_object_or_404(Rack, rack_id=rack_id)
        s = RackSerializer(rack, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response(s.data)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class DeleteRackView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, rack_id):
        rack = get_object_or_404(Rack, rack_id=rack_id)
        if Inventory.objects.filter(bin__shelf__rack=rack).exists():
            return Response(
                {"error": "Cannot delete rack with existing inventory."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rack.delete()
        return Response({"message": "Rack and all its shelves/bins deleted."})


# ─────────────────────────────────────────────
# SHELF  (read-only — auto-created by rack)
# ─────────────────────────────────────────────

class ListShelfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        shelves = Shelf.objects.select_related("rack__zone").all()
        return Response(ShelfSerializer(shelves, many=True).data)


class GetShelfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, shelf_id):
        shelf = get_object_or_404(
            Shelf.objects.select_related("rack__zone"), shelf_id=shelf_id
        )
        return Response(ShelfSerializer(shelf).data)


# ─────────────────────────────────────────────
# BIN  (read + availability — auto-created by rack)
# ─────────────────────────────────────────────

class ListBinView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        bins = Bin.objects.select_related("shelf__rack__zone").all()
        return Response(BinSerializer(bins, many=True).data)


class GetBinView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, bin_id):
        b = get_object_or_404(
            Bin.objects.select_related("shelf__rack__zone"), bin_id=bin_id
        )
        return Response(BinSerializer(b).data)


class ListAvailableBinsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        bins = Bin.objects.select_related("shelf__rack__zone").filter(
            current_load__lt=F("capacity")
        )
        return Response(BinSerializer(bins, many=True).data)


class BinContentsView(APIView):
    """GET /api/inventory/bins/<bin_id>/contents/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, bin_id):
        b = get_object_or_404(
            Bin.objects.select_related("shelf__rack__zone"), bin_id=bin_id
        )
        inventories = Inventory.objects.filter(bin=b).select_related(
            "product", "vendor", "batch"
        )
        return Response(
            {
                "bin_id":                 b.bin_id,
                "shelf_id":               b.shelf.shelf_id,
                "rack_id":                b.shelf.rack.rack_id,
                "zone_id":                b.shelf.rack.zone.zone_id,
                "zone_type":              b.shelf.rack.zone.zone_type,
                "capacity":               b.capacity,
                "current_load":           b.current_load,
                "available_units":        b.available_units,
                "max_weight_kg":          b.max_weight_kg,
                "current_weight_kg":      b.current_weight_kg,
                "available_weight_kg":    b.available_weight_kg,
                "volume_cm3":             b.volume_cm3,
                "used_volume_cm3":        b.used_volume_cm3,
                "available_volume_cm3":   b.available_volume_cm3,
                "distance_from_dispatch": b.distance_from_dispatch,
                "contents": [
                    {
                        "inventory_id": inv.inventory_id,
                        "product_id":   inv.product_id,
                        "product_name": inv.product.product_name,
                        "size":         inv.product.size,
                        "barcode":      inv.product.barcode,
                        "vendor_id":    inv.vendor_id,
                        "vendor_name":  inv.vendor.vendor_name,
                        "batch_id":     inv.batch_id,
                        "batch_number": inv.batch.batch_number,
                        "mfg_date":     str(inv.batch.manufactured_date or ""),
                        "expiry_date":  str(inv.batch.expiry_date or ""),
                        "quantity":     inv.quantity,
                        "abc":          inv.product.ABC,
                        "xyz":          inv.product.XYZ,
                        "ved":          inv.product.VED,
                    }
                    for inv in inventories
                ],
            }
        )


# ─────────────────────────────────────────────
# BATCH
# ─────────────────────────────────────────────

class BatchListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        batches = Batch.objects.select_related("vendor", "product").all()
        return Response(BatchSerializer(batches, many=True).data)


class BatchDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        batch = get_object_or_404(
            Batch.objects.select_related("vendor", "product"), batch_id=batch_id
        )
        return Response(BatchSerializer(batch).data)


class BatchLookupView(APIView):
    """GET /api/inventory/batches/lookup/?vendor_id=&product_id=&batch_number="""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        vid = request.query_params.get("vendor_id")
        pid = request.query_params.get("product_id")
        bn  = request.query_params.get("batch_number")

        if not all([vid, pid, bn]):
            return Response(
                {"error": "vendor_id, product_id, and batch_number are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            batch = Batch.objects.select_related("vendor", "product").get(
                vendor_id=vid, product_id=pid, batch_number=bn
            )
        except Batch.DoesNotExist:
            return Response({"error": "Batch not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(BatchSerializer(batch).data)


# ─────────────────────────────────────────────
# INVENTORY
# ─────────────────────────────────────────────

class ListInventoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        inv = Inventory.objects.select_related(
            "product", "vendor", "batch", "bin__shelf__rack__zone"
        ).all()
        return Response(InventorySerializer(inv, many=True).data)


class GetInventoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, inventory_id):
        inv = get_object_or_404(
            Inventory.objects.select_related(
                "product", "vendor", "batch", "bin__shelf__rack__zone"
            ),
            inventory_id=inventory_id,
        )
        return Response(InventorySerializer(inv).data)


class ProductStockView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id):
        from products.models import Product

        p = get_object_or_404(Product, product_id=product_id)
        total = (
            Inventory.objects.filter(product_id=product_id)
            .aggregate(total=Sum("quantity"))["total"]
            or 0
        )
        # Guard against zero conversion_factor (should never happen, but be safe)
        carton_size = float(p.conversion_factor) if float(p.conversion_factor) > 0 else 1
        return Response(
            {
                "product_id":    product_id,
                "product_name":  p.product_name,
                "size":          p.size,
                "total_stock":   total,
                "base_unit":     p.base_unit,
                "in_cartons":    round(total / carton_size, 2),
                "purchase_unit": p.purchase_unit,
                "abc":           p.ABC,
                "xyz":           p.XYZ,
                "ved":           p.VED,
                "reorder_point": p.effective_reorder_point,
            }
        )


class ProductStockByVendorView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id):
        inventories = (
            Inventory.objects.filter(product_id=product_id)
            .select_related("vendor", "batch", "bin__shelf__rack__zone")
            .order_by("vendor__vendor_name", "batch__batch_number")
        )

        vendor_map: dict = {}
        for inv in inventories:
            vid = inv.vendor_id
            if vid not in vendor_map:
                vendor_map[vid] = {
                    "vendor_id":   vid,
                    "vendor_name": inv.vendor.vendor_name,
                    "total_qty":   0,
                    "batches":     {},
                }
            vm = vendor_map[vid]
            vm["total_qty"] += inv.quantity

            bid = inv.batch_id
            if bid not in vm["batches"]:
                vm["batches"][bid] = {
                    "batch_id":          bid,
                    "batch_number":      inv.batch.batch_number,
                    "manufactured_date": str(inv.batch.manufactured_date or ""),
                    "expiry_date":       str(inv.batch.expiry_date or ""),
                    "total_qty":         0,
                    "bins":              [],
                }
            bm = vm["batches"][bid]
            bm["total_qty"] += inv.quantity
            bm["bins"].append(
                {
                    "bin_id":   inv.bin.bin_id,
                    "shelf_id": inv.bin.shelf.shelf_id,
                    "rack_id":  inv.bin.shelf.rack.rack_id,
                    "zone_id":  inv.bin.shelf.rack.zone.zone_id,
                    "quantity": inv.quantity,
                }
            )

        result = []
        for vm in vendor_map.values():
            vm["batches"] = list(vm["batches"].values())
            result.append(vm)

        return Response(
            {
                "product_id":  product_id,
                "total_stock": sum(v["total_qty"] for v in result),
                "by_vendor":   result,
            }
        )


class CrossVendorPurchaseView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id):
        from products.models import Product

        p = get_object_or_404(Product, product_id=product_id)

        po_stats = (
            PurchaseOrder.objects.filter(
                pr__product_id=product_id, pr__status="Approved"
            )
            .values("vendor", "vendor__vendor_name")
            .annotate(
                po_count      = Count("po_id"),
                total_ordered = Sum("order_quantity"),
                total_cartons = Sum("order_cartons"),
                total_spend   = Sum("total_amount"),
            )
            .order_by("-po_count")
        )

        result = []
        for stat in po_stats:
            grn_accepted = (
                GRNItem.objects.filter(
                    grn__vendor_id=stat["vendor"],
                    product_id=product_id,
                    qc_status="Completed",
                ).aggregate(total=Sum("accepted_quantity"))["total"]
                or 0
            )
            result.append(
                {
                    "vendor_id":     stat["vendor"],
                    "vendor_name":   stat["vendor__vendor_name"],
                    "po_count":      stat["po_count"],
                    "total_ordered": stat["total_ordered"],
                    "total_cartons": stat["total_cartons"],
                    "total_spend":   str(stat["total_spend"]),
                    "grn_accepted":  grn_accepted,
                    "base_unit":     p.base_unit,
                    "purchase_unit": p.purchase_unit,
                }
            )

        return Response({"product_id": product_id, "vendors": result})


class RemoveStockByProductView(APIView):
    """
    POST /api/inventory/product/<product_id>/remove-stock/
    Body: { "quantity": <int in base units> }
    Picks from nearest bin first. Triggers reorder check.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, product_id):
        try:
            qty = int(request.data.get("quantity"))
        except (TypeError, ValueError):
            return Response(
                {"error": "quantity must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if qty <= 0:
            return Response(
                {"error": "Quantity must be > 0."}, status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            inventories = list(
                Inventory.objects.select_for_update()
                .select_related("product", "vendor", "batch", "bin")
                .filter(product_id=product_id, quantity__gt=0)
                .order_by("bin__distance_from_dispatch", "bin__pick_count")
            )
            if not inventories:
                return Response(
                    {"error": "No stock found."}, status=status.HTTP_404_NOT_FOUND
                )

            total = sum(inv.quantity for inv in inventories)
            if qty > total:
                return Response(
                    {"error": f"Requested {qty}, available {total}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            remaining   = qty
            product     = None
            picked_bins = []

            for inv in inventories:
                if remaining <= 0:
                    break
                if product is None:
                    product = inv.product

                deduct   = min(inv.quantity, remaining)
                prev_qty = inv.quantity
                inv.quantity -= deduct
                inv.save()

                b = inv.bin
                b.current_load      -= deduct
                b.current_weight_kg  = max(
                    0.0, b.current_weight_kg - deduct * (inv.product.weight_kg or 0)
                )
                b.used_volume_cm3    = max(
                    0.0, b.used_volume_cm3 - deduct * (inv.product.volume_cm3 or 0)
                )
                b.pick_count        += 1
                b.last_picked_at     = timezone.now()
                b.save()

                StockMovement.objects.create(
                    product        = inv.product,
                    vendor         = inv.vendor,
                    batch          = inv.batch,
                    bin            = b,
                    movement_type  = "OUTBOUND",
                    quantity       = deduct,
                    previous_stock = prev_qty,
                    new_stock      = inv.quantity,
                )
                picked_bins.append(
                    {
                        "bin_id":          b.bin_id,
                        "vendor_name":     inv.vendor.vendor_name,
                        "batch_number":    inv.batch.batch_number,
                        "picked_quantity": deduct,
                    }
                )
                remaining -= deduct

        if product:
            check_reorder(product)

        return Response(
            {
                "message":          "Stock removed.",
                "removed_quantity": qty,
                "picked_from":      picked_bins,
            }
        )


class StockMovementListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        movements = (
            StockMovement.objects.select_related("product", "vendor", "batch", "bin")
            .order_by("-created_at")[:100]
        )
        return Response(StockMovementSerializer(movements, many=True).data)


class StockMovementByProductView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id):
        movements = (
            StockMovement.objects.filter(product_id=product_id)
            .select_related("vendor", "batch", "bin")
            .order_by("-created_at")
        )
        return Response(StockMovementSerializer(movements, many=True).data)


# ─────────────────────────────────────────────
# VENDOR SCORING
# ─────────────────────────────────────────────

class VendorScoreView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id):
        from products.models import Product

        product = get_object_or_404(Product, product_id=product_id)
        scores  = score_vendors_for_product(product)
        return Response(
            {
                "product_id": product_id,
                "scores": [
                    {
                        "vendor_id":           s["vendor"].vendor_id,
                        "vendor_name":         s["vendor"].vendor_name,
                        "effective_lead_time": s["effective_lead_time"],
                        "po_count":            s["po_count"],
                        "score":               s["score"],
                    }
                    for s in scores
                ],
            }
        )


# ─────────────────────────────────────────────
# PURCHASE REQUEST
# ─────────────────────────────────────────────

class ManualCreatePRView(APIView):
    """
    POST /api/inventory/purchase-request/manual/
    Body: { "product_id": "PRO001", "vendor_id": "VEN001", "requested_cartons": 10 }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from products.models import Product

        product_id = request.data.get("product_id")
        cartons    = request.data.get("requested_cartons")
        vendor_id  = request.data.get("vendor_id")

        if not all([product_id, cartons, vendor_id]):
            return Response(
                {"error": "product_id, vendor_id, and requested_cartons are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            cartons = int(cartons)
        except (TypeError, ValueError):
            return Response(
                {"error": "requested_cartons must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if cartons <= 0:
            return Response(
                {"error": "requested_cartons must be > 0."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product = get_object_or_404(Product, product_id=product_id)

        carton_size        = float(product.conversion_factor) if float(product.conversion_factor) > 0 else 1
        requested_quantity = int(cartons * carton_size)
        total_amount       = cartons * float(product.carton_price)

        # Manual PRs skip the "Manager Review" step because the creator 
        # (Supervisor/Manager) already selected the vendor and quantity.
        final_status = "Finance Pending"

        pr = PurchaseRequest.objects.create(
            product            = product,
            vendor_id          = vendor_id,
            requested_cartons  = cartons,
            requested_quantity = requested_quantity,
            total_amount       = total_amount,
            status             = final_status,
            is_auto_generated  = False,
            created_by         = request.user,
        )

        po = None

        # ── Automated Notification ──
        notify_role(
            sender=request.user,
            recipient_role_name="manager",
            notification_type="approval",
            title=f"New Purchase Request: {pr.pr_id}",
            message=f"Product: {product.product_name} | Qty: {cartons} cartons | Amount: ₹{pr.total_amount}",
            redirect_url="/purchase-requests"
        )
        notify_role(
            sender=request.user,
            recipient_role_name="finance_director",
            notification_type="approval",
            title=f"PR Awaiting Finance Review: {pr.pr_id}",
            message=f"Amount: ₹{pr.total_amount}. Awaiting your approval.",
            redirect_url="/purchase-requests"
        )

        return Response(
            {"message": "Manual PR created.", "pr_id": pr.pr_id},
            status=status.HTTP_201_CREATED,
        )


class PurchaseRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PurchaseRequest.objects.select_related(
            "product", "vendor", "recommended_vendor", "created_by"
        ).order_by("-created_at")

        # Exclude auto-generated PRs that are still Pending
        qs = qs.exclude(is_auto_generated=True, status="Pending")

        # Optional filters
        if s := request.query_params.get("status"):
            qs = qs.filter(status=s)
        if vid := request.query_params.get("vendor_id"):
            qs = qs.filter(vendor__vendor_id=vid)

        return Response(PurchaseRequestSerializer(qs, many=True).data)


class PurchaseRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pr_id):
        pr = get_object_or_404(
            PurchaseRequest.objects.select_related(
                "product", "vendor", "recommended_vendor", "created_by"
            ),
            pr_id=pr_id,
        )
        data   = PurchaseRequestSerializer(pr).data
        scores = score_vendors_for_product(pr.product)
        data["vendor_scores"] = [
            {
                "vendor_id":           s["vendor"].vendor_id,
                "vendor_name":         s["vendor"].vendor_name,
                "effective_lead_time": s["effective_lead_time"],
                "po_count":            s["po_count"],
                "score":               s["score"],
            }
            for s in scores
        ]
        return Response(data)


class ManagerApprovePR(APIView):
    """
    POST /api/inventory/purchase-requests/<pr_id>/manager-approve/

    Manager can change vendor and/or requested_cartons before approving.
    If total_amount > APPROVAL_THRESHOLD → routed to Finance.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pr_id):
        with transaction.atomic():
            try:
                pr = (
                    PurchaseRequest.objects.select_for_update()
                    .select_related("product", "vendor", "recommended_vendor")
                    .get(pr_id=pr_id)
                )
            except PurchaseRequest.DoesNotExist:
                return Response(
                    {"error": "PR not found."}, status=status.HTTP_404_NOT_FOUND
                )

            if pr.status != "Pending":
                return Response(
                    {"error": f"PR cannot be approved — current status is '{pr.status}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            edit_s = PRManagerEditSerializer(pr, data=request.data, partial=True)
            if not edit_s.is_valid():
                return Response(edit_s.errors, status=status.HTTP_400_BAD_REQUEST)

            edited = edit_s.validated_data

            # Delete low-stock alert notification for this PR
            from rbac.models import Notification
            Notification.objects.filter(
                redirect_url=f"/purchase-requests?view_pr={pr.pr_id}",
                notification_type="inventory"
            ).delete()

            if "vendor" in edited:
                new_vendor = edited["vendor"]
                scores     = score_vendors_for_product(pr.product)
                score_map  = {s["vendor"].vendor_id: s["score"] for s in scores}
                new_score  = score_map.get(new_vendor.vendor_id, 0)
                rec_score  = score_map.get(
                    pr.recommended_vendor.vendor_id if pr.recommended_vendor else None, 0
                )
                pr.vendor         = new_vendor
                pr.chosen_score   = new_score
                pr.vendor_warning = new_score < rec_score

            if "requested_cartons" in edited:
                pr.requested_cartons  = edited["requested_cartons"]
                carton_size           = float(pr.product.conversion_factor) if float(pr.product.conversion_factor) > 0 else 1
                pr.requested_quantity = int(pr.requested_cartons * carton_size)

            pr.total_amount = pr.requested_cartons * float(pr.product.carton_price)

            pr.status = "Finance Pending"
            pr.save()

            # ── Automated Notification ──
            notify_role(
                sender=request.user,
                recipient_role_name="finance_director",
                notification_type="approval",
                title=f"Approval Required: {pr.pr_id}",
                message=f"Finance Director approval required. Amount: ₹{pr.total_amount}",
                redirect_url="/purchase-requests"
            )

            return Response(
                {
                    "message":        "PR routed to Finance Director for approval.",
                    "pr_id":          pr.pr_id,
                    "status":         pr.status,
                    "total_amount":   str(pr.total_amount),
                    "vendor_warning": pr.vendor_warning,
                }
            )


class ManagerRejectPR(APIView):
    """
    POST /api/inventory/purchase-requests/<pr_id>/manager-reject/
    Body: { "reason": "<optional rejection reason>" }

    Manager rejects a Pending PR. Status → Rejected.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pr_id):
        try:
            pr = PurchaseRequest.objects.select_for_update().get(pr_id=pr_id)
        except PurchaseRequest.DoesNotExist:
            return Response({"error": "PR not found."}, status=status.HTTP_404_NOT_FOUND)

        if pr.status != "Pending":
            return Response(
                {"error": f"Only Pending PRs can be rejected by the manager (current: '{pr.status}')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "")
        with transaction.atomic():
            pr.status = "Rejected"
            if reason:
                pr.notes = reason
            pr.save()

            # Delete low-stock alert notification for this PR
            from rbac.models import Notification
            Notification.objects.filter(
                redirect_url=f"/purchase-requests?view_pr={pr.pr_id}",
                notification_type="inventory"
            ).delete()

        return Response(
            {
                "message": "Purchase request rejected.",
                "pr_id":   pr.pr_id,
                "status":  pr.status,
                "reason":  reason,
            }
        )


class FinanceApprovePR(APIView):

    """
    POST /api/inventory/purchase-requests/<pr_id>/finance-approve/
    Body: { "action": "approve" | "reject" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pr_id):
        action = request.data.get("action")
        if action not in ("approve", "reject"):
            return Response(
                {"error": "action must be 'approve' or 'reject'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                pr = (
                    PurchaseRequest.objects.select_for_update()
                    .select_related("product", "vendor")
                    .get(pr_id=pr_id)
                )
            except PurchaseRequest.DoesNotExist:
                return Response(
                    {"error": "PR not found."}, status=status.HTTP_404_NOT_FOUND
                )

            if pr.status != "Finance Pending":
                return Response(
                    {
                        "error": (
                            f"PR is not awaiting finance approval "
                            f"(current status: '{pr.status}')."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if action == "reject":
                pr.status = "Rejected"
                pr.save()
                return Response({"message": "PR rejected.", "pr_id": pr.pr_id, "status": pr.status})

            pr.status = "Approved"
            pr.save()
            po = create_po_from_pr(pr)
            send_po_email(po)

            # ── Automated Notification ──
            notify_role(
                sender=request.user,
                recipient_role_name="manager",
                notification_type="update",
                title=f"PR Approved by Finance: {pr.pr_id}",
                message=f"High-value PR for {pr.product.product_name} has been approved.",
                redirect_url="/purchase-requests"
            )
            notify_role(
                sender=request.user,
                recipient_role_name="inventory_manager",
                notification_type="task",
                title=f"PO Created: {po.po_id}",
                message=f"Finance approved PR. PO {po.po_id} generated for {po.pr.product.product_name}.",
                redirect_url="/purchase-orders"
            )
            notify_role(
                sender=request.user,
                recipient_role_name="supervisor",
                notification_type="task",
                title=f"Create ASN for PO: {po.po_id}",
                message=f"PO {po.po_id} (Finance Approved) is ready. Please coordinate with the vendor to create the ASN.",
                redirect_url="/asn"
            )

        send_po_email(po)
        return Response(
            {"message": "Finance approved — PO created.", "pr_id": pr.pr_id, "po_id": po.po_id}
        )


# ─────────────────────────────────────────────
# PURCHASE ORDER
# ─────────────────────────────────────────────

class PurchaseOrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pos = PurchaseOrder.objects.select_related(
            "pr__product", "vendor"
        ).order_by("-created_at")
        return Response(PurchaseOrderSerializer(pos, many=True).data)


class PurchaseOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, po_id):
        po = get_object_or_404(
            PurchaseOrder.objects.select_related("pr__product", "vendor"), po_id=po_id
        )
        return Response(PurchaseOrderSerializer(po).data)


# ─────────────────────────────────────────────
# ASN
# ─────────────────────────────────────────────

class ASNCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = ASNSerializer(data=request.data)
        if s.is_valid():
            asn = s.save()

            # ── Automated Notification ──
            notify_role(
                sender=request.user,
                recipient_role_name="supervisor",
                notification_type="inventory",
                title=f"New ASN: {asn.asn_id}",
                message=f"Shipment from {asn.vendor.vendor_name} expected on {asn.expected_arrival_date}.",
                redirect_url="/asn"
            )
            return Response(
                {"message": "ASN created.", "asn_id": asn.asn_id, "data": s.data},
                status=status.HTTP_201_CREATED,
            )
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class ASNListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        asns = ASN.objects.select_related("po", "vendor").prefetch_related("grns").all()
        return Response(ASNSerializer(asns, many=True).data)


class ASNDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        asn = get_object_or_404(ASN.objects.select_related("po", "vendor"), asn_id=pk)
        return Response(ASNSerializer(asn).data)


class CreateASNItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Accept single or list
        many = isinstance(request.data, list)
        s = ASNItemSerializer(data=request.data, many=many)
        if s.is_valid():
            s.save()
            return Response(
                {"message": "ASN item(s) created.", "data": s.data},
                status=status.HTTP_201_CREATED,
            )
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class ASNItemListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = ASNItem.objects.select_related("asn", "product").all()
        return Response(ASNItemSerializer(items, many=True).data)


class ASNItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        item = get_object_or_404(ASNItem, asn_item_id=pk)
        return Response(ASNItemSerializer(item).data)


# ─────────────────────────────────────────────
# GRN — SUPERVISOR
# ─────────────────────────────────────────────

class SupervisorCreateGRN(APIView):
    """
    POST /api/inventory/grn/supervisor/create/

    Body: { "po": "PO0001", "grn_number": "GRN-EXT-001",
            "receipt_date": "2024-01-15", "asn": "ASN0001" (optional) }
    Vendor info is auto-populated from the PO.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = GRNCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)

        po     = s.validated_data["po"]
        vendor = po.vendor
        grn    = s.save(
            pr           = po.pr,
            received_by  = request.user,
            status       = "QC_PENDING",
            vendor       = vendor,
            vendor_name  = vendor.vendor_name,
            vendor_gstin = getattr(vendor, "gstin", "") or "",
        )

        # ── Automated Notification ──
        notify_role(
            sender=request.user,
            recipient_role_name="quality_assistant",
            notification_type="quality",
            title=f"QC Pending: {grn.grn_id}",
            message=f"GRN received from {grn.vendor_name}. Inspection required.",
            redirect_url="/quality-check"
        )
        notify_role(
            sender=request.user,
            recipient_role_name="inventory_manager",
            notification_type="inventory",
            title=f"New Arrival: {grn.grn_id}",
            message=f"Shipment from {grn.vendor_name} has arrived. Awaiting QC before scanning for putaway.",
            redirect_url="/dashboard"
        )
        return Response(
            {"message": "GRN created.", "grn_id": grn.grn_id},
            status=status.HTTP_201_CREATED,
        )


class SupervisorScanBarcodeView(APIView):
    """
    GET /api/inventory/grn/<grn_id>/scan/?barcode=<barcode>
    Returns product details + expected quantity from ASN (if present).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, grn_id):
        barcode = request.query_params.get("barcode")
        if not barcode:
            return Response(
                {"error": "barcode query param is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(f"Scan attempt: GRN={grn_id}, Barcode={barcode}")

        # 1. Validate GRN exists
        grn = get_object_or_404(GRN, grn_id=grn_id)

        # 2. Lookup product
        product = lookup_product_by_barcode(barcode)
        if not product:
            logger.warning(f"Scan failed: Product not found for barcode '{barcode}'")
            return Response(
                {"error": f"No product found for barcode '{barcode}'."},
                status=status.HTTP_404_NOT_FOUND,
            )

        expected_qty = 0
        if grn.asn:
            asn_item = ASNItem.objects.filter(asn=grn.asn, product=product).first()
            if asn_item:
                expected_qty = asn_item.shipped_quantity

        return Response(
            {
                "product_id":            product.product_id,
                "product_name":          product.product_name,
                "size":                  product.size,
                "barcode":               product.barcode,
                "package_type":          product.package_type,
                "base_unit":             product.base_unit,
                "purchase_unit":         product.purchase_unit,
                "conversion_factor":     float(product.conversion_factor),
                "carton_price":          float(product.carton_price),
                "weight_kg":             product.weight_kg,
                "length_cm":             product.length_cm,
                "width_cm":              product.width_cm,
                "height_cm":             product.height_cm,
                "abc":                   product.ABC,
                "xyz":                   product.XYZ,
                "ved":                   product.VED,
                "expected_qty_from_asn": expected_qty,
                "already_added": GRNItem.objects.filter(
                    grn=grn, product=product
                ).exists(),
            },
            status=status.HTTP_200_OK
        )


class SupervisorAddGRNItem(APIView):
    """
    POST /api/inventory/grn/<grn_id>/add-item/

    Body:
        barcode           : product barcode (scanned from carton)
        batch_number      : from carton label
        received_cartons  : number of cartons counted off the truck
        manufactured_date : (optional)
        expiry_date       : (optional)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, grn_id):
        logger.info(f"Add GRN Item attempt: GRN={grn_id}, Data={request.data}")
        try:
            with transaction.atomic():
                # 1. Validate GRN
                grn = get_object_or_404(GRN, grn_id=grn_id)
                if grn.status not in ("RECEIVED", "QC_PENDING"):
                    return Response(
                        {"error": "Cannot add items to a GRN that is not in RECEIVED or QC_PENDING status."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                barcode          = (request.data.get("barcode") or "").strip()
                batch_number     = (request.data.get("batch_number") or "").strip()
                received_cartons = request.data.get("received_cartons")
                mfg_date         = request.data.get("manufactured_date") or None
                exp_date         = request.data.get("expiry_date") or None

                if mfg_date == "": mfg_date = None
                if exp_date == "": exp_date = None

                if not all([barcode, batch_number, received_cartons]):
                    return Response(
                        {"error": "barcode, batch_number, and received_cartons are required."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                try:
                    received_cartons = int(received_cartons)
                except (TypeError, ValueError):
                    return Response(
                        {"error": "received_cartons must be an integer."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if received_cartons <= 0:
                    return Response(
                        {"error": "received_cartons must be > 0."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # 2. Lookup product
                product = lookup_product_by_barcode(barcode)
                if not product:
                    return Response(
                        {"error": f"No product found for barcode '{barcode}'."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                # 3. Prevent Duplicate Creation
                if GRNItem.objects.filter(grn=grn, product=product).exists():
                    return Response(
                        {"error": f"Product '{product.product_name}' has already been added to this GRN."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # 4. Get/Create Batch
                batch, created = get_or_create_batch(
                    vendor            = grn.vendor,
                    product           = product,
                    batch_number      = batch_number,
                    manufactured_date = mfg_date,
                    expiry_date       = exp_date,
                )

                carton_size       = float(product.conversion_factor) if float(product.conversion_factor) > 0 else 1
                received_quantity = int(received_cartons * carton_size)

                # 5. Calculate prices
                cf = float(product.conversion_factor) if product.conversion_factor else 1
                unit_price = round(float(product.carton_price) / cf, 4) if cf > 0 else float(product.carton_price)

                # 6. Create GRN Item
                grn_item = GRNItem.objects.create(
                    grn                        = grn,
                    product                    = product,
                    batch                      = batch,
                    received_cartons           = received_cartons,
                    received_quantity          = received_quantity,
                    accepted_quantity          = 0,
                    rejected_quantity          = 0,
                    unit_price                 = unit_price,
                    # total_price auto-calculated in model.save()
                    snapshot_product_name      = product.product_name,
                    snapshot_size              = product.size,
                    snapshot_barcode           = product.barcode,
                    snapshot_package_type      = product.package_type,
                    snapshot_base_unit         = product.base_unit,
                    snapshot_purchase_unit     = product.purchase_unit,
                    snapshot_conversion_factor = product.conversion_factor,
                    snapshot_carton_price      = product.carton_price,
                    snapshot_gst_percent       = product.gst_percent,
                    snapshot_weight_kg         = product.weight_kg,
                    snapshot_length_cm         = product.length_cm,
                    snapshot_width_cm          = product.width_cm,
                    snapshot_height_cm         = product.height_cm,
                    snapshot_abc               = product.ABC,
                    snapshot_xyz               = product.XYZ,
                    snapshot_ved               = product.VED,
                    qc_status                  = "Pending",
                    rejection_confirmed        = False,
                )

                # 7. Automated Notification
                notify_role(
                    sender=request.user,
                    recipient_role_name="quality_assistant",
                    notification_type="quality",
                    title=f"Item Ready for QC: {product.product_name}",
                    message=f"New item {product.product_name} (Batch: {batch_number}) added to GRN {grn.grn_id}. Inspection required.",
                    redirect_url="/quality-check"
                )

                logger.info(f"GRN Item created successfully: ID={grn_item.grn_item_id}")
                return Response(
                    {
                        "message":           "GRN item added.",
                        "grn_item_id":       grn_item.grn_item_id,
                        "product_name":      product.product_name,
                        "size":              product.size,
                        "batch_number":      batch_number,
                        "manufactured_date": str(batch.manufactured_date or ""),
                        "expiry_date":       str(batch.expiry_date or ""),
                        "batch_created":     created,
                        "received_cartons":  received_cartons,
                        "received_quantity": received_quantity,
                        "unit_price":        unit_price,
                        "total_price":       grn_item.total_price,
                        "base_unit":         product.base_unit,
                        "purchase_unit":     product.purchase_unit,
                    },
                    status=status.HTTP_201_CREATED
                )
        except Exception as e:
            logger.exception(f"Error in SupervisorAddGRNItem: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class SupervisorGRNListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        grns = GRN.objects.filter(received_by=request.user)
        if sf := request.query_params.get("status"):
            grns = grns.filter(status=sf)
        grns = grns.order_by("-created_at")
        data = GRNReadSerializer(grns, many=True).data
        return Response({"count": len(data), "data": data})


# ─────────────────────────────────────────────
# GRN — QC
# ─────────────────────────────────────────────

class QCUpdateGRNItem(APIView):
    """
    PUT /api/inventory/grn-items/<pk>/qc/
    QC staff fills in accepted_quantity, rejected_quantity, and optional
    rejection_reason, rejection_notes, rejection_images (list of base64 strings).
    """
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        print(f"QC Update Data: {request.data}")
        item = get_object_or_404(GRNItem, pk=pk)
        if item.rejection_confirmed:
            return Response(
                {"error": "This rejection has already been confirmed by a manager and cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        s = GRNItemQCSerializer(item, data=request.data, partial=True)
        if s.is_valid():
            print(f"Validated Data: {s.validated_data}")
            # Clear rejection fields if no units are being rejected
            rejected = s.validated_data.get("rejected_quantity", item.rejected_quantity)
            if rejected == 0:
                s.validated_data["rejection_reason"] = ""
                s.validated_data["rejection_notes"]  = ""
                s.validated_data["rejection_images"] = []
            s.save(qc_status="Completed")
            return Response({"message": "QC updated.", "data": s.data})
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class QCApproveGRN(APIView):
    """
    POST /api/inventory/grn/<grn_id>/qc-approve/

    Pipeline:
      1. Validates all GRN items are QC completed.
      2. Calls generate_putaway_plans() → creates PutawayPlan rows per accepted item.
         Also generates per-item barcodes (GRNItem.barcode_image) for every item.
      3. Generates GRN-level barcode PNG (GRN.barcode_image) for overview scan.
      4. Sets GRN.status = PUTAWAY_PENDING.

    FIX: Response now includes item_barcodes list — one entry per GRNItem —
         so the frontend receives every item's individual barcode, not just
         the single GRN-level one that was previously the only thing returned.

    Inventory and Bin loads are NOT touched here.
    They are updated only when each worker confirms a PutawayPlan row.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, grn_id):
        grn = get_object_or_404(GRN, grn_id=grn_id)

        if grn.status != "QC_PENDING":
            return Response(
                {"error": f"GRN is not in QC_PENDING status (current: '{grn.status}')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = GRNItem.objects.filter(grn=grn)
        if not items.exists():
            return Response(
                {"error": "No GRN items found. Add items before approving."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        incomplete = items.filter(qc_status="Pending")
        if incomplete.exists():
            return Response(
                {
                    "error":         f"{incomplete.count()} item(s) have not been QC completed yet.",
                    "pending_items": list(incomplete.values_list("grn_item_id", flat=True)),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            plans = generate_putaway_plans(grn)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # GRN-level barcode (overview / backward-compat scan)
        grn_barcode_image  = generate_grn_barcode(grn)
        grn.barcode_image  = grn_barcode_image
        grn.status         = "PUTAWAY_PENDING"
        grn.qc_verified_by = request.user
        grn.save(update_fields=["barcode_image", "status", "qc_verified_by"])

        # ── Automated Notification ──
        notify_role(
            sender=request.user,
            recipient_role_name="inventory_manager",
            notification_type="task",
            title=f"Putaway Scan Required: {grn.grn_id}",
            message=f"QC completed for {grn.grn_id}. Please use the Barcode Scanner to perform putaway for {len(plans)} items.",
            redirect_url="/barcode-scanner"
        )

        # Fetch all GRNItems fresh from DB so barcode_image values written
        # by generate_putaway_plans() are reflected (avoids stale in-memory cache).
        grn_items_with_barcodes = GRNItem.objects.filter(
            grn=grn, qc_status="Completed"
        ).values("grn_item_id", "snapshot_product_name", "snapshot_barcode", "barcode_image")

        return Response(
            {
                "message":       "QC approved. Putaway plan generated.",
                "grn_id":        grn_id,
                "status":        grn.status,
                "plans_created": len(plans),

                # GRN-level barcode — for scanning the whole GRN at once
                "barcode_image": grn_barcode_image,

                # Per-item barcodes — one per GRNItem, for individual worker scans
                "item_barcodes": [
                    {
                        "grn_item_id":   item["grn_item_id"],
                        "product_name":  item["snapshot_product_name"],
                        "product_barcode": item["snapshot_barcode"],
                        "barcode_image": item["barcode_image"],
                    }
                    for item in grn_items_with_barcodes
                ],

                "putaway_plan": [
                    {
                        "plan_id":        p.plan_id,
                        "grn_item_id":    p.grn_item.grn_item_id,
                        "product_name":   p.product.product_name,
                        "size":           p.product.size,
                        "batch_number":   p.batch.batch_number,
                        "mfg_date":       str(p.batch.manufactured_date or ""),
                        "expiry_date":    str(p.batch.expiry_date or ""),
                        "planned_qty":    p.planned_quantity,
                        "base_unit":      p.product.base_unit,
                        "bin_id":         p.bin.bin_id,
                        "shelf_id":       p.bin.shelf.shelf_id,
                        "rack_id":        p.bin.shelf.rack.rack_id,
                        "zone_id":        p.bin.shelf.rack.zone.zone_id,
                        "zone_type":      p.bin.shelf.rack.zone.zone_type,
                        "shelf_position": p.bin.shelf.position,
                        "package_type":   p.product.package_type,
                        "status":         p.status,
                    }
                    for p in plans
                ],
            }
        )


class ListRejectedItemsView(generics.ListAPIView):
    """
    GET /api/inventory/rejections/
    Lists all GRNItems where rejected_quantity > 0.
    Viewable by: manager, admin, supervisor.
    """
    serializer_class = GRNItemReadSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GRNItem.objects.filter(rejected_quantity__gt=0).order_by("-created_at")


class ManagerConfirmRejectionView(APIView):
    """
    POST /api/inventory/rejections/<pk>/confirm/
    Manager confirms the rejection of an item after physical verification.
    Only allowed for managers.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        # RBAC check: only manager or admin can confirm
        from rbac.models import UserRole
        try:
            ur = UserRole.objects.select_related("role").get(user=request.user)
            role_name = ur.role.name
        except UserRole.DoesNotExist:
            role_name = "unknown"

        if role_name != "manager":
            return Response(
                {"error": "Only Managers can perform the final rejection action."},
                status=status.HTTP_403_FORBIDDEN
            )

        item = get_object_or_404(GRNItem, pk=pk)
        if item.rejected_quantity <= 0:
            return Response(
                {"error": "This item has no rejected quantity to confirm."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if item.rejection_confirmed:
            return Response(
                {"error": "This rejection is already confirmed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        item.rejection_confirmed    = True
        item.rejection_confirmed_at = timezone.now()
        item.rejection_confirmed_by = request.user
        item.save(update_fields=["rejection_confirmed", "rejection_confirmed_at", "rejection_confirmed_by"])

        return Response({
            "message": "Rejection confirmed successfully.",
            "confirmed_at": item.rejection_confirmed_at,
            "confirmed_by": request.user.username
        })


class GRNQCPendingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        grns = GRN.objects.filter(status="QC_PENDING").order_by("-created_at")
        return Response(GRNReadSerializer(grns, many=True).data)


# ─────────────────────────────────────────────
# GRN BARCODE DECODE
# ─────────────────────────────────────────────

class GRNBarcodeDecodeView(APIView):
    """
    POST /api/inventory/grn/decode-barcode/
    Body: { "barcode_value": "GRN-0012" }

    Accepts both GRN-level ("GRN-XXXX") and item-level ("GRN-ITM-XXXX") barcodes.
    - GRN-level  → returns the full putaway plan for that GRN.
    - Item-level → returns the specific putaway plan row(s) for that GRN item.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        barcode_value = (request.data.get("barcode_value") or "").strip()
        if not barcode_value:
            return Response(
                {"error": "barcode_value is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            decoded_id = decode_grn_barcode(barcode_value)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # ── Item-level scan ───────────────────────────────────────────────────
        if decoded_id.startswith("GRN-ITM-"):
            try:
                grn_item = GRNItem.objects.select_related(
                    "grn__po", "grn__vendor", "product", "batch"
                ).get(grn_item_id=decoded_id)
            except GRNItem.DoesNotExist:
                return Response(
                    {"error": f"GRN item '{decoded_id}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            plans = PutawayPlan.objects.filter(
                grn_item=grn_item
            ).select_related(
                "product", "vendor", "batch",
                "bin__shelf__rack__zone",
                "completed_by",
            ).order_by("status")

            return Response(
                {
                    "scan_type":         "item",
                    "grn_item_id":       grn_item.grn_item_id,
                    "grn_id":            grn_item.grn.grn_id,
                    "product_name":      grn_item.snapshot_product_name,
                    "barcode":           grn_item.snapshot_barcode,
                    "batch_number":      grn_item.batch.batch_number if grn_item.batch else "",
                    "accepted_quantity": grn_item.accepted_quantity,
                    "base_unit":         grn_item.snapshot_base_unit,
                    "putaway_plans":     PutawayPlanSerializer(plans, many=True).data,
                }
            )

        # ── Plan-level scan ───────────────────────────────────────────────────
        if decoded_id.startswith("PAP-"):
            try:
                plan = PutawayPlan.objects.select_related(
                    "product", "vendor", "batch",
                    "bin__shelf__rack__zone",
                    "grn_item__grn",
                    "completed_by",
                ).get(plan_id=decoded_id)
            except PutawayPlan.DoesNotExist:
                return Response(
                    {"error": f"Putaway plan '{decoded_id}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return Response(
                {
                    "scan_type":         "item",  # Treat single plan scan like an item scan for UI consistency
                    "grn_item_id":       plan.grn_item.grn_item_id,
                    "grn_id":            plan.grn_item.grn.grn_id,
                    "product_name":      plan.product.product_name,
                    "barcode":           plan.product.barcode,
                    "batch_number":      plan.batch.batch_number,
                    "accepted_quantity": plan.grn_item.accepted_quantity,
                    "base_unit":         plan.product.base_unit,
                    "putaway_plans":     [PutawayPlanSerializer(plan).data],
                }
            )

        # ── GRN-level scan ────────────────────────────────────────────────────
        try:
            grn = GRN.objects.select_related(
                "po", "pr", "vendor", "received_by", "qc_verified_by"
            ).get(grn_id=decoded_id)
        except GRN.DoesNotExist:
            return Response(
                {"error": f"GRN '{decoded_id}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if grn.status not in ("PUTAWAY_PENDING", "COMPLETED"):
            return Response(
                {
                    "error": (
                        f"GRN is in '{grn.status}' status. "
                        "Putaway plan is only available after QC approval."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        plans = (
            PutawayPlan.objects.filter(grn_item__grn=grn)
            .select_related(
                "product", "vendor", "batch",
                "bin__shelf__rack__zone",
                "grn_item",
                "completed_by",
            )
            .order_by("bin__shelf__rack__zone_id", "bin__shelf__rack_id", "bin_id")
        )

        pending_count   = plans.filter(status="Pending").count()
        completed_count = plans.filter(status="Completed").count()

        return Response(
            {
                "scan_type":       "grn",
                "grn_id":          grn.grn_id,
                "grn_number":      grn.grn_number,
                "receipt_date":    str(grn.receipt_date),
                "po_id":           grn.po_id,
                "vendor_name":     grn.vendor_name,
                "vendor_gstin":    grn.vendor_gstin,
                "grn_status":      grn.status,
                "qc_verified_by":  (
                    grn.qc_verified_by.get_full_name() if grn.qc_verified_by else None
                ),
                "total_plans":     plans.count(),
                "pending_plans":   pending_count,
                "completed_plans": completed_count,
                "putaway_plan": [
                    {
                        "plan_id":           p.plan_id,
                        "product_id":        p.product.product_id,
                        "product_name":      p.product.product_name,
                        "size":              p.product.size,
                        "barcode":           p.product.barcode,
                        "package_type":      p.product.package_type,
                        "base_unit":         p.product.base_unit,
                        "batch_id":          p.batch.batch_id,
                        "batch_number":      p.batch.batch_number,
                        "manufactured_date": str(p.batch.manufactured_date or ""),
                        "expiry_date":       str(p.batch.expiry_date or ""),
                        "planned_quantity":  p.planned_quantity,
                        "quantity_placed":   p.quantity_placed,
                        "zone_id":           p.bin.shelf.rack.zone.zone_id,
                        "zone_type":         p.bin.shelf.rack.zone.zone_type,
                        "rack_id":           p.bin.shelf.rack.rack_id,
                        "shelf_id":          p.bin.shelf.shelf_id,
                        "shelf_position":    p.bin.shelf.position,
                        "bin_id":            p.bin.bin_id,
                        "status":            p.status,
                        "completed_by":      (
                            p.completed_by.get_full_name() if p.completed_by else None
                        ),
                        "completed_at":      str(p.completed_at or ""),
                        "notes":             p.notes,
                    }
                    for p in plans
                ],
            }
        )


# ─────────────────────────────────────────────
# PUTAWAY PLAN — CONFIRM + REASSIGN
# ─────────────────────────────────────────────

class ConfirmPutawayPlanView(APIView):
    """
    POST /api/inventory/putaway/<plan_id>/confirm/
    Body: { "quantity_placed": <int>, "notes": "<optional>" }

    Worker places stock in the assigned bin and confirms here.

    Steps:
      1. Validates quantity_placed ≤ planned_quantity.
      2. Creates / updates Inventory row (product + vendor + batch + bin).
      3. Updates Bin.current_load, current_weight_kg, used_volume_cm3.
      4. Logs INBOUND StockMovement.
      5. Marks PutawayPlan → Completed.
      6. If all plans for this GRN are done → GRN → COMPLETED.
      7. Runs check_reorder().
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, plan_id):
        plan = get_object_or_404(
            PutawayPlan.objects.select_related(
                "product", "vendor", "batch", "bin", "grn_item__grn"
            ),
            plan_id=plan_id,
        )

        if plan.status == "Completed":
            return Response(
                {"error": "This putaway plan row is already confirmed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if plan.status == "Reassigned":
            return Response(
                {"error": "This plan row was reassigned. Confirm the new plan row instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            qty_placed = int(request.data.get("quantity_placed", plan.planned_quantity))
        except (TypeError, ValueError):
            return Response(
                {"error": "quantity_placed must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if qty_placed <= 0:
            return Response(
                {"error": "quantity_placed must be > 0."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if qty_placed > plan.planned_quantity:
            return Response(
                {
                    "error": (
                        f"quantity_placed ({qty_placed}) exceeds "
                        f"planned_quantity ({plan.planned_quantity})."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        notes       = request.data.get("notes", "")
        product     = plan.product
        unit_weight = product.weight_kg or 0
        unit_volume = product.volume_cm3 or 0
        bin_obj     = plan.bin

        with transaction.atomic():
            # ── AUTO-SPILLOVER LOGIC ──────────────────────────────────────────
            # Re-fetch bin with lock to ensure no concurrent additions
            locked_bin = Bin.objects.select_for_update().get(bin_id=bin_obj.bin_id)

            # If the bin cannot fit the full amount, we take what fits and 
            # automatically reassign the remainder to a new bin.
            
            fit_by_units  = locked_bin.available_units
            fit_by_weight = int(locked_bin.available_weight_kg / unit_weight) if unit_weight > 0 else qty_placed
            fit_by_volume = int(locked_bin.available_volume_cm3 / unit_volume) if unit_volume > 0 else qty_placed
            
            can_fit = max(0, min(qty_placed, fit_by_units, fit_by_weight, fit_by_volume))
            remainder = qty_placed - can_fit

            if can_fit == 0 and qty_placed > 0:
                # Truly zero space — must reassign everything
                return Response(
                    {"error": f"Bin {locked_bin.bin_id} is completely full. Please use the 'Reassign' button to find a new bin."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            actual_qty = can_fit
            
            inventory, _ = Inventory.objects.get_or_create(
                product  = product,
                vendor   = plan.vendor,
                batch    = plan.batch,
                bin      = locked_bin,
                defaults = {
                    "quantity":     0,
                    "grn_item":     plan.grn_item,
                    "putaway_plan": plan,
                },
            )
            prev_qty           = inventory.quantity
            inventory.quantity += actual_qty
            inventory.grn_item     = plan.grn_item
            inventory.putaway_plan = plan
            inventory.save()

            locked_bin.current_load      += actual_qty
            locked_bin.current_weight_kg += actual_qty * unit_weight
            locked_bin.used_volume_cm3   += actual_qty * unit_volume
            locked_bin.save()

            StockMovement.objects.create(
                product        = product,
                vendor         = plan.vendor,
                batch          = plan.batch,
                bin            = locked_bin,
                movement_type  = "INBOUND",
                quantity       = actual_qty,
                previous_stock = prev_qty,
                new_stock      = inventory.quantity,
            )

            plan.quantity_placed = actual_qty
            plan.status          = "Completed"
            plan.completed_by    = request.user
            plan.completed_at    = timezone.now()
            plan.notes           = notes
            plan.save()

            # Mark GRN as COMPLETED when all pending plans are done
            grn = plan.grn_item.grn
            all_done = not PutawayPlan.objects.filter(
                grn_item__grn=grn, status="Pending"
            ).exists()
            if all_done:
                grn.status = "COMPLETED"
                grn.save(update_fields=["status"])

                # ── Automated Notification ──
                notify_role(
                    sender=request.user,
                    recipient_role_name="manager",
                    notification_type="update",
                    title=f"GRN Completed: {grn.grn_id}",
                    message=f"All items from GRN {grn.grn_id} (PO: {grn.po_id}) have been put away and are now in inventory.",
                    redirect_url="/dashboard"
                )

            # ── Handle Remainder (Automatic Reassignment) ──
            new_plan_id = None
            new_bin_id  = None
            if remainder > 0:
                try:
                    new_bin = assign_bin(product, remainder, exclude_bin_ids=[locked_bin.bin_id])
                    spill_plan = PutawayPlan.objects.create(
                        grn_item         = plan.grn_item,
                        product          = product,
                        vendor           = plan.vendor,
                        batch            = plan.batch,
                        bin              = new_bin,
                        planned_quantity = remainder,
                        quantity_placed  = 0,
                        status           = "Pending",
                        notes            = f"Spillover from {locked_bin.bin_id} (full). Original plan: {plan.plan_id}",
                    )
                    new_plan_id = spill_plan.plan_id
                    new_bin_id  = new_bin.bin_id
                    new_bin_data = {
                        "bin_id": new_bin.bin_id,
                        "zone_id": new_bin.shelf.rack.zone.zone_id,
                        "zone_type": new_bin.shelf.rack.zone.zone_type,
                        "rack_id": new_bin.shelf.rack.rack_id,
                        "shelf_id": new_bin.shelf.shelf_id,
                        "shelf_position": new_bin.shelf.position,
                        "distance_from_dispatch": new_bin.distance_from_dispatch,
                    }
                except ValueError:
                    # No space anywhere else either? 
                    # We still confirmed the partial amount, but we should warn
                    new_bin_data = None
            else:
                new_bin_data = None

        check_reorder(product)

        return Response(
            {
                "message":       "Putaway confirmed. Inventory updated.",
                "plan_id":       plan_id,
                "product_name":  product.product_name,
                "size":          product.size,
                "batch_number":  plan.batch.batch_number,
                "bin_id":        bin_obj.bin_id,
                "qty_placed":    actual_qty,
                "remainder":     remainder,
                "new_plan_id":   new_plan_id,
                "new_bin_id":    new_bin_id,
                "new_bin_data":  new_bin_data,
                "base_unit":     product.base_unit,
                "inventory_id":  inventory.inventory_id,
                "grn_completed": all_done,
            }
        )


class ReassignPutawayBinView(APIView):
    """
    POST /api/inventory/putaway/<plan_id>/reassign/

    Worker finds the assigned bin is physically full or inaccessible.
    System re-runs assign_bin() → updates the plan with a new bin.
    Old bin loads are NOT changed (it was never physically filled).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, plan_id):
        plan = get_object_or_404(
            PutawayPlan.objects.select_related("product", "bin", "grn_item", "vendor", "batch"),
            plan_id=plan_id,
        )

        if plan.status != "Pending":
            return Response(
                {"error": "Only Pending plans can be reassigned."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_bin = plan.bin

        try:
            # Pass exclude_bin_id so assign_bin never returns the same bin
            new_bin = assign_bin(
                plan.product,
                plan.planned_quantity,
                exclude_bin_ids=[old_bin.bin_id],
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        username = request.user.get_full_name() or request.user.username
        notes    = request.data.get(
            "notes", f"Reassigned from {old_bin.bin_id} by {username}."
        )

        with transaction.atomic():
            # Mark original plan as Reassigned (audit trail)
            plan.status = "Reassigned"
            plan.notes  = notes
            plan.save(update_fields=["status", "notes"])

            # Create new plan row pointing at the new bin
            new_plan = PutawayPlan.objects.create(
                grn_item         = plan.grn_item,
                product          = plan.product,
                vendor           = plan.vendor,
                batch            = plan.batch,
                bin              = new_bin,
                planned_quantity = plan.planned_quantity,
                quantity_placed  = 0,
                status           = "Pending",
                notes            = f"Reassigned from {old_bin.bin_id}.",
            )

        return Response(
            {
                "message":     "Bin reassigned. New putaway plan created.",
                "old_plan_id": plan_id,
                "new_plan_id": new_plan.plan_id,
                "old_bin_id":  old_bin.bin_id,
                "new_bin_id":  new_bin.bin_id,
                "shelf_id":    new_bin.shelf.shelf_id,
                "rack_id":     new_bin.shelf.rack.rack_id,
                "zone_id":     new_bin.shelf.rack.zone.zone_id,
                "zone_type":   new_bin.shelf.rack.zone.zone_type,
                "shelf_position": new_bin.shelf.position,
                "distance_from_dispatch": new_bin.distance_from_dispatch,
            }
        )


class PutawayPlanListView(APIView):
    """GET /api/inventory/putaway/pending/ — all pending putaway tasks."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plans = (
            PutawayPlan.objects.filter(status="Pending")
            .select_related(
                "product", "vendor", "batch",
                "bin__shelf__rack__zone",
                "grn_item__grn",
            )
            .order_by("grn_item__grn_id", "bin__shelf__rack__zone_id", "bin_id")
        )
        return Response(
            {"count": plans.count(), "plans": PutawayPlanSerializer(plans, many=True).data}
        )


class PutawayPlanByGRNView(APIView):
    """GET /api/inventory/grn/<grn_id>/putaway-plan/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, grn_id):
        grn = get_object_or_404(GRN, grn_id=grn_id)
        plans = (
            PutawayPlan.objects.filter(grn_item__grn=grn)
            .select_related(
                "product", "vendor", "batch",
                "bin__shelf__rack__zone",
                "grn_item", "completed_by",
            )
            .order_by("status", "bin_id")
        )
        return Response(
            {
                "grn_id":     grn_id,
                "grn_status": grn.status,
                "count":      plans.count(),
                "plans":      PutawayPlanSerializer(plans, many=True).data,
            }
        )


# ─────────────────────────────────────────────
# GRN — GENERAL READ
# ─────────────────────────────────────────────

class GRNListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        grns = GRN.objects.select_related(
            "po", "pr", "asn", "vendor", "received_by", "qc_verified_by"
        ).order_by("-created_at")

        if sf := request.query_params.get("status"):
            grns = grns.filter(status=sf)
        if vid := request.query_params.get("vendor_id"):
            grns = grns.filter(vendor__vendor_id=vid)

        return Response(GRNReadSerializer(grns, many=True).data)


class GRNDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        grn = get_object_or_404(GRN, grn_id=pk)
        return Response(GRNReadSerializer(grn).data)


class GRNItemsByGRNView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, grn_id):
        items = GRNItem.objects.filter(
            grn__grn_id=grn_id
        ).select_related("product", "batch__vendor")
        return Response(GRNItemReadSerializer(items, many=True).data)


class GRNSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, grn_id):
        result = GRNItem.objects.filter(grn__grn_id=grn_id).aggregate(
            received = Sum("received_quantity"),
            accepted = Sum("accepted_quantity"),
            rejected = Sum("rejected_quantity"),
        )
        return Response(
            {"grn_id": grn_id, **{k: (v or 0) for k, v in result.items()}}
        )


class GRNItemListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = GRNItem.objects.select_related("product", "batch__vendor").all()
        return Response(GRNItemReadSerializer(items, many=True).data)


class GRNItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        item = get_object_or_404(
            GRNItem.objects.select_related("product", "batch__vendor"), pk=pk
        )
        return Response(GRNItemReadSerializer(item).data)


# ─────────────────────────────────────────────
# OUTBOUND PICKING
# ─────────────────────────────────────────────

class OptimizedOutboundView(APIView):
    """
    POST /api/inventory/outbound/pick/<product_id>/
    Body: { "quantity": <int in base units> }

    Picks from nearest bin first, tie-broken by pick_count (least-picked first).
    Logs OUTBOUND StockMovement per bin. Triggers reorder check.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, product_id):
        try:
            qty = int(request.data.get("quantity"))
        except (TypeError, ValueError):
            return Response(
                {"error": "quantity must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if qty <= 0:
            return Response(
                {"error": "Quantity must be > 0."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product = get_object_or_404(Product, product_id=product_id)

        vendor_id = request.data.get("vendor_id")

        # Trigger reorder check proactively. This ensures that even if dispatch 
        # fails due to zero stock, an Auto-PR is still generated.
        check_reorder(product, vendor_id)

        with transaction.atomic():
            filters = {"product_id": product_id, "quantity__gt": 0}
            if vendor_id:
                filters["vendor_id"] = vendor_id

            inventories = list(
                Inventory.objects.select_for_update()
                .select_related("product", "vendor", "batch", "bin")
                .filter(**filters)
                .order_by("bin__distance_from_dispatch", "bin__pick_count")
            )

            if not inventories:
                return Response(
                    {
                        "success": False,
                        "error": "Insufficient stock available for dispatch.",
                        "message": "Insufficient stock available for dispatch.",
                        "reorder_triggered": True
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            total = sum(inv.quantity for inv in inventories)
            if qty > total:
                return Response(
                    {
                        "success": False,
                        "error": "Insufficient stock available for dispatch.",
                        "message": "Insufficient stock available for dispatch."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            remaining   = qty
            picked_bins = []

            for inv in inventories:
                if remaining <= 0:
                    break

                pick_qty = min(inv.quantity, remaining)
                prev_qty = inv.quantity

                inv.quantity -= pick_qty
                inv.save()

                unit_weight = inv.product.weight_kg or 0
                unit_volume = inv.product.volume_cm3 or 0

                b = inv.bin
                b.current_load      -= pick_qty
                b.current_weight_kg  = max(
                    0.0, b.current_weight_kg - pick_qty * unit_weight
                )
                b.used_volume_cm3    = max(
                    0.0, b.used_volume_cm3 - pick_qty * unit_volume
                )
                b.pick_count        += 1
                b.last_picked_at     = timezone.now()
                b.save()

                StockMovement.objects.create(
                    product        = inv.product,
                    vendor         = inv.vendor,
                    batch          = inv.batch,
                    bin            = b,
                    movement_type  = "OUTBOUND",
                    quantity       = pick_qty,
                    previous_stock = prev_qty,
                    new_stock      = inv.quantity,
                )
                picked_bins.append(
                    {
                        "bin_id":          b.bin_id,
                        "vendor_name":     inv.vendor.vendor_name,
                        "batch_number":    inv.batch.batch_number,
                        "picked_quantity": pick_qty,
                        "base_unit":       inv.product.base_unit,
                    }
                )
                remaining -= pick_qty

        # After successful dispatch, check if stock is now low
        total_remaining = Inventory.objects.filter(product=product).aggregate(
            s=Sum("quantity")
        )["s"] or 0
        
        low_stock_warning = total_remaining < product.effective_reorder_point

        return Response(
            {
                "message":            "Outbound picking completed.",
                "product_id":         product_id,
                "requested_quantity": qty,
                "picked_bins":        picked_bins,
                "low_stock_warning":  low_stock_warning,
                "remaining_stock":    total_remaining
            }
        )