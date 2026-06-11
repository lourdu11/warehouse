import sqlite3

conn = sqlite3.connect('db.sqlite3')
cur = conn.cursor()

# Verify what we're about to delete
cur.execute("SELECT vendor_id, vendor_name, email, supplier_id FROM vendors_vendor WHERE vendor_id='VEN004'")
row = cur.fetchone()
if row:
    print(f"Found VEN004: {row}")
    cur.execute("DELETE FROM vendors_vendor WHERE vendor_id='VEN004'")
    conn.commit()
    print(f"Deleted VEN004. Rows affected: {cur.rowcount}")
else:
    print("VEN004 not found — already removed.")

# Verify remaining vendors
print("\nRemaining vendors:")
cur.execute("SELECT vendor_id, vendor_name, email, supplier_id FROM vendors_vendor")
for r in cur.fetchall():
    print(" ", r)

# Verify supplier still intact
print("\nSupplier table:")
cur.execute("SELECT supplier_id, supplier_name, email FROM supplier")
for r in cur.fetchall():
    print(" ", r)

conn.close()
