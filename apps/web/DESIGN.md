# Usine design system

Usine is the first project on the shared Memo Labs base: the rules, scales and components come from `ui-craft` (`references/socle.md`, `taste.md`, `standard-2026.md`), and this file holds only Usine's brand layer and how it maps onto the base. Written 17 November 2026. The tokens live in `src/assets/main.css`.

## Brand layer: « Le fil »

Validated by Guillaume on 16 November 2026 (version F, MEM-86). It stays; the work is to make it visible, not to replace it.

- **Signature.** Every agent owns a coloured thread; the threads knot into one black gate, where a person decides. The knot is also the logo, and the threads knotting is the page's one expressive motion (`--dur-signature`, 560 ms).
- **Signals.** Four agent threads: sky, magenta, green, amber (`--color-sky`, `--color-mag`, `--color-grn`, `--color-amb`), each with an `-ink` tone at 4.5:1 or better and a `-soft` tint. A thread colour always means an agent, nothing else.
- **Ink.** Near-black `--color-ink` carries text, the primary action and the gate. The gate is the one high-contrast object on any screen.
- **Families.** Onest for the interface, Instrument Serif for the voice (agent names, the gate's verdict, the question), JetBrains Mono for data (file paths, ids, times). The serif is never an italic accent word in a headline.
- **Ground.** A light, near-neutral paper (`--color-paper`, oklch 96.1% 0.003 106). It is not warm on purpose (taste.md, 17 Nov 2026). Its material is the open decision below.
- **Light only.** F has no dark theme; Nuxt UI runs with `colorMode: false`.

## Mapping onto the base

`main.css` keeps F's names. One alias block maps them onto the contract so shared components can read the generic names:

| Contract | Usine |
|---|---|
| `--color-ground`, `-2`, `-3` | `--color-paper`, `--color-paper-3`, `--color-paper-4` |
| `--color-surface`, `--color-surface-raised` | `--color-surface`, `--color-paper-2` |
| `--color-ink`, `--color-ink-2`, `--color-muted`, `--color-on-ink` | same names |
| `--color-sig-<agent>` and `-ink`, `-soft` | `--color-sky`, `--color-mag`, `--color-grn`, `--color-amb` and their `-ink`, `-soft` |
| `--font-voice` | `--font-serif` |

Scales (type, space, radius, elevation, motion, layout) already match the base.

## Rules specific to Usine

- An agent is shown by its thread on a structural edge and its name in serif; its status is a word on the thread (« lit le dépôt », « terminé », « en attente de la porte »). No badge, no dot pill, no grey capsule.
- Every element on screen is paid for by a real event of a real run (PRODUCT.md). A thread grows one segment per event; a thread that receives nothing says what it waits for instead of simulating activity.
- One gate per run, in front of the one irreversible outside action (opening a GitHub issue), showing the exact payload.
- The public page shows one object: the recorded run, replayed, labelled as such. The atelier, signed in, may be dense (three columns: steps, graph, inspector).

## Open decision

**The ground's material.** Guillaume liked material grounds (image, texture, colour field) and is not convinced by warm colours. The specimen in `design/specimen.html` shows three candidates on the same panels; the choice goes here once made.

## To apply after the interview of 18 November 2026

The public site is frozen until then. In order:

1. Add the alias block above to `main.css`, and `--dur-signature: 560ms`.
2. Replace the grey capsule `.tag` in `VisitPage.vue` with a status word.
3. Apply the chosen ground.
4. Tint `--shadow-*` toward the ground's hue once the ground is chosen (they are tinted toward the ink's hue 264 today).
5. Run `scripts/ui-check.js` at 375, 768, 1024 and 1440, and `impeccable detect` on the running app.
