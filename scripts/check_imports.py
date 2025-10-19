# Script to validate that project modules can be imported.
# This script is resilient to being run from any working directory:
# it ensures the repository root (parent of this scripts/ folder) is on sys.path.
# Run: python .\scripts\check_imports.py
import sys
import os
import importlib

# Determine repository root relative to this file (scripts/ is inside repo)
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(THIS_DIR)

# Ensure repo root is on sys.path so top-level modules (config.py, handlers) are importable.
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Modules to test importing
MODULES = [
    "config",
    "handlers.database_handler",
    "handlers.import_handler",
    "handlers.ai_handler",
]

def test_import(name):
    try:
        importlib.import_module(name)
        print(f"{name} OK")
    except Exception as e:
        # Print concise error message similar to what you observed
        print(f"{name} ERROR {type(e).__name__} {e}")

if __name__ == "__main__":
    for m in MODULES:
        test_import(m)
