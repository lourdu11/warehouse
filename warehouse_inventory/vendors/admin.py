from django.contrib import admin
from .models import (
    Category, Warehouse, Vendor,
    VendorAgreement, VendorAgreementProduct,
    VendorProduct, RejectedAgreement
)


# ─────────────────────────────────────────────
# CATEGORY
# ─────────────────────────────────────────────

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "zone_type", "created_at")
    search_fields = ("name",)
    list_filter = ("zone_type",)
    ordering = ("name",)


# ─────────────────────────────────────────────
# WAREHOUSE
# ─────────────────────────────────────────────

@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ("warehouse_id", "warehouse_name", "city", "state", "country")
    search_fields = ("warehouse_id", "warehouse_name", "city")
    list_filter = ("country", "state")
    ordering = ("warehouse_name",)


# ─────────────────────────────────────────────
# VENDOR
# ─────────────────────────────────────────────

@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ("vendor_id", "vendor_name", "email", "phone", "gstin", "lead_time", "is_active")
    search_fields = ("vendor_id", "vendor_name", "email", "gstin")
    list_filter = ("is_active", "state", "country")
    ordering = ("vendor_name",)
    readonly_fields = ("created_at", "updated_at")


# ─────────────────────────────────────────────
# INLINE: AGREEMENT PRODUCTS
# ─────────────────────────────────────────────

class VendorAgreementProductInline(admin.TabularInline):
    model = VendorAgreementProduct
    extra = 1
    fields = (
        "barcode", "product_name", "category",
        "base_unit", "purchase_unit", "conversion_factor",
        "vendor_price", "gst_percent",
        "carton_weight_kg", "carton_length_cm", "carton_width_cm", "carton_height_cm",
        "is_mapped", "mapped_product"
    )
    show_change_link = True


# ─────────────────────────────────────────────
# VENDOR AGREEMENT
# ─────────────────────────────────────────────

@admin.register(VendorAgreement)
class VendorAgreementAdmin(admin.ModelAdmin):
    list_display = ("agreement_id", "vendor", "valid_from", "valid_until", "is_active", "uploaded_at")
    search_fields = ("agreement_id", "vendor__vendor_name")
    list_filter = ("is_active", "valid_from", "valid_until")
    ordering = ("-uploaded_at",)
    readonly_fields = ("agreement_id", "uploaded_at")

    inlines = [VendorAgreementProductInline]


# ─────────────────────────────────────────────
# VENDOR AGREEMENT PRODUCT
# ─────────────────────────────────────────────

@admin.register(VendorAgreementProduct)
class VendorAgreementProductAdmin(admin.ModelAdmin):
    list_display = (
        "product_name", "vendor", "agreement",
        "barcode", "category",
        "conversion_factor", "vendor_price", "unit_price",
        "is_mapped", "is_new_product"
    )
    search_fields = ("product_name", "barcode", "vendor__vendor_name")
    list_filter = ("category", "is_mapped", "is_new_product", "is_multi_vendor")
    ordering = ("product_name",)
    readonly_fields = ("created_at", "updated_at", "unit_price")

    autocomplete_fields = ("vendor", "agreement", "category", "mapped_product")


# ─────────────────────────────────────────────
# LEGACY VENDOR PRODUCT
# ─────────────────────────────────────────────

@admin.register(VendorProduct)
class VendorProductAdmin(admin.ModelAdmin):
    list_display = ("product_name", "vendor", "barcode", "vendor_price", "is_mapped", "match_score")
    search_fields = ("product_name", "barcode", "vendor__vendor_name")
    list_filter = ("is_mapped",)
    ordering = ("product_name",)


# ─────────────────────────────────────────────
# REJECTED AGREEMENTS
# ─────────────────────────────────────────────

@admin.register(RejectedAgreement)
class RejectedAgreementAdmin(admin.ModelAdmin):
    list_display = ("reason", "vendor_id_provided", "gstin_in_pdf", "email_in_pdf", "rejected_at")
    search_fields = ("vendor_id_provided", "gstin_in_pdf", "email_in_pdf", "file_name")
    list_filter = ("reason", "rejected_at")
    ordering = ("-rejected_at",)
    readonly_fields = ("rejected_at",)
