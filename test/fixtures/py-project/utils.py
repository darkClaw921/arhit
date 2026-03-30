MAX_RETRIES = 3

def format_greeting(name):
    return f"Hello, {name}!"

def create_user(name):
    return {"name": name, "greeting": format_greeting(name)}

def _internal_helper():
    return True
