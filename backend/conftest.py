"""Root conftest.py so pytest can discover backend tests from the project root."""
import sys
from pathlib import Path

# Add backend directory to sys.path so `import app.*` works when running
# pytest from the project root (e.g., `pytest backend/tests/`).
sys.path.insert(0, str(Path(__file__).parent))
