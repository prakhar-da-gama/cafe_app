"""Open (or reuse) the user's cart for a chat session.

Mirrors what ``POST /api/cart/add-item`` does before it adds a line: a cart is a
draft ``orders`` row with status ``cart``, and every user has at most one open at
a time. So this returns the id of the user's existing cart when there is one, and
otherwise creates an empty cart and returns its id.
"""
from sqlalchemy.orm import Session

from ... import crud


def initiate_my_cart(db: Session, user_id: int) -> int:
    """The id of the user's open cart, creating an empty one if none exists.

    Reuses the same ``get_or_create_cart`` helper the cart endpoints use, so an
    already-open cart is returned as is rather than duplicated.
    """
    cart = crud.get_or_create_cart(db, user_id)
    return cart.id
