"""
products/models.py

Product is the single inventory reference table.
Products are ONLY created via the vendor agreement parsing flow.
Direct creation is blocked at the API level (returns 403).

Key fixes vs original:
  - category field now stores normalized string (lowercase) matching Category.name
  - unit_price derivation guarded against zero conversion_factor
  - save() uses select_for_update for race-safe ID generation
  - volume_cm3 is a property (never stored — always derived)
  - reorder_point, avg_lead_time, avg_daily_sales fields for auto-PR logic
"""

from django.db import models
from django.core.exceptions import ValidationError


PACKAGE_TYPE_CHOICES = [
    ("POUCH", "Pouch"),   # lightweight → top shelf
    ("BOX",   "Box"),     # medium      → middle shelf
    ("BAG",   "Bag"),     # heavy       → bottom shelf
]

ABC_CHOICES = [("A", "A"), ("B", "B"), ("C", "C")]
VED_CHOICES = [("V", "Vital"), ("E", "Essential"), ("D", "Desirable")]
XYZ_CHOICES = [("X", "X"), ("Y", "Y"), ("Z", "Z")]


class Product(models.Model):
    # ── Identity ──────────────────────────────────────────────────────────────
    product_id   = models.CharField(max_length=10, primary_key=True, editable=False)
    product_name = models.CharField(max_length=255)
    brand_name   = models.CharField(max_length=100, blank=True, default="")
    barcode      = models.CharField(max_length=100, unique=True, db_index=True)
    sku_code     = models.CharField(max_length=200, unique=True, editable=False)
    description  = models.TextField(blank=True, default="")

    # category: normalized lowercase string matching vendors.Category.name
    # Stored as plain string for fast filtering; FK resolution done in app layer.
    category = models.CharField(
        max_length=100, blank=True, default="",
        help_text="Normalized lowercase category name, e.g. 'beverages'"
    )
    size     = models.CharField(max_length=50, blank=True, default="")
    is_active = models.BooleanField(default=True)

    # ── Inventory classification ──────────────────────────────────────────────
    ABC = models.CharField(max_length=1, choices=ABC_CHOICES, blank=True, default="")
    XYZ = models.CharField(max_length=1, choices=XYZ_CHOICES, blank=True, default="")
    VED = models.CharField(max_length=1, choices=VED_CHOICES, blank=True, default="")

    # ── Reorder ───────────────────────────────────────────────────────────────
    re_order       = models.IntegerField(default=0,
                                          help_text="Admin-set reorder point in base units")
    reorder_point  = models.IntegerField(default=0,
                                          help_text="Calculated reorder point (auto-updated)")
    avg_lead_time  = models.FloatField(default=7,
                                        help_text="Weighted avg lead time in days (auto-updated)")
    avg_daily_sales = models.FloatField(default=10,
                                         help_text="Average daily sales in base units")

    # ── Physical packaging ────────────────────────────────────────────────────
    package_type = models.CharField(
        max_length=10, choices=PACKAGE_TYPE_CHOICES, blank=True, default="",
        help_text="POUCH=top shelf, BOX=middle, BAG=bottom"
    )

    # ── Unit structure ────────────────────────────────────────────────────────
    base_unit = models.CharField(
        max_length=50, default="Piece",
        help_text="Unit for one base item (e.g. Piece, Kg, Litre)"
    )
    purchase_unit = models.CharField(
        max_length=50, default="Carton",
        help_text="Unit for purchasing (e.g. Carton, Box, Case)"
    )
    conversion_factor = models.DecimalField(
        max_digits=10, decimal_places=4, default=1,
        help_text="Base units per purchase unit (e.g. 1 Carton = 24 Pieces)"
    )
    carton_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="Price per purchase unit (carton) in INR"
    )
    gst_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=18.00
    )

    # ── Physical dimensions of one base unit ──────────────────────────────────
    weight_kg = models.FloatField(default=0, help_text="Weight of one base unit in kg")
    length_cm = models.FloatField(default=0)
    width_cm  = models.FloatField(default=0)
    height_cm = models.FloatField(default=0)

    # ── Zone ──────────────────────────────────────────────────────────────────
    zone = models.ForeignKey(
        "Inventory.Zone",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="products",
        help_text="Warehouse zone assigned by admin at product creation"
    )

    # ── Vendor link ───────────────────────────────────────────────────────────
    vendor = models.ForeignKey(
        "vendors.Vendor",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="products",
        help_text="First/primary vendor for this product"
    )
    is_first_vendor = models.BooleanField(
        default=False,
        help_text="True when only one vendor has ever supplied this product"
    )
    is_multi_vendor = models.BooleanField(
        default=False,
        help_text="True when multiple vendors supply this product"
    )

    # ── Legacy / migration ────────────────────────────────────────────────────
    is_deprecated            = models.BooleanField(default=False)
    migrated_from_product_id = models.CharField(max_length=10, blank=True, null=True)

    # ── Pricing (derived — kept for backward compat) ──────────────────────────
    unit_price = models.DecimalField(
        max_digits=12, decimal_places=4, default=0,
        help_text="Price per base unit — auto-derived: carton_price / conversion_factor"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── Auto-ID and SKU generation ────────────────────────────────────────────
    def save(self, *args, **kwargs):
        from django.db import transaction

        # Race-safe auto-ID
        if not self.product_id:
            with transaction.atomic():
                last   = Product.objects.select_for_update().order_by("product_id").last()
                new_id = (int(last.product_id[3:]) + 1) if last else 1
                self.product_id = f"PRO{new_id:03d}"

        # SKU: BRAND-PCODE-BARCODE (guaranteed unique via barcode)
        if not self.sku_code:
            brand  = (self.brand_name or "UNK")[:3].upper()
            words  = self.product_name.split()
            pcode  = "".join(w[0] for w in words if w).upper()[:5]
            self.sku_code = f"{brand}-{pcode}-{self.barcode}"

        # Normalize category to lowercase
        if self.category:
            self.category = self.category.strip().lower()

        # Derive unit_price safely — guard against zero conversion_factor
        cf = float(self.conversion_factor) if self.conversion_factor else 0
        if cf > 0 and self.carton_price:
            self.unit_price = round(float(self.carton_price) / cf, 4)
        elif self.carton_price:
            self.unit_price = float(self.carton_price)

        super().save(*args, **kwargs)

    # ── Computed properties ───────────────────────────────────────────────────
    @property
    def volume_cm3(self):
        """Volume of one base unit in cm³."""
        return self.length_cm * self.width_cm * self.height_cm

    @property
    def effective_reorder_point(self):
        """
        Returns the best reorder threshold available:
          admin-set re_order > calculated reorder_point > 0
        """
        return self.re_order or self.reorder_point or 0

    @property
    def allocated_stock(self):
        """Total stock reserved for confirmed CPRs and active Sales Orders (not yet dispatched)."""
        from sales.models import CustomerPurchaseRequest, SalesOrder
        from django.db.models import Sum
        
        cpr_alloc = CustomerPurchaseRequest.objects.filter(
            product=self, status="Stock Confirmed"
        ).aggregate(total=Sum("requested_quantity"))["total"] or 0
        
        so_alloc = SalesOrder.objects.filter(
            product=self,
            status__in=["Pending Supervisor", "Supervisor Approved", "Payment Pending", "Finance Confirmed", "Pick & Pack"]
        ).aggregate(total=Sum("quantity"))["total"] or 0
        
        return cpr_alloc + so_alloc

    @property
    def total_stock(self):
        """Total physical inventory present in the warehouse."""
        from Inventory.models import Inventory
        from django.db.models import Sum
        return Inventory.objects.filter(product=self).aggregate(total=Sum("quantity"))["total"] or 0

    @property
    def available_stock(self):
        """Total physical inventory minus allocated stock."""
        return self.total_stock - self.allocated_stock

    def __str__(self):
        return f"{self.product_name} ({self.product_id})"

    class Meta:
        indexes = [
            models.Index(fields=["barcode"]),
            models.Index(fields=["product_name"]),
            models.Index(fields=["category"]),
        ]