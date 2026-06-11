import os
import sys
import django

# Add the parent folder to the system path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'warehouse.settings')
django.setup()

from supplier.models import Supplier
from vendors.models import Vendor

def test_unmirroring():
    print("Starting verification test...")
    
    # 1. Check existing counts
    supplier_count_before = Supplier.objects.count()
    vendor_count_before = Vendor.objects.count()
    print(f"Initial state: {supplier_count_before} suppliers, {vendor_count_before} vendors")
    
    # 2. Create a new supplier
    print("Creating temporary Supplier 'Wayne Enterprises'...")
    wayne = Supplier.objects.create(
        supplier_name="Wayne Enterprises",
        contact_personname="Bruce Wayne",
        email="bruce@wayne.com",
        phone="555-0199",
        address="1007 Mountain Drive",
        city="Gotham",
        state="NJ",
        country="USA"
    )
    
    supplier_count_after = Supplier.objects.count()
    vendor_count_after = Vendor.objects.count()
    print(f"After creating supplier: {supplier_count_after} suppliers, {vendor_count_after} vendors")
    
    # Verify that the supplier count increased by 1 but vendor count stayed the same
    assert supplier_count_after == supplier_count_before + 1, "Supplier was not created successfully!"
    assert vendor_count_after == vendor_count_before, "WARNING: A vendor was automatically created!"
    
    print("\nSUCCESS: Creating a Supplier did NOT create a Vendor mirror.")
    
    # Clean up
    wayne.delete()
    print("Temporary Supplier cleaned up successfully.")

if __name__ == '__main__':
    test_unmirroring()
