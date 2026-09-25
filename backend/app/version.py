from pathlib import Path

VERSION_FILE = Path(__file__).resolve().parent.parent.parent / "VERSION"
try:
    APP_VERSION = VERSION_FILE.read_text().strip()
except FileNotFoundError:
    APP_VERSION = "0.0.0"
