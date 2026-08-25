---
title: 'Surfacer les mesures d''éval comme signal visible dans la page'
type: 'feature'
created: '2026-08-24'
status: 'done'
baseline_revision: '90f388110cf50b0cd0b626b6bc03ae6132cc0977'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/DESIGN.md'
  - 'docs/6-FAISABILITE.md'
warnings: []
deferred:
  - summary: >-
      Le signal d'éval est dans le repli d'état, fermé par défaut, alors que
      l'intent le veut « au premier plan ».
    evidence: |-
      Tension interne de l'intent : le Problème dit « premier plan » (docs/6/7),
      l'Approche impose le repli existant (règle des quatre zones). Choix
      défendable retenu (repli), mais la prominence reste un compromis à revoir.
    location: >-
      src/ui/FactoryApp.vue (status-detail, v-if=modeHelp)
    severity: low
  - summary: >-
      Afficher la mesure du run courant (/evaluation/{run_id}) serait plus
      honnête en contexte que l'agrégat inter-runs.
    evidence: |-
      L'agrégat n'est pas payé par le flux du run affiché ; la route par run
      existe déjà côté service (app.py:345) et porte firstScreenRank, etc.
    location: >-
      services/api/usine_api/app.py:345
    severity: low
  - summary: >-
      Dédupliquer le patron « GET JSON, relecture hostile, silence sur échec »
      partagé par archive-client, sources et eval-client.
    evidence: |-
      Trois copies du même try/timeout/!ok/catch → dérive possible ; les
      commentaires du code s'en inquiètent déjà.
    severity: low
  - summary: >-
      Champs validés mais non affichés : meanAgents, totalRollbacks,
      totalMalformed (totalRollbacks est un signal fort du produit).
    evidence: |-
      readEvaluation les valide, formatEvaluation ne les montre pas.
    severity: low
---

<intent-contract>

## Intent

