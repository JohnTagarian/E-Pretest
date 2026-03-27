from __future__ import annotations

import os
from pathlib import Path


def _clean(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1].strip()
    return value


def load_local_env() -> None:
    """Load infra/env/.env into process env if present.

    - Does not override already-exported variables.
    - Keeps MVP setup simple (no manual export required each run).
    """
    root = Path(__file__).resolve().parents[2]
    env_path = root / "infra" / "env" / ".env"
    if not env_path.exists():
        return

    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        os.environ.setdefault(key, _clean(value))
