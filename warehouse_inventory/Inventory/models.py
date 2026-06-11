"""
inventory/models.py

Warehouse hierarchy:
    Zone (max 15 racks)
      └── Rack (auto-creates shelves + bins on save)
            └── Shelf  (positions divided equally: N/3 per position)
                  └── Bin (dimensions inherited from rack template)

Key rules:
  - Zone enforces max 15 racks
  - Rack.save() auto-creates shelves and bins — never create manually
  - All bins in a rack share the same dimensions (rack-level template)
  - Shelf positions: 1=Bottom(BAG), 2=Middle(BOX), 3=Top(POUCH)
    divided equally across shelf_count (must be divisible by 3)
  - distance_from_dispatch is rack-level (same for all bins in that rack)

Inventory flow:
  GRN → QC → PutawayPlan generated (bin auto-assigned) → Worker confirms → Inventory updated
  Inventory is NEVER written directly from QC approval.

Key changes vs original:
  - GRNItem now has barcode_image field (Option B: per-item barcode)
  - GRNItem.barcode_image stores base64 PNG, generated after QC per item
  - GRN.barcode_image retained (GRN-level overview scan — backward compat)
  - Unique constraints documented and enforced via Meta
"""

import math
from django.db import models, transaction
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone


# ─────────────────────────────────────────────
# WAREHOUSE STRUCTURE
# ─────────────────────────────────────────────

class Zone(models.Model):
    """
    A large physical hall/area.
    zone_type must match Category.zone_type values.
    Enforces maximum 15 racks.
    """
    zone_id    = models.CharField(primary_key=True, max_length=10)
    zone_type  = models.CharField(max_length=50,
                                   help_text="e.g. Dry, Cold, Frozen, Ambient, Hazmat")
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def rack_count(self):
        return self.racks.count()

    @property
    def total_volume_cm3(self):
        total = 0
        for rack in self.racks.all():
            total += rack.bin_volume_cm3 * rack.shelf_count * rack.bin_count_per_shelf
        return total

    @property
    def total_weight_kg(self):
        return sum(r.max_weight_kg for r in self.racks.all())

    def clean(self):
        if self.pk and self.racks.count() > 15:
            raise ValidationError("A zone cannot have more than 15 racks.")

    def __str__(self):
        return f"{self.zone_id} — {self.zone_type}"


class Rack(models.Model):
    """
    One rack inside a zone.
    Admin sets bin dimension template here.
    On first save, shelves and bins are auto-generated.

    shelf_count MUST be divisible by 3.
    """
    rack_id                = models.CharField(primary_key=True, max_length=10)
    zone                   = models.ForeignKey(Zone, on_delete=models.CASCADE,
                                                related_name="racks")
    max_weight_kg          = models.FloatField(default=0)
    bin_capacity           = models.IntegerField(default=100)
    bin_max_weight_kg      = models.FloatField(default=50)
    bin_volume_cm3         = models.FloatField(default=125000)
    shelf_count            = models.IntegerField(default=3)
    bin_count_per_shelf    = models.IntegerField(default=10)
    distance_from_dispatch = models.FloatField(default=0)
    created_at             = models.DateTimeField(auto_now_add=True)
    _shelves_generated     = models.BooleanField(default=False, editable=False)

    def clean(self):
        if self.shelf_count % 3 != 0:
            raise ValidationError(
                f"shelf_count must be divisible by 3 (got {self.shelf_count})."
            )
        if self.bin_count_per_shelf < 1:
            raise ValidationError("bin_count_per_shelf must be ≥ 1.")

    def save(self, *args, **kwargs):
        self.clean()
        if not self.pk:
            existing = Rack.objects.filter(zone=self.zone).count()
            if existing >= 15:
                raise ValidationError(
                    f"Zone {self.zone_id} already has 15 racks."
                )
        super().save(*args, **kwargs)
        if not self._shelves_generated:
            self._generate_shelves_and_bins()
            Rack.objects.filter(pk=self.pk).update(_shelves_generated=True)

    def _generate_shelves_and_bins(self):
        shelves_per_position = self.shelf_count //3
        shelf_num = 1
        for position in [1, 2, 3]:
            for _ in range(shelves_per_position):
                shelf_id = f"{self.rack_id}-S{shelf_num:02d}"
                shelf = Shelf.objects.create(
                    shelf_id      = shelf_id,
                    rack          = self,
                    position      = position,
                    max_weight_kg = self.bin_max_weight_kg * self.bin_count_per_shelf,
                    volume_cm3    = self.bin_volume_cm3    * self.bin_count_per_shelf,
                )
                for bin_num in range(1, self.bin_count_per_shelf + 1):
                    Bin.objects.create(
                        bin_id                 = f"{shelf_id}-B{bin_num:02d}",
                        shelf                  = shelf,
                        capacity               = self.bin_capacity,
                        current_load           = 0,
                        max_weight_kg          = self.bin_max_weight_kg,
                        current_weight_kg      = 0,
                        volume_cm3             = self.bin_volume_cm3,
                        used_volume_cm3        = 0,
                        distance_from_dispatch = self.distance_from_dispatch,
                        pick_count             = 0,
                    )
                shelf_num += 1

    def __str__(self):
        return f"{self.rack_id} (Zone: {self.zone_id})"


