## 1. Composeur épuré

- [x] 1.1 Retirer les exemples (`EXAMPLES`) du composeur et l'import associé dans le shell ; `src/examples/index.ts` réduit à `CONTACT` (encore référencé). Le champ démarre vide ; l'accroche et le rappel d'honnêteté « sans modèle, rien ne sort » restent. Verify: browser test `starts with no jargon example chips` (aucun chip, champ vide) ; `type-check` vert.
- [x] 1.2 Ajouter l'unique entrée « Voir un run enregistré » (`playRecordedRun`) qui écrit `DEMO_BRIEF` et relance ; visible seulement en mode démo. Verify: browser test — l'entrée est présente en démo et le run repart (helpers `startRun` migrés dessus).

## 2. Scène : intro avant run

- [x] 2.1 Bloc d'intro statique des trois temps (besoin → fabrication en direct → fork/diff avant prod), rendu quand `!started`, retiré au démarrage ; aucun faux graphe ni squelette. Verify: browser tests `explains the workshop before any run` et `yields the intro to the graph once the run starts`.

## 3. Scène : état application vide honnête

- [x] 3.1 Dans `LiveApplication.vue`, quand `screen.markup` est vide, afficher l'état nommé « L'application n'a encore rien posé » et masquer le cadre (gardé monté pour le host). Verify: `live-application.browser.spec.ts` — markup vide ⇒ `.live-empty` + cadre `display:none` ; markup présent ⇒ cadre visible, pas de note.

## 4. Fork remonté

- [x] 4.1 Le geste `.fork-start` gagne l'accent + une phrase de pourquoi (`.fork-why`) ; le bandeau d'honnêteté intra-runtime reste dans `ForkView`. Verify: browser test `surfaces the fork with its why on a forkable run`.

## 5. Rééquilibrage + lift visuel

- [x] 5.1 Poids de police 300 → 400 (Oswald lisible), intro dimensionnée sur les jetons, hiérarchie typo de l'intro ; `prefers-reduced-motion` déjà global et conservé. Verify: suite navigateur verte (géométrie/scroll/honnêteté inchangés) ; contrôle visuel dans le preview.

## 6. Références visuelles

- [x] 6.1 Sans objet : les tests n'utilisent aucune assertion pixel (`toMatchScreenshot` absent) et les PNG de `__screenshots__` ne sont pas comparés — les tests DOM couvrent les régressions. Rien à régénérer ; `git status` sur `__screenshots__` reste propre.

## 7. Vérification complète

- [x] 7.1 `pnpm lint` ✓, `pnpm type-check` ✓, `pnpm test` (350) ✓, `pnpm test:browser` (78) ✓, `pnpm build` ✓, `openspec validate atelier-redesign --strict` ✓.
