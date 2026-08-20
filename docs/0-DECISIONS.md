# L'usine agentique — Décisions figées (grounding PRD)

Source de vérité pour le PRD BMAD. Décidé avec Guillaume le 2026-08-20. Prime sur les autres docs de `docs/` en cas de conflit.

## Ce qu'on construit
**Un vrai produit**, pas une démo. Une **usine agentique** : l'utilisateur écrit un **prompt (un brief)** → le système **crée réellement des agents** qui se connectent, **tournent pour de vrai et parlent** (streament leurs messages), passent une **porte humaine**, et produisent un **vrai produit fonctionnel** en sortie.

Ce qu'on **jette** : le run scripté par timers (la version « démo/théâtrale » déjà portée dans `src/usine/run.ts`). On garde le **design system** et la coquille visuelle, on remplace le faux moteur par le vrai.

## Le cœur = le moteur Cordis (non négociable, on part de là)
- **Cordis** (`@cordisjs`) est le moteur validé ensemble : composition dynamique, **spawn/kill à chaud avec réversion auto** (prouvé : `ctx.plugin(fn)` → Fiber ; `fiber.dispose()` → revert), coeffects réactifs (`inject`/`provide`), HMR.
- Chaque **agent** et chaque **outil** = un **composant Cordis** (une fiber). Le graphe live se construit depuis la **vraie topologie de fibers/coeffects**, pas un script.
- L'agent maître spawn des composants ; décharger cascade proprement.
- **Ne pas rebuilder le runtime.** À câbler : le coeffect réactif (provide/inject) proprement + la couche agentique par-dessus.
- ~~Vérifier tôt : Cordis tourne-t-il dans le bundle navigateur (Vite) ?~~ **Vérifié le 2026-08-20 : oui.** Spike exécuté dans Chrome, 13/13. Aucun repli worker ni backend. Le moteur reste client-only.

## Niveau des agents (décidé)
**Cordis réel + LLM branchable.** Vrais composants Cordis qui exécutent vraiment le brief et streament leurs messages ; **client-only, zéro clé/token par défaut** (respecte la contrainte tokens/batterie de Guillaume). Un **interrupteur** branche un vrai LLM sur un agent **à la demande** — les agents « parlent » réellement quand on l'active.

## UI
- **100vh, app plein écran** — PAS la page éditoriale qui scrolle. Layout app : **prompt/chat à gauche, panneau vivant (graphe + agents qui parlent) à droite** (esprit Claude Desktop).
- **Design system Memo Labs** conservé : crème `#faf9f7`, encre `#16130f`, terracotta `#ad4c16`, Oswald, coins carrés, minimaliste. (Voir `3-CLAUDE-DESIGN-BRIEF.md` + `src/assets/usine.css` déjà porté.)
- Le **payoff reste réel** (type ClaimCheck : classifieur qui tourne vraiment).

## Stack
- **Vue 3 + TypeScript** (scaffoldé via `create-vue`), **Vite**, **pnpm partout**. ESLint/oxlint + Prettier. Strict TS.
- Déploiement : `usine.memolabs.dev` (Dockerfile node22 → nginx, pnpm) + entrée dans `lab-hub/public/projects.json`. Chaque app Memo Labs = son repo + sous-domaine.

## Contraintes dures
- Frugalité : pas de LLM par défaut, pas de tokens par visiteur.
- Le CDI reste l'objectif n°1 : ce produit sert aussi la vitrine « agentic engineer ».
- Human-in-the-loop + sortie déterministe + audit (doctrine sku-regulator) sur tout verdict.

## Skills de puissance installés (2026-08-20, chargés au prochain lancement)
- **superpowers** (obra) · **frontend-design** (officiel Anthropic) · **ui-ux-pro-max** (nextlevelbuilder)
- **BMAD** (bmm + bmb) installé dans ce projet pour le flow PRD → Architecture → Epics/Stories → Sprint → Build.

## Ce que le PRD a produit (2026-08-20)

Le PRD est finalisé : `_bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md`. Il est la source de vérité pour les exigences ; ce document reste la source de vérité pour les décisions de cadrage.

Décisions prises pendant sa rédaction, qui complètent celles ci-dessus :

- **Les agents fabriquent des composants à l'exécution**, par composition de primitives et sans évaluation de code. Ce n'est pas un catalogue fermé qu'on orchestre. La voie par `new Function` échoue sous CSP stricte et reste réservée au mode LLM branché.
- **Un nœud n'affiche une étiquette de technologie que si cette technologie tourne réellement derrière lui.** Les étiquettes FastAPI et Postgres du prototype sont abandonnées : en client-only, elles n'auraient rien derrière.
- **Le spectacle est un objectif assumé**, pas un dommage collatéral. Mais on impressionne par ce qui se passe, jamais par de la décoration.
- **Mesure d'audience** : comptage agrégé de quatre événements (lancement, porte humaine, payoff, première soumission), sans cookie, sans identifiant, sans tiers, sans jamais transmettre ce que l'utilisateur saisit.
- **Les artefacts produits par les agents sont consultables** — histoires, spécification, décision d'architecture. C'est l'antidote au « c'est creux ».
- **L'agent maître se constitue une mémoire de run**, consultable, à laquelle les agents en aval se réfèrent.
