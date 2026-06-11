import sqlite3

conn = sqlite3.connect('db.sqlite3')
cur = conn.cursor()

# Clear supplier_id from all vendors
cur.execute("UPDATE vendors_vendor SET supplier_id = ''")
conn.commit()
print(f"Cleared supplier_id on {cur.rowcount} vendor(s).")

# Verify
cur.execute("SELECT vendor_id, vendor_name, supplier_id FROM vendors_vendor")
for r in cur.fetchall():
    print(" ", r)

conn.close()
print("Done — vendors and suppliers are now fully independent.")
