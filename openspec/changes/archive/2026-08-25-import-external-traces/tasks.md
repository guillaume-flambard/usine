## 1. Archive origin marker

- [x] 1.1 Add optional `origin?: 'foreign'` to `RunArchive` in `src/app/replay.ts` (absent = internal); update `archiveOf` to keep default internal, and make `readArchive` preserve `origin` when present. Verify: existing archive-client / replay tests stay green, plus a new unit test asserting a v1 archive without `origin` still reads and is treated as internal.

## 2. Import entry point + format detection

- [x] 2.1 Create `src/app/import/index.ts` exposing `importTrace(input): RunArchive | ImportError` that detects the source format and delegates to the matching adapter. Verify: unit test — unknown format returns a clear `ImportError`, no archive.
- [x] 2.2 Add shared time-normalization + ordering helper (absolute stamps → `at` elapsed from first event, `sequence` reassigned ascending). Verify: unit test — first event `at===0`, no negative `at`, out-of-order source is ordered.

## 3. LangGraph adapter

- [x] 3.1 Write failing tests for the LangGraph adapter from a fixed sample export (mapping steps to existing `RunEvent` types, ordering, foreign marker, refusal on missing required fields).
- [x] 3.2 Implement `src/app/import/langgraph.ts` to pass those tests, producing a version-1 `RunArchive` marked `origin:'foreign'`. Verify: the adapter tests pass and the produced archive replays end-to-end via the existing replay path.

## 4. OTLP adapter

- [x] 4.1 Write failing tests for the OTLP-spans adapter from a fixed sample (span→event mapping, ordering, refusal on a recognized-but-broken trace).
- [x] 4.2 Implement `src/app/import/otlp.ts` to pass those tests, producing a version-1 foreign `RunArchive`. Verify: adapter tests pass and the archive replays end-to-end.

## 5. UI: hide fork for foreign runs

- [x] 5.1 In the scene/`LiveApplication` wiring, gate the "Forker ce run" affordance on `archive.origin !== 'foreign'`. Verify: browser test — a foreign archive renders no fork affordance; an internal recorded run still shows it (regression guard).
- [x] 5.2 Add a minimal import path in the composer (load a trace file → `importTrace` → replay). Verify: browser test — importing a sample foreign trace replays it and shows its `RunMeasure` metrics, with fork absent.

## 6. Full-suite verification

- [x] 6.1 Run `pnpm lint && pnpm type-check && pnpm test && pnpm test:browser && pnpm build`. Verify: all green; no `src/runtime` boundary violation (cordis stays confined); `openspec validate import-external-traces --strict` passes.
