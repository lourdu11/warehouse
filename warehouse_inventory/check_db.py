import sqlite3

def get_table_counts(filename):
    conn = sqlite3.connect(filename)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    counts = {}
    for t in sorted(tables):
        try:
            cursor.execute(f"SELECT COUNT(*) FROM `{t}`;")
            counts[t] = cursor.fetchone()[0]
        except Exception:
            pass
    conn.close()
    return counts

db1 = get_table_counts("db.sqlite3")
db2 = get_table_counts("db_modified.sqlite3")

print("Tables only in db.sqlite3:", set(db1.keys()) - set(db2.keys()))
print("Tables only in db_modified.sqlite3:", set(db2.keys()) - set(db1.keys()))

print("\nComparing row counts for common tables:")
mismatches = []
for t in sorted(set(db1.keys()) & set(db2.keys())):
    if db1[t] != db2[t]:
        print(f"  {t}: db.sqlite3={db1[t]}, db_modified.sqlite3={db2[t]}")
        mismatches.append(t)

if not mismatches:
    print("All common tables have the exact same row counts!")
