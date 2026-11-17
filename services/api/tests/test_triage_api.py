"""The triage route: a service token, one run a day, a checklist gate (ADR 0003)."""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from test_fork import CountingPlanner, CountingSpecialist
from test_triage_graph import MERGED, POLICY, Executor, Judge, Reader, issue

from usine_api.app import create_app
from usine_api.graph.triage import build_triage_graph
from usine_api.identity import InMemoryIdentityStore, InMemorySessionStore
from usine_api.mcp_auth import InMemoryMcpAuthStore
from usine_api.threads import InMemoryThreadIndex
from usine_api.triage.github import Snapshot

TODAY = "tri-" + datetime.now(ZoneInfo("Europe/Paris")).date().isoformat()


class World:
    def __init__(self, snap: Snapshot | None = None) -> None:
        self.people, self.seats = InMemoryIdentityStore(), InMemorySessionStore()
        self.owner = self.people.ensure("owner@atelier.co")
        self.org = self.owner.organization.id
        self.tokens = InMemoryMcpAuthStore()
        self.triage = self.tokens.issue(self.org, "timer", "triage").token
        self.read = self.tokens.issue(self.org, "lecture", "read").token
        self.executor = Executor()
        items = [issue(1, closed_by_merged_pr=MERGED), issue(2), issue(3)]
        self.snap = snap or Snapshot(items=items)

        def factory(checkpointer: Any) -> Any:
            return build_triage_graph(
                Reader(self.snap), Judge(), self.executor, POLICY, checkpointer=checkpointer
            )

        self.app = create_app(
            planner=CountingPlanner(),
            specialist=CountingSpecialist(),
            open_atelier=False,
            secure_cookies=False,
            identities=self.people,
            sessions=self.seats,
            mcp_auth=self.tokens,
            threads=InMemoryThreadIndex(),
            triage_graph=factory,
            triage_org=self.org,
        )

    def session(self) -> dict[str, str]:
        return {"usine_session": self.seats.open(self.owner.account.id)}


