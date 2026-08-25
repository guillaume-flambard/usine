"""L'identité des visiteurs de l'atelier.

Jusqu'ici un run était anonyme. Pour qu'il puisse appartenir à quelqu'un, il
faut une identité — et on la donne par **lien magique** : pas de mot de passe,
pas de tiers. Un visiteur entre son email, reçoit un lien à usage unique, et le
suivre ouvre une session.

Tout est derrière des ports (`Protocol`), comme le reste du service : une impl
en mémoire suffit aux tests (ni base ni SMTP requis), et Postgres/SMTP les
remplacent en production sans toucher aux routes.

Deux règles d'honnêteté câblées ici :
- Le jeton d'un lien n'est **jamais** conservé en clair — seulement son hash.
- On ne révèle pas si un email a déjà un compte, ni pourquoi une redemption
  échoue (expiré, utilisé, inconnu se ressemblent) : sinon on offre un oracle.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import smtplib
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Protocol

logger = logging.getLogger("usine.identity")

#: Durée de validité d'un lien magique. Assez pour aller lire son email, pas plus.
TOKEN_TTL_SECONDS = 15 * 60

#: Durée d'une session. Au-delà, on se reconnecte.
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60


def _hash(token: str) -> str:
    """Le hash qu'on stocke à la place du jeton. Un vol de base ne rend aucun lien."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_email(email: str) -> str:
    """Un email comparable : sans espaces, en minuscules. Vide si absurde."""
    cleaned = email.strip().lower()
    # Une validation minimale : un `@` entouré de quelque chose. On ne prétend
    # pas valider un email — l'envoi le fera —, seulement écarter le vide.
    if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
        return ""
    return cleaned


@dataclass(frozen=True)
class Account:
    """Un compte, identifié par son email."""

    id: str
    email: str


@dataclass(frozen=True)
class Organization:
    """Une organisation. En v1, une seule par compte (personnelle)."""

    id: str
    name: str
    owner_account_id: str


@dataclass(frozen=True)
class Identity:
    """Ce qu'une session résout : le compte et son organisation."""

    account: Account
    organization: Organization


class IdentityStore(Protocol):
    """Comptes et organisations. Idempotent par email."""

    def ensure(self, email: str) -> Identity:
        """Rend l'identité de cet email, en la créant à la première connexion."""
        ...

    def by_account(self, account_id: str) -> Identity | None: ...

    def forget(self, account_id: str) -> bool:
        """Efface le compte et son organisation (droit à l'effacement)."""
        ...


class TokenStore(Protocol):
    """Les jetons de lien magique. On stocke un hash, jamais le jeton."""

    def issue(self, email: str) -> str:
        """Crée un jeton pour cet email et rend le jeton en clair (à envoyer)."""
        ...

    def redeem(self, token: str) -> str | None:
        """Rend l'email si le jeton est valide et inutilisé, sinon `None`. Usage unique."""
        ...

    def forget(self, email: str) -> int:
        """Efface les jetons d'un email (effacement)."""
        ...

    def purge_expired(self) -> int:
        """Retire les jetons expirés (rétention)."""
        ...


class SessionStore(Protocol):
    """Les sessions ouvertes."""

    def open(self, account_id: str) -> str:
        """Ouvre une session et rend son identifiant (le secret du cookie)."""
        ...

    def account(self, session_id: str) -> str | None:
        """Le compte d'une session valide, sinon `None`."""
        ...

    def close(self, session_id: str) -> None: ...

    def forget(self, account_id: str) -> int:
        """Efface les sessions d'un compte (effacement)."""
        ...

    def purge_expired(self) -> int:
        """Retire les sessions expirées (rétention)."""
        ...


class EmailSender(Protocol):
    """L'envoi du lien. Faux en test, SMTP en prod, journal en dev."""

    def send_link(self, email: str, link: str) -> None: ...


# --- Implémentations en mémoire : suffisantes pour les tests et le dev. ---


class InMemoryIdentityStore:
    """Comptes/orgs en mémoire, idempotents par email."""

    def __init__(self) -> None:
        self._by_email: dict[str, Identity] = {}
        self._by_account: dict[str, Identity] = {}

    def ensure(self, email: str) -> Identity:
        existing = self._by_email.get(email)
        if existing is not None:
            return existing
        account = Account(id=secrets.token_hex(8), email=email)
        # Une org personnelle, nommée par l'email : lisible, et remplaçable
        # quand le multi-membres arrivera.
        org = Organization(
            id=secrets.token_hex(8),
            name=email,
            owner_account_id=account.id,
        )
        identity = Identity(account=account, organization=org)
        self._by_email[email] = identity
        self._by_account[account.id] = identity
        return identity

    def by_account(self, account_id: str) -> Identity | None:
        return self._by_account.get(account_id)

    def forget(self, account_id: str) -> bool:
        identity = self._by_account.pop(account_id, None)
        if identity is None:
            return False
        self._by_email.pop(identity.account.email, None)
        return True


