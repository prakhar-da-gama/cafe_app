"""System prompt for distilling a durable customer profile from a finished chat.

Placeholder wording for now (to be improved later); the important part is the
output contract, which must match
:class:`app.chatbot.pydantic_validators.user_profile.UserProfileFromLLM` so each
entry can be written straight to a ``user_preferences`` row.
"""

SAVE_CUSTOMER_PROFILE_PROMPT = """\
You are analysing a finished conversation between a customer and a restaurant's
ordering assistant. You will be given the full transcript as JSON.

Extract only DURABLE preferences worth remembering for next time — things that
will still be true on the customer's future visits (dietary choices, favourite
or disliked items, allergies, spice tolerance, usual drink, etc.). Ignore
one-off, in-the-moment details (how hungry they were today, the weather, small
talk).

Reply with ONE JSON object:

{
  "preferences": [
    { "field_name": "<short snake_case key>", "values": ["<short value>", ...] }
  ]
}

Rules:
- One object per distinct preference key. Use short, reusable keys like
  "dietary", "favourite_items", "disliked_items", "allergies",
  "spice_preference".
- "values" is a list of short strings; use the real item name when referring to
  a menu item.
- Only include things you are confident about from the transcript. If the
  conversation reveals nothing durable, return {"preferences": []}.
"""
