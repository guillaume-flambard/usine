# Usine: research checklist for the public pages

The research of 16 November 2026, turned into rules that can be checked. Every change to `/` (LandingPage.vue) or `/visite` (VisitPage.vue) is checked against this list before it is shown, and the report gives the table: applied, not applicable (with its reason), or missing.

Sources, in the side-session notes of 16 November (`~/Library/Application Support/Claude/side-session-notes/local_63a523d4-865b-40d5-97b4-94146b42d5a1/`):
- **UX**: `research_notes/Produit agentique impeccable en 2026/ux_ui_agentique.md` (section 6, prioritised checklist)
- **LP**: `research_notes/.../landing_pages_reference.md` (pattern library for Usine)
- **MO**: `research_notes/.../motion_profondeur_etats.md` (section 10, spec)
- **RL**: `releve/RELEVE.md` (the measured defects of the live pages, 16 November, 19 h)
- **TA**: ui-craft `references/taste.md` (the owner's own rules)

State as of 17 November 2026, 11 h 40, after the third pass (AgentLane, the visit on threads).

## Public page (`/`)

| ID | Rule | Source | How to check | State |
|---|---|---|---|---|
| L1 | Headline of 5 to 8 words, left-aligned, one-sentence sub | LP | count the words | applied (8) |
| L2 | The product at work fills at least half of the first screen, not a description of it | LP, UX 1, TA | screenshot at 1440 × 900 | applied |
| L3 | The run is labelled as recorded and replayed or summed up from its log | UX 9, LP | read the caption | applied |
| L4 | One primary action and one quiet secondary | UX avoid 7 | look at the hero | applied |
| L5 | Parallel agents side by side: colour, name, status in words, elapsed time | UX 4 | look; tool-call count only if the log has it | applied (count not in the log) |
| L6 | Agent motion follows the real event times: the three agents start together, finish in the logged order | UX should 5, MO 7 | compare with `public/visite/run.json` | applied (start together, finish in the logged order 3, 1, 2) |
| L7 | The gate shows the exact payload, says « irréversible à partir d'ici », names approve, correct, reject | UX 7 | read the gate | applied |
| L8 | Proof as links: the file the agents read, the run id, the code | UX 8 | click each link | applied (README on GitHub, run.json, the code) |
| L9 | A « vérifié / supposé / non fait » line under the outcome | UX 8 | read it | applied |
| L10 | The limit is named: going back restores the run, not the outside world | UX should 7 | read it | applied (in the gate) |
| L11 | Phone: one column, the threads still knot into a full-width gate, buttons stacked at full width | LP mobile, UX 11, RL 14 | 375 px screenshot | applied |
| L12 | Text lines of 75 characters at most | RL, UX 5 | ui-check line measure | applied (0 line over 80 characters at 4 widths) |
| L13 | None of: badge or kicker above the H1, three icon cards, numbered 1-2-3 steps, logo wall, stat banner, serif-italic accent, coloured left border, dot pills | UX avoid, TA | impeccable detect, look | applied |

## The recorded run itself (both pages)

Added at 11 h 40: the story findings of the 16 November survey were left out of the first version of this list.

| ID | Rule | Source | How to check | State |
|---|---|---|---|---|
| R1 | The agents have distinct reasons to work in parallel: they read different files and the run ends in one proposal, not three duplicates (a tech lead reads three agents re-reading one file as naive orchestration) | RL 1, RL A | read `public/visite/run.json` | missing |
| R2 | The proposal carries nothing internal: no `ssh lab`, no `MEM-n`, no internal SHA, no English, no copied figures | RL 2 | read the ticket body | missing |
| R3 | The subject does not read « the candidate's site is broken » to a recruiter | RL 3, RL A | read the question | missing |
| R4 | The run never says « issue » where the page says « ticket » | RL 5 | read the visit | missing |

## The visit (`/visite`)

| ID | Rule | Source | How to check | State |
|---|---|---|---|---|
| V1 | 5 to 13 steps, captions of 25 to 30 words at most | UX 3 | count | applied (4 steps) |
| V2 | Pause and play always visible (WCAG 2.2.2), never on hover only; reduced motion starts paused | UX 3, UX 10, MO | look; emulate reduced motion | applied (sticky bar, Pause and Reprendre tested; reduced motion shows every step at once, not seen in a browser) |
| V3 | Honest progress: each agent's thread grows one segment per real event, with the step in words and the elapsed time; no bare « travaille… » | MO 5, UX anti-patterns, RL 17 | watch the replay | applied (AgentLane live: start, then the tools at finish, in the logged order 3, 1, 2; status Â« en cours Â» then Â« terminÃ© en N s Â») |
| V4 | The convergence into the gate is shown, as the one expressive moment | RL 18, MO 7 | watch | applied (the threads knot when the gate opens, 560 ms, drawn once) |
| V5 | Conclusion first, then how it was reached | UX 4, RL 4 | read the top | applied (Â« La rÃ©ponse, en bref Â») |
| V6 | Two layers of text: a plain caption, a technical detail you can open | UX 4 | look | partly (« Pour les curieux ») |
| V7 | Its title differs from the public page's | RL 6 | compare | applied (the public page has its own headline) |
| V8 | The visitor's approve click is simulated and says so | UX 7 | click | applied |

## Motion, depth, states (both pages)

| ID | Rule | Source | How to check | State |
|---|---|---|---|---|
| M1 | UI moves in 100 to 300 ms with a strong ease-out; press at 0.97; nothing grows from 0; hover only under `(hover: hover) and (pointer: fine)`; no `transition: all` | MO 1 | read the CSS | applied |
| M2 | One expressive moment per page, about 560 ms: the threads knotting into the gate | MO 10 | watch | applied on both pages |
| M3 | Reduced motion reduces, it does not remove: fades and colour stay | MO 8 | emulate reduced motion | applied |
| M4 | Only transform, opacity, clip-path and a few stroke-dashoffsets move | MO 9 | read the CSS | applied |
| D1 | Layered shadows tinted toward the ground; a higher shadow fades in on a layer, never an animated box-shadow | MO 4 | read the CSS | applied |
| D2 | Every button's edge reads on its ground (non-text contrast, WCAG 1.4.11) | MO 1 (Vercel), owner 17 Nov | ui-check button measure | applied (0 faint button on / ; on /visite, the ticket choices fixed; Nuxt UI copy button draws its edge with a ring the sweep cannot read) |
| S1 | Loading: nothing under 150 to 300 ms, then a placeholder matching the layout | MO 5 | throttle the network | not checked |
| S2 | Errors say the cause, what it means, what to do, next to their source | MO 6 | force the error | applied (unreachable service) |
| A1 | AA text contrast, visible focus ring, 44 px targets, 16 px inputs | ui-craft | ui-check at 375, 768, 1024, 1440 | applied |
