"""
sales/views.py

Endpoint summary:
  GET/POST   /api/sales/cpr/                     → list / create CPR  (sales_manager)
  PATCH      /api/sales/cpr/<id>/inventory-action/→ confirm / reject   (inventory_manager)
  GET/POST   /api/sales/so/                       → list / create SO   (multiple roles)
  PATCH      /api/sales/so/<id>/supervisor-action/ → approve / reject  (supervisor)
  POST       /api/sales/so/<id>/payment/          → record payment     (sales_manager)
  PATCH      /api/sales/so/<id>/finance-confirm/  → confirm payment    (finance_director)
  POST       /api/sales/so/<id>/dispatch/         → mark dispatched    (inventory_manager)
"""

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from .models import Customer, CustomerPurchaseRequest, SalesOrder, SOPayment
from .serializers import (
    CustomerSerializer,
    CustomerPurchaseRequestSerializer,
    SalesOrderSerializer,
    SOPaymentSerializer,
)
from rbac.models import Notification
from Inventory.models import Inventory, StockMovement
from django.db import transaction


# ─────────────────────────────────────────────
# Helper: get role of the calling user
# ─────────────────────────────────────────────

def get_role(request):
    try:
        return request.user.user_role.role.name
    except Exception:
        return None


def send_notification(sender, sender_role, recipient_role, ntype, title, message, url=""):
    Notification.objects.create(
        sender=sender,
        sender_role=sender_role,
        recipient_role=recipient_role,
        notification_type=ntype,
        title=title,
        message=message,
        redirect_url=url,
    )


# ─────────────────────────────────────────────
# CUSTOMERS
# ─────────────────────────────────────────────

class CustomerListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_role(request)
        if role not in ("admin", "sales_manager", "finance_director", "manager"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        customers = Customer.objects.all()
        return Response(CustomerSerializer(customers, many=True).data)

    def post(self, request):
        role = get_role(request)
        if role not in ("admin", "sales_manager"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = CustomerSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        try:
            customer = Customer.objects.get(customer_id=customer_id)
        except Customer.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(CustomerSerializer(customer).data)

    def patch(self, request, customer_id):
        role = get_role(request)
        if role not in ("admin", "sales_manager"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            customer = Customer.objects.get(customer_id=customer_id)
        except Customer.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CustomerSerializer(customer, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, customer_id):
        role = get_role(request)
        if role not in ("admin", "sales_manager"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            customer = Customer.objects.get(customer_id=customer_id)
        except Customer.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            
        # Optional: check if customer has linked CPRs before deleting
        if customer.cprs.exists():
            return Response({"error": "Cannot delete customer with existing purchase requests."}, status=status.HTTP_400_BAD_REQUEST)
            
        customer.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────
# CPR — List & Create
# ─────────────────────────────────────────────

class CPRListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_role(request)
        if role not in ("admin", "sales_manager", "inventory_manager", "supervisor", "finance_director", "manager"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        qs = CustomerPurchaseRequest.objects.select_related(
            "product", "created_by", "inventory_checked_by"
        ).all()

        # Inventory manager only sees Pending CPRs by default (can override with ?all=1)
        if role == "inventory_manager" and request.query_params.get("all") != "1":
            qs = qs.filter(status="Pending")

        serializer = CustomerPurchaseRequestSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        role = get_role(request)
        if role not in ("admin", "sales_manager"):
            return Response({"error": "Only Sales Managers can create CPRs."}, status=status.HTTP_403_FORBIDDEN)

        serializer = CustomerPurchaseRequestSerializer(data=request.data)
        if serializer.is_valid():
            cpr = serializer.save(created_by=request.user)
            # Notify inventory manager
            send_notification(
                sender=request.user,
                sender_role="sales_manager",
                recipient_role="inventory_manager",
                ntype="task",
                title=f"New CPR: {cpr.cpr_id} — Stock Check Required",
                message=(
                    f"Sales Manager {request.user.get_full_name() or request.user.username} created CPR {cpr.cpr_id} "
                    f"for {cpr.requested_quantity} units of {cpr.product.product_name} "
                    f"for customer '{cpr.customer_name}'. Please verify stock availability."
                ),
                url="/stock-check",
            )
            return Response(CustomerPurchaseRequestSerializer(cpr).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# CPR — Inventory Manager Action
# ─────────────────────────────────────────────

class CPRInventoryActionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, cpr_id):
        role = get_role(request)
        if role not in ("admin", "inventory_manager"):
            return Response({"error": "Only Inventory Managers can perform this action."}, status=status.HTTP_403_FORBIDDEN)

        try:
            cpr = CustomerPurchaseRequest.objects.get(cpr_id=cpr_id)
        except CustomerPurchaseRequest.DoesNotExist:
            return Response({"error": "CPR not found."}, status=status.HTTP_404_NOT_FOUND)

        if cpr.status != "Pending":
            return Response({"error": f"CPR is already '{cpr.status}'. Cannot change."}, status=status.HTTP_400_BAD_REQUEST)

        action = request.data.get("action")   # "confirm" or "reject"
        notes  = request.data.get("notes", "")

        if action not in ("confirm", "reject"):
            return Response({"error": "action must be 'confirm' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

        cpr.inventory_notes      = notes
        cpr.inventory_checked_by = request.user
        cpr.inventory_checked_at = timezone.now()

        if action == "confirm":
            cpr.status = "Stock Confirmed"
            notif_title = f"CPR {cpr.cpr_id} — Stock Confirmed ✅"
            notif_msg   = (
                f"Inventory Manager confirmed stock availability for CPR {cpr.cpr_id} "
                f"({cpr.requested_quantity} units of {cpr.product.product_name}). "
                f"You can now create a Sales Order."
            )
        else:
            cpr.status = "Stock Rejected"
            notif_title = f"CPR {cpr.cpr_id} — Stock Not Available ❌"
            notif_msg   = (
                f"Inventory Manager rejected CPR {cpr.cpr_id} — stock not available. "
                f"Reason: {notes or 'No reason provided.'}"
            )

        cpr.save()

        send_notification(
            sender=request.user,
            sender_role="inventory_manager",
            recipient_role="sales_manager",
            ntype="inventory",
            title=notif_title,
            message=notif_msg,
            url="/sales",
        )

        return Response(CustomerPurchaseRequestSerializer(cpr).data)


# ─────────────────────────────────────────────
# SO — List & Create
# ─────────────────────────────────────────────

class SOListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_role(request)
        if role not in ("admin", "sales_manager", "supervisor", "finance_director", "inventory_manager", "manager"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        qs = SalesOrder.objects.select_related(
            "cpr", "product", "created_by", "supervisor_reviewed_by"
        ).all()

        # Role-based filtering
        if role == "supervisor":
            qs = qs.filter(status="Pending Supervisor")
        elif role == "inventory_manager":
            qs = qs.filter(status__in=["Finance Confirmed", "Pick & Pack", "Ready for Dispatch", "Dispatched"])
        elif role == "finance_director":
            qs = qs.filter(status__in=["Supervisor Approved", "Payment Pending", "Finance Confirmed", "Pick & Pack", "Ready for Dispatch", "Dispatched"])

        serializer = SalesOrderSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        role = get_role(request)
        if role not in ("admin", "sales_manager"):
            return Response({"error": "Only Sales Managers can create Sales Orders."}, status=status.HTTP_403_FORBIDDEN)

        cpr_id = request.data.get("cpr")
        try:
            cpr = CustomerPurchaseRequest.objects.get(cpr_id=cpr_id)
        except CustomerPurchaseRequest.DoesNotExist:
            return Response({"error": "CPR not found."}, status=status.HTTP_404_NOT_FOUND)

        if cpr.status != "Stock Confirmed":
            return Response(
                {"error": f"CPR must be 'Stock Confirmed' before creating a Sales Order. Current status: '{cpr.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(cpr, "sales_order"):
            return Response({"error": "A Sales Order already exists for this CPR."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = SalesOrderSerializer(data=request.data)
        if serializer.is_valid():
            so = serializer.save(
                created_by=request.user,
                product=cpr.product,
                quantity=cpr.requested_quantity,
                unit_price=cpr.unit_price,
                status="Pending Supervisor",
            )
            # Mark CPR as SO Created
            cpr.status = "SO Created"
            cpr.save()

            send_notification(
                sender=request.user,
                sender_role="sales_manager",
                recipient_role="supervisor",
                ntype="approval",
                title=f"New Sales Order {so.so_id} — Awaiting Your Approval",
                message=(
                    f"Sales Manager created SO {so.so_id} for customer '{cpr.customer_name}' "
                    f"({so.quantity} units of {so.product.product_name}, "
                    f"Total: ₹{so.total_amount}). Please review and approve."
                ),
                url="/order-approval",
            )
            return Response(SalesOrderSerializer(so).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# SO — Supervisor Action
# ─────────────────────────────────────────────

class SOSupervisorActionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, so_id):
        role = get_role(request)
        if role not in ("admin", "supervisor"):
            return Response({"error": "Only Supervisors can perform this action."}, status=status.HTTP_403_FORBIDDEN)

        try:
            so = SalesOrder.objects.select_related("cpr", "product").get(so_id=so_id)
        except SalesOrder.DoesNotExist:
            return Response({"error": "Sales Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if so.status != "Pending Supervisor":
            return Response({"error": f"SO status is '{so.status}'. Cannot act on it now."}, status=status.HTTP_400_BAD_REQUEST)

        action = request.data.get("action")
        notes  = request.data.get("notes", "")

        if action not in ("approve", "reject"):
            return Response({"error": "action must be 'approve' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

        so.supervisor_notes        = notes
        so.supervisor_reviewed_by  = request.user
        so.supervisor_reviewed_at  = timezone.now()

        if action == "approve":
            so.status = "Supervisor Approved"
            notif_title = f"SO {so.so_id} Approved by Supervisor ✅"
            notif_msg   = (
                f"Supervisor approved Sales Order {so.so_id} for customer '{so.cpr.customer_name}'. "
                f"Please record the payment received from the customer."
            )
            
            # 1. Notify Finance Director to record payment
            send_notification(
                sender=request.user,
                sender_role="supervisor",
                recipient_role="finance_director",
                ntype="payment",
                title=f"SO {so.so_id} Approved — Awaiting Payment Recording",
                message=(
                    f"Supervisor approved Sales Order {so.so_id} for customer '{so.cpr.customer_name}'. "
                    f"Please record the payment received from the customer (Total: ₹{so.total_amount})."
                ),
                url="/sales-finance",
            )
            
            # 2. Notify Sales Manager for informational purposes
            send_notification(
                sender=request.user,
                sender_role="supervisor",
                recipient_role="sales_manager",
                ntype="approval",
                title=notif_title,
                message=f"Supervisor approved Sales Order {so.so_id} for customer '{so.cpr.customer_name}'. Finance Director has been notified to record payment.",
                url="/sales",
            )
        else:
            so.status = "Supervisor Rejected"
            notif_title = f"SO {so.so_id} Rejected by Supervisor ❌"
            notif_msg   = f"Supervisor rejected SO {so.so_id}. Reason: {notes or 'No reason provided.'}"
            
            send_notification(
                sender=request.user,
                sender_role="supervisor",
                recipient_role="sales_manager",
                ntype="approval",
                title=notif_title,
                message=notif_msg,
                url="/sales",
            )

        so.save()

        return Response(SalesOrderSerializer(so).data)


# ─────────────────────────────────────────────
# SO — Record Payment (Sales Manager)
# ─────────────────────────────────────────────

class SOPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, so_id):
        role = get_role(request)
        if role not in ("admin", "finance_director"):
            return Response({"error": "Only Finance Directors can record payments."}, status=status.HTTP_403_FORBIDDEN)

        try:
            so = SalesOrder.objects.select_related("cpr", "product").get(so_id=so_id)
        except SalesOrder.DoesNotExist:
            return Response({"error": "Sales Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if so.status != "Supervisor Approved":
            return Response(
                {"error": f"SO must be 'Supervisor Approved' before recording payment. Current: '{so.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(so, "payment"):
            return Response({"error": "Payment already recorded for this SO."}, status=status.HTTP_400_BAD_REQUEST)

        data = request.data.copy()
        data["so"] = so.so_id

        serializer = SOPaymentSerializer(data=data)
        if serializer.is_valid():
            payment = serializer.save(
                recorded_by=request.user,
                finance_confirmed=True,
                finance_confirmed_by=request.user,
                confirmed_at=timezone.now()
            )
            # Move SO directly to Finance Confirmed
            so.status = "Finance Confirmed"
            so.save()

            # Notify sales manager and inventory manager
            send_notification(
                sender=request.user,
                sender_role="finance_director",
                recipient_role="sales_manager",
                ntype="payment",
                title=f"SO {so.so_id} — Finance Confirmed ✅",
                message=(
                    f"Finance Director recorded and confirmed payment of ₹{payment.amount_received} ({payment.payment_type}) "
                    f"for SO {so.so_id}. The order is now finalised."
                ),
                url="/sales",
            )
            send_notification(
                sender=request.user,
                sender_role="finance_director",
                recipient_role="inventory_manager",
                ntype="task",
                title=f"SO {so.so_id} — Ready for Pick & Pack 📦",
                message=(
                    f"Finance confirmed SO {so.so_id} for customer '{so.cpr.customer_name}'. "
                    f"Please pick & pack {so.quantity} units of {so.product.product_name} "
                    f"and mark the order as dispatched."
                ),
                url="/stock-check",
            )
            return Response(SOPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# SO — Finance Director Confirm
# ─────────────────────────────────────────────

class SOFinanceConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, so_id):
        role = get_role(request)
        if role not in ("admin", "finance_director"):
            return Response({"error": "Only Finance Directors can confirm payments."}, status=status.HTTP_403_FORBIDDEN)

        try:
            so = SalesOrder.objects.select_related("cpr", "product", "payment").get(so_id=so_id)
        except SalesOrder.DoesNotExist:
            return Response({"error": "Sales Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if so.status != "Payment Pending":
            return Response({"error": f"SO status is '{so.status}'. Cannot confirm now."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = so.payment
        except SOPayment.DoesNotExist:
            return Response({"error": "No payment record found for this SO."}, status=status.HTTP_404_NOT_FOUND)

        finance_notes = request.data.get("finance_notes", "")

        payment.finance_confirmed    = True
        payment.finance_notes        = finance_notes
        payment.finance_confirmed_by = request.user
        payment.confirmed_at         = timezone.now()
        payment.save()

        so.status = "Finance Confirmed"
        so.save()

        # Notify both sales manager and inventory manager
        send_notification(
            sender=request.user,
            sender_role="finance_director",
            recipient_role="sales_manager",
            ntype="payment",
            title=f"SO {so.so_id} — Finance Confirmed ✅",
            message=(
                f"Finance Director confirmed payment for SO {so.so_id}. "
                f"The order is now finalised."
            ),
            url="/sales",
        )
        send_notification(
            sender=request.user,
            sender_role="finance_director",
            recipient_role="inventory_manager",
            ntype="task",
            title=f"SO {so.so_id} — Ready for Pick & Pack 📦",
            message=(
                f"Finance confirmed SO {so.so_id} for customer '{so.cpr.customer_name}'. "
                f"Please pick & pack {so.quantity} units of {so.product.product_name} "
                f"and mark the order as dispatched."
            ),
            url="/stock-check",
        )

        return Response(SalesOrderSerializer(so).data)


# ─────────────────────────────────────────────
# SO — Dispatch (Inventory Manager)
# ─────────────────────────────────────────────

class SODispatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, so_id):
        role = get_role(request)
        if role not in ("admin", "inventory_manager"):
            return Response({"error": "Only Inventory Managers can mark orders as dispatched."}, status=status.HTTP_403_FORBIDDEN)

        try:
            so = SalesOrder.objects.select_related("cpr", "product").get(so_id=so_id)
        except SalesOrder.DoesNotExist:
            return Response({"error": "Sales Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if so.status not in ("Finance Confirmed", "Pick & Pack", "Ready for Dispatch"):
            return Response(
                {"error": f"SO must be 'Finance Confirmed', 'Pick & Pack' or 'Ready for Dispatch' to dispatch. Current: '{so.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        driver_name = request.data.get("driver_name", "").strip()
        vehicle_number = request.data.get("vehicle_number", "").strip()

        if not driver_name or not vehicle_number:
            return Response({"error": "Driver details and Vehicle number are required to dispatch."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Lock the inventory rows for this product
            inventories = list(
                Inventory.objects.select_for_update()
                .select_related("product", "vendor", "batch", "bin")
                .filter(product=so.product, quantity__gt=0)
                .order_by("bin__distance_from_dispatch", "bin__pick_count")
            )
            
            total_available = sum(inv.quantity for inv in inventories)
            if so.quantity > total_available:
                return Response(
                    {"error": f"Insufficient physical stock! Required: {so.quantity}, Available: {total_available}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            remaining = so.quantity
            for inv in inventories:
                if remaining <= 0:
                    break

                deduct = min(inv.quantity, remaining)
                prev_qty = inv.quantity
                inv.quantity -= deduct
                inv.save()

                # Update bin stats
                b = inv.bin
                b.current_load -= deduct
                b.current_weight_kg = max(
                    0.0, b.current_weight_kg - deduct * (inv.product.weight_kg or 0)
                )
                b.used_volume_cm3 = max(
                    0.0, b.used_volume_cm3 - deduct * (inv.product.volume_cm3 or 0)
                )
                b.pick_count += 1
                b.last_picked_at = timezone.now()
                b.save()

                # Record stock movement
                StockMovement.objects.create(
                    product=inv.product,
                    vendor=inv.vendor,
                    batch=inv.batch,
                    bin=b,
                    movement_type="OUTBOUND",
                    quantity=deduct,
                    previous_stock=prev_qty,
                    new_stock=inv.quantity,
                )

                remaining -= deduct

            so.driver_name = driver_name
            so.vehicle_number = vehicle_number
            so.status = "Dispatched"
            so.save()

        send_notification(
            sender=request.user,
            sender_role="inventory_manager",
            recipient_role="sales_manager",
            ntype="update",
            title=f"SO {so.so_id} — Dispatched 🚚",
            message=(
                f"SO {so.so_id} for customer '{so.cpr.customer_name}' has been dispatched. "
                f"{so.quantity} units of {so.product.product_name} have been deducted from inventory and shipped."
            ),
            url="/sales",
        )

        return Response(SalesOrderSerializer(so).data)


# ─────────────────────────────────────────────
# SO — Mark Pick & Pack in Progress
# ─────────────────────────────────────────────

class SOPickPackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, so_id):
        role = get_role(request)
        if role not in ("admin", "inventory_manager"):
            return Response({"error": "Only Inventory Managers can update pick & pack status."}, status=status.HTTP_403_FORBIDDEN)

        try:
            so = SalesOrder.objects.select_related("cpr", "product").get(so_id=so_id)
        except SalesOrder.DoesNotExist:
            return Response({"error": "Sales Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if so.status != "Finance Confirmed":
            return Response({"error": f"SO must be 'Finance Confirmed' to start Pick & Pack. Current: '{so.status}'."}, status=status.HTTP_400_BAD_REQUEST)

        so.status = "Pick & Pack"
        
        # Generate barcode & barcode_image
        try:
            so_num = int(so.so_id[2:])
        except ValueError:
            so_num = 1
        barcode_val = f"{so.so_id}-ITM-D{so_num:02d}"
        so.barcode = barcode_val
        
        from Inventory.utils import _encode_barcode_to_base64
        so.barcode_image = _encode_barcode_to_base64(barcode_val)
        
        so.save()

        return Response(SalesOrderSerializer(so).data)


# ─────────────────────────────────────────────
# SO — Print Logsheet (Inventory Manager)
# ─────────────────────────────────────────────

class SOPrintLogsheetView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, so_id):
        role = get_role(request)
        if role not in ("admin", "inventory_manager"):
            return Response({"error": "Only Inventory Managers can mark logsheets as printed."}, status=status.HTTP_403_FORBIDDEN)

        try:
            so = SalesOrder.objects.select_related("cpr", "product").get(so_id=so_id)
        except SalesOrder.DoesNotExist:
            return Response({"error": "Sales Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if so.status != "Pick & Pack":
            return Response(
                {"error": f"SO must be 'Pick & Pack' to print logsheet. Current: '{so.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        so.logsheet_printed = True
        so.status = "Ready for Dispatch"
        so.save()

        return Response(SalesOrderSerializer(so).data)


# ─────────────────────────────────────────────
# SO — Decode Barcode (Inventory Manager)
# ─────────────────────────────────────────────

class SODecodeBarcodeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        role = get_role(request)
        if role not in ("admin", "inventory_manager"):
            return Response({"error": "Only Inventory Managers can decode order barcodes."}, status=status.HTTP_403_FORBIDDEN)

        barcode_val = (request.data.get("barcode_value") or "").strip()
        if not barcode_val:
            return Response({"error": "barcode_value is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            so = SalesOrder.objects.select_related("cpr", "product", "payment").get(barcode=barcode_val)
        except SalesOrder.DoesNotExist:
            return Response({"error": f"Sales Order with barcode '{barcode_val}' not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(SalesOrderSerializer(so).data)


# ─────────────────────────────────────────────
# Payments — Finance Director list
# ─────────────────────────────────────────────

class SOPaymentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_role(request)
        if role not in ("admin", "finance_director", "sales_manager", "manager"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        qs = SOPayment.objects.select_related(
            "so", "so__cpr", "so__product", "recorded_by", "finance_confirmed_by"
        ).all()

        if role == "finance_director":
            # Finance director sees unconfirmed payments by default
            if request.query_params.get("all") != "1":
                qs = qs.filter(finance_confirmed=False)

        serializer = SOPaymentSerializer(qs, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────
# SO — Record Balance Payment
# ─────────────────────────────────────────────

class SOBalancePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, so_id):
        role = get_role(request)
        if role not in ("admin", "finance_director"):
            return Response({"error": "Only Finance Directors can record balance payments."}, status=status.HTTP_403_FORBIDDEN)

        try:
            so = SalesOrder.objects.select_related("payment").get(so_id=so_id)
        except SalesOrder.DoesNotExist:
            return Response({"error": "Sales Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if not hasattr(so, "payment"):
            return Response({"error": "No initial payment found for this SO."}, status=status.HTTP_400_BAD_REQUEST)

        # Allow recording balance if status is Dispatched
        if so.status != "Dispatched":
            return Response(
                {"error": f"SO must be 'Dispatched' before recording final balance payment. Current: '{so.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from decimal import Decimal
        amount_val = request.data.get("amount", 0)
        try:
            amount = Decimal(str(amount_val))
        except:
            return Response({"error": "Invalid amount format."}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({"error": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)

        payment = so.payment
        if amount > payment.balance_due:
            return Response({"error": "Amount exceeds balance due."}, status=status.HTTP_400_BAD_REQUEST)

        # Update payment
        payment.amount_received = payment.amount_received + amount
        # payment.balance_due is auto-calculated on save in models.py
        
        notes = request.data.get("notes", "")
        if notes:
            payment.payment_notes = (payment.payment_notes + f"\nBalance Payment Note: {notes}").strip()
            
        payment.save()

        # Send notification to sales manager
        send_notification(
            sender=request.user,
            sender_role="finance_director",
            recipient_role="sales_manager",
            ntype="payment",
            title=f"Balance Payment Recorded — SO {so.so_id}",
            message=(
                f"Finance Director recorded a balance payment of ₹{amount} for SO {so.so_id}. "
                f"Remaining Balance: ₹{payment.balance_due}."
            ),
            url="/sales",
        )

        return Response({"message": "Balance payment recorded successfully.", "balance_due": payment.balance_due})

