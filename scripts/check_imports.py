import importlib
modules = ['config','handlers.database_handler','handlers.import_handler','handlers.ai_handler','handlers.hello']
for m in modules:
    try:
        importlib.import_module(m)
        print(m + ' OK')
    except Exception as e:
        print(m + ' ERROR', type(e).__name__, e)
