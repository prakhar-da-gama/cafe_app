"""Admin analytics: sales, menu, traffic, basket, customer and operations
metrics for the cafe, all computed from `orders` + `order_items`.

Every endpoint takes an inclusive `start`/`end` date range (cafe-local dates —
timestamps are stored as the cafe's wall-clock time, the same way the rest of
the app reads them) and compares it against the immediately preceding period
of the same length.

Performance notes:
- All heavy lifting is SQL aggregation (GROUP BY); Python only shapes the few
  aggregated rows that come back. No ORM entities are loaded (the Order model
  eagerly selectin-loads its lines, which would be wasteful here) — every query
  selects plain columns.
- The order filter is always `status IN (...) AND created_at in range`, which
  is served by the existing `ix_orders_status_created` index; order lines join
  in through the `order_items.order_id` index.
- The current and previous periods are fetched in a single pass and split by
  a `cur` flag, so comparisons never double the number of round-trips.

"Sales" means every checked-out, non-cancelled order (received → paid). Carts
and cancelled orders are reported separately.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, distinct, func, literal_column, select
from sqlalchemy.orm import Session, aliased

from .. import models
from ..auth import require_admin
from ..database import get_db

router = APIRouter(prefix="/api/admin/analytics", tags=["admin-analytics"])

Order = models.Order
OrderItem = models.OrderItem
Status = models.OrderStatus

SALE_STATUSES = (
    Status.received,
    Status.preparing,
    Status.ready,
    Status.payment_pending,
    Status.payment_completed,
)
OPEN_STATUSES = (Status.received, Status.preparing, Status.ready, Status.payment_pending)

Granularity = Literal["auto", "hour", "day", "week", "month"]

# Longest range we'll aggregate in one request (keeps the bucket count sane).
_MAX_RANGE_DAYS = 3 * 366

# Dayparts used by the traffic view: (key, label, first hour, end hour exclusive).
_DAYPARTS = (
    ("breakfast", "Breakfast", 6, 11),
    ("lunch", "Lunch", 11, 15),
    ("afternoon", "Afternoon", 15, 18),
    ("dinner", "Dinner", 18, 22),
    ("late", "Late night", 22, 30),  # 22:00 → 06:00 (hours 0-5 wrap to 24-29)
)


# --------------------------------------------------------------------------
# Period window + shared query helpers
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Window:
    start: datetime  # current period, inclusive
    end: datetime  # current period, exclusive
    prev_start: datetime  # previous period, inclusive (prev end == start)
    days: int
    granularity: str

    @property
    def bucket_count(self) -> int:
        if self.granularity == "hour":
            return self.days * 24
        if self.granularity == "day":
            return self.days
        if self.granularity == "week":
            return math.ceil(self.days / 7)
        last = self.end - timedelta(days=1)
        return (last.year - self.start.year) * 12 + last.month - self.start.month + 1

    def bucket_start(self, period_start: datetime, offset: int) -> datetime:
        if self.granularity == "hour":
            return period_start + timedelta(hours=offset)
        if self.granularity == "day":
            return period_start + timedelta(days=offset)
        if self.granularity == "week":
            return period_start + timedelta(days=7 * offset)
        if not offset:
            return period_start
        month = period_start.month - 1 + offset
        return period_start.replace(year=period_start.year + month // 12, month=month % 12 + 1, day=1)


def _window(start: date | None, end: date | None, granularity: str = "auto") -> Window:
    today = date.today()
    end = end or today
    start = start or end - timedelta(days=29)
    if start > end:
        raise HTTPException(status_code=400, detail="start must be on or before end")
    days = (end - start).days + 1
    if days > _MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail="Date range is too long (max 3 years)")
    if granularity == "auto":
        granularity = (
            "hour" if days <= 2 else "day" if days <= 92 else "week" if days <= 366 else "month"
        )
    if granularity == "hour" and days > 14:
        raise HTTPException(status_code=400, detail="Hourly view is limited to 14 days")
    s = datetime.combine(start, datetime.min.time())
    return Window(
        start=s,
        end=s + timedelta(days=days),
        prev_start=s - timedelta(days=days),
        days=days,
        granularity=granularity,
    )


def _range_params(
    start: date | None = Query(default=None, description="First day (inclusive). Default: 29 days before end."),
    end: date | None = Query(default=None, description="Last day (inclusive). Default: today."),
) -> tuple[date | None, date | None]:
    return start, end


def _cur(w: Window):
    """1 for rows in the current period, 0 for the previous one."""
    return case((Order.created_at >= w.start, 1), else_=0)


def _sales_in(w: Window, *, include_prev: bool = True):
    """WHERE clause: sale orders inside the (current [+ previous]) window."""
    return and_(
        Order.status.in_(SALE_STATUSES),
        Order.created_at >= (w.prev_start if include_prev else w.start),
        Order.created_at < w.end,
    )


def _bucket_offset(w: Window, *, include_prev: bool = True):
    """SQL expression: bucket index of an order relative to its own period's
    start, so the current and previous periods line up offset-for-offset."""
    if include_prev:
        period_start = case((Order.created_at >= w.start, w.start), else_=w.prev_start)
    else:
        period_start = w.start
    if w.granularity == "hour":
        return func.timestampdiff(literal_column("HOUR"), period_start, Order.created_at)
    if w.granularity == "day":
        return func.datediff(Order.created_at, period_start)
    if w.granularity == "week":
        return func.floor(func.datediff(Order.created_at, period_start) / 7)
    # Calendar months, so buckets match the month labels even mid-month.
    return (
        func.year(Order.created_at) * 12 + func.month(Order.created_at)
        - (func.year(period_start) * 12 + func.month(period_start))
    )


def _f(v: Any) -> float:
    return round(float(v or 0), 2)


def _pct_change(cur: float, prev: float) -> float | None:
    if not prev:
        return None
    return round((cur - prev) / prev * 100, 1)


def _share(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _bucket_labels(w: Window) -> list[tuple[str, str]]:
    n = w.bucket_count
    return [
        (
            w.bucket_start(w.start, i).isoformat(),
            w.bucket_start(w.prev_start, i).isoformat(),
        )
        for i in range(n)
    ]


def _item_meta(db: Session, item_ids: list[int] | None = None) -> dict[int, Any]:
    """id → (name, price, is_veg, is_available, is_active, subcat, cat id, cat)."""
    q = (
        select(
            models.Item.id,
            models.Item.name,
            models.Item.price,
            models.Item.is_veg,
            models.Item.is_available,
            models.Item.is_active,
            models.Subcategory.name.label("subcategory"),
            models.Category.id.label("category_id"),
            models.Category.name.label("category"),
        )
        .join(models.Subcategory, models.Subcategory.id == models.Item.subcategory_id)
        .join(models.Category, models.Category.id == models.Subcategory.category_id)
    )
    if item_ids is not None:
        if not item_ids:
            return {}
        q = q.where(models.Item.id.in_(item_ids))
    return {r.id: r for r in db.execute(q).all()}


# --------------------------------------------------------------------------
# Response models
# --------------------------------------------------------------------------


class Period(BaseModel):
    start: date
    end: date
    prev_start: date
    prev_end: date
    days: int
    granularity: str


class Kpi(BaseModel):
    value: float
    previous: float
    change_pct: float | None


class TrendPoint(BaseModel):
    bucket: str
    prev_bucket: str
    sales: float
    orders: int
    aov: float
    prev_sales: float
    prev_orders: int
    prev_aov: float


class PipelineStage(BaseModel):
    status: str
    orders: int
    value: float
    oldest_minutes: int | None


class Overview(BaseModel):
    period: Period
    kpis: dict[str, Kpi]
    trend: list[TrendPoint]
    pipeline: list[PipelineStage]


class HeatCell(BaseModel):
    weekday: int  # 0 = Monday
    hour: int
    orders: int
    sales: float


class Daypart(BaseModel):
    key: str
    label: str
    hours: str
    orders: int
    sales: float
    aov: float
    share: float


class TimePatterns(BaseModel):
    period: Period
    cells: list[HeatCell]
    weekday_days: list[int]  # how many of each weekday the range spans
    weekday_totals: list[HeatCell]  # hour = -1
    hour_totals: list[HeatCell]  # weekday = -1
    dayparts: list[Daypart]
    peak: HeatCell | None


class ItemRow(BaseModel):
    item_id: int
    name: str
    category_id: int | None
    category: str | None
    subcategory: str | None
    is_veg: bool
    is_available: bool
    is_active: bool
    menu_price: float
    qty: int
    revenue: float
    orders: int
    avg_price: float
    qty_share: float
    revenue_share: float
    penetration: float  # % of all orders containing this item
    prev_qty: int
    prev_revenue: float
    revenue_change_pct: float | None
    avg_rating: float | None
    rating_count: int
    last_sold: datetime | None
    engineering: str  # star | plowhorse | puzzle | dog | no_sales
    abc: str  # A | B | C | -


class CategoryMix(BaseModel):
    category_id: int | None
    category: str
    qty: int
    revenue: float
    revenue_share: float
    prev_revenue: float
    revenue_change_pct: float | None
    items_sold: int


class ItemsAnalytics(BaseModel):
    period: Period
    total_orders: int
    total_qty: int
    total_revenue: float
    menu_size: int
    items_sold: int
    popularity_threshold: float  # qty-mix % (Kasavana-Smith 70% rule)
    avg_item_price: float  # weighted average realised price per unit
    engineering_counts: dict[str, int]
    items: list[ItemRow]
    categories: list[CategoryMix]


class NamedCount(BaseModel):
    id: int
    name: str
    count: int
    share: float


class PairedItem(BaseModel):
    item_id: int
    name: str
    orders_together: int
    confidence: float  # % of this item's orders that also contain it
    lift: float


class Review(BaseModel):
    rating: int | None
    review: str | None
    customer: str | None
    created_at: datetime


class ItemDetail(BaseModel):
    period: Period
    item_id: int
    name: str
    category: str | None
    subcategory: str | None
    menu_price: float
    is_veg: bool
    is_available: bool
    kpis: dict[str, Kpi]
    trend: list[TrendPoint]
    by_hour: list[int]  # qty per hour 0-23
    by_weekday: list[int]  # qty per weekday Mon-Sun
    variants: list[NamedCount]
    toppings: list[NamedCount]
    lines_with_toppings_pct: float
    paired: list[PairedItem]
    rating_distribution: list[int]  # count of 1..5 stars
    reviews: list[Review]
    customers: int
    repeat_customers: int


class SizeBucket(BaseModel):
    size: str
    orders: int
    share: float
    aov: float


class Pair(BaseModel):
    a_id: int
    a_name: str
    b_id: int
    b_name: str
    orders_together: int
    support: float
    confidence_ab: float
    confidence_ba: float
    lift: float


class Baskets(BaseModel):
    period: Period
    total_orders: int
    avg_items: float
    avg_lines: float
    single_item_orders_pct: float
    size_distribution: list[SizeBucket]
    pairs: list[Pair]
    lines: int
    topping_attach_pct: float
    variant_pick_pct: float
    toppings: list[NamedCount]
    variants: list[NamedCount]
    est_topping_revenue: float


class FrequencyBucket(BaseModel):
    label: str
    customers: int
    share: float
    revenue: float


class CustomerTrendPoint(BaseModel):
    bucket: str
    new: int
    returning: int


class CustomerRow(BaseModel):
    user_id: int
    name: str | None
    email: str
    orders: int
    spend: float
    last_order: datetime
    days_since: int


class Customers(BaseModel):
    period: Period
    kpis: dict[str, Kpi]
    frequency: list[FrequencyBucket]
    trend: list[CustomerTrendPoint]
    top: list[CustomerRow]
    lapsed: list[CustomerRow]
    returning_revenue_share: float


class StatusCount(BaseModel):
    status: str
    orders: int
    value: float


class OpsTrendPoint(BaseModel):
    bucket: str
    orders: int
    cancelled: int


class Operations(BaseModel):
    period: Period
    statuses: list[StatusCount]
    cancellation_rate: Kpi
    cancelled_value: float
    abandoned_carts: int
    abandoned_cart_value: float
    settle_minutes_avg: float | None
    settle_minutes_median: float | None
    settle_minutes_p90: float | None
    settle_by_hour: list[float | None]  # avg minutes per hour 0-23
    trend: list[OpsTrendPoint]
    pipeline: list[PipelineStage]


def _period(w: Window) -> Period:
    return Period(
        start=w.start.date(),
        end=(w.end - timedelta(days=1)).date(),
        prev_start=w.prev_start.date(),
        prev_end=(w.start - timedelta(days=1)).date(),
        days=w.days,
        granularity=w.granularity,
    )


def _kpi(cur: float, prev: float) -> Kpi:
    return Kpi(value=round(cur, 2), previous=round(prev, 2), change_pct=_pct_change(cur, prev))


def _pipeline(db: Session) -> list[PipelineStage]:
    """Live: orders currently in flight (not period-bound). Served by the
    (status, created_at) index."""
    rows = db.execute(
        select(
            Order.status,
            func.count(),
            func.coalesce(func.sum(Order.total_amount), 0),
            func.min(Order.created_at),
        )
        .where(Order.status.in_(OPEN_STATUSES))
        .group_by(Order.status)
    ).all()
    by = {r[0]: r for r in rows}
    now = datetime.now()
    out = []
    for s in OPEN_STATUSES:
        r = by.get(s)
        out.append(
            PipelineStage(
                status=s.value,
                orders=r[1] if r else 0,
                value=_f(r[2]) if r else 0,
                oldest_minutes=int((now - r[3]).total_seconds() // 60) if r and r[3] else None,
            )
        )
    return out


def _trend_points(w: Window, data: dict[tuple[int, int], tuple[int, float]]) -> list[TrendPoint]:
    """Shape {(cur, offset): (count, sales)} into aligned current/previous points."""
    out = []
    for i, (b, pb) in enumerate(_bucket_labels(w)):
        o, s = data.get((1, i), (0, 0.0))
        po, ps = data.get((0, i), (0, 0.0))
        out.append(
            TrendPoint(
                bucket=b,
                prev_bucket=pb,
                sales=round(s, 2),
                orders=o,
                aov=round(s / o, 2) if o else 0,
                prev_sales=round(ps, 2),
                prev_orders=po,
                prev_aov=round(ps / po, 2) if po else 0,
            )
        )
    return out


def _customer_sets(db: Session, w: Window):
    """Per period: {user_id: (orders, spend)} plus each of those users' first-ever
    sale order time (datetime.min when it predates the whole window).

    Rather than scanning every customer's full history for MIN(created_at), we
    only ask whether each window customer has *any* earlier order — an EXISTS
    probe on the (user_id, status) index that stops at the first hit. Everyone
    else's first order is their earliest one inside the window."""
    cur = _cur(w).label("cur")
    rows = db.execute(
        select(Order.user_id, cur, func.count(), func.sum(Order.total_amount), func.min(Order.created_at))
        .where(_sales_in(w))
        .group_by(Order.user_id, literal_column("cur"))
    ).all()
    per: dict[int, dict[int, tuple[int, float]]] = {0: {}, 1: {}}
    first: dict[int, datetime] = {}
    for uid, c, n, spend, earliest in rows:
        per[int(c)][uid] = (n, float(spend or 0))
        first[uid] = min(first.get(uid, earliest), earliest)
    if first:
        earlier = aliased(Order)
        users_in_window = select(distinct(Order.user_id)).where(_sales_in(w))
        for (uid,) in db.execute(
            select(models.User.id).where(
                models.User.id.in_(users_in_window),
                select(earlier.id)
                .where(
                    earlier.user_id == models.User.id,
                    earlier.status.in_(SALE_STATUSES),
                    earlier.created_at < w.prev_start,
                )
                .exists(),
            )
        ).all():
            first[uid] = datetime.min
    return per, first


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------


