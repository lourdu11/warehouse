"""
vendors/models.py

Models:
  - Category   : product category → zone_type mapping (normalized, case-insensitive)
  - Warehouse  : single warehouse instance
  - Vendor     : supplier master
  - VendorAgreement        : PDF-backed agreement per vendor
  - VendorAgreementProduct : per-product line in an agreement (catalog entry)
  - VendorProduct          : legacy vendor-product mapping (kept for compat)
  - RejectedAgreement      : audit log for failed uploads
"""

from django.db import models
from django.db.models.functions import Lower


# ─────────────────────────────────────────────
# CATEGORY  (new — maps product category → zone type)
# ─────────────────────────────────────────────

class Category(models.Model):
    """
    Normalized product category.
    name is stored lowercase + stripped — enforced via clean() and save().
    zone_type must match one of the Zone zone_type values in Inventory.
    """
    ZONE_TYPE_CHOICES = [
        ("Dry",    "Dry Storage"),
        ("Cold",   "Cold Storage"),
        ("Frozen", "Frozen Storage"),
        ("Ambient","Ambient"),
        ("Hazmat", "Hazardous Materials"),
    ]

    name      = models.CharField(max_length=100, unique=True,
                                  help_text="Stored lowercase+trimmed. e.g. 'beverages'")
    zone_type = models.CharField(max_length=20, choices=ZONE_TYPE_CHOICES,
                                  help_text="Zone type this category maps to")
    description = models.TextField(blank=True, default="")
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        # Normalize: lowercase + strip
        self.name = self.name.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} → {self.zone_type}"


# ─────────────────────────────────────────────
# WAREHOUSE
# ─────────────────────────────────────────────

class Warehouse(models.Model):
    warehouse_id = models.CharField(max_length=10, primary_key=True, editable=False)
    warehouse_name = models.CharField(max_length=100)
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=50, blank=True, default="")
    state = models.CharField(max_length=50, blank=True, default="")
    country = models.CharField(max_length=50, blank=True, default="")
    warehouse_email = models.EmailField(blank=True, default="")
    warehouse_phone = models.CharField(max_length=15, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.warehouse_id:
            last = Warehouse.objects.order_by('-warehouse_id').first()
            if last:
                last_id = int(last.warehouse_id[2:])
                new_id = f"WH{last_id + 1:03d}"
            else:
                new_id = "WH001"
            self.warehouse_id = new_id
        super().save(*args, **kwargs)

    def __str__(self):
        return self.warehouse_name



# ─────────────────────────────────────────────
# VENDOR
# ─────────────────────────────────────────────

class Vendor(models.Model):
    vendor_id      = models.CharField(max_length=10,  primary_key=True)
    vendor_name    = models.CharField(max_length=150)
    contact_person = models.CharField(max_length=100, blank=True, default="")
    email          = models.EmailField(unique=True,   blank=True, null=True)
    phone          = models.CharField(max_length=15,  blank=True, default="")
    gstin          = models.CharField(max_length=15,  unique=True, blank=True, null=True,
                                       help_text="15-char GST Identification Number")
    address        = models.TextField(blank=True, default="")
    city           = models.CharField(max_length=50,  blank=True, default="")
    state          = models.CharField(max_length=50,  blank=True, default="")
    country        = models.CharField(max_length=50,  blank=True, default="India")
    lead_time      = models.IntegerField(default=7,
                                          help_text="Default vendor lead time in days")
    payment_terms  = models.CharField(max_length=100, blank=True, default="",
                                       help_text="e.g. Net-30, COD")
    warehouse      = models.ForeignKey(Warehouse, on_delete=models.SET_NULL,
                                        null=True, blank=True, related_name="vendors")
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["vendor_name"]

    def save(self, *args, **kwargs):
        if not self.vendor_id:
            from django.db import transaction as _tx
            with _tx.atomic():
                last = Vendor.objects.select_for_update().order_by("vendor_id").last()
                new_id = (int(last.vendor_id[3:]) + 1) if last else 1
                self.vendor_id = f"VEN{new_id:03d}"
        # Normalize email/gstin
        if self.email:
            self.email = self.email.strip().lower()
        if self.gstin:
            self.gstin = self.gstin.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.vendor_name} ({self.vendor_id})"


# ─────────────────────────────────────────────
# VENDOR AGREEMENT
# ─────────────────────────────────────────────

class VendorAgreement(models.Model):
    agreement_id      = models.CharField(max_length=15, primary_key=True, editable=False)
    vendor            = models.ForeignKey(Vendor, on_delete=models.CASCADE,
                                           related_name="agreements")
    file              = models.FileField(upload_to="vendor_agreements/", null=True, blank=True)

    # Validity window
    valid_from        = models.DateField(null=True, blank=True)
    valid_until       = models.DateField(null=True, blank=True)

    # Commercial terms
    payment_terms     = models.CharField(max_length=150, blank=True, default="")
    delivery_location = models.CharField(max_length=150, blank=True, default="")
    notes             = models.TextField(blank=True, default="")

    # Status
    is_active         = models.BooleanField(default=True)
    uploaded_at       = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.agreement_id:
            from django.db import transaction as _tx
            with _tx.atomic():
                last = VendorAgreement.objects.select_for_update().order_by("uploaded_at").last()
                new_id = (int(last.agreement_id[3:]) + 1) if last else 1
                self.agreement_id = f"AGR{new_id:04d}"
        # Auto-expire if valid_until passed
        if self.valid_until:
            from django.utils import timezone
            if self.valid_until < timezone.now().date():
                self.is_active = False
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.agreement_id} | {self.vendor.vendor_name}"


