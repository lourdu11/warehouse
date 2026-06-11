"""
vendors/serializers.py
"""
from rest_framework import serializers
from .models import (
    Category, Warehouse, Vendor,
    VendorAgreement, VendorAgreementProduct,
    VendorProduct, RejectedAgreement,
)


# ─────────────────────────────────────────────
# CATEGORY
# ─────────────────────────────────────────────

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = Category
        fields = ["id", "name", "zone_type", "description", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_name(self, value):
        # Normalize before uniqueness check
        return value.strip().lower()


# ─────────────────────────────────────────────
# WAREHOUSE
# ─────────────────────────────────────────────

class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Warehouse
        fields = "__all__"


# ─────────────────────────────────────────────
# VENDOR
# ─────────────────────────────────────────────

class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Vendor
        fields = [
            "vendor_id", "vendor_name", "contact_person",
            "email", "phone", "gstin",
            "address", "city", "state", "country",
            "lead_time", "payment_terms",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["vendor_id", "created_at", "updated_at"]

    def validate_gstin(self, value):
        if value:
            return value.strip().upper()
        return value

    def validate_email(self, value):
        if value:
            return value.strip().lower()
        return value


# ─────────────────────────────────────────────
# VENDOR AGREEMENT
# ─────────────────────────────────────────────

class VendorAgreementSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.vendor_name", read_only=True)

    class Meta:
        model  = VendorAgreement
        fields = [
            "agreement_id", "vendor", "vendor_name",
            "file", "valid_from", "valid_until",
            "payment_terms", "delivery_location", "notes",
            "is_active", "uploaded_at",
        ]
        read_only_fields = ["agreement_id", "uploaded_at", "is_active"]


# ─────────────────────────────────────────────
# VENDOR AGREEMENT PRODUCT
# ─────────────────────────────────────────────

class VendorAgreementProductSerializer(serializers.ModelSerializer):
    vendor_name   = serializers.CharField(source="vendor.vendor_name",         read_only=True)
    agreement_ref = serializers.CharField(source="agreement.agreement_id",     read_only=True)
    category_name = serializers.CharField(source="category.name",              read_only=True,
                                           allow_null=True)
    zone_type     = serializers.CharField(source="category.zone_type",         read_only=True,
                                           allow_null=True)
    unit_price    = serializers.ReadOnlyField()
    carton_volume_cm3 = serializers.ReadOnlyField()

    class Meta:
        model  = VendorAgreementProduct
        fields = [
            "id", "vendor", "vendor_name",
            "agreement", "agreement_ref",
            "barcode", "product_name", "variant", "sku",
            # Category
            "category", "category_name", "zone_type",
            # Unit structure
            "base_unit", "purchase_unit", "conversion_factor",
            "vendor_price", "unit_price", "gst_percent", "moq", "lead_time",
            # Base unit dims
            "weight_kg", "length_cm", "width_cm", "height_cm",
            # Carton dims
            "carton_weight_kg", "carton_length_cm", "carton_width_cm",
            "carton_height_cm", "carton_volume_cm3",
            # Mapping
            "mapped_product", "is_mapped", "is_new_product", "is_multi_vendor",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "vendor_name", "agreement_ref",
            "category_name", "zone_type",
            "unit_price", "carton_volume_cm3",
            "is_mapped", "is_new_product", "is_multi_vendor",
            "created_at", "updated_at",
        ]

    def validate_conversion_factor(self, value):
        if value <= 0:
            raise serializers.ValidationError("conversion_factor must be > 0.")
        return value

    def validate_vendor_price(self, value):
        if value < 0:
            raise serializers.ValidationError("vendor_price cannot be negative.")
        return value


# ─────────────────────────────────────────────
# VENDOR PRODUCT  (legacy)
# ─────────────────────────────────────────────

class VendorProductSerializer(serializers.ModelSerializer):
    vendor_name      = serializers.CharField(source="vendor.vendor_name",         read_only=True)
    mapped_product_name = serializers.CharField(
        source="mapped_product.product_name", read_only=True, allow_null=True
    )

    class Meta:
        model  = VendorProduct
        fields = [
            "id", "vendor", "vendor_name",
            "product_name", "barcode", "vendor_price",
            "mapped_product", "mapped_product_name",
            "is_mapped", "match_score", "created_at",
        ]
        read_only_fields = ["id", "is_mapped", "match_score", "created_at"]


# ─────────────────────────────────────────────
# REJECTED AGREEMENT
# ─────────────────────────────────────────────

class RejectedAgreementSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RejectedAgreement
        fields = [
            "id", "reason", "gstin_in_pdf", "email_in_pdf",
            "vendor_id_provided", "file_name", "detail", "rejected_at",
        ]
        read_only_fields = fields