"""Current date and time for the chatbot."""
from datetime import datetime


def get_current_time() -> str:
    """The current local date and time as an ISO 8601 string."""
    return datetime.now().isoformat()
