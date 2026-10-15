"""Current date and time for the chatbot."""
from datetime import datetime
from zoneinfo import ZoneInfo

INDIA_TZ = ZoneInfo("Asia/Kolkata")


def get_current_time() -> str:
    """The current date and time in India (IST) as an ISO 8601 string."""
    return datetime.now(INDIA_TZ).isoformat()
