"""
A simple utility script to dump the schema of the SQLite database.

This script connects to the database file specified in the project's config
and prints the `CREATE TABLE` statements for all tables. It's useful for
quickly inspecting the database structure without needing a separate DB tool.

Run from the project root:
    python scripts/dump_schema.py
"""
import sqlite3
import os

def dump_schema():
    """Connects to the SQLite database and prints the schema of all tables."""
    # The script is in scripts/, so the project root is one level up.
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(project_root, 'data', 'gamedb.sqlite')

    if not os.path.exists(db_path):
        print(f"Database file not found at: {db_path}")
        print("Please run the main application first to create the database.")
        return

    print(f"Reading schema from: {db_path}\n")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Get the CREATE TABLE statements for all tables
        cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        for table_name, sql_statement in cursor.fetchall():
            print(f"-- Schema for table: {table_name}\n{sql_statement};\n")

    except sqlite3.Error as e:
        print(f"An SQLite error occurred: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    dump_schema()