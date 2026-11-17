"""Le registre des serveurs d'outils, en liste blanche (MEM-37).

Un agent nomme un serveur, jamais une adresse. Ce module est le seul endroit où
un nom devient une URL, et il ne prend ses noms que dans un fichier versionné
(`config/mcp-servers.yaml`), pas dans ce que dit un modèle.

Trois refus y sont tenus, chacun pour une raison différente :

- **un nom inconnu** ne résout pas : sinon la liste blanche ne serait qu'une
  décoration ;
- **une adresse à la place d'un nom** est refusée : un site public qui relaie
  une URL fournie par un modèle est un proxy ouvert (CLAUDE.md, invariant 2) ;
- **un outil hors liste** n'est jamais exposé, même si le serveur le propose :
  le jour où un serveur ajoute un outil, il ne devient pas disponible sans une
  ligne dans le fichier.

Le niveau de risque vit par outil, pas par serveur : un même serveur peut lire
et publier. Un outil `irreversible` ne s'exécute pas sans décision humaine
(MEM-20), et l'appel le dit au lieu de le faire.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Literal

import yaml

from usine_api.mcp import Server, remember_credential

RiskLevel = Literal["read", "write", "irreversible"]
RISKS: tuple[str, ...] = ("read", "write", "irreversible")

#: A name, not an address: lowercase, dot, dash, underscore.
NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")

#: An environment variable name, by convention uppercase.
ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")


class RegistryRefusal(Exception):
    """A tool server request the registry will not serve, and why."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class AllowedTool:
    name: str
    risk: RiskLevel


@dataclass(frozen=True)
class Registered:
    """One server as the whitelist declares it."""

    name: str
    url: str
    description: str
    token_env: str | None
    tools: tuple[AllowedTool, ...]

    def server(self) -> Server:
        return Server(name=self.name, url=self.url, description=self.description)

    def risk_of(self, tool: str) -> RiskLevel:
        for allowed in self.tools:
            if allowed.name == tool:
                return allowed.risk
        raise RegistryRefusal(403, f"outil non autorisé sur « {self.name} » : {tool}")


class Registry:
    """The whitelist: names in, servers and tools out."""

    def __init__(self, servers: dict[str, Registered]) -> None:
        self._servers = servers
        # The transport sends each server its own token, read from the named
        # variable at call time (mcp.auth_headers).
        for registered in servers.values():
            if registered.token_env:
                remember_credential(registered.url, registered.token_env)

    @classmethod
    def load(cls, path: Path) -> Registry:
        if not path.exists():
            return cls({})
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        entries = raw.get("servers") or []
        if not isinstance(entries, list):
            raise ValueError(f"{path}: « servers » doit être une liste")
        servers: dict[str, Registered] = {}
        for entry in entries:
            registered = _validate(entry, path)
            if registered.name in servers:
                raise ValueError(f"{path}: serveur en double : {registered.name}")
            servers[registered.name] = registered
        return cls(servers)

    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._servers))

    def without(self, tools: frozenset[str]) -> Registry:
        """The same whitelist minus some tools: what the chat may not reach."""
        servers = {
            name: replace(
                registered,
                tools=tuple(tool for tool in registered.tools if tool.name not in tools),
            )
            for name, registered in self._servers.items()
        }
        return Registry(servers)

    def servers(self) -> dict[str, Server]:
        return {name: registered.server() for name, registered in self._servers.items()}

    def resolve(self, name: str) -> Registered:
        """A server by name. An address is not a name."""
        if "://" in name or "/" in name:
            raise RegistryRefusal(
                400,
                f"un serveur se nomme, il ne s'adresse pas : « {name} » ressemble à une adresse",
            )
        registered = self._servers.get(name)
        if registered is None:
            known = ", ".join(self.names()) or "aucun"
            raise RegistryRefusal(400, f"serveur inconnu : {name}. Serveurs : {known}")
        return registered

    def allowed(self, name: str, tool: str) -> RiskLevel:
        registered = self.resolve(name)
        return registered.risk_of(tool)

    def check_call(self, name: str, tool: str) -> RiskLevel:
        """The risk of a call the service is willing to serve, or a refusal.

        An irreversible tool here is refused **before** anything runs: it has to
        come back with a human decision, never start on its own.
        """
        risk = self.allowed(name, tool)
        if risk == "irreversible":
            raise RegistryRefusal(
                409,
                f"« {name}/{tool} » est irréversible : il passe par la porte "
                "humaine (MEM-20), il ne s'exécute pas à la demande d'un agent",
            )
        return risk


def tools_reachable(registry: Registry, env: Mapping[str, str]) -> bool:
    """True when at least one whitelisted server can be called now.

    A server that names a token is reachable only once that variable is set;
    a server without `token_env` needs none.
    """
    for name in registry.names():
        token_env = registry.resolve(name).token_env
        if token_env is None or env.get(token_env):
            return True
    return False


def _validate(entry: Any, path: Path) -> Registered:
    if not isinstance(entry, dict):
        raise ValueError(f"{path}: chaque serveur doit être un objet")
    name = str(entry.get("name", ""))
    if not NAME.match(name):
        raise ValueError(f"{path}: nom de serveur invalide : {name!r}")
    url = str(entry.get("url", ""))
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"{path}: {name}: une URL http(s) est attendue")
    tools = entry.get("tools") or {}
    if not isinstance(tools, dict) or not tools:
        raise ValueError(f"{path}: {name}: au moins un outil, et son niveau de risque")
    allowed: list[AllowedTool] = []
    for tool, risk in tools.items():
        if not NAME.match(str(tool)):
            raise ValueError(f"{path}: {name}: nom d'outil invalide : {tool!r}")
        if risk not in RISKS:
            raise ValueError(f"{path}: {name}/{tool}: risque inconnu : {risk!r}")
        allowed.append(AllowedTool(name=str(tool), risk=risk))
    token_env = entry.get("token_env")
    if token_env is not None and not ENV_NAME.match(str(token_env)):
        raise ValueError(f"{path}: {name}: token_env doit être un nom de variable")
    return Registered(
        name=name,
        url=url,
        description=str(entry.get("description", "")),
        token_env=str(token_env) if token_env else None,
        tools=tuple(allowed),
    )
