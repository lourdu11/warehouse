"""
products/admin.py

Django admin registrations for the Products app.

Key behaviours:
  - Direct product creation is disabled in the API but allowed in admin for
    superuser data-fix scenarios (matches the business rule intent).
  - product_id, sku_code, unit_price are always read-only (auto-generated).
  - Zone assignment uses a raw_id_field to avoid loading all zones in the dropdown.
  - ABC / XYZ / VED / package_type are editable post-creation.
  - Products needing zone assignment are surfaced via a list_filter.
"""

from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from .models import Product


# ─────────────────────────────────────────────
# PRODUCT
# ─────────────────────────────────────────────

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    # ── List view ─────────────────────────────────────────────────────────────
    list_display = [
        "product_id", "product_name", "brand_name", "barcode",
        "category", "zone_display", "package_type",
        "ABC", "XYZ", "VED",
        "carton_price", "unit_price",
        "is_active", "is_multi_vendor", "created_at",
    ]
    list_filter  = [
        "is_active", "is_deprecated",
        "ABC", "XYZ", "VED",
        "package_type",
        "is_multi_vendor", "is_first_vendor",
        ("zone", admin.RelatedOnlyFieldListFilter),
    ]
    search_fields = [
        "product_id", "product_name", "brand_name",
        "barcode", "sku_code", "category",
        "vendor__vendor_name",
    ]
    ordering      = ["-created_at"]
    list_per_page = 50

    # ── Detail view ───────────────────────────────────────────────────────────
    readonly_fields = [
        "product_id", "sku_code",
        "unit_price", "volume_cm3_display",
        "effective_reorder_point_display",
        "reorder_point", "avg_lead_time", "avg_daily_sales",
        "is_first_vendor", "is_multi_vendor",
        "created_at", "updated_at",
    ]
    raw_id_fields = ["vendor", "zone"]

    fieldsets = [
        ("Identity", {
            "fields": [
                "product_id", "product_name", "brand_name",
                "barcode", "sku_code", "description",
                "category", "size",
            ],
        }),
        ("Inventory Classification", {
            "fields": ["ABC", "XYZ", "VED"],
        }),
        ("Reorder", {
            "fields": [
                "re_order", "reorder_point", "effective_reorder_point_display",
                "avg_lead_time", "avg_daily_sales",
            ],
        }),
        ("Unit Structure & Pricing", {
            "fields": [
                "package_type",
                "base_unit", "purchase_unit", "conversion_factor",
                "carton_price", "unit_price",
                "gst_percent",
            ],
        }),
        ("Physical Dimensions (base unit)", {
            "classes": ["collapse"],
            "fields": ["weight_kg", "length_cm", "width_cm", "height_cm", "volume_cm3_display"],
        }),
        ("Zone & Vendor", {
            "fields": [
                "zone",
                "vendor", "is_first_vendor", "is_multi_vendor",
            ],
        }),
        ("Status", {
            "fields": ["is_active", "is_deprecated", "migrated_from_product_id"],
        }),
        ("Timestamps", {
            "classes": ["collapse"],
            "fields": ["created_at", "updated_at"],
        }),
    ]

    # ── Custom columns ────────────────────────────────────────────────────────

    def zone_display(self, obj):
        if obj.zone:
            return format_html(
                "<span title='{}'>{}</span>",
                obj.zone.zone_type,
                obj.zone.zone_id,
            )
        # Static string with no placeholders — use mark_safe instead of format_html
        return mark_safe("<span style='color:red;'>&#9888; No Zone</span>")
    zone_display.short_description = "Zone"
    zone_display.admin_order_field = "zone"

    def volume_cm3_display(self, obj):
        return f"{obj.volume_cm3:.2f} cm³"
    volume_cm3_display.short_description = "Volume (cm³)"

    # Renamed to avoid clash with the model property effective_reorder_point
    def effective_reorder_point_display(self, obj):
        return obj.effective_reorder_point
    effective_reorder_point_display.short_description = "Effective Reorder Point"

    # ── Actions ───────────────────────────────────────────────────────────────

    actions = ["mark_active", "mark_inactive", "recalculate_reorder"]

    @admin.action(description="Mark selected products as active")
    def mark_active(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} product(s) marked as active.")

    @admin.action(description="Mark selected products as inactive")
    def mark_inactive(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} product(s) marked as inactive.")

    @admin.action(description="Recalculate reorder point for selected products")
    def recalculate_reorder(self, request, queryset):
        from Inventory.utils import update_product_reorder_level

        count  = 0
        errors = 0
        for product in queryset:
            try:
                update_product_reorder_level(product)
                count += 1
            except Exception:
                errors += 1

        if count:
            self.message_user(request, f"Reorder point recalculated for {count} product(s).")
        if errors:
            self.message_user(
                request,
                f"{errors} product(s) failed to recalculate.",
                level="warning",
            )