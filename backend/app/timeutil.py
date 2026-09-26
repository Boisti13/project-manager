from datetime import datetime, timezone


def utcnow() -> datetime:
    """Current UTC time without tzinfo -- what datetime.utcnow() returned
    (deprecated since Python 3.12). DB columns store naive UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
