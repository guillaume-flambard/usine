"""Les bornes, sans passer par HTTP.

Les deux plafonds ne protègent pas la même chose et ne se remplacent pas : le
global protège la facture, celui par visiteur protège les autres visiteurs.
"""

from __future__ import annotations

from dataclasses import replace

from usine_api.limits import Limits, RateLimiter

DEFAULTS = Limits()


def frozen(start: float = 1_755_000_000.0):
    """Une horloge qu'on avance à la main : un test ne dort pas."""
    now = {"t": start}
    return now, lambda: now["t"]


def test_it_caps_one_address_per_minute_then_releases_it() -> None:
    now, clock = frozen()
    gate = RateLimiter(DEFAULTS, clock)

    for _ in range(DEFAULTS.per_minute):
        assert gate.allow("a") is None
    assert "trop de demandes" in (gate.allow("a") or "")
    # Une autre adresse n'est pas punie pour la première.
    assert gate.allow("b") is None

    now["t"] += 61
    assert gate.allow("a") is None


def test_one_visitor_cannot_take_the_day_and_the_others_are_spared() -> None:
    now, clock = frozen()
    limits = replace(DEFAULTS, per_minute=10_000, per_day=1_000, per_visitor_per_day=5)
    gate = RateLimiter(limits, clock)

    for _ in range(limits.per_visitor_per_day):
        assert gate.allow("gourmand") is None
    assert gate.allow("gourmand") == "capacité du jour atteinte pour vous"
    # Tout l'intérêt : le site n'est pas à court, ce visiteur l'est.
    assert gate.allow("quelqu-un-d-autre") is None

    now["t"] += 24 * 3600
    assert gate.allow("gourmand") is None


def test_the_site_cap_still_exists_above_the_per_visitor_one() -> None:
    _, clock = frozen()
    limits = replace(DEFAULTS, per_minute=10_000, per_day=12, per_visitor_per_day=10_000)
    gate = RateLimiter(limits, clock)

    for i in range(limits.per_day):
        assert gate.allow(f"ip-{i}") is None
    assert gate.allow("nouvelle-ip") == "capacité du jour atteinte pour le site"


def test_reading_what_is_left_consumes_nothing() -> None:
    _, clock = frozen()
    limits = replace(DEFAULTS, per_day=100, per_visitor_per_day=10)
    gate = RateLimiter(limits, clock)

    # La page lit ceci avant chaque run : si lire coûtait, elle épuiserait la
    # capacité en l'annonçant.
    assert (gate.remaining("a").visitor, gate.remaining("a").site) == (10, 100)
    assert (gate.remaining("a").visitor, gate.remaining("a").site) == (10, 100)

    gate.allow("a")

    assert (gate.remaining("a").visitor, gate.remaining("a").site) == (9, 99)
    # La part d'un autre visiteur est la sienne ; le global est partagé.
    assert (gate.remaining("b").visitor, gate.remaining("b").site) == (10, 99)


def test_a_new_day_does_not_carry_yesterday() -> None:
    now, clock = frozen()
    limits = replace(DEFAULTS, per_visitor_per_day=2)
    gate = RateLimiter(limits, clock)

    gate.allow("a")
    gate.allow("a")
    assert gate.allow("a") is not None

    now["t"] += 24 * 3600
    assert gate.remaining("a").visitor == 2
    assert gate.allow("a") is None
