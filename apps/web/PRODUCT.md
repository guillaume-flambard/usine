# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary, for evaluation: engineering leads, CTOs and technical recruiters deciding whether to trust Guillaume Flambard, a freelance developer, with an agentic AI and Vue.js mission. They have a few minutes, often during an interview, and want to see how he builds agents that hold up in production.

Secondary: Guillaume himself, who uses the atelier to build and test the agents of his lab (Memo Labs).

## Product Purpose

Usine is Guillaume's agent workshop, shown openly. It is not sold as a product. It shows, on real runs, how he builds a multi-agent system that can be trusted in production:

- a coordinator splits a request and hands each part to a specialist agent;
- agents use real tools through MCP (GitHub today), inside a versioned whitelist;
- any action that leaves the system stops at a human gate showing the exact arguments;
- every run is checkpointed, so it can be replayed exactly, forked from any step with another agent, and compared;
- every model call is traced (Langfuse) and goes through a gateway (LiteLLM);
- a Vue 3 front shows all of it live.

Success: in a few minutes, the visitor understands what the system does, sees it work on a real case, and believes Guillaume can build the same for them.

## Positioning

Honest craft rather than a pitch: real runs, real code (public repository), real defects found and fixed. The atelier proves engineering judgment (orchestration, tool safety, human control, replayability, observability) and front-end quality at the same time.

## Operating Context

- Shown live during interviews and calls, often screen-shared from a laptop.
- Public pages can be read without an account; launching a run requires a Pocket ID account (the lab's own identity provider).
- One real, documented case, recorded on 17 November 2026 in the production atelier (thread `WkkmutTlh5Aaqgfd`, replayed by the visit from `public/visite/run.json`): « can a new contributor start on guillaume-flambard/usine? ». Three agents read the README, the CI and the repository; the third found no `CONTRIBUTING.md` and proposed one ticket, which stopped at the gate. The guide was then written by hand.
- Shared with recruiters and their clients as a sample of Guillaume's work in the agentic and Vue world (first sent to Jump Staffing on 17 November 2026).

## Capabilities and Constraints

- Tools: GitHub only (read files and issues; `issue_write` is gated). No logs, metrics or alerting integrations.
- One executor: GitHub issues. Other actions are refused, never simulated.
- Rollback restores the run's state, never the outside world.
- Cost and evaluation scores per run are not built yet (M6): never invent them.
- The word "demo" is banned everywhere, on screen, in code and in copy. Say atelier, application, run, case.
- Code is in English; interface copy is in French.

## Evidence on Hand

- The public repository: github.com/guillaume-flambard/usine.
- The real case above, replayable from its archived event stream.
- No customers, testimonials, benchmarks or pricing exist. Do not fabricate any.

## Product Principles

1. Show the work: every element on screen is paid for by a real event of a real run.
2. The person decides: nothing that leaves the system goes without explicit approval.
3. Say only what is true.
4. Understandable in seconds by an engineering lead who has never seen it.

## Accessibility & Inclusion

WCAG 2.2 AA. Every status in words as well as colour. Keyboard-complete gate decisions.
