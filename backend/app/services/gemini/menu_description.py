"""Gemini call behind the cached restaurant understanding."""
from .client import generate_text


def generate_menu_description(menu_json: str) -> str:
    """Ask Gemini to study the full menu and describe the restaurant in ~300
    words: its style, speciality, and how its themes relate to current trends.

    This understanding is cached on the tenant and reused as context when
    recommending future changes to the menu and theme.
    """
    prompt = (
        "You are a restaurant branding and menu consultant. Below is the "
        "complete menu of a cafe as JSON (categories -> subcategories -> items "
        "with prices, veg flags, toppings and variants).\n\n"
        "Understand this menu and work out the style of the restaurant, its "
        "speciality, its apparent price positioning and target audience. This "
        "information will be used to recommend future changes to the "
        "restaurant's menu and theme, so also analyse current themes and food "
        "trends to give an accurate, grounded description. Write about 300 "
        "words of flowing prose (no headings, no bullet points).\n\n"
        f"MENU JSON:\n{menu_json}"
    )
    return generate_text(prompt)
