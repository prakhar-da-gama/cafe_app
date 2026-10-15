"""Generate the barista's opening message for a fresh chat session.

Called by ``POST /api/chatbot/initiate-chat`` when a new ``chat_contexts`` row is
created: the session context (from ``tools.get_context``) and the full menu (from
``tools.get_full_menu``) are handed to the model, which opens the conversation —
a warm greeting plus 4 starter suggestions. Uses the same .env-keyed Gemini
client as the live chat (``chatbot.llm.generate_structured``), constrained to
:class:`ChatbotReply` so the reply is stored and rendered like any other turn.
The caller persists the result to ``chatbot_transcripts`` and resolves the
suggestions against the real menu.
"""
import json

from ..llm import generate_structured
from ..prompts.initial_barista_message import INITIAL_BARISTA_MESSAGE_PROMPT
from ..pydantic_validators.chatbot_reply import ChatbotReply


def initial_barista_message(context: dict, menu: list[dict]) -> ChatbotReply:
    """Build the barista's opening :class:`ChatbotReply` for a new session.

    ``context`` is the session's stored fields (from ``tools.get_context``) and
    ``menu`` is the trimmed, veg-scoped menu tree (from ``tools.get_full_menu``).
    There is no customer message yet — the model opens the conversation.
    """
    user_content = json.dumps(
        {"context": context, "menu": menu}, ensure_ascii=False, default=str
    )
    reply = generate_structured(
        INITIAL_BARISTA_MESSAGE_PROMPT, user_content, ChatbotReply
    )
    assert isinstance(reply, ChatbotReply)  # narrows the return type
    return reply
