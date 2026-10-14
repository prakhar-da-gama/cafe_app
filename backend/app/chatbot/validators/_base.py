"""Shared fuzzy name -> row resolution for the chatbot validators.

Each validator in this package takes a free-text string (typically produced by
the chatbot) and resolves it to the single best-matching row of one menu table
by fuzzy-matching against that table's `name` field, returning the full object
for that row.

Matching uses rapidfuzz. The whole table is small (menu data), so we load every
row and score it in memory rather than pushing the fuzzy match into SQL.

These are internal helpers, not HTTP endpoints, so a failed resolution raises
`ResolutionError` for the caller to handle rather than an HTTP error.
"""
from typing import Type, TypeVar

from rapidfuzz import fuzz, process, utils
from sqlalchemy.orm import Session

from ...database import Base

ModelT = TypeVar("ModelT", bound=Base)


class ResolutionError(Exception):
    """Raised when free text can't be resolved to a row of a menu table."""


def resolve(
    db: Session,
    model: Type[ModelT],
    query: str,
    score_cutoff: float,
    label: str,
) -> ModelT:
    """Return the row of `model` whose `name` best matches `query`.

    Raises `ResolutionError` if the table is empty or nothing scores at/above
    `score_cutoff`.
    """
    rows = db.query(model).all()
    if not rows:
        raise ResolutionError(f"No {label} exist to match against")

    by_id = {row.id: row for row in rows}
    choices = {row_id: row.name for row_id, row in by_id.items()}

    match = process.extractOne(
        query,
        choices,
        scorer=fuzz.WRatio,
        # Normalise case / punctuation / whitespace on both sides before scoring
        # so LLM noise like "EXTRA CHEESE" still matches "Extra Cheese".
        processor=utils.default_process,
        score_cutoff=score_cutoff,
    )
    if match is None:
        raise ResolutionError(f"No {label} name matched {query!r} closely enough")

    # process.extractOne over a dict returns (matched_name, score, matched_key).
    matched_id = match[2]
    return by_id[matched_id]