def bearer(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


def wait_for(client: TestClient, token: str, status: str) -> dict[str, Any]:
    for _ in range(100):
        reply = client.get(f"/api/runs/{TODAY}", headers=bearer(token))
        if reply.status_code == 200 and reply.json()["status"] == status:
            return dict(reply.json())
        time.sleep(0.02)
    raise AssertionError(f"run never reached {status}")


def test_triage_needs_the_triage_scope() -> None:
    world = World()
    with TestClient(world.app) as client:
        assert client.post("/api/triage", headers=bearer(world.read)).status_code == 401
        assert client.post("/api/triage").status_code == 401


def test_session_cannot_start_triage() -> None:
    world = World()
    with TestClient(world.app, cookies=world.session()) as client:
        assert client.post("/api/triage").status_code == 401


def test_triage_token_opens_nothing_else() -> None:
    world = World()
    with TestClient(world.app) as client:
        assert client.get("/api/runs", headers=bearer(world.triage)).status_code == 401
        assert client.post("/api/chat", headers=bearer(world.triage), json={}).status_code == 401


def test_triage_run_waits_at_a_checklist_gate_in_the_token_org() -> None:
    world = World()
    with TestClient(world.app) as client:
        started = client.post("/api/triage", headers=bearer(world.triage))
        assert started.status_code == 202 and started.json() == {"threadId": TODAY}
        run = wait_for(client, world.read, "waiting")
        assert run["gate"]["checklist"] is True and len(run["gate"]["actions"]) == 3
        stranger = world.tokens.issue("org-b", "lecture", "read").token
        assert client.get(f"/api/runs/{TODAY}", headers=bearer(stranger)).status_code == 404
        assert world.executor.done == []


def test_second_triage_same_day_conflicts() -> None:
    world = World()
    with TestClient(world.app) as client:
        assert client.post("/api/triage", headers=bearer(world.triage)).status_code == 202
        second = client.post("/api/triage", headers=bearer(world.triage))
        assert second.status_code == 409


def test_without_github_token_triage_is_unavailable() -> None:
    world = World()
    world.app = create_app(
        planner=CountingPlanner(),
        specialist=CountingSpecialist(),
        open_atelier=False,
        mcp_auth=world.tokens,
    )
    with TestClient(world.app) as client:
        assert client.post("/api/triage", headers=bearer(world.triage)).status_code == 503


def test_partial_approval_runs_the_checked_items_only(monkeypatch: pytest.MonkeyPatch) -> None:
    import usine_api.app as app_module

    recorded: list[tuple[str, list[Any], dict[str, Any]]] = []
    monkeypatch.setattr(
        app_module,
        "record_triage_decisions",
        lambda thread, actions, decision: recorded.append((thread, actions, decision)),
    )
    world = World()
    with TestClient(world.app, cookies=world.session()) as client:
        client.post("/api/triage", headers=bearer(world.triage))
        wait_for(client, world.read, "waiting")
        reply = client.post(
            f"/api/runs/{TODAY}/gate", json={"decision": "approve", "selected": [0, 2]}
        )
        assert reply.status_code == 200
        reply.read()
    assert [done["number"] for done in world.executor.done] == [1, 3]
    assert recorded[0][0] == TODAY and len(recorded[0][1]) == 3
    assert recorded[0][2]["selected"] == [0, 2]


def test_selected_out_of_range_is_refused() -> None:
    world = World()
    with TestClient(world.app, cookies=world.session()) as client:
        client.post("/api/triage", headers=bearer(world.triage))
        wait_for(client, world.read, "waiting")
        reply = client.post(
            f"/api/runs/{TODAY}/gate", json={"decision": "approve", "selected": [7]}
        )
        assert reply.status_code == 422
    assert world.executor.done == []


def test_selected_on_chat_gate_is_refused() -> None:
    from test_gate import ProposingSpecialist

    people, seats = InMemoryIdentityStore(), InMemorySessionStore()
    owner = people.ensure("owner@atelier.co")
    app = create_app(
        planner=CountingPlanner(),
        specialist=ProposingSpecialist(),
        open_atelier=False,
        secure_cookies=False,
        identities=people,
        sessions=seats,
        threads=InMemoryThreadIndex(),
    )
    with TestClient(app, cookies={"usine_session": seats.open(owner.account.id)}) as client:
        message = {"role": "user", "parts": [{"type": "text", "text": "brief"}]}
        client.post("/api/chat", json={"id": "chat-1", "messages": [message]}).read()
        reply = client.post("/api/runs/chat-1/gate", json={"decision": "approve", "selected": [0]})
        assert reply.status_code == 422


def test_a_triage_run_is_not_forked() -> None:
    world = World()
    with TestClient(world.app, cookies=world.session()) as client:
        client.post("/api/triage", headers=bearer(world.triage))
        wait_for(client, world.read, "waiting")
        reply = client.post(f"/api/runs/{TODAY}/fork", json={"checkpoint_id": "x"})
        assert reply.status_code == 409


def test_another_org_cannot_start_the_triage() -> None:
    world = World()
    stranger = world.tokens.issue("org-b", "timer", "triage").token
    with TestClient(world.app) as client:
        assert client.post("/api/triage", headers=bearer(stranger)).status_code == 403
        # The owner's timer still gets the day's run.
        assert client.post("/api/triage", headers=bearer(world.triage)).status_code == 202


def test_only_the_triage_org_mints_a_triage_token() -> None:
    world = World()
    other = world.people.ensure("autre@atelier.co")
    with TestClient(world.app, cookies={"usine_session": world.seats.open(other.account.id)}) as c:
        body = {"label": "timer", "scope": "triage"}
        assert c.post("/api/mcp/tokens", json=body).status_code == 403
    with TestClient(world.app, cookies=world.session()) as client:
        assert client.post("/api/mcp/tokens", json=body).status_code == 200


def test_without_a_triage_org_triage_is_unavailable() -> None:
    world = World()
    world.app = create_app(
        planner=CountingPlanner(),
        specialist=CountingSpecialist(),
        open_atelier=False,
        mcp_auth=world.tokens,
        triage_graph=lambda checkpointer: object(),
    )
    with TestClient(world.app) as client:
        assert client.post("/api/triage", headers=bearer(world.triage)).status_code == 503


def test_edit_on_a_checklist_gate_is_refused() -> None:
    world = World()
    with TestClient(world.app, cookies=world.session()) as client:
        client.post("/api/triage", headers=bearer(world.triage))
        run = wait_for(client, world.read, "waiting")
        reply = client.post(
            f"/api/runs/{TODAY}/gate",
            json={"decision": "edit", "actions": run["gate"]["actions"]},
        )
        assert reply.status_code == 422
    assert world.executor.done == []


def test_execution_survives_a_closed_stream() -> None:
    # Closing the tab must not cut a batch between a comment and its close.
    world = World()
    with TestClient(world.app, cookies=world.session()) as client:
        client.post("/api/triage", headers=bearer(world.triage))
        wait_for(client, world.read, "waiting")
        with client.stream("POST", f"/api/runs/{TODAY}/gate", json={"decision": "approve"}):
            pass
        for _ in range(100):
            if len(world.executor.done) == 3:
                break
            time.sleep(0.02)
    assert [done["number"] for done in world.executor.done] == [1, 2, 3]
