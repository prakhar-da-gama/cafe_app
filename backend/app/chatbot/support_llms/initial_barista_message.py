"""Generate the barista's opening message for a fresh chat session.

Called by ``POST /api/chatbot/initiate-chat`` when a new ``chat_contexts`` row is
created: the session context (from ``tools.get_context``), the full menu (from
``tools.get_full_menu``) and the current cart (from ``tools.view_my_cart``) are
handed to the model, which opens the conversation — a warm greeting and 4
tappable quick-action chips. It does NOT suggest items up front (that was slow
and not useful). Uses the same .env-keyed Gemini client as the live chat
(``chatbot.llm.generate_structured``), constrained to :class:`InitialBaristaReply`.
The caller persists the greeting to ``chatbot_transcripts``.
"""
import json

from ..llm import generate_structured
from ..prompts.initial_barista_message import INITIAL_BARISTA_MESSAGE_PROMPT
from ..pydantic_validators.initial_barista_reply import InitialBaristaReply


def initial_barista_message(
    context: dict, menu: list[dict], cart: dict
) -> InitialBaristaReply:
    """Build the barista's opening :class:`InitialBaristaReply` for a new session.

    ``context`` is the session's stored fields (from ``tools.get_context``),
    ``menu`` is the trimmed, veg-scoped menu tree (from ``tools.get_full_menu``)
    and ``cart`` is the current cart (from ``tools.view_my_cart``) so the opener
    and its quick-action chips can reason from what's already been added. There
    is no customer message yet — the model opens the conversation.
    """
    user_content = json.dumps(
        {"context": context, "menu": menu, "cart": cart},
        ensure_ascii=False,
        default=str,
    )
    reply = generate_structured(
        INITIAL_BARISTA_MESSAGE_PROMPT, user_content, InitialBaristaReply
    )
    assert isinstance(reply, InitialBaristaReply)  # narrows the return type
    return reply