@router.get("/overview", response_model=Overview)
def overview(
    rng: tuple[date | None, date | None] = Depends(_range_params),
    granularity: Granularity = Query(default="auto"),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Headline KPIs for the period vs the previous period, the sales trend
    (both periods aligned bucket-for-bucket) and the live order pipeline."""
    w = _window(*rng, granularity)
    cur = _cur(w).label("cur")

    # 1) Orders + value by period, bucket and status — feeds the sales,
    # collected and cancellation KPIs *and* the trend in one pass.
    off = _bucket_offset(w).label("off")
    order_rows = db.execute(
        select(cur, off, Order.status, func.count(), func.sum(Order.total_amount))
        .where(
            Order.status.in_(SALE_STATUSES + (Status.cancelled,)),
            Order.created_at >= w.prev_start,
            Order.created_at < w.end,
        )
        .group_by(literal_column("cur"), literal_column("off"), Order.status)
    ).all()
    agg = {p: defaultdict(float) for p in (0, 1)}
    trend_data: dict[tuple[int, int], tuple[int, float]] = {}
    for c, o, st, n, v in order_rows:
        a = agg[int(c)]
        v = float(v or 0)
        if st != Status.cancelled:
            tn, tv = trend_data.get((int(c), int(o)), (0, 0.0))
            trend_data[(int(c), int(o))] = (tn + n, tv + v)
        if st == Status.cancelled:
            a["cancelled"] += n
            a["cancelled_value"] += v
        else:
            a["orders"] += n
            a["sales"] += v
            if st == Status.payment_completed:
                a["collected"] += v

    # 2) Units sold + item ratings by period.
    for c, qty, lines, avg_r, n_r in db.execute(
        select(
            cur,
            func.sum(OrderItem.quantity),
            func.count(),
            func.avg(OrderItem.rating),
            func.count(OrderItem.rating),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(_sales_in(w))
        .group_by(literal_column("cur"))
    ).all():
        a = agg[int(c)]
        a["items"] = float(qty or 0)
        a["avg_rating"] = float(avg_r or 0)
        a["ratings"] = n_r

    # 3) Customers: unique, new (first-ever order in the period), repeat.
    per, first = _customer_sets(db, w)
    for p, pstart in ((1, w.start), (0, w.prev_start)):
        a = agg[p]
        users = per[p]
        a["customers"] = len(users)
        a["new_customers"] = sum(1 for u in users if first.get(u) and first[u] >= pstart)
        a["returning_customers"] = a["customers"] - a["new_customers"]
        a["repeat_customers"] = sum(1 for n, _ in users.values() if n >= 2)

    def derived(a: dict[str, float]) -> dict[str, float]:
        orders, attempted = a["orders"], a["orders"] + a["cancelled"]
        return {
            "net_sales": a["sales"],
            "orders": orders,
            "aov": a["sales"] / orders if orders else 0,
            "items_sold": a["items"],
            "items_per_order": a["items"] / orders if orders else 0,
            "customers": a["customers"],
            "new_customers": a["new_customers"],
            "returning_customers": a["returning_customers"],
            "repeat_rate": _share(a["repeat_customers"], a["customers"]),
            "orders_per_customer": orders / a["customers"] if a["customers"] else 0,
            "collected": a["collected"],
            "outstanding": a["sales"] - a["collected"],
            "cancelled_orders": a["cancelled"],
            "cancelled_value": a["cancelled_value"],
            "cancellation_rate": _share(a["cancelled"], attempted),
            "avg_rating": a["avg_rating"],
            "ratings": a["ratings"],
            "sales_per_day": a["sales"] / w.days,
        }

    c, p = derived(agg[1]), derived(agg[0])
    return Overview(
        period=_period(w),
        kpis={k: _kpi(c[k], p[k]) for k in c},
        trend=_trend_points(w, trend_data),
        pipeline=_pipeline(db),
    )


@router.get("/time-patterns", response_model=TimePatterns)
def time_patterns(
    rng: tuple[date | None, date | None] = Depends(_range_params),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """When the cafe is busy: a weekday × hour heatmap of orders and sales,
    weekday/hour totals and the daypart split. One grouped query."""
    w = _window(*rng)
    wd = func.weekday(Order.created_at).label("wd")
    hr = func.hour(Order.created_at).label("hr")
    rows = db.execute(
        select(wd, hr, func.count(), func.sum(Order.total_amount))
        .where(_sales_in(w, include_prev=False))
        .group_by(literal_column("wd"), literal_column("hr"))
    ).all()
    cells = [HeatCell(weekday=r[0], hour=r[1], orders=r[2], sales=_f(r[3])) for r in rows]

    weekday_days = [0] * 7
    for i in range(w.days):
        weekday_days[(w.start + timedelta(days=i)).weekday()] += 1

    wd_tot = [[0, 0.0] for _ in range(7)]
    hr_tot = [[0, 0.0] for _ in range(24)]
    for c in cells:
        wd_tot[c.weekday][0] += c.orders
        wd_tot[c.weekday][1] += c.sales
        hr_tot[c.hour][0] += c.orders
        hr_tot[c.hour][1] += c.sales
    total_orders = sum(o for o, _ in hr_tot)

    dayparts = []
    for key, label, h0, h1 in _DAYPARTS:
        hours = [h % 24 for h in range(h0, h1)]
        o = sum(hr_tot[h][0] for h in hours)
        s = sum(hr_tot[h][1] for h in hours)
        dayparts.append(
            Daypart(
                key=key,
                label=label,
                hours=f"{h0 % 24:02d}:00–{h1 % 24:02d}:00",
                orders=o,
                sales=round(s, 2),
                aov=round(s / o, 2) if o else 0,
                share=_share(o, total_orders),
            )
        )

    return TimePatterns(
        period=_period(w),
        cells=cells,
        weekday_days=weekday_days,
        weekday_totals=[
            HeatCell(weekday=i, hour=-1, orders=o, sales=round(s, 2)) for i, (o, s) in enumerate(wd_tot)
        ],
        hour_totals=[
            HeatCell(weekday=-1, hour=i, orders=o, sales=round(s, 2)) for i, (o, s) in enumerate(hr_tot)
        ],
        dayparts=dayparts,
        peak=max(cells, key=lambda c: c.orders) if cells else None,
    )


@router.get("/items", response_model=ItemsAnalytics)
def items_analytics(
    rng: tuple[date | None, date | None] = Depends(_range_params),
    category_id: int | None = Query(default=None, description="Scope the analysis to one category."),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Per-item performance with menu engineering (Kasavana-Smith matrix using
    realised price as the contribution proxy — the menu has no food cost),
    ABC/Pareto classes, non-sellers and the category mix."""
    w = _window(*rng)
    cur = _cur(w).label("cur")
    meta = _item_meta(db)

    rows = db.execute(
        select(
            OrderItem.item_id,
            cur,
            func.sum(OrderItem.quantity),
            func.sum(OrderItem.quantity * OrderItem.price),
            func.count(distinct(OrderItem.order_id)),
            func.avg(OrderItem.rating),
            func.count(OrderItem.rating),
            func.max(Order.created_at),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(_sales_in(w))
        .group_by(OrderItem.item_id, literal_column("cur"))
    ).all()
    stats: dict[int, dict[int, tuple]] = defaultdict(dict)
    for iid, c, qty, rev, n_orders, avg_r, n_r, last in rows:
        stats[iid][int(c)] = (int(qty or 0), float(rev or 0), n_orders, avg_r, n_r, last)

    total_orders = db.execute(
        select(func.count()).select_from(Order).where(_sales_in(w, include_prev=False))
    ).scalar_one()

    # Analysis set: active menu items plus anything (even retired) that sold.
    ids = [
        i for i, m in meta.items()
        if (m.is_active or i in stats) and (category_id is None or m.category_id == category_id)
    ]
    empty = (0, 0.0, 0, None, 0, None)
    total_qty = sum(stats[i].get(1, empty)[0] for i in ids)
    total_rev = sum(stats[i].get(1, empty)[1] for i in ids)
    n = len(ids)
    pop_threshold = 0.7 / n * 100 if n else 0  # % of qty mix
    avg_price = total_rev / total_qty if total_qty else 0

    out: list[ItemRow] = []
    for i in ids:
        m = meta[i]
        qty, rev, n_orders, avg_r, n_r, last = stats[i].get(1, empty)
        pqty, prev_rev = stats[i].get(0, empty)[:2]
        qty_share = qty / total_qty * 100 if total_qty else 0
        unit = rev / qty if qty else 0
        if not qty:
            eng = "no_sales"
        else:
            popular = qty_share >= pop_threshold
            profitable = unit >= avg_price
            eng = {(True, True): "star", (True, False): "plowhorse",
                   (False, True): "puzzle", (False, False): "dog"}[(popular, profitable)]
        out.append(
            ItemRow(
                item_id=i,
                name=m.name,
                category_id=m.category_id,
                category=m.category,
                subcategory=m.subcategory,
                is_veg=m.is_veg,
                is_available=m.is_available,
                is_active=m.is_active,
                menu_price=_f(m.price),
                qty=qty,
                revenue=round(rev, 2),
                orders=n_orders,
                avg_price=round(unit, 2),
                qty_share=round(qty_share, 2),
                revenue_share=round(rev / total_rev * 100, 2) if total_rev else 0,
                penetration=_share(n_orders, total_orders),
                prev_qty=pqty,
                prev_revenue=round(prev_rev, 2),
                revenue_change_pct=_pct_change(rev, prev_rev),
                avg_rating=round(float(avg_r), 2) if avg_r is not None else None,
                rating_count=n_r,
                last_sold=last,
                engineering=eng,
                abc="-",
            )
        )

    # ABC: A = items making the first 80% of revenue, B = next 15%, C = the rest.
    out.sort(key=lambda r: r.revenue, reverse=True)
    running = 0.0
    for r in out:
        if not r.revenue:
            break
        before = running
        running += r.revenue
        r.abc = "A" if before < 0.8 * total_rev else "B" if before < 0.95 * total_rev else "C"

    cats: dict[int | None, dict[str, Any]] = {}
    for r in out:
        c = cats.setdefault(
            r.category_id,
            {"category": r.category or "Uncategorised", "qty": 0, "rev": 0.0, "prev": 0.0, "sold": 0},
        )
        c["qty"] += r.qty
        c["rev"] += r.revenue
        c["prev"] += r.prev_revenue
        c["sold"] += 1 if r.qty else 0
    categories = sorted(
        (
            CategoryMix(
                category_id=cid,
                category=c["category"],
                qty=c["qty"],
                revenue=round(c["rev"], 2),
                revenue_share=_share(c["rev"], total_rev),
                prev_revenue=round(c["prev"], 2),
                revenue_change_pct=_pct_change(c["rev"], c["prev"]),
                items_sold=c["sold"],
            )
            for cid, c in cats.items()
        ),
        key=lambda c: c.revenue,
        reverse=True,
    )

    return ItemsAnalytics(
        period=_period(w),
        total_orders=total_orders,
        total_qty=total_qty,
        total_revenue=round(total_rev, 2),
        menu_size=n,
        items_sold=sum(1 for r in out if r.qty),
        popularity_threshold=round(pop_threshold, 2),
        avg_item_price=round(avg_price, 2),
        engineering_counts=dict(Counter(r.engineering for r in out)),
        items=out,
        categories=categories,
    )


def _named_counts(counter: Counter, names: dict[int, str], total: int, limit: int = 12) -> list[NamedCount]:
    return [
        NamedCount(id=i, name=names.get(i, f"#{i}"), count=n, share=_share(n, total))
        for i, n in counter.most_common(limit)
    ]


def _addon_names(db: Session, topping_ids: set[int], variant_ids: set[int]):
    tnames, tprices, vnames = {}, {}, {}
    if topping_ids:
        for i, name, price in db.execute(
            select(models.Topping.id, models.Topping.name, models.Topping.price).where(
                models.Topping.id.in_(topping_ids)
            )
        ).all():
            tnames[i], tprices[i] = name, float(price or 0)
    if variant_ids:
        vnames = dict(
            db.execute(
                select(models.Variant.id, models.Variant.name).where(models.Variant.id.in_(variant_ids))
            ).all()
        )
    return tnames, tprices, vnames


@router.get("/items/{item_id}", response_model=ItemDetail)
def item_detail(
    item_id: int,
    rng: tuple[date | None, date | None] = Depends(_range_params),
    granularity: Granularity = Query(default="auto"),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Deep dive on one menu item: trend, when it sells, how it's customised,
    what it's bought with, its ratings and who buys it."""
    w = _window(*rng, granularity)
    meta = _item_meta(db, [item_id]).get(item_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Item not found")
    cur = _cur(w).label("cur")
    off = _bucket_offset(w).label("off")
    mine = and_(_sales_in(w), OrderItem.item_id == item_id)
    base = select().select_from(OrderItem).join(Order, Order.id == OrderItem.order_id)

    # One pass over this item's lines in both periods, grouped finely enough
    # (period, bucket, weekday, hour) to derive the trend, the totals, when it
    # sells and its star spread. Every order falls in exactly one group, so
    # summing the per-group distinct order counts stays exact.
    wd = func.weekday(Order.created_at).label("wd")
    hr = func.hour(Order.created_at).label("hr")
    stars = [func.sum(case((OrderItem.rating == k, 1), else_=0)) for k in range(1, 6)]
    grid = db.execute(
        base.add_columns(
            cur, off, wd, hr,
            func.sum(OrderItem.quantity),
            func.sum(OrderItem.quantity * OrderItem.price),
            func.count(distinct(OrderItem.order_id)),
            *stars,
        ).where(mine).group_by(
            literal_column("cur"), literal_column("off"), literal_column("wd"), literal_column("hr")
        )
    ).all()
    data: dict[tuple[int, int], tuple[int, float]] = {}
    tot = {0: [0, 0.0, 0], 1: [0, 0.0, 0]}
    dists = {0: [0] * 5, 1: [0] * 5}
    by_hour, by_weekday = [0] * 24, [0] * 7
    for c, o, d, h, q, v, n, *st in grid:
        c, q, v = int(c), int(q or 0), float(v or 0)
        dq, dv = data.get((c, int(o)), (0, 0.0))
        data[(c, int(o))] = (dq + q, dv + v)
        t = tot[c]
        t[0] += q
        t[1] += v
        t[2] += n
        for k in range(5):
            dists[c][k] += int(st[k] or 0)
        if c:
            by_hour[h] += q
            by_weekday[d] += q
    trend = _trend_points(w, data)
    dist = dists[1]

    def avg_stars(dd: list[int]) -> float:
        return sum((i + 1) * n for i, n in enumerate(dd)) / sum(dd) if sum(dd) else 0

    period_orders = dict(
        db.execute(select(cur, func.count()).where(_sales_in(w)).group_by(literal_column("cur"))).all()
    )

    cur_only = and_(_sales_in(w, include_prev=False), OrderItem.item_id == item_id)

    # Customisation mix — only the two JSON columns + qty are read.
    vcount, tcount = Counter(), Counter()
    lines = lines_with_toppings = 0
    for tids, vids, q in db.execute(
        base.add_columns(OrderItem.topping_ids, OrderItem.variant_ids, OrderItem.quantity).where(cur_only)
    ).all():
        lines += 1
        if tids:
            lines_with_toppings += 1
        for t in tids or []:
            tcount[t] += q
        for v in vids or []:
            vcount[v] += q
    tnames, _, vnames = _addon_names(db, set(tcount), set(vcount))
    units = tot[1][0]

    # Frequently bought together (with lift against each partner's order count).
    other = aliased(OrderItem)
    paired_rows = db.execute(
        select(other.item_id, func.count(distinct(other.order_id)).label("n"))
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .join(other, and_(other.order_id == OrderItem.order_id, other.item_id != item_id))
        .where(cur_only)
        .group_by(other.item_id)
        .order_by(literal_column("n").desc())
        .limit(8)
    ).all()
    paired: list[PairedItem] = []
    if paired_rows:
        partner_ids = [r[0] for r in paired_rows]
        partner_orders = dict(
            db.execute(
                base.add_columns(OrderItem.item_id, func.count(distinct(OrderItem.order_id)))
                .where(_sales_in(w, include_prev=False), OrderItem.item_id.in_(partner_ids))
                .group_by(OrderItem.item_id)
            ).all()
        )
        names = _item_meta(db, partner_ids)
        n_all, n_me = period_orders.get(1, 0), tot[1][2]
        for pid, n in paired_rows:
            n_p = partner_orders.get(pid, 0)
            paired.append(PairedItem(
                item_id=pid,
                name=names[pid].name if pid in names else f"#{pid}",
                orders_together=n,
                confidence=_share(n, n_me),
                lift=round(n * n_all / (n_me * n_p), 2) if n_me and n_p else 0,
            ))

    # Latest reviews up to the end of the period.
    reviews = [
        Review(rating=r, review=t, customer=name, created_at=at)
        for r, t, name, at in db.execute(
            base.add_columns(OrderItem.rating, OrderItem.review, models.User.name, Order.created_at)
            .join(models.User, models.User.id == Order.user_id)
            .where(
                OrderItem.item_id == item_id,
                Order.status.in_(SALE_STATUSES),
                Order.created_at < w.end,
                (OrderItem.rating.is_not(None)) | (OrderItem.review.is_not(None)),
            )
            .order_by(Order.created_at.desc())
            .limit(10)
        ).all()
    ]

    # Who buys it: distinct customers and those who came back for it.
    buyer_counts = db.execute(
        base.add_columns(Order.user_id, func.count(distinct(Order.id))).where(cur_only).group_by(Order.user_id)
    ).all()

    def pen(p: int) -> float:
        return _share(tot[p][2], period_orders.get(p, 0))

    return ItemDetail(
        period=_period(w),
        item_id=item_id,
        name=meta.name,
        category=meta.category,
        subcategory=meta.subcategory,
        menu_price=_f(meta.price),
        is_veg=meta.is_veg,
        is_available=meta.is_available,
        kpis={
            "qty": _kpi(tot[1][0], tot[0][0]),
            "revenue": _kpi(tot[1][1], tot[0][1]),
            "orders": _kpi(tot[1][2], tot[0][2]),
            "avg_price": _kpi(tot[1][1] / tot[1][0] if tot[1][0] else 0, tot[0][1] / tot[0][0] if tot[0][0] else 0),
            "penetration": _kpi(pen(1), pen(0)),
            "avg_rating": _kpi(avg_stars(dists[1]), avg_stars(dists[0])),
        },
        trend=trend,
        by_hour=by_hour,
        by_weekday=by_weekday,
        variants=_named_counts(vcount, vnames, units),
        toppings=_named_counts(tcount, tnames, units),
        lines_with_toppings_pct=_share(lines_with_toppings, lines),
        paired=paired,
        rating_distribution=dist,
        reviews=reviews,
        customers=len(buyer_counts),
        repeat_customers=sum(1 for _, n in buyer_counts if n >= 2),
    )


@router.get("/baskets", response_model=Baskets)
def baskets(
    rng: tuple[date | None, date | None] = Depends(_range_params),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Basket analysis: basket-size distribution, the strongest item pairs
    (support / confidence / lift) and add-on (topping, variant) attach."""
    w = _window(*rng)
    in_cur = _sales_in(w, include_prev=False)

    # Per-order size (plus customised-line counts), aggregated again in SQL
    # so only ≤6 rows come back.
    has_t = func.json_length(OrderItem.topping_ids) > 0
    has_v = func.json_length(OrderItem.variant_ids) > 0
    per_order = (
        select(
            Order.id.label("oid"),
            Order.total_amount.label("total"),
            func.sum(OrderItem.quantity).label("units"),
            func.count(OrderItem.id).label("nlines"),
            func.sum(case((has_t, 1), else_=0)).label("t_lines"),
            func.sum(case((has_v, 1), else_=0)).label("v_lines"),
        )
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(in_cur)
        .group_by(Order.id, Order.total_amount)
        .subquery()
    )
    size = func.least(per_order.c.units, 6).label("size")
    size_rows = db.execute(
        select(size, func.count(), func.avg(per_order.c.total), func.sum(per_order.c.units),
               func.sum(per_order.c.nlines), func.sum(case((per_order.c.nlines == 1, 1), else_=0)),
               func.sum(per_order.c.t_lines), func.sum(per_order.c.v_lines))
        .group_by(literal_column("size"))
        .order_by(literal_column("size"))
    ).all()
    total_orders = sum(r[1] for r in size_rows)
    units = sum(int(r[3] or 0) for r in size_rows)
    nlines = sum(int(r[4] or 0) for r in size_rows)
    single = sum(int(r[5] or 0) for r in size_rows)
    t_lines = sum(int(r[6] or 0) for r in size_rows)
    v_lines = sum(int(r[7] or 0) for r in size_rows)
    size_distribution = [
        SizeBucket(size="6+" if s >= 6 else str(int(s)), orders=n, share=_share(n, total_orders), aov=_f(a))
        for s, n, a, *_ in size_rows
    ]

    # Item pairs: self-join on order, a < b so each pair is counted once.
    a_, b_ = aliased(OrderItem), aliased(OrderItem)
    pair_rows = db.execute(
        select(a_.item_id, b_.item_id, func.count(distinct(a_.order_id)).label("n"))
        .select_from(a_)
        .join(b_, and_(b_.order_id == a_.order_id, b_.item_id > a_.item_id))
        .join(Order, Order.id == a_.order_id)
        .where(in_cur)
        .group_by(a_.item_id, b_.item_id)
        .order_by(literal_column("n").desc())
        .limit(15)
    ).all()
    pairs: list[Pair] = []
    if pair_rows:
        ids = list({i for r in pair_rows for i in r[:2]})
        item_orders = dict(
            db.execute(
                select(OrderItem.item_id, func.count(distinct(OrderItem.order_id)))
                .join(Order, Order.id == OrderItem.order_id)
                .where(in_cur, OrderItem.item_id.in_(ids))
                .group_by(OrderItem.item_id)
            ).all()
        )
        names = _item_meta(db, ids)
        for a, b, n in pair_rows:
            na, nb = item_orders.get(a, 0), item_orders.get(b, 0)
            pairs.append(Pair(
                a_id=a, a_name=names[a].name if a in names else f"#{a}",
                b_id=b, b_name=names[b].name if b in names else f"#{b}",
                orders_together=n,
                support=_share(n, total_orders),
                confidence_ab=_share(n, na),
                confidence_ba=_share(n, nb),
                lift=round(n * total_orders / (na * nb), 2) if na and nb else 0,
            ))

    # Add-on mix: read only the customised lines' JSON.
    joined = select().select_from(OrderItem).join(Order, Order.id == OrderItem.order_id)
    tcount, vcount = Counter(), Counter()
    for tids, vids, q in db.execute(
        joined.add_columns(OrderItem.topping_ids, OrderItem.variant_ids, OrderItem.quantity)
        .where(in_cur, has_t | has_v)
    ).all():
        for t in tids or []:
            tcount[t] += q
        for v in vids or []:
            vcount[v] += q
    tnames, tprices, vnames = _addon_names(db, set(tcount), set(vcount))

    return Baskets(
        period=_period(w),
        total_orders=total_orders,
        avg_items=round(units / total_orders, 2) if total_orders else 0,
        avg_lines=round(nlines / total_orders, 2) if total_orders else 0,
        single_item_orders_pct=_share(single, total_orders),
        size_distribution=size_distribution,
        pairs=pairs,
        lines=nlines,
        topping_attach_pct=_share(t_lines, nlines),
        variant_pick_pct=_share(v_lines, nlines),
        toppings=_named_counts(tcount, tnames, units),
        variants=_named_counts(vcount, vnames, units),
        est_topping_revenue=round(sum(n * tprices.get(t, 0) for t, n in tcount.items()), 2),
    )


@router.get("/customers", response_model=Customers)
def customers(
    rng: tuple[date | None, date | None] = Depends(_range_params),
    lapsed_after_days: int = Query(default=21, ge=7, le=180, description="A regular is 'lapsed' after this many days away."),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Customer health: new vs returning, visit frequency, top spenders and a
    win-back list of regulars (3+ lifetime orders) who stopped coming."""
    w = _window(*rng)
    per, first = _customer_sets(db, w)

    def stats(p: int, pstart: datetime) -> dict[str, float]:
        users = per[p]
        n = len(users)
        new = [u for u in users if first.get(u) and first[u] >= pstart]
        spend = sum(s for _, s in users.values())
        orders = sum(o for o, _ in users.values())
        new_set = set(new)
        ret_spend = sum(s for u, (_, s) in users.items() if u not in new_set)
        return {
            "customers": n,
            "new_customers": len(new),
            "returning_customers": n - len(new),
            "repeat_rate": _share(sum(1 for o, _ in users.values() if o >= 2), n),
            "orders_per_customer": orders / n if n else 0,
            "spend_per_customer": spend / n if n else 0,
            "_ret_share": _share(ret_spend, spend),
        }

    c, p = stats(1, w.start), stats(0, w.prev_start)
    ret_share = c.pop("_ret_share")
    p.pop("_ret_share")

    freq_def = (("1 visit", 1, 1), ("2 visits", 2, 2), ("3–4 visits", 3, 4), ("5–9 visits", 5, 9), ("10+ visits", 10, 10**9))
    users = per[1]
    frequency = []
    for label, lo, hi in freq_def:
        group = [s for o, s in users.values() if lo <= o <= hi]
        frequency.append(FrequencyBucket(
            label=label, customers=len(group), share=_share(len(group), len(users)), revenue=round(sum(group), 2)
        ))

    # New vs returning per bucket: distinct (user, bucket) pairs in the period.
    off = _bucket_offset(w, include_prev=False).label("off")
    trend_new, trend_ret = Counter(), Counter()
    for uid, o in db.execute(
        select(Order.user_id, off).where(_sales_in(w, include_prev=False))
        .group_by(Order.user_id, literal_column("off"))
    ).all():
        bucket_start = w.bucket_start(w.start, int(o))
        (trend_new if first.get(uid) and first[uid] >= bucket_start else trend_ret)[int(o)] += 1
    trend = [
        CustomerTrendPoint(bucket=b, new=trend_new[i], returning=trend_ret[i])
        for i, (b, _) in enumerate(_bucket_labels(w))
    ]

    def rows_to_customers(rows) -> list[CustomerRow]:
        return [
            CustomerRow(
                user_id=r[0], name=r[1], email=r[2], orders=r[3], spend=_f(r[4]),
                last_order=r[5], days_since=max(0, (w.end - r[5]).days),
            )
            for r in rows
        ]

    cols = (
        Order.user_id,
        models.User.name,
        models.User.email_id,
        func.count().label("n"),
        func.sum(Order.total_amount).label("spend"),
        func.max(Order.created_at).label("last"),
    )
    top = rows_to_customers(db.execute(
        select(*cols).join(models.User, models.User.id == Order.user_id)
        .where(_sales_in(w, include_prev=False))
        .group_by(Order.user_id, models.User.name, models.User.email_id)
        .order_by(literal_column("spend").desc())
        .limit(10)
    ).all())
    lapsed = rows_to_customers(db.execute(
        select(*cols).join(models.User, models.User.id == Order.user_id)
        .where(Order.status.in_(SALE_STATUSES), Order.created_at < w.end)
        .group_by(Order.user_id, models.User.name, models.User.email_id)
        .having(and_(func.count() >= 3, func.max(Order.created_at) < w.end - timedelta(days=lapsed_after_days)))
        .order_by(literal_column("spend").desc())
        .limit(10)
    ).all())

    return Customers(
        period=_period(w),
        kpis={k: _kpi(c[k], p[k]) for k in c},
        frequency=frequency,
        trend=trend,
        top=top,
        lapsed=lapsed,
        returning_revenue_share=ret_share,
    )


@router.get("/operations", response_model=Operations)
def operations(
    rng: tuple[date | None, date | None] = Depends(_range_params),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Service health: status funnel, cancellations, abandoned carts, how long
    bills take to settle (placed → paid) and the live pipeline."""
    w = _window(*rng)
    cur = _cur(w).label("cur")
    rows = db.execute(
        select(cur, Order.status, func.count(), func.sum(Order.total_amount))
        .where(Order.created_at >= w.prev_start, Order.created_at < w.end)
        .group_by(literal_column("cur"), Order.status)
    ).all()
    by = {(int(c), s): (n, float(v or 0)) for c, s, n, v in rows}

    def rate(p: int) -> float:
        cancelled = by.get((p, Status.cancelled), (0, 0))[0]
        placed = cancelled + sum(by.get((p, s), (0, 0))[0] for s in SALE_STATUSES)
        return _share(cancelled, placed)

    statuses = [
        StatusCount(status=s.value, orders=by.get((1, s), (0, 0))[0], value=round(by.get((1, s), (0, 0))[1], 2))
        for s in Status
    ]

    # Settle time: completed orders, created → last update (the payment).
    secs = func.timestampdiff(literal_column("SECOND"), Order.created_at, Order.updated_at)
    paid_in_cur = and_(
        Order.status == Status.payment_completed,
        Order.created_at >= w.start,
        Order.created_at < w.end,
    )
    durations = sorted(
        max(0, int(d or 0)) for (d,) in db.execute(select(secs).where(paid_in_cur)).all()
    )

    def pct(q: float) -> float | None:
        if not durations:
            return None
        return round(durations[min(len(durations) - 1, int(q * len(durations)))] / 60, 1)

    hr = func.hour(Order.created_at).label("hr")
    settle_by_hour: list[float | None] = [None] * 24
    for h, avg_s in db.execute(select(hr, func.avg(secs)).where(paid_in_cur).group_by(literal_column("hr"))).all():
        settle_by_hour[h] = round(float(avg_s or 0) / 60, 1)

    off = _bucket_offset(w, include_prev=False).label("off")
    trend_data = {
        int(o): (int(n or 0), int(cn or 0))
        for o, n, cn in db.execute(
            select(
                off,
                func.sum(case((Order.status.in_(SALE_STATUSES), 1), else_=0)),
                func.sum(case((Order.status == Status.cancelled, 1), else_=0)),
            )
            .where(Order.status.in_(SALE_STATUSES + (Status.cancelled,)),
                   Order.created_at >= w.start, Order.created_at < w.end)
            .group_by(literal_column("off"))
        ).all()
    }
    trend = [
        OpsTrendPoint(bucket=b, orders=trend_data.get(i, (0, 0))[0], cancelled=trend_data.get(i, (0, 0))[1])
        for i, (b, _) in enumerate(_bucket_labels(w))
    ]

    carts = by.get((1, Status.cart), (0, 0.0))
    cancelled = by.get((1, Status.cancelled), (0, 0.0))
    return Operations(
        period=_period(w),
        statuses=statuses,
        cancellation_rate=_kpi(rate(1), rate(0)),
        cancelled_value=round(cancelled[1], 2),
        abandoned_carts=carts[0],
        abandoned_cart_value=round(carts[1], 2),
        settle_minutes_avg=round(sum(durations) / len(durations) / 60, 1) if durations else None,
        settle_minutes_median=pct(0.5),
        settle_minutes_p90=pct(0.9),
        settle_by_hour=settle_by_hour,
        trend=trend,
        pipeline=_pipeline(db),
    )
