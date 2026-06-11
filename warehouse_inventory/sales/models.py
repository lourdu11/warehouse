"""
sales/models.py

Outbound Sales Workflow:
  CPR (Customer Purchase Request)
    → Inventory Manager confirms stock
    → Sales Manager creates SO (Sales Order)
    → Supervisor approves SO
    → Sales Manager records payment (full / advance)
    → Finance Director confirms payment & finalises SO
    → Inventory Manager does Pick & Pack → Dispatch
"""

from django.db import models, transaction
from django.conf import settings


# ─────────────────────────────────────────────────────────────────────────────
# CUSTOMER
# ─────────────────────────────────────────────────────────────────────────────

class Customer(models.Model):
    STATUS_CHOICES = [
        ("Active", "Active"),
        ("Inactive", "Inactive"),
    ]

    customer_id    = models.CharField(max_length=10, primary_key=True, editable=False)
    company_name   = models.CharField(max_length=150)
    contact_person = models.CharField(max_length=150, blank=True, default="")
    email          = models.EmailField(blank=True, default="")
    phone          = models.CharField(max_length=20)
    location       = models.TextField(blank=True, default="")
    gstin          = models.CharField(max_length=15, blank=True, default="")
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Active")

    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Customer"
        verbose_name_plural = "Customers"

    def save(self, *args, **kwargs):
        if not self.customer_id:
            with transaction.atomic():
                last = Customer.objects.select_for_update().order_by("-customer_id").first()
                new_id = (int(last.customer_id[3:]) + 1) if last else 1
                self.customer_id = f"CUS{new_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.customer_id} | {self.company_name}"


# ─────────────────────────────────────────────────────────────────────────────
# CUSTOMER PURCHASE REQUEST  (CPR)
# ─────────────────────────────────────────────────────────────────────────────

class CustomerPurchaseRequest(models.Model):
    STATUS_CHOICES = [
        ("Pending",          "Pending — Awaiting Inventory Check"),
        ("Stock Confirmed",  "Stock Confirmed by Inventory Manager"),
        ("Stock Rejected",   "Stock Rejected by Inventory Manager"),
        ("SO Created",       "Sales Order Created"),
    ]

    cpr_id             = models.CharField(max_length=10, primary_key=True, editable=False)

    # Linked Customer (optional for backwards compatibility)
    customer           = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="cprs"
    )

    # Customer details snapshots
    customer_name      = models.CharField(max_length=150)
    customer_phone     = models.CharField(max_length=20)
    customer_email     = models.EmailField(blank=True, default="")
    customer_address   = models.TextField(blank=True, default="")
    customer_gstin     = models.CharField(max_length=15, blank=True, default="")

    # Product & pricing
    product            = models.ForeignKey(
        "products.Product", on_delete=models.CASCADE, related_name="cprs"
    )
    requested_quantity = models.IntegerField(help_text="Base units")
    unit_price         = models.DecimalField(max_digits=12, decimal_places=2)
    total_amount       = models.DecimalField(max_digits=14, decimal_places=2, editable=False)

    notes              = models.TextField(blank=True, default="")

    # Inventory manager response
    status             = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="Pending"
    )
    inventory_notes    = models.TextField(blank=True, default="")
    inventory_checked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="cprs_checked"
    )
    inventory_checked_at = models.DateTimeField(null=True, blank=True)

    # Creator
    created_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="cprs_created"
    )
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Customer Purchase Request"
        verbose_name_plural = "Customer Purchase Requests"

    def save(self, *args, **kwargs):
        # Auto-generate primary key
        if not self.cpr_id:
            with transaction.atomic():
                last = CustomerPurchaseRequest.objects.select_for_update().order_by("-cpr_id").first()
                new_id = (int(last.cpr_id[3:]) + 1) if last else 1
                self.cpr_id = f"CPR{new_id:04d}"
        # Auto-calculate total
        self.total_amount = self.unit_price * self.requested_quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.cpr_id} | {self.customer_name} | {self.product} | {self.status}"


# ─────────────────────────────────────────────────────────────────────────────
# SALES ORDER  (SO)
# ─────────────────────────────────────────────────────────────────────────────