class Shelf(models.Model):
    POSITION_CHOICES = [
        (1, "Bottom — Heavy (BAG)"),
        (2, "Middle — Medium (BOX)"),
        (3, "Top    — Light (POUCH)"),
    ]
    shelf_id      = models.CharField(primary_key=True, max_length=20)
    rack          = models.ForeignKey(Rack, on_delete=models.CASCADE, related_name="shelves")
    position      = models.IntegerField(choices=POSITION_CHOICES)
    max_weight_kg = models.FloatField(default=0)
    volume_cm3    = models.FloatField(default=0)
    created_at    = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.shelf_id} (Pos: {self.position})"


class Bin(models.Model):
    bin_id                 = models.CharField(primary_key=True, max_length=20)
    shelf                  = models.ForeignKey(Shelf, on_delete=models.CASCADE,
                                                related_name="bins")
    capacity               = models.IntegerField(help_text="Max base units")
    current_load           = models.IntegerField(default=0)
    max_weight_kg          = models.FloatField(default=0)
    current_weight_kg      = models.FloatField(default=0)
    volume_cm3             = models.FloatField(default=0)
    used_volume_cm3        = models.FloatField(default=0)
    distance_from_dispatch = models.FloatField()
    pick_count             = models.IntegerField(default=0)
    last_picked_at         = models.DateTimeField(null=True, blank=True)
    created_at             = models.DateTimeField(auto_now_add=True)

    @property
    def available_units(self):
        return self.capacity - self.current_load

    @property
    def available_weight_kg(self):
        return self.max_weight_kg - self.current_weight_kg

    @property
    def available_volume_cm3(self):
        return self.volume_cm3 - self.used_volume_cm3

    @property
    def zone_id(self):
        return self.shelf.rack.zone_id

    def __str__(self):
        return self.bin_id


# ─────────────────────────────────────────────
# BATCH
# ─────────────────────────────────────────────

