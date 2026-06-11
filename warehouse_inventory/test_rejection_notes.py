import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'warehouse.settings')
django.setup()

from Inventory.models import GRNItem

def test_update():
    item = GRNItem.objects.filter(rejected_quantity__gt=0).first()
    if not item:
        print("No rejected items found.")
        return
    
    print(f"Testing with item {item.grn_item_id}")
    item.rejection_notes = "TEST NOTES"
    item.save()
    
    item.refresh_from_db()
    print(f"Notes after save: '{item.rejection_notes}'")

if __name__ == "__main__":
    test_update()