@dataclass
class _Token:
    email: str
    expires_at: float
    used: bool = False


class InMemoryTokenStore:
    """Jetons en mémoire. Stocke le hash, expire, et n'accepte qu'un usage."""

    def __init__(
        self,
        *,
        ttl_seconds: float = TOKEN_TTL_SECONDS,
        now: Callable[[], float] = time.time,
    ) -> None:
        self._tokens: dict[str, _Token] = {}
        self._ttl = ttl_seconds
        self._now = now

    def issue(self, email: str) -> str:
        token = secrets.token_urlsafe(32)
        self._tokens[_hash(token)] = _Token(email=email, expires_at=self._now() + self._ttl)
        return token

    def redeem(self, token: str) -> str | None:
        entry = self._tokens.get(_hash(token))
        if entry is None or entry.used or entry.expires_at < self._now():
            return None
        entry.used = True
        return entry.email

    def forget(self, email: str) -> int:
        gone = [key for key, entry in self._tokens.items() if entry.email == email]
        for key in gone:
            del self._tokens[key]
        return len(gone)

    def purge_expired(self) -> int:
        now = self._now()
        gone = [key for key, entry in self._tokens.items() if entry.expires_at < now]
        for key in gone:
            del self._tokens[key]
        return len(gone)


@dataclass
class _Session:
    account_id: str
    expires_at: float


class InMemorySessionStore:
    """Sessions en mémoire, avec expiration."""

    def __init__(
        self,
        *,
        ttl_seconds: float = SESSION_TTL_SECONDS,
        now: Callable[[], float] = time.time,
    ) -> None:
        self._sessions: dict[str, _Session] = {}
        self._ttl = ttl_seconds
        self._now = now

    def open(self, account_id: str) -> str:
        session_id = secrets.token_urlsafe(32)
        self._sessions[session_id] = _Session(
            account_id=account_id, expires_at=self._now() + self._ttl
        )
        return session_id

    def account(self, session_id: str) -> str | None:
        entry = self._sessions.get(session_id)
        if entry is None or entry.expires_at < self._now():
            return None
        return entry.account_id

    def close(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def forget(self, account_id: str) -> int:
        gone = [sid for sid, entry in self._sessions.items() if entry.account_id == account_id]
        for sid in gone:
            del self._sessions[sid]
        return len(gone)

    def purge_expired(self) -> int:
        now = self._now()
        gone = [sid for sid, entry in self._sessions.items() if entry.expires_at < now]
        for sid in gone:
            del self._sessions[sid]
        return len(gone)


@dataclass
class RecordingEmailSender:
    """Un émetteur qui garde le dernier lien plutôt que de l'envoyer.

    En dev, il tient lieu d'SMTP (on lit le lien dans les logs) ; en test, il
    rend le lien vérifiable sans réseau.
    """

    sent: list[tuple[str, str]] = field(default_factory=list)

    def send_link(self, email: str, link: str) -> None:
        self.sent.append((email, link))


class LoggingEmailSender:
    """En dev, on n'envoie pas : on journalise le lien pour le suivre à la main.

    Honnête sur ce qu'il fait — il ne joint aucun serveur. À remplacer par
    `SmtpEmailSender` en production (sélection par variable d'environnement).
    """

    def send_link(self, email: str, link: str) -> None:
        # Le lien est un secret à usage unique : en dev seulement, jamais en prod
        # (où c'est `SmtpEmailSender` qui sert, et rien n'est journalisé).
        logger.info("lien de connexion pour %s : %s", email, link)


@dataclass
class SmtpEmailSender:
    """L'envoi réel, par SMTP. Configuré par l'environnement, jamais testé en CI.

    Non exercé par les tests (il joindrait un serveur) : c'est un adaptateur de
    bord, comme l'appel au fournisseur. Sa correction se vérifie à la mise en
    service (tâche d'infra), pas ici.
    """

    host: str
    port: int
    username: str
    password: str
    sender: str
    use_tls: bool = True

    def send_link(self, email: str, link: str) -> None:
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = email
        message["Subject"] = "Votre lien de connexion à l'atelier"
        message.set_content(
            "Pour vous connecter, ouvrez ce lien (valable un usage, un court instant) :\n\n"
            f"{link}\n\nSi vous n'avez rien demandé, ignorez cet email."
        )
        with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
            if self.use_tls:
                smtp.starttls()
            if self.username:
                smtp.login(self.username, self.password)
            smtp.send_message(message)
