# Réconciliation — src/usine/run.ts et src/assets/usine.css

Confronté à `prd.md` + `addendum.md`.

## Repris fidèlement
- L'abandon du run choréographié comme moteur : PRD §5, addendum.
- La conservation du design system (`usine.css`, 1318 lignes) : PRD §10.
- Le moteur de règles du vérificateur (`ClaimRules` : interdites, à vérifier, autorisées avec source et document) : PRD FR-035 à FR-039, addendum.
- Les trois scénarios existants (ClaimCheck, Pulse, Tandem) : addendum, et FR-049 à FR-051.
- Le comportement d'écartement à la porte : FR-032.

## Écarts

### E11 — Le second scénario est déjà là, la question Q3 est peut-être déjà répondue
`run.ts` contient trois scénarios écrits, chacun avec brief, nœuds, rail de narration et jeu de règles. Q3 (« quel est le second scénario ? ») pourrait se résoudre en lisant Pulse et Tandem plutôt qu'en inventant.

### E12 — Le rail de narration est un actif non reconnu
Chaque scénario porte un `rail` : une suite de couples agent-phrase, déjà écrits, déjà dans le ton. Le PRD exige des messages d'agents (FR-025 à FR-028) sans dire qu'un corpus existe. En mode déterministe, ce rail est précisément ce que les agents peuvent dire — à condition qu'il soit rattaché à un vrai événement du moteur et non à un timer.

### E13 — La géométrie des nœuds est en dur
Les positions `x` / `y` sont codées en dur par nœud. FR-022 exige une disposition automatique en couches. Le passage de l'un à l'autre est un vrai travail, non signalé comme tel dans le PRD ni dans l'addendum.
