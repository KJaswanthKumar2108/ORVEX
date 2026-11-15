from __future__ import annotations

import sys
from pathlib import Path

# Ensure the repository root and backend directory are in sys.path
# This guarantees that 'analytics', 'hardware', and 'backend.app' modules are importable
BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
for path in (str(BACKEND_DIR), str(REPO_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

from app.main import app, create_app

__all__ = ["app", "create_app"]