class Batch(models.Model):
    batch_id          = models.CharField(primary_key=True, max_length=20, editable=False)
    vendor            = models.ForeignKey("vendors.Vendor", on_delete=models.CASCADE,
                                           related_name="batches")
    product           = models.ForeignKey("products.Product", on_delete=models.CASCADE,
                                           related_name="batches")
    batch_number      = models.CharField(max_length=50)
    manufactured_date = models.DateField(null=True, blank=True)
    expiry_date       = models.DateField(null=True, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("vendor", "product", "batch_number")

    def save(self, *args, **kwargs):
        if not self.batch_id:
            with transaction.atomic():
                last   = Batch.objects.select_for_update().order_by("-batch_id").first()
                new_id = (int(last.batch_id[3:]) + 1) if last else 1
                self.batch_id = f"BAT{new_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.batch_id} | {self.vendor} | {self.batch_number}"


# ─────────────────────────────────────────────
# INVENTORY
# ─────────────────────────────────────────────

class Inventory(models.Model):
    """
    One row per (product + vendor + batch + bin).
    Written ONLY when a PutawayPlan row is confirmed by worker.
    """
    inventory_id = models.CharField(max_length=15, primary_key=True, editable=False)
    product      = models.ForeignKey("products.Product", on_delete=models.CASCADE,
                                      related_name="inventories")
    vendor       = models.ForeignKey("vendors.Vendor", on_delete=models.CASCADE,
                                      related_name="inventories")
    batch        = models.ForeignKey(Batch, on_delete=models.CASCADE,
                                      related_name="inventories")
    bin          = models.ForeignKey(Bin, on_delete=models.CASCADE,
                                      related_name="inventories")
    quantity     = models.IntegerField(default=0)   # base units

    grn_item     = models.ForeignKey("GRNItem", on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name="inventory_rows")
    putaway_plan = models.ForeignKey("PutawayPlan", on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name="inventory_rows")
    last_update  = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product", "vendor", "batch", "bin")

    def save(self, *args, **kwargs):
        if not self.inventory_id:
            with transaction.atomic():
                last   = Inventory.objects.select_for_update().order_by("-inventory_id").first()
                new_id = (int(last.inventory_id[3:]) + 1) if last else 1
                self.inventory_id = f"INV{new_id:04d}"
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.product} | {self.vendor} | "
            f"Batch {self.batch.batch_number} | Bin {self.bin}"
        )


# ─────────────────────────────────────────────
# PURCHASE REQUEST
# ─────────────────────────────────────────────

class PurchaseRequest(models.Model):
    STATUS_CHOICES = [
        ("Pending",         "Pending"),
        ("Finance Pending", "Finance Pending"),
        ("Approved",        "Approved"),
        ("Rejected",        "Rejected"),
    ]
    pr_id              = models.CharField(max_length=10, primary_key=True, editable=False)
    product            = models.ForeignKey("products.Product", on_delete=models.CASCADE,
                                            related_name="purchase_requests")
    vendor             = models.ForeignKey("vendors.Vendor", on_delete=models.CASCADE,
                                            related_name="purchase_requests")
    requested_cartons  = models.IntegerField()
    requested_quantity = models.IntegerField(help_text="In base units")
    total_amount       = models.DecimalField(max_digits=12, decimal_places=2)
    recommended_vendor = models.ForeignKey(
        "vendors.Vendor", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="recommended_prs"
    )
    recommended_score  = models.FloatField(null=True, blank=True)
    chosen_score       = models.FloatField(null=True, blank=True)
    vendor_warning     = models.BooleanField(default=False)
    status             = models.CharField(max_length=20, choices=STATUS_CHOICES,
                                           default="Pending")
    is_auto_generated  = models.BooleanField(default=False)
    created_by         = models.ForeignKey("auth.User", on_delete=models.SET_NULL,
                                            null=True, blank=True, related_name="created_prs")
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.pr_id:
            with transaction.atomic():
                last   = PurchaseRequest.objects.select_for_update().order_by("-pr_id").first()
                new_id = (int(last.pr_id[2:]) + 1) if last else 1
                self.pr_id = f"PR{new_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.pr_id} | {self.product} | {self.status}"


# ─────────────────────────────────────────────
# PURCHASE ORDER
# ─────────────────────────────────────────────

class PurchaseOrder(models.Model):
    po_id          = models.CharField(max_length=10, primary_key=True, editable=False)
    pr             = models.OneToOneField(PurchaseRequest, on_delete=models.CASCADE,
                                          related_name="purchase_order")
    vendor         = models.ForeignKey("vendors.Vendor", on_delete=models.CASCADE,
                                        related_name="purchase_orders")
    order_cartons  = models.IntegerField()
    order_quantity = models.IntegerField(help_text="Base units")
    total_amount   = models.DecimalField(max_digits=12, decimal_places=2)
    created_at     = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.po_id:
            with transaction.atomic():
                last   = PurchaseOrder.objects.select_for_update().order_by("-po_id").first()
                new_id = (int(last.po_id[2:]) + 1) if last else 1
                self.po_id = f"PO{new_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.po_id} | {self.vendor} | {self.order_quantity} units"


