"""Aggregate 0-10 service-aspect scores from every customer service review.

``calculate_service_scores`` pulls all rows from the ``service_reviews`` table,
feeds their text (and star rating) to Gemini, and forces a structured response:
one 0-10 score per service aspect, or null where the reviews give nothing to
judge it on. The parsed/validated scores are written to the singleton
``service_review_scores`` row, and a notification is raised for the manager and
the admin that fresh scores are ready.

The Pydantic ``LlmServiceScores`` model below both *constrains* Gemini's output
(it is handed to the SDK as the response schema) and *validates* it: every
aspect is an int clamped to 0-10, or None when the model couldn't score it.
"""
from __future__ import annotations

import logging

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import crud, models
from ...database import SessionLocal
from ...models.notification import NotificationFor
from ...services.gemini import generate_structured

logger = logging.getLogger(__name__)

# The single source of truth for the 20 service aspects: (display name, the
# ServiceReviewScores column / LlmServiceScores field it maps to). The order
# here is the order the dashboard chart renders them in.
TAGS: list[tuple[str, str]] = [
    ("Staff Friendliness", "staff_friendliness"),
    ("Speed of Service", "speed_of_service"),
    ("Order Accuracy", "order_accuracy"),
    ("Attentiveness", "attentiveness"),
    ("Atmosphere / Ambiance", "atmosphere_ambiance"),
    ("Cleanliness", "cleanliness"),
    ("Value for Money", "value_for_money"),
    ("Food Quality", "food_quality"),
    ("Beverage Quality", "beverage_quality"),
    ("Menu Variety", "menu_variety"),
    ("Seating Comfort", "seating_comfort"),
    ("Wait Time / Queue Management", "wait_time_queue_management"),
    ("Problem Resolution", "problem_resolution"),
    ("Staff Knowledge", "staff_knowledge"),
    ("Noise Level", "noise_level"),
    ("Payment & Billing Experience", "payment_billing_experience"),
    ("Kid-Family Friendliness", "kid_family_friendliness"),
    ("Pet Friendliness", "pet_friendliness"),
    ("Aesthetic / Decor", "aesthetic_decor"),
    ("Accessibility", "accessibility"),
]

_FIELD_NAMES = [field for _, field in TAGS]


class LlmServiceScores(BaseModel):
    """Gemini's structured response: a 0-10 score for each service aspect, or
    null when the reviews don't support scoring it. Also the validator for the
    response — out-of-range numbers are clamped into 0-10 so a slightly
    misbehaving model can never poison the stored row."""

    staff_friendliness: int | None = Field(default=None, description="Staff Friendliness")
    speed_of_service: int | None = Field(default=None, description="Speed of Service")
    order_accuracy: int | None = Field(default=None, description="Order Accuracy")
    attentiveness: int | None = Field(default=None, description="Attentiveness")
    atmosphere_ambiance: int | None = Field(default=None, description="Atmosphere / Ambiance")
    cleanliness: int | None = Field(default=None, description="Cleanliness")
    value_for_money: int | None = Field(default=None, description="Value for Money")
    food_quality: int | None = Field(default=None, description="Food Quality")
    beverage_quality: int | None = Field(default=None, description="Beverage Quality")
    menu_variety: int | None = Field(default=None, description="Menu Variety")
    seating_comfort: int | None = Field(default=None, description="Seating Comfort")
    wait_time_queue_management: int | None = Field(
        default=None, description="Wait Time / Queue Management"
    )
    problem_resolution: int | None = Field(default=None, description="Problem Resolution")
    staff_knowledge: int | None = Field(default=None, description="Staff Knowledge")
    noise_level: int | None = Field(default=None, description="Noise Level")
    payment_billing_experience: int | None = Field(
        default=None, description="Payment & Billing Experience"
    )
    kid_family_friendliness: int | None = Field(
        default=None, description="Kid-Family Friendliness"
    )
    pet_friendliness: int | None = Field(default=None, description="Pet Friendliness")
    aesthetic_decor: int | None = Field(default=None, description="Aesthetic / Decor")
    accessibility: int | None = Field(default=None, description="Accessibility")

    @field_validator("*", mode="before")
    @classmethod
    def _clamp_0_10(cls, value: object) -> int | None:
        """Keep every score null-or-in-range: None stays None, anything
        unparseable becomes None, and valid numbers are clamped to 0-10."""
        if value is None:
            return None
        try:
            num = int(round(float(value)))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return max(0, min(10, num))


def _build_prompt(reviews: list[models.ServiceReview]) -> str:
    lines = []
    for i, r in enumerate(reviews, start=1):
        text = (r.review or "").strip()
        if not text:
            continue
        lines.append(f"{i}. [{r.rating}/5 stars] {text}")
    corpus = "\n".join(lines)

    aspects = "\n".join(f"- {display} ({field})" for display, field in TAGS)
    return (
        "You are an analyst scoring a cafe's service quality from its customer "
        "reviews. Below are all the service reviews left for the cafe, each with "
        "the customer's overall star rating (0-5) and their written note.\n\n"
        "Score the cafe on EACH of the following service aspects on a 0-10 scale "
        "(0 = terrible, 10 = excellent), judging ONLY from evidence in the "
        "reviews. If the reviews contain nothing that lets you judge an aspect, "
        "return null for that aspect rather than guessing.\n\n"
        f"Aspects (respond using the field name in brackets):\n{aspects}\n\n"
        f"Reviews:\n{corpus or '(no written reviews yet)'}"
    )


def calculate_service_scores(db: Session) -> models.ServiceReviewScores:
    """Score every service review with Gemini and store the aggregate on the
    singleton ``service_review_scores`` row, then notify manager + admin.

    Returns the updated row. If there are no written reviews to analyse, the
    stored scores are cleared to null (and the review count re-stamped)."""
    reviews = list(
        db.execute(
            select(models.ServiceReview).order_by(models.ServiceReview.id)
        ).scalars().all()
    )
    total = len(reviews)
    has_text = any((r.review or "").strip() for r in reviews)

    row = crud.get_or_create_service_review_scores(db)
    row.number_of_reviews = total

    if has_text:
        scores = generate_structured(_build_prompt(reviews), LlmServiceScores)
        for _, field in TAGS:
            setattr(row, field, getattr(scores, field))
    else:
        for _, field in TAGS:
            setattr(row, field, None)

    # Let the manager and the admin each know fresh scores are available.
    message = f"Service review scores recalculated across {total} review(s)."
    crud.create_notification(db, text=message, notification_for=NotificationFor.manager)
    crud.create_notification(db, text=message, notification_for=NotificationFor.admin)

    db.commit()
    db.refresh(row)
    return row


def run_score_calculation() -> None:
    """Background-task entrypoint: run the scoring in its own DB session.

    Opens and closes its own session (the request's session is gone by the time
    a FastAPI background task runs) and swallows failures so a Gemini/network
    error never crashes the worker — it just leaves the last good scores."""
    db = SessionLocal()
    try:
        calculate_service_scores(db)
    except Exception as exc:  # noqa: BLE001 - best-effort background job
        logger.warning("Service review score calculation failed: %s", exc)
        db.rollback()
    finally:
        db.close()
