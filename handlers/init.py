# Minimal package marker for the 'handlers' directory.
# This file makes 'handlers' importable as a Python package (e.g., import handlers.database_handler).
# Keep this file intentionally tiny to avoid introducing shared mutable globals.
# Having this file avoids ModuleNotFoundError when code does "import handlers.xxx".
# No runtime behavior is required here.