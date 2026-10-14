"""A chatbot-friendly view of a chat session's stored context.

Returns the facts the chatbot reasons with for one ``chat_contexts`` row —
weather, time, who's at the table, dietary preference — leaving out the bookkeeping
columns (id, created_at, updated_at) the model never needs.
"""
from sqlalchemy.orm import Session

from ... import models
from .fullmenu import ChatContextNotFound

# Columns handed to the chatbot, in a sensible reading order. Bookkeeping
# columns (id, created_at, updated_at) are deliberately left out.
_FIELDS = ("user_id", "weather", "time", "setup_of_people", "veg_only", "is_active")


def get_context(db: Session, chat_context_id: int) -> dict:
    """The stored context for ``chat_context_id`` as a flat dict.

    Includes every field except ``id``, ``created_at`` and ``updated_at``. Any
    field whose value is ``None`` is dropped entirely — its key won't appear in
    the result (booleans like ``veg_only`` are kept even when ``False``, since
    that's a real value, not a missing one).

    Raises :class:`ChatContextNotFound` if the id doesn't match a row.
    """
    context = db.get(models.ChatContext, chat_context_id)
    if context is None:
        raise ChatContextNotFound(f"No chat context with id {chat_context_id!r}")

    result: dict = {}
    for field in _FIELDS:
        value = getattr(context, field)
        if value is not None:
            result[field] = value
    return result
