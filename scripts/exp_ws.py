
import secrets
from time import time



_state_store: dict[str, float] = {}

def _issue_state() -> str:
    state = secrets.token_urlsafe(24)
    _state_store[state] = time() + 300  # 5 minutes TTL
    return state


state = _issue_state()
print("Issued state:", state)
print("State store:", _state_store)


print(_state_store.pop(state, None))  # Should return the expiry timestamp
print("State store after pop:", _state_store)