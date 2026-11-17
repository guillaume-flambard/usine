# Usine design system

Usine is the first project on the shared Memo Labs base: the rules, scales and components come from `ui-craft` (`references/socle.md`, `taste.md`, `standard-2026.md`), and this file holds only Usine's brand layer and how it maps onto the base. Written 17 November 2026. The tokens live in `src/assets/main.css`.

## Brand layer: « Le fil »

Validated by Guillaume on 16 November 2026 (version F, MEM-86). It stays; the work is to make it visible, not to replace it.

- **Signature.** Every agent owns a coloured thread; the threads knot into one black gate, where a person decides. The knot is also the logo, and the threads knotting is the page's one expressive motion (`--dur-signature`, 560 ms).
- **Signals.** Four agent threads: sky, magenta, green, amber (`--color-sky`, `--color-mag`, `--color-grn`, `--color-amb`), each with an `-ink` tone at 4.5:1 or better and a `-soft` tint. A thread colour always means an agent, nothing else.
- **Ink.** Near-black `--color-ink` carries text, the primary action and the gate. The gate is the one high-contrast object on any screen.
- **Families.** Onest for the interface, Instrument Serif for the voice (agent names, the gate's verdict, the question), JetBrains Mono for data (file paths, ids, times). The serif is never an italic accent word in a headline.
- **Ground.** A cool colour field: a pale blue-grey base crossed by wide translucent bands in the four thread colours, so the brand becomes the ground. Chosen by Guillaume on 17 November 2026 (candidate B of `design/specimen.html`), over flat paper (A) and grained stone (C). Not warm on purpose (taste.md, 17 Nov 2026). Panels, lanes and the gate sit on it unchanged.
- **Light only.** F has no dark theme; Nuxt UI runs with `colorMode: false`.

## Mapping onto the base

`main.css` keeps F's names. One alias block maps them onto the contract so shared components can read the generic names:

| Contract | Usine |
|---|---|
| `--color-ground` | the colour field (below); `--color-paper` stays for inset areas |
| `--color-ground-2`, `-3` | `--color-paper-3`, `--color-paper-4` |
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

## The ground, exactly

As built in `design/specimen.html` (`.ground--field`):

- Base: `--color-ground: oklch(95.4% 0.012 240)`.
- Bands: a `::before` layer behind the content (`z-index: -1`, `inset: -20%`), four `linear-gradient(104deg, …)` bands: sky at 0.30 alpha (6 to 34 %), magenta at 0.18 (28 to 55 %), green at 0.22 (50 to 76 %), amber at 0.24 (69 to 95 %).
- Shadows tinted toward hue 240 (`--shadow-hue: 240`).
- Text that sits directly on the bands is `--color-ink` or `--color-ink-2`; measured at 4.5:1 or better at 375, 768, 1024 and 1440 px. Thread colours never carry text on the bands, only on white panels (`-ink` tones).
- The bands are still: no animation, so nothing to pause or reduce.

## To apply after the interview of 18 November 2026

The public site is frozen until then. In order:

1. Add the alias block above to `main.css`, and `--dur-signature: 560ms`.
2. Replace the grey capsule `.tag` in `VisitPage.vue` with a status word.
3. Apply the colour-field ground above to the public page and the atelier shell; panels keep their white surface.
4. Tint `--shadow-*` toward hue 240 (they are tinted toward the ink's hue 264 today).
5. Run `scripts/ui-check.js` at 375, 768, 1024 and 1440, and `impeccable detect` on the running app.