# ─────────────────────────────────────────────
# STOCK MOVEMENT
# ─────────────────────────────────────────────

class StockMovement(models.Model):
    MOVEMENT_CHOICES = [("INBOUND", "Inbound"), ("OUTBOUND", "Outbound")]
    product        = models.ForeignKey("products.Product", on_delete=models.CASCADE,
                                        related_name="stock_movements")
    vendor         = models.ForeignKey("vendors.Vendor", on_delete=models.CASCADE,
                                        null=True, blank=True, related_name="stock_movements")
    batch          = models.ForeignKey(Batch, on_delete=models.CASCADE,
                                        null=True, blank=True, related_name="stock_movements")
    bin            = models.ForeignKey(Bin, on_delete=models.CASCADE,
                                        related_name="stock_movements")
    movement_type  = models.CharField(max_length=20, choices=MOVEMENT_CHOICES)
    quantity       = models.IntegerField(help_text="Base units")
    previous_stock = models.IntegerField()
    new_stock      = models.IntegerField()
    created_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.movement_type} | {self.product} | {self.quantity} | {self.created_at:%Y-%m-%d}"


# ─────────────────────────────────────────────
# ASN
# ─────────────────────────────────────────────

class ASN(models.Model):
    asn_id                = models.CharField(max_length=10, primary_key=True, editable=False)
    po                    = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE,
                                               related_name="asns")
    asn_number            = models.CharField(max_length=50, unique=True, blank=True)
    vendor                = models.ForeignKey("vendors.Vendor", on_delete=models.CASCADE,
                                               related_name="asns")
    shipment_date         = models.DateField()
    expected_arrival_date = models.DateField()
    vehicle_num           = models.CharField(max_length=13)
    driver_name           = models.CharField(max_length=25)
    driver_phone          = models.CharField(max_length=15)
    created_at            = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.asn_id:
            with transaction.atomic():
                # Sort by PK to ensure strict sequence
                last   = ASN.objects.select_for_update().order_by("-asn_id").first()
                new_id = (int(last.asn_id[3:]) + 1) if last else 1
                self.asn_id = f"ASN{new_id:04d}"
                
                # Auto-generate asn_number if missing
                if not self.asn_number:
                    year = timezone.now().year
                    self.asn_number = f"ASN-{year}-{new_id:04d}"
                
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.asn_id} | PO: {self.po_id} | {self.vendor}"


class ASNItem(models.Model):
    asn_item_id       = models.CharField(max_length=20, primary_key=True, editable=False)
    asn               = models.ForeignKey(ASN, on_delete=models.CASCADE, related_name="items")
    product           = models.ForeignKey("products.Product", on_delete=models.CASCADE,
                                           related_name="asn_items")
    expected_quantity = models.IntegerField(help_text="Base units")
    shipped_quantity  = models.IntegerField(help_text="Base units")
    created_at        = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.asn_item_id:
            with transaction.atomic():
                # Sort by PK to ensure strict sequence
                last   = ASNItem.objects.select_for_update().order_by("-asn_item_id").first()
                # ASN-ITM-001 -> split by '-' is ['ASN', 'ITM', '001']
                new_id = (int(last.asn_item_id.split("-")[-1]) + 1) if last else 1
                self.asn_item_id = f"ASN-ITM-{new_id:03d}"
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────
# GRN
# ─────────────────────────────────────────────