# ─────────────────────────────────────────────
# VENDOR AGREEMENT PRODUCT  (catalog entry)
# ─────────────────────────────────────────────

class VendorAgreementProduct(models.Model):
    """
    One row per (vendor × agreement × barcode).
    This is the vendor's catalog entry for a product.

    Unit structure (mirrors Product):
      base_unit         : smallest saleable unit, e.g. "Piece", "Pouch"
      purchase_unit     : what vendor ships in, e.g. "Carton"
      conversion_factor : base units per purchase unit  (e.g. 1 Carton = 24 Pieces)
      vendor_price      : price per purchase unit (carton price)

    Dimensions are for ONE base unit (same convention as Product).
    """
    vendor      = models.ForeignKey(Vendor, on_delete=models.CASCADE,
                                     related_name="agreement_products")
    agreement   = models.ForeignKey(VendorAgreement, on_delete=models.CASCADE,
                                     related_name="products")
    barcode     = models.CharField(max_length=100, db_index=True)

    # Product identity
    product_name = models.CharField(max_length=255)
    variant      = models.CharField(max_length=100, blank=True, default="")
    sku          = models.CharField(max_length=100, blank=True, default="")

    # Category — normalized, links to Category table
    category     = models.ForeignKey(
        Category, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="agreement_products",
        help_text="Normalized category — determines zone eligibility"
    )

    # Unit structure
    base_unit         = models.CharField(max_length=50,  default="Piece")
    purchase_unit     = models.CharField(max_length=50,  default="Carton")
    conversion_factor = models.DecimalField(max_digits=10, decimal_places=4, default=1,
                                             help_text="Base units per purchase unit")
    vendor_price      = models.DecimalField(max_digits=12, decimal_places=2,
                                             help_text="Price per purchase unit (carton)")
    gst_percent       = models.DecimalField(max_digits=5,  decimal_places=2, default=18.00)
    moq               = models.IntegerField(default=1, help_text="Min order qty in purchase units")
    lead_time         = models.IntegerField(null=True, blank=True,
                                             help_text="Override vendor default lead time (days)")

    # Physical dims of ONE base unit
    weight_kg  = models.FloatField(default=0, help_text="Weight of one base unit (kg)")
    length_cm  = models.FloatField(default=0)
    width_cm   = models.FloatField(default=0)
    height_cm  = models.FloatField(default=0)

    # Carton-level dims (new — for receiving/storage planning)
    carton_weight_kg = models.FloatField(default=0, help_text="Gross weight of one carton (kg)")
    carton_length_cm = models.FloatField(default=0)
    carton_width_cm  = models.FloatField(default=0)
    carton_height_cm = models.FloatField(default=0)

    # Mapping status
    mapped_product  = models.ForeignKey(
        "products.Product", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="vendor_catalog_entries"
    )
    is_mapped       = models.BooleanField(default=False)
    is_new_product  = models.BooleanField(default=False,
                                           help_text="True if created fresh via this agreement")
    is_multi_vendor = models.BooleanField(default=False,
                                           help_text="True if another vendor also supplies this product")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("vendor", "agreement", "barcode")
        ordering        = ["product_name"]

    @property
    def unit_price(self):
        """Derived price per base unit."""
        if self.conversion_factor and float(self.conversion_factor) > 0:
            return round(float(self.vendor_price) / float(self.conversion_factor), 4)
        return float(self.vendor_price)

    @property
    def carton_volume_cm3(self):
        return self.carton_length_cm * self.carton_width_cm * self.carton_height_cm

    def __str__(self):
        return f"{self.product_name} | {self.vendor.vendor_name} | {self.barcode}"


# ─────────────────────────────────────────────
# VENDOR PRODUCT  (legacy — kept for backward compat)
# ─────────────────────────────────────────────

class VendorProduct(models.Model):
    vendor          = models.ForeignKey(Vendor, on_delete=models.CASCADE,
                                         related_name="vendor_products")
    product_name    = models.CharField(max_length=255)
    barcode         = models.CharField(max_length=100, blank=True, default="")
    vendor_price    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    mapped_product  = models.ForeignKey(
        "products.Product", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="vendor_mappings"
    )
    is_mapped       = models.BooleanField(default=False)
    match_score     = models.FloatField(default=0)
    created_at      = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.product_name} ({self.vendor.vendor_name})"


# ─────────────────────────────────────────────
# REJECTED AGREEMENT AUDIT LOG
# ─────────────────────────────────────────────

class RejectedAgreement(models.Model):
    REASON_CHOICES = [
        ("GSTIN_MISMATCH",  "GSTIN Mismatch"),
        ("EMAIL_MISMATCH",  "Email Mismatch"),
        ("MISSING_GSTIN",   "Missing GSTIN"),
        ("MISSING_EMAIL",   "Missing Email"),
        ("BOTH_MISMATCH",   "Both GSTIN and Email Mismatch"),
        ("VALIDATION_ERROR","Validation Error"),
    ]

    reason              = models.CharField(max_length=30, choices=REASON_CHOICES)
    gstin_in_pdf        = models.CharField(max_length=15, blank=True, default="")
    email_in_pdf        = models.CharField(max_length=254, blank=True, default="")
    vendor_id_provided  = models.CharField(max_length=10, blank=True, default="")
    file_name           = models.CharField(max_length=255, blank=True, default="")
    detail              = models.TextField(blank=True, default="")
    rejected_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-rejected_at"]

    def __str__(self):
        return f"{self.reason} | {self.vendor_id_provided} | {self.rejected_at:%Y-%m-%d %H:%M}"