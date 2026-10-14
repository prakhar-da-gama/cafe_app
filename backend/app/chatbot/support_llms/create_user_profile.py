"""Distill a durable customer profile from a finished chat transcript.

Called by the end-of-chat endpoint: the session's transcript (from
``tools.get_transcript``) is handed to the model, which returns the preferences
worth remembering. Uses the same .env-keyed Gemini client as the live chat
(``chatbot.llm.generate_structured``), constrained to
:class:`UserProfileFromLLM`. The caller is responsible for persisting the result
into ``user_preferences``.
"""
import json

from ..llm import generate_structured
from ..prompts.save_customer_profile_prompt import SAVE_CUSTOMER_PROFILE_PROMPT
from ..pydantic_validators.user_profile import UserProfileFromLLM


def create_user_profile(transcript: list[dict]) -> UserProfileFromLLM:
    """Build a :class:`UserProfileFromLLM` from a chat ``transcript``.

    ``transcript`` is the list of turns from ``tools.get_transcript``. An empty
    transcript short-circuits to an empty profile (no LLM call).
    """
    if not transcript:
        return UserProfileFromLLM(preferences=[])

    user_content = json.dumps(
        {"transcript": transcript}, ensure_ascii=False, default=str
    )
    profile = generate_structured(
        SAVE_CUSTOMER_PROFILE_PROMPT, user_content, UserProfileFromLLM
    )
    assert isinstance(profile, UserProfileFromLLM)  # narrows the return type
    return profile