class GRN(models.Model):
    STATUS_CHOICES = [
        ("RECEIVED",        "Received by Supervisor"),
        ("QC_PENDING",      "QC Pending"),
        ("PUTAWAY_PENDING", "Putaway Plan Generated — Awaiting Worker Confirmation"),
        ("COMPLETED",       "Completed"),
    ]
    grn_id        = models.CharField(primary_key=True, max_length=10, editable=False)
    grn_number    = models.CharField(max_length=50, unique=True)
    po            = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE,
                                       related_name="grns")
    pr            = models.ForeignKey(PurchaseRequest, on_delete=models.CASCADE,
                                       related_name="grns")
    asn           = models.ForeignKey(ASN, on_delete=models.CASCADE,
                                       null=True, blank=True, related_name="grns")
    vendor        = models.ForeignKey("vendors.Vendor", on_delete=models.SET_NULL,
                                       null=True, related_name="grns")
    vendor_name   = models.CharField(max_length=150)
    vendor_gstin  = models.CharField(max_length=15, blank=True, default="")
    receipt_date  = models.DateField()
    received_by   = models.ForeignKey("auth.User", on_delete=models.SET_NULL,
                                       null=True, related_name="grns_received")
    qc_verified_by = models.ForeignKey("auth.User", on_delete=models.SET_NULL,
                                        null=True, blank=True, related_name="grns_verified")
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES,
                                      default="RECEIVED")
    # GRN-level barcode: base64 PNG — for overview scan (backward compat)
    barcode_image = models.TextField(
        blank=True, default="",
        help_text="Base64 PNG of Code128 barcode encoding the grn_id"
    )
    created_at    = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.grn_id:
            with transaction.atomic():
                last   = GRN.objects.select_for_update().order_by("-grn_id").first()
                new_id = (int(last.grn_id.split("-")[-1]) + 1) if last else 1
                self.grn_id = f"GRN-{new_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.grn_id} | PO: {self.po_id} | {self.vendor_name}"


class GRNItem(models.Model):
    """
    One line per product per GRN.
    barcode_image (NEW, Option B): per-item Code128 barcode PNG, base64-encoded.
    Generated per item after QC approval → workers scan individual items for putaway.
    """
    QC_STATUS_CHOICES = [("Pending", "Pending"), ("Completed", "Completed")]

    REJECTION_REASON_CHOICES = [
        ("Defect",     "Defect"),
        ("Damaged",    "Damaged"),
        ("Expired",    "Expired"),
        ("Wrong Item", "Wrong Item"),
        ("Other",      "Other"),
    ]

    grn_item_id = models.CharField(primary_key=True, max_length=15, editable=False)
    grn         = models.ForeignKey(GRN, on_delete=models.CASCADE, related_name="items")
    product     = models.ForeignKey("products.Product", on_delete=models.CASCADE,
                                     related_name="grn_items")
    batch       = models.ForeignKey(Batch, on_delete=models.CASCADE,
                                     null=True, blank=True, related_name="grn_items")

    # Quantities
    received_cartons  = models.IntegerField(default=0)
    received_quantity = models.IntegerField(help_text="Base units")
    accepted_quantity = models.IntegerField(default=0)
    rejected_quantity = models.IntegerField(default=0)

    # Rejection details (filled when rejected_quantity > 0)
    rejection_reason = models.CharField(
        max_length=20, choices=REJECTION_REASON_CHOICES,
        blank=True, default="",
        help_text="Primary reason for rejection."
    )
    rejection_notes  = models.TextField(
        blank=True, default="",
        help_text="Free-text description of the defect / damage."
    )
    rejection_images = models.JSONField(
        default=list, blank=True,
        help_text="List of base64-encoded PNG/JPEG strings (up to 5 images)."
    )
    rejection_confirmed    = models.BooleanField(default=False)
    rejection_confirmed_at = models.DateTimeField(null=True, blank=True)
    rejection_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="rejections_confirmed"
    )

    # Product snapshot at receipt time
    snapshot_product_name      = models.CharField(max_length=255)
    snapshot_size              = models.CharField(max_length=50, blank=True, default="")
    snapshot_barcode           = models.CharField(max_length=100)
    snapshot_package_type      = models.CharField(max_length=10)
    snapshot_base_unit         = models.CharField(max_length=50)
    snapshot_purchase_unit     = models.CharField(max_length=50)
    snapshot_conversion_factor = models.DecimalField(max_digits=10, decimal_places=4)
    snapshot_carton_price      = models.DecimalField(max_digits=12, decimal_places=2)
    snapshot_gst_percent       = models.DecimalField(max_digits=5,  decimal_places=2)
    snapshot_weight_kg         = models.FloatField(default=0)
    snapshot_length_cm         = models.FloatField(default=0)
    snapshot_width_cm          = models.FloatField(default=0)
    snapshot_height_cm         = models.FloatField(default=0)
    snapshot_abc               = models.CharField(max_length=1, blank=True, default="")
    snapshot_xyz               = models.CharField(max_length=1, blank=True, default="")
    snapshot_ved               = models.CharField(max_length=1, blank=True, default="")

    # Pricing
    unit_price  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # NEW (Option B): per-item barcode generated after QC approval
    barcode_image = models.TextField(
        blank=True, default="",
        help_text="Base64 PNG of Code128 barcode encoding this grn_item_id. "
                  "Generated after QC approval. Workers scan this for putaway."
    )

    qc_status  = models.CharField(max_length=15, choices=QC_STATUS_CHOICES, default="Pending")
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def snapshot_volume_cm3(self):
        return (self.snapshot_length_cm *
                self.snapshot_width_cm *
                self.snapshot_height_cm)

    def clean(self):
        if self.accepted_quantity + self.rejected_quantity > self.received_quantity:
            raise ValidationError(
                "Accepted + Rejected quantities cannot exceed Received quantity."
            )
        if self.accepted_quantity < 0 or self.rejected_quantity < 0:
            raise ValidationError("Quantities cannot be negative.")

    def save(self, *args, **kwargs):
        self.clean()
        
        # Auto-calculate total_price
        self.total_price = float(self.unit_price) * self.received_quantity

        if not self.grn_item_id:
            with transaction.atomic():
                last   = GRNItem.objects.select_for_update().order_by("-grn_item_id").first()
                new_id = (int(last.grn_item_id.split("-")[-1]) + 1) if last else 1
                self.grn_item_id = f"GRN-ITM-{new_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.grn_item_id} | {self.snapshot_product_name} ({self.snapshot_size})"


