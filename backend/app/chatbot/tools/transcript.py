"""The conversation transcript for a chat session, for feeding back to the model.

Returns every turn stored for a ``chat_contexts`` row, oldest first, trimmed to
what the model needs to follow the conversation: the ``role``, the ``content``,
and (only when present) the items suggested that turn. Used by the message
endpoint to give the bot memory of the chat so far, and by the end-of-chat
profile builder.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models


def get_transcript(db: Session, chat_context_id: int) -> list[dict]:
    """The session's messages as a flat, ordered list.

    Each entry is ``{"role", "content"}`` plus an ``"items_json"`` key only when
    that turn carried item suggestions. Ordered oldest-first by row id. Returns
    an empty list if the session has no messages yet (or doesn't exist).
    """
    rows = (
        db.execute(
            select(models.ChatbotTranscript)
            .where(models.ChatbotTranscript.chat_context_id == chat_context_id)
            .order_by(models.ChatbotTranscript.id)
        )
        .scalars()
        .all()
    )

    transcript: list[dict] = []
    for row in rows:
        entry: dict = {"role": row.role, "content": row.content}
        if row.items_json is not None:
            entry["items_json"] = row.items_json
        transcript.append(entry)
    return transcript
