"""L'identité par lien magique.

Ce qu'elle garantit : un compte par email (idempotent), un jeton à usage unique
qui expire et n'est jamais stocké en clair, des sessions qui se ferment.
"""

from __future__ import annotations

from usine_api.identity import (
    InMemoryIdentityStore,
    InMemorySessionStore,
    InMemoryTokenStore,
    RecordingEmailSender,
    _hash,
    normalize_email,
)


def test_first_sign_in_provisions_account_and_personal_org() -> None:
    store = InMemoryIdentityStore()
    first = store.ensure("a@b.co")
    assert first.account.email == "a@b.co"
    assert first.organization.owner_account_id == first.account.id


def test_sign_in_is_idempotent_by_email() -> None:
    store = InMemoryIdentityStore()
    first = store.ensure("a@b.co")
    again = store.ensure("a@b.co")
    assert again.account.id == first.account.id
    assert again.organization.id == first.organization.id


def test_by_account_resolves_a_known_account() -> None:
    store = InMemoryIdentityStore()
    made = store.ensure("a@b.co")
    assert store.by_account(made.account.id) == made
    assert store.by_account("unknown") is None


def test_a_token_is_never_stored_in_clear() -> None:
    tokens = InMemoryTokenStore()
    token = tokens.issue("a@b.co")
    # Le jeton en clair n'est nulle part ; seul son hash l'est.
    assert _hash(token) in tokens._tokens
    assert token not in tokens._tokens


def test_a_valid_token_redeems_once_to_its_email() -> None:
    tokens = InMemoryTokenStore()
    token = tokens.issue("a@b.co")
    assert tokens.redeem(token) == "a@b.co"
    # Usage unique : la deuxième fois échoue.
    assert tokens.redeem(token) is None


def test_an_expired_token_is_refused() -> None:
    clock = {"t": 1000.0}
    tokens = InMemoryTokenStore(ttl_seconds=60, now=lambda: clock["t"])
    token = tokens.issue("a@b.co")
    clock["t"] += 61
    assert tokens.redeem(token) is None


def test_an_unknown_token_is_refused() -> None:
    tokens = InMemoryTokenStore()
    assert tokens.redeem("not-a-real-token") is None


def test_a_session_opens_resolves_and_closes() -> None:
    sessions = InMemorySessionStore()
    sid = sessions.open("acct-1")
    assert sessions.account(sid) == "acct-1"
    sessions.close(sid)
    assert sessions.account(sid) is None


def test_an_expired_session_does_not_resolve() -> None:
    clock = {"t": 0.0}
    sessions = InMemorySessionStore(ttl_seconds=10, now=lambda: clock["t"])
    sid = sessions.open("acct-1")
    clock["t"] += 11
    assert sessions.account(sid) is None


def test_normalize_email_rejects_the_absurd() -> None:
    assert normalize_email("  A@B.CO ") == "a@b.co"
    assert normalize_email("no-at") == ""
    assert normalize_email("@nope") == ""


def test_recording_sender_keeps_the_link() -> None:
    sender = RecordingEmailSender()
    sender.send_link("a@b.co", "https://x/redeem?token=zzz")
    assert sender.sent == [("a@b.co", "https://x/redeem?token=zzz")]