# ─────────────────────────────────────────────
# PUTAWAY PLAN
# ─────────────────────────────────────────────

class PutawayPlan(models.Model):
    STATUS_CHOICES = [
        ("Pending",    "Pending"),
        ("Completed",  "Completed"),
        ("Reassigned", "Reassigned — New bin assigned"),
    ]
    plan_id          = models.CharField(primary_key=True, max_length=15, editable=False)
    grn_item         = models.ForeignKey(GRNItem, on_delete=models.CASCADE,
                                          related_name="putaway_plans")
    product          = models.ForeignKey("products.Product", on_delete=models.CASCADE,
                                          related_name="putaway_plans")
    vendor           = models.ForeignKey("vendors.Vendor", on_delete=models.CASCADE,
                                          related_name="putaway_plans")
    batch            = models.ForeignKey(Batch, on_delete=models.CASCADE,
                                          related_name="putaway_plans")
    bin              = models.ForeignKey(Bin, on_delete=models.CASCADE,
                                          related_name="putaway_plans")
    planned_quantity = models.IntegerField()
    quantity_placed  = models.IntegerField(default=0)
    status           = models.CharField(max_length=15, choices=STATUS_CHOICES, default="Pending")
    completed_by     = models.ForeignKey("auth.User", on_delete=models.SET_NULL,
                                          null=True, blank=True, related_name="completed_putaways")
    completed_at     = models.DateTimeField(null=True, blank=True)
    notes            = models.TextField(blank=True, default="")
    created_at       = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.plan_id:
            with transaction.atomic():
                last   = PutawayPlan.objects.select_for_update().order_by("-plan_id").first()
                new_id = (int(last.plan_id.split("-")[-1]) + 1) if last else 1
                self.plan_id = f"PAP-{new_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.plan_id} | {self.product} | "
            f"Bin {self.bin_id} | {self.planned_quantity} units | {self.status}"
        )