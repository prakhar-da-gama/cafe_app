"""Gemini call behind POST /fix-grammar."""
from .client import generate_text


def fix_grammar(text: str) -> str:
    """Fix grammar, spelling and capitalisation of arbitrary text, returning the
    corrected version only."""
    prompt = (
        "Fix the grammar, spelling and capitalisation of the following text. "
        "Preserve its meaning and tone, do not add or remove information, and "
        "return ONLY the corrected text with no quotes, labels or commentary.\n\n"
        f"TEXT:\n{text}"
    )
    return generate_text(prompt)
