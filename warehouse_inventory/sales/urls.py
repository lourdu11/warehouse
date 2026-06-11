from django.urls import path
from .views import (
    CustomerListCreateView,
    CustomerDetailView,
    CPRListCreateView,
    CPRInventoryActionView,
    SOListCreateView,
    SOSupervisorActionView,
    SOPaymentView,
    SOFinanceConfirmView,
    SODispatchView,
    SOPickPackView,
    SOPrintLogsheetView,
    SODecodeBarcodeView,
    SOPaymentListView,
    SOBalancePaymentView,
)

urlpatterns = [
    path("customers/", CustomerListCreateView.as_view(), name="customer-list-create"),
    path("customers/<str:customer_id>/", CustomerDetailView.as_view(), name="customer-detail"),

    # ── Customer Purchase Request ──────────────────────────────────────────
    path("cpr/",                              CPRListCreateView.as_view(),      name="cpr-list-create"),
    path("cpr/<str:cpr_id>/inventory-action/", CPRInventoryActionView.as_view(), name="cpr-inventory-action"),

    # ── Sales Order ────────────────────────────────────────────────────────
    path("so/",                                SOListCreateView.as_view(),       name="so-list-create"),
    path("so/decode-barcode/",                 SODecodeBarcodeView.as_view(),    name="so-decode-barcode"),
    path("so/<str:so_id>/supervisor-action/",  SOSupervisorActionView.as_view(), name="so-supervisor-action"),
    path("so/<str:so_id>/payment/",            SOPaymentView.as_view(),          name="so-payment"),
    path("so/<str:so_id>/finance-confirm/",    SOFinanceConfirmView.as_view(),   name="so-finance-confirm"),
    path("so/<str:so_id>/pick-pack/",          SOPickPackView.as_view(),         name="so-pick-pack"),
    path("so/<str:so_id>/print-logsheet/",     SOPrintLogsheetView.as_view(),    name="so-print-logsheet"),
    path("so/<str:so_id>/dispatch/",           SODispatchView.as_view(),         name="so-dispatch"),
    path("so/<str:so_id>/balance-payment/",    SOBalancePaymentView.as_view(),   name="so-balance-payment"),

    # ── Payments ───────────────────────────────────────────────────────────
    path("payments/",                          SOPaymentListView.as_view(),      name="payment-list"),
]
