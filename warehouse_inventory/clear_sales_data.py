import os
import django
from django.db import transaction

import sys
# Setup django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "warehouse.settings")
django.setup()

from sales.models import CustomerPurchaseRequest, SalesOrder, SOPayment
from Inventory.models import Inventory, StockMovement, Bin

def clear_sales_transactions():
    print("Starting transaction rollback and sales data clearance...")
    with transaction.atomic():
        # 1. Reverse Outbound stock movements to restore inventory levels
        outbound_movements = StockMovement.objects.filter(movement_type="OUTBOUND")
        print(f"Found {outbound_movements.count()} outbound movements to reverse.")
        
        for move in outbound_movements:
            # Restore Inventory row
            inv, created = Inventory.objects.get_or_create(
                product=move.product,
                vendor=move.vendor,
                batch=move.batch,
                bin=move.bin,
                defaults={"quantity": 0}
            )
            inv.quantity += move.quantity
            inv.save()
            
            # Restore Bin stats
            bin_obj = move.bin
            bin_obj.current_load += move.quantity
            weight_factor = move.product.weight_kg or 0.0
            volume_factor = move.product.volume_cm3 or 0.0
            bin_obj.current_weight_kg += move.quantity * weight_factor
            bin_obj.used_volume_cm3 += move.quantity * volume_factor
            bin_obj.save()
            
            print(f"Restored {move.quantity} units of '{move.product.product_name}' to Bin {bin_obj.bin_id}.")
        
        # Delete outbound movements
        deleted_moves, _ = outbound_movements.delete()
        print(f"Deleted {deleted_moves} outbound stock movement logs.")
        
        # 2. Delete Sales payments
        deleted_payments, _ = SOPayment.objects.all().delete()
        print(f"Deleted {deleted_payments} sales payment records.")
        
        # 3. Delete Sales Orders
        deleted_sos, _ = SalesOrder.objects.all().delete()
        print(f"Deleted {deleted_sos} sales order records.")
        
        # 4. Delete Customer Purchase Requests (CPRs)
        deleted_cprs, _ = CustomerPurchaseRequest.objects.all().delete()
        print(f"Deleted {deleted_cprs} customer purchase requests.")
        
    print("Database cleared and inventory levels restored successfully!")

if __name__ == "__main__":
    clear_sales_transactions()
