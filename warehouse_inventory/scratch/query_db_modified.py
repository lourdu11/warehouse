import sqlite3

def run():
    print("=== db_modified.sqlite3 ===")
    conn = sqlite3.connect('db_modified.sqlite3')
    cur = conn.cursor()
    
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cur.fetchall()]
    
    for table in sorted(tables):
        if 'vendor' in table.lower() or 'supplier' in table.lower():
            print(f"--- TABLE: {table} ---")
            cur.execute(f"SELECT * FROM `{table}`")
            rows = cur.fetchall()
            print(f"Row count: {len(rows)}")
            for r in rows:
                print(" ", r)
            print()

if __name__ == '__main__':
    run()
