"""
sales/serializers.py
"""
from rest_framework import serializers
from .models import Customer, CustomerPurchaseRequest, SalesOrder, SOPayment


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "customer_id", "company_name", "contact_person", "email",
            "phone", "location", "gstin", "status",
            "created_at", "updated_at"
        ]
        read_only_fields = ["customer_id", "created_at", "updated_at"]


class CustomerPurchaseRequestSerializer(serializers.ModelSerializer):
    product_name    = serializers.CharField(source="product.product_name", read_only=True)
    product_id      = serializers.CharField(source="product.product_id", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    checked_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = CustomerPurchaseRequest
        fields = [
            "cpr_id", "customer", "customer_name", "customer_phone", "customer_email",
            "customer_address", "customer_gstin",
            "product", "product_id", "product_name",
            "requested_quantity", "unit_price", "total_amount",
            "notes", "status", "inventory_notes",
            "inventory_checked_by", "checked_by_name", "inventory_checked_at",
            "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = [
            "cpr_id", "total_amount", "status",
            "inventory_checked_by", "inventory_checked_at",
            "created_by", "created_at", "updated_at",
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_checked_by_name(self, obj):
        if obj.inventory_checked_by:
            return f"{obj.inventory_checked_by.first_name} {obj.inventory_checked_by.last_name}".strip() or obj.inventory_checked_by.username
        return None


class SalesOrderSerializer(serializers.ModelSerializer):
    product_name          = serializers.CharField(source="product.product_name", read_only=True)
    product_id_display    = serializers.CharField(source="product.product_id", read_only=True)
    customer_name         = serializers.CharField(source="cpr.customer_name", read_only=True)
    customer_phone        = serializers.CharField(source="cpr.customer_phone", read_only=True)
    customer_email        = serializers.CharField(source="cpr.customer_email", read_only=True)
    customer_address      = serializers.CharField(source="cpr.customer_address", read_only=True)
    cpr_status            = serializers.CharField(source="cpr.status", read_only=True)
    created_by_name       = serializers.SerializerMethodField()
    supervisor_name       = serializers.SerializerMethodField()
    payment_info          = serializers.SerializerMethodField()

    class Meta:
        model  = SalesOrder
        fields = [
            "so_id", "cpr", "cpr_status",
            "customer_name", "customer_phone", "customer_email", "customer_address",
            "product", "product_id_display", "product_name",
            "quantity", "unit_price", "total_amount",
            "status", "supervisor_notes",
            "supervisor_reviewed_by", "supervisor_name", "supervisor_reviewed_at",
            "created_by", "created_by_name", "created_at", "updated_at",
            "payment_info",
            "barcode", "barcode_image", "driver_name", "vehicle_number", "logsheet_printed",
        ]
        read_only_fields = [
            "so_id", "total_amount", "status",
            "supervisor_reviewed_by", "supervisor_reviewed_at",
            "created_by", "created_at", "updated_at",
            "product", "quantity", "unit_price",
            "barcode", "barcode_image", "logsheet_printed",
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_supervisor_name(self, obj):
        if obj.supervisor_reviewed_by:
            return f"{obj.supervisor_reviewed_by.first_name} {obj.supervisor_reviewed_by.last_name}".strip() or obj.supervisor_reviewed_by.username
        return None

    def get_payment_info(self, obj):
        try:
            p = obj.payment
            return {
                "payment_id":      p.payment_id,
                "payment_type":    p.payment_type,
                "amount_received": str(p.amount_received),
                "balance_due":     str(p.balance_due),
                "finance_confirmed": p.finance_confirmed,
                "confirmed_at":    p.confirmed_at,
            }
        except SOPayment.DoesNotExist:
            return None


class SOPaymentSerializer(serializers.ModelSerializer):
    so_status       = serializers.CharField(source="so.status", read_only=True)
    so_total        = serializers.DecimalField(source="so.total_amount", max_digits=14, decimal_places=2, read_only=True)
    customer_name   = serializers.CharField(source="so.cpr.customer_name", read_only=True)
    product_name    = serializers.CharField(source="so.product.product_name", read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = SOPayment
        fields = [
            "payment_id", "so", "so_status", "so_total",
            "customer_name", "product_name",
            "payment_type", "amount_received", "balance_due",
            "payment_notes", "finance_confirmed", "finance_notes",
            "finance_confirmed_by", "confirmed_by_name", "confirmed_at",
            "recorded_by", "recorded_by_name", "created_at", "updated_at",
        ]
        read_only_fields = [
            "payment_id", "balance_due",
            "finance_confirmed", "finance_confirmed_by", "confirmed_at",
            "recorded_by", "created_at", "updated_at",
        ]

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return f"{obj.recorded_by.first_name} {obj.recorded_by.last_name}".strip() or obj.recorded_by.username
        return None

    def get_confirmed_by_name(self, obj):
        if obj.finance_confirmed_by:
            return f"{obj.finance_confirmed_by.first_name} {obj.finance_confirmed_by.last_name}".strip() or obj.finance_confirmed_by.username
        return None
