from django.contrib import admin
from .models import CustomerPurchaseRequest, SalesOrder, SOPayment


@admin.register(CustomerPurchaseRequest)
class CPRAdmin(admin.ModelAdmin):
    list_display  = ["cpr_id", "customer_name", "customer_phone", "product", "requested_quantity", "total_amount", "status", "created_at"]
    list_filter   = ["status"]
    search_fields = ["cpr_id", "customer_name", "customer_phone", "customer_gstin"]
    readonly_fields = ["cpr_id", "total_amount", "created_at", "updated_at"]
    ordering      = ["-created_at"]


@admin.register(SalesOrder)
class SOAdmin(admin.ModelAdmin):
    list_display  = ["so_id", "cpr", "product", "quantity", "total_amount", "status", "created_at"]
    list_filter   = ["status"]
    search_fields = ["so_id", "cpr__customer_name"]
    readonly_fields = ["so_id", "total_amount", "created_at", "updated_at"]
    ordering      = ["-created_at"]


@admin.register(SOPayment)
class SOPaymentAdmin(admin.ModelAdmin):
    list_display  = ["payment_id", "so", "payment_type", "amount_received", "balance_due", "finance_confirmed", "created_at"]
    list_filter   = ["payment_type", "finance_confirmed"]
    search_fields = ["payment_id", "so__so_id"]
    readonly_fields = ["payment_id", "balance_due", "created_at", "updated_at"]
    ordering      = ["-created_at"]
