"""
CSV import handler stub.

For now this handler is a placeholder that returns a simple JSON message
indicating the feature is not implemented. In the future, this file will
parse uploaded CSVs, validate mappings, and insert rows into the DB file.
"""

def handle(req):
    # Minimal, explicit response format: status 200 with a simple JSON dict.
    return (200, {"status": "ok", "message": "CSV import handler not implemented yet."})
