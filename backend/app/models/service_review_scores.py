from __future__ import annotations

from sqlalchemy import CheckConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ServiceReviewScores(Base):
    """A single aggregate row of AI-derived service scores across every service
    review. Each of the 20 aspect columns holds a 0-10 score the model inferred
    from all the reviews, or NULL when it couldn't be judged from the text.

    The table is deliberately a singleton: a CHECK (id = 1) constraint plus the
    get-or-create helper in crud keep it to at most one row. ``number_of_reviews``
    is the running count of service reviews (incremented as new ones arrive and
    re-stamped with the true total whenever the scores are recalculated); it is
    what the POST endpoint checks against the every-20-reviews recompute cadence.
    """

    __tablename__ = "service_review_scores"
    __table_args__ = (CheckConstraint("id = 1", name="ck_service_review_scores_single_row"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    number_of_reviews: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # The 20 service aspects. Nullable: NULL means the model couldn't score the
    # aspect from the available reviews. Column names map 1:1 to the display tags
    # defined in service_review_analyser/analysis_scores/cal_scores.py.
    staff_friendliness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    speed_of_service: Mapped[int | None] = mapped_column(Integer, nullable=True)
    order_accuracy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attentiveness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    atmosphere_ambiance: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cleanliness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_for_money: Mapped[int | None] = mapped_column(Integer, nullable=True)
    food_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)
    beverage_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)
    menu_variety: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seating_comfort: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wait_time_queue_management: Mapped[int | None] = mapped_column(Integer, nullable=True)
    problem_resolution: Mapped[int | None] = mapped_column(Integer, nullable=True)
    staff_knowledge: Mapped[int | None] = mapped_column(Integer, nullable=True)
    noise_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_billing_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kid_family_friendliness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pet_friendliness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aesthetic_decor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accessibility: Mapped[int | None] = mapped_column(Integer, nullable=True)