**Problem:** Le harnais d'éval existe côté service (`services/api/usine_api/evaluation.py`, route `GET /evaluation`) mais **n'est visible nulle part dans la page**. Or `docs/6-FAISABILITE.md` le nomme le **signal recruteur n°1** (« la preuve qu'on a vraiment construit avec des LLM »), et la cible atelier (`docs/7`) veut ces mesures au premier plan comme base du « quelle branche est meilleure ». C'est la première tranche code du tournant, sûre et bien spécifiée.

**Approach:** Ajouter un petit client HTTP côté front (calqué sur `src/app/archive-client.ts`) qui lit `GET /api/evaluation`, valide la réponse comme donnée hostile, et rend `undefined` en cas d'échec. Afficher le rapport agrégé **dans le repli d'état existant** de `FactoryApp.vue` (la zone marque + ligne d'état, dépliée par `modeHelp`) — pas une nouvelle zone — et seulement quand des runs conservés existent.

## Boundaries & Constraints

**Always:**
- La forme JSON rendue suit `Report.as_json()` (`evaluation.py`) : `runs, servedRatio, replacedRatio, medianFirstScreenRank, meanTokens, meanAgents, totalRollbacks, totalMalformed`.
- Donnée hostile : tout champ manquant ou de mauvais type → `undefined`, jamais de rendu partiel deviné (comme `readArchive`).
- Règle d'honnêteté (DESIGN.md) : chaque élément affiché est **payé par une mesure réelle**. Si le service est absent ou `runs === 0`, **ne rien afficher** (pas de squelette, pas de zéros décoratifs).
- Rester dans les **quatre zones** : les mesures vivent dans le repli d'état (`status-detail`), pas dans un bloc de plus.
- Code en anglais (identifiants, fichiers, tests) ; libellés d'interface en français.

**Block If:**
- Le contrat JSON de `Report.as_json()` diffère de la liste ci-dessus au moment d'implémenter (schéma inconnu) → HALT `blocked`, condition `eval report shape mismatch`.

**Never:**
- Ne pas ajouter de nouvel endpoint ni modifier `evaluation.py` / `app.py` (le service est déjà là).
- Ne pas appeler un modèle ni dépendre d'une clé (l'éval est gratuite par construction).
- Ne pas afficher de comparaison de branches (tranche fork ultérieure) ni de graphiques lourds.
- Ne pas mettre l'e-mail ou une donnée perso dans une URL/entête.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rapport valide | `200` + JSON conforme, `runs>0` | Objet `Evaluation` typé rendu | — |
| Aucun run | `200` + `runs: 0` | `Evaluation` avec `runs: 0` ; l'UI n'affiche rien | — |
| Champ manquant/typé faux | `200` + `{servedRatio:"x"}` | `undefined` | Pas de rendu |
| Service absent / 5xx / timeout | fetch rejette ou `!ok` | `undefined` | Silencieux (try/catch), pas d'incident page |

</intent-contract>

## Code Map

- `services/api/usine_api/evaluation.py:41-64` -- `Report.as_json()` : **source de vérité** de la forme JSON à valider.
- `services/api/usine_api/app.py:339-343` -- `GET /evaluation` : route agrégée, `no_store`, lit `store.all()`.
- `src/app/archive-client.ts` -- **patron à copier** : `fetch` injecté, `AbortSignal.timeout`, `!ok`/catch → `undefined`, relecture hostile via `readArchive`.
- `src/app/replay.ts:40` -- `readArchive` : exemple de validation de donnée hostile à imiter pour le rapport.
- `src/ui/FactoryApp.vue:437-458` -- repli `status-detail` (`v-if="modeHelp"`) : point d'insertion du bloc de mesures ; déjà la bonne zone.
- `src/ui/FactoryApp.vue:322-341` -- `onMounted` : où déclencher le `fetchEvaluation` (une fois, au montage).
- `vite.config.ts:28-32` -- proxy `/api` → `127.0.0.1:3111` (dev).
- `_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/DESIGN.md:299-301` -- règle d'honnêteté (rien sans événement/mesure réelle).

## Tasks & Acceptance

**Execution:**
- `src/app/eval-client.ts` -- créer `interface Evaluation` (les 8 champs) + `fetchEvaluation(endpoint = '/api/evaluation', call = globalThis.fetch): Promise<Evaluation | undefined>` ; valider chaque champ (nombres ; `medianFirstScreenRank` = `number | null`) ; `undefined` sur `!ok`/exception/forme invalide -- réutilise le patron d'`archive-client.ts`.
- `src/app/eval-client.spec.ts` -- test node : rapport conforme parsé ; `runs:0` accepté ; champ manquant/typé faux → `undefined` ; `call` qui rejette ou `!ok` → `undefined` (fetch injecté, pas de réseau).
- `src/ui/FactoryApp.vue` -- appeler `fetchEvaluation` au montage, stocker le résultat dans un `ref<Evaluation | undefined>` ; dans `status-detail`, rendre un bloc **seulement si** défini et `runs > 0` : une ligne compacte, libellés FR (ex. « Mesures — sur les runs conservés : {runs} runs · {servedRatio%} servent une app · {replacedRatio%} avec remplacement à chaud · rang médian du 1er écran {medianFirstScreenRank ?? '—'} · {meanTokens} tokens moyens »). Pourcentages arrondis à l'entier.

**Acceptance Criteria:**
- Given le service répond un rapport avec `runs>0`, when le visiteur déplie l'état (`détail`), then le bloc de mesures s'affiche avec les valeurs du rapport, libellé « sur les runs conservés ».
- Given le service est absent (aucune API en local), when la page monte et l'état est déplié, then **aucun** bloc de mesures n'apparaît et la page fonctionne normalement (pas d'incident, pas de zéros).
- Given `runs === 0`, when l'état est déplié, then aucun bloc de mesures n'apparaît (honnêteté : rien à montrer).

## Design Notes

Le client est volontairement identique en esprit à `archive-client.ts` : `fetch` injectable pour le test, `AbortSignal.timeout(15_000)`, silence sur échec. La validation suit `readArchive` : on n'affiche que ce qu'on a vérifié. Le rendu tient en une ou deux lignes de texte dans le repli déjà présent — aucune nouvelle zone, aucun graphique. C'est le « signal n°1 » rendu visible, pas un tableau de bord.

## Verification

**Commands:**
- `pnpm test` -- expected: la suite node passe, `eval-client.spec.ts` compris.
- `pnpm type-check` -- expected: vert.
- `pnpm lint` -- expected: vert.

**Manual checks:**
- Lancer le service (`cd services/api && … uvicorn …`) + `pnpm dev`, faire un run, recharger, déplier « détail » : le bloc de mesures apparaît. Couper le service, recharger : le bloc disparaît, rien d'autre ne casse.

## Review Triage Log

### 2026-08-24 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 3, low 3)
- defer: 4: (high 0, medium 0, low 4)
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` Aucun test sur la logique d'affichage (garde `runs===0`, %, repli `—`, arrondi) — extrait `formatEvaluation()` pur et testé.
  - `[medium]` `[patch]` La ligne d'éval (agrégat inter-runs) s'affichait aussi sur un rejeu de lien partagé — fetch désormais sauté quand `requestedRun()` est défini.
  - `[medium]` `[patch]` Descriptions de tests en français (viole CLAUDE.md) — réécrites en anglais.
  - `[low]` `[patch]` Validation hostile sans contrôle de domaine — refus des parts hors [0,1] et des comptes négatifs.
  - `[low]` `[patch]` Timeout de 15 s pour une ligne décorative — aligné à 6 s.
  - `[low]` `[patch]` Tests renforcés — champ manquant paramétré sur tous les champs, endpoint par défaut exercé.

## Auto Run Result

Status: done

**Changement livré.** Le signal recruteur n°1 (harnais d'éval) devient visible dans la page : un client `fetchEvaluation` lit `GET /api/evaluation`, relit le rapport comme donnée hostile, et une ligne de mesures s'affiche dans le repli d'état — seulement sur des runs réellement conservés, jamais sur un rejeu de lien partagé.

**Fichiers.**
- `src/app/eval-client.ts` (nouveau) — `Evaluation`, `fetchEvaluation` (timeout 6 s, silence sur échec), `readEvaluation` (validation hostile + domaine), `formatEvaluation` (ligne pure et testable).
- `src/app/__tests__/eval-client.spec.ts` (nouveau) — 11 tests : lecture/validation/domaine/échec + formatage.
- `src/ui/FactoryApp.vue` — fetch au montage hors rejeu, `measurements` = `formatEvaluation(...)`, rendu dans `status-detail`.
- `src/assets/app.css` — `.status-eval` (tabular-nums).

**Revue.** 6 patchs appliqués (3 medium, 3 low), 4 reports différés (frontmatter `deferred`), 3 rejets. Aucun intent_gap, aucun bad_spec.

**Follow-up review recommandé : true** — patchs de cette passe : 0 high, 3 medium, 3 low ; score `3×3 + 1×3 = 12 ≥ 5`.

**Vérification.** `pnpm test` 262/262, `pnpm type-check` vert, `pnpm lint` vert. Vérif manuelle navigateur (service uvicorn + `pnpm dev`) non exécutée en session non interactive.

**Risques résiduels.** Placement dans le repli fermé par défaut (prominence, différé) ; l'agrégat inter-runs n'est pas payé par le flux du run affiché (différé : préférer la mesure du run courant).
