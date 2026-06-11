import sqlite3

def run():
    conn = sqlite3.connect('db.sqlite3')
    cur = conn.cursor()
    
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cur.fetchall()]
    
    targets = ['VEN004', 'SUP0001']
    
    for table in sorted(tables):
        try:
            cur.execute(f"PRAGMA table_info(`{table}`)")
            columns = [c[1] for c in cur.fetchall()]
            
            cur.execute(f"SELECT * FROM `{table}`")
            rows = cur.fetchall()
            
            for row in rows:
                row_str = str(row).upper()
                for target in targets:
                    if target.upper() in row_str:
                        print(f"Table: {table}")
                        print(f"Row: {row}")
                        print("-" * 40)
        except Exception as e:
            print(f"Error querying {table}: {e}")

if __name__ == '__main__':
    run()