class SalesOrder(models.Model):
    STATUS_CHOICES = [
        ("Pending Supervisor",  "Pending — Awaiting Supervisor Approval"),
        ("Supervisor Approved", "Approved by Supervisor"),
        ("Supervisor Rejected", "Rejected by Supervisor"),
        ("Payment Pending",     "Payment Pending — Awaiting Finance"),
        ("Finance Confirmed",   "Confirmed by Finance Director"),
        ("Pick & Pack",         "Pick & Pack in Progress"),
        ("Ready for Dispatch",  "Ready for Dispatch"),
        ("Dispatched",          "Dispatched"),
    ]

    so_id              = models.CharField(max_length=10, primary_key=True, editable=False)
    cpr                = models.OneToOneField(
        CustomerPurchaseRequest, on_delete=models.CASCADE, related_name="sales_order"
    )
    product            = models.ForeignKey(
        "products.Product", on_delete=models.CASCADE, related_name="sales_orders"
    )
    quantity           = models.IntegerField(help_text="Base units")
    unit_price         = models.DecimalField(max_digits=12, decimal_places=2)
    total_amount       = models.DecimalField(max_digits=14, decimal_places=2, editable=False)

    status             = models.CharField(
        max_length=25, choices=STATUS_CHOICES, default="Pending Supervisor"
    )

    # Barcode & Delivery Info
    barcode            = models.CharField(max_length=50, blank=True, default="")
    barcode_image      = models.TextField(blank=True, default="", help_text="Base64 PNG of Code128 barcode")
    driver_name        = models.CharField(max_length=150, blank=True, default="")
    vehicle_number     = models.CharField(max_length=50, blank=True, default="")
    logsheet_printed   = models.BooleanField(default=False)

    # Supervisor review
    supervisor_notes   = models.TextField(blank=True, default="")
    supervisor_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="sos_reviewed"
    )
    supervisor_reviewed_at = models.DateTimeField(null=True, blank=True)

    # Creator
    created_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="sos_created"
    )
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Sales Order"
        verbose_name_plural = "Sales Orders"

    def save(self, *args, **kwargs):
        if not self.so_id:
            with transaction.atomic():
                last = SalesOrder.objects.select_for_update().order_by("-so_id").first()
                new_id = (int(last.so_id[2:]) + 1) if last else 1
                self.so_id = f"SO{new_id:04d}"
        self.total_amount = self.unit_price * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.so_id} | {self.cpr.customer_name} | {self.status}"


# ─────────────────────────────────────────────────────────────────────────────
# SALES ORDER PAYMENT
# ─────────────────────────────────────────────────────────────────────────────

class SOPayment(models.Model):
    PAYMENT_TYPE_CHOICES = [
        ("full",    "Full Payment"),
        ("advance", "Advance Payment"),
    ]

    payment_id        = models.CharField(max_length=10, primary_key=True, editable=False)
    so                = models.OneToOneField(
        SalesOrder, on_delete=models.CASCADE, related_name="payment"
    )

    payment_type      = models.CharField(max_length=10, choices=PAYMENT_TYPE_CHOICES)
    amount_received   = models.DecimalField(max_digits=14, decimal_places=2)
    balance_due       = models.DecimalField(max_digits=14, decimal_places=2, editable=False)
    payment_notes     = models.TextField(blank=True, default="")

    # Finance Director confirmation
    finance_confirmed   = models.BooleanField(default=False)
    finance_notes       = models.TextField(blank=True, default="")
    finance_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="payments_confirmed"
    )
    confirmed_at        = models.DateTimeField(null=True, blank=True)

    # Recorder
    recorded_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="payments_recorded"
    )
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "SO Payment"
        verbose_name_plural = "SO Payments"

    def save(self, *args, **kwargs):
        if not self.payment_id:
            with transaction.atomic():
                last = SOPayment.objects.select_for_update().order_by("-payment_id").first()
                new_id = (int(last.payment_id[3:]) + 1) if last else 1
                self.payment_id = f"PAY{new_id:04d}"
        # Auto-calculate balance due
        self.balance_due = self.so.total_amount - self.amount_received
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.payment_id} | SO: {self.so_id} | {self.payment_type} | Confirmed: {self.finance_confirmed}"
