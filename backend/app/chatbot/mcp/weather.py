"""Current weather for the cafe's location.

Reads the cafe's ``location`` (and, when available, ``latitude`` /
``longitude``) from the single ``TenantRightsAndInformation`` row and returns
a trimmed, chatbot-friendly snapshot of the current conditions there.

Weather comes from `Open-Meteo <https://open-meteo.com/>`_ — a free API that
needs no key and permits commercial use. Two of its endpoints are used:

* geocoding (``geocoding-api.open-meteo.com``) — only when the stored row has a
  ``location`` name but no coordinates, to turn that name into lat/lon.
* forecast (``api.open-meteo.com``) — fetches ``current_weather`` for the
  resolved coordinates.

Everything goes through the standard-library ``urllib`` so no extra dependency
is pulled in.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models

_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_TIMEOUT = 10  # seconds

# Open-Meteo reports conditions as WMO weather codes; map the ones we care
# about to a short human phrase so the chatbot gets words, not a number.
_WMO_DESCRIPTIONS: dict[int, str] = {
    0: "clear sky",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "depositing rime fog",
    51: "light drizzle",
    53: "moderate drizzle",
    55: "dense drizzle",
    56: "light freezing drizzle",
    57: "dense freezing drizzle",
    61: "slight rain",
    63: "moderate rain",
    65: "heavy rain",
    66: "light freezing rain",
    67: "heavy freezing rain",
    71: "slight snowfall",
    73: "moderate snowfall",
    75: "heavy snowfall",
    77: "snow grains",
    80: "slight rain showers",
    81: "moderate rain showers",
    82: "violent rain showers",
    85: "slight snow showers",
    86: "heavy snow showers",
    95: "thunderstorm",
    96: "thunderstorm with slight hail",
    99: "thunderstorm with heavy hail",
}

# How the raw temperature (°C) reads to a human — ordered coldest to hottest.
# Each entry is the upper bound (exclusive) for its word; the last word covers
# everything above the final bound.
_TEMPERATURE_BANDS: list[tuple[float, str]] = [
    (8, "cold"),
    (15, "cool"),
    (22, "pleasant"),
    (28, "normal"),
    (35, "hot"),
]
_HOTTEST_WORD = "extremely hot"


def _temperature_word(temperature_c: float | None) -> str:
    """A single adjective — cold / cool / pleasant / normal / hot / extremely
    hot — for a Celsius reading, or ``"unknown temperature"`` when absent."""
    if temperature_c is None:
        return "unknown temperature"
    for upper, word in _TEMPERATURE_BANDS:
        if temperature_c < upper:
            return word
    return _HOTTEST_WORD


class WeatherUnavailable(RuntimeError):
    """Raised when the cafe has no usable location or the API can't be reached."""


def _get(url: str, params: dict) -> dict:
    """GET ``url?params`` and return the decoded JSON body as a dict."""
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}", headers={"User-Agent": "cafe-app-weather/1.0"}
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def _geocode(name: str) -> tuple[float, float, str]:
    """Resolve a place name to ``(latitude, longitude, resolved_name)``."""
    data = _get(_GEOCODE_URL, {"name": name, "count": 1, "format": "json"})
    results = data.get("results") or []
    if not results:
        raise WeatherUnavailable(f"Could not find a location named {name!r}.")
    top = results[0]
    label_parts = [top.get("name"), top.get("admin1"), top.get("country")]
    label = ", ".join(part for part in label_parts if part)
    return float(top["latitude"]), float(top["longitude"]), label


def get_weather(db: Session) -> str:
    """Current weather at the cafe's stored location, as one short phrase for
    an LLM prompt.

    Resolves coordinates from the ``TenantRightsAndInformation`` row —
    preferring stored ``latitude`` / ``longitude``, otherwise geocoding the
    ``location`` name — fetches the current conditions from Open-Meteo, and
    boils them down to the sky description plus a temperature word, e.g.
    ``"partly cloudy, pleasant"`` or ``"slight rain, cool"``.

    Raises :class:`WeatherUnavailable` when the cafe has neither coordinates nor
    a resolvable ``location``, or when Open-Meteo can't be reached.
    """
    row = db.execute(
        select(models.TenantRightsAndInformation).limit(1)
    ).scalar_one_or_none()
    if row is None:
        raise WeatherUnavailable("No tenant row found to read a location from.")

    if row.latitude is not None and row.longitude is not None:
        latitude, longitude = float(row.latitude), float(row.longitude)
        label = row.location or f"{latitude:.4f}, {longitude:.4f}"
    elif row.location:
        latitude, longitude, label = _geocode(row.location)
    else:
        raise WeatherUnavailable(
            "The cafe has no location set (need latitude/longitude or a "
            "location name)."
        )

    try:
        forecast = _get(
            _FORECAST_URL,
            {
                "latitude": latitude,
                "longitude": longitude,
                "current_weather": "true",
            },
        )
    except (urllib.error.URLError, TimeoutError) as exc:
        raise WeatherUnavailable(f"Weather service unreachable: {exc}") from exc

    current = forecast.get("current_weather")
    if not current:
        raise WeatherUnavailable("Weather service returned no current conditions.")

    sky = _WMO_DESCRIPTIONS.get(current.get("weathercode"), "unknown conditions")
    return f"{sky}, temperature : {_temperature_word(current.get('temperature'))}"
