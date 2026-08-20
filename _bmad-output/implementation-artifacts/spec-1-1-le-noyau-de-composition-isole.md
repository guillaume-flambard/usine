---
title: 'Story 1.1 — Le noyau de composition isolé'
type: 'feature'
created: '2026-08-20'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: '27509387c6f55bee8066ed3afb516625e2948202'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le projet n'a pas de couche entre Cordis et le reste de l'application. Sans elle, les appels au moteur se disperseront dans les composants Vue, l'interface finira par lire directement l'état des fibers, et l'invariant central du produit — ce qui est affiché correspond à ce qui vit — deviendra invérifiable.

**Approach:** Créer `src/runtime/`, seul module autorisé à importer `cordis`, exposant un contrat de composant, une union d'événements séquencés, un chargement/libération et une introspection de topologie. Aucun type de Cordis ne franchit sa frontière publique. La règle d'isolement est appliquée par ESLint, pas par la discipline.

## Boundaries & Constraints

**Always:**
- `cordis` n'est importé que sous `src/runtime/`. Une règle `no-restricted-imports` fait échouer le lint partout ailleurs.
- Aucun type exporté par `cordis` (`Context`, `Fiber`, `FiberState`, `Service`, `Inject`) n'apparaît dans une signature publique de `src/runtime/`.
- Chaque événement porte un numéro de séquence entier strictement croissant, attribué par le noyau. Jamais par l'appelant.
- L'identifiant d'un composant est produit par le noyau et typé nominalement. Aucun autre module ne peut en fabriquer un.
- Un échec d'activation devient un événement d'erreur ; il ne remonte jamais en exception hors du noyau.
- TypeScript strict, aucun `any`, aucune assertion `as` sur la frontière publique.
- Code, identifiants et commentaires en français, sauf les noms d'API Cordis (`inject`, `provide`, `effect`, `plugin`, `dispose`) qui restent tels quels.

**Ask First:**
- Toute modification de `src/usine/run.ts`, `src/App.vue` ou `src/assets/usine.css`.
- Tout ajout de dépendance autre que Vitest.

**Never:**
- Pas d'interface, pas de Vue, pas de DOM dans `src/runtime/`. Le noyau doit être testable sans navigateur.
- Pas de store, pas de réducteur, pas de disposition, pas de fabrication à l'exécution — ce sont les stories 1.2, 1.4 et 2.1.
- Pas de `console.log`.
- Pas de `new Function`, pas d'`eval`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chargement simple | un composant sans dépendance | il s'active, un événement `composant-cree` puis `composant-active` sont émis avec des séquences croissantes | N/A |
| Dépendance absente | un composant qui déclare une dépendance non fournie | il reste inactif ; l'introspection le donne en attente | N/A |
| Dépendance fournie | le fournisseur se charge ensuite | le dépendant s'active seul, événement émis | N/A |
| Dépendance retirée | le fournisseur est libéré | le dépendant se désactive seul, sans état résiduel | N/A |
| Cascade | un composant en a chargé un autre, on libère le parent | l'enfant est libéré aussi, effets annulés en ordre inverse | N/A |
| Nom de dépendance déjà pris | un second fournisseur pour le même nom | le chargement échoue | événement `composant-en-erreur` avec code `nom-deja-fourni` ; le run continue |
| Échec d'activation | `apply` lève | le composant est marqué en erreur | événement `composant-en-erreur` ; aucune exception hors du noyau |
| Introspection | un run à un instant donné | liste des composants vivants avec état et arêtes de dépendance | N/A |

</frozen-after-approval>

## Code Map

- `node_modules/cordis/lib/*.d.ts` -- API réelle de `cordis@4.0.0-rc.8` : `Context`, `ctx.plugin`, `ctx.effect`, `ctx.provide`, `ctx.registry`, `Fiber`, `FiberState`. **Lecture seule.**
- `spike/cordis-browser/experiment.ts` -- usages **prouvés** de cette API (chargement, `dispose`, `provide`/`inject`, cascade, introspection via `registry.size`/`registry.counter`) et pièges de typage déjà rencontrés : `FiberState` est un `const enum` donc pas de lookup inverse, et `ctx.effect` veut son second argument `label`. **Repartir de là plutôt que de redécouvrir.**
- `src/usine/run.ts` -- moteur choréographié hérité. **Ne pas toucher, ne pas importer.** Il reste en place jusqu'à la story 1.4.
- `src/App.vue` -- monte `initUsine()`. **Inchangé dans cette story.**
- `eslint.config.ts` -- `defineConfigWithVueTs`, bloc `app/files-to-lint`. C'est là qu'atterrit la règle d'isolement.
- `tsconfig.app.json` -- `noUncheckedIndexedAccess: false` (concession faite au moteur hérité). Le noyau doit rester correct même sans ce garde-fou.
- `package.json` -- `cordis` est déjà en dépendance ; Vitest est à ajouter en dépendance de développement.

## Tasks & Acceptance

**Execution:**
- [x] `src/runtime/contrat.ts` -- définir `IdComposant` (type nominal), `Composant` (`nom`, `injecte`, `fournit`, `presentation`, `applique`), `Presentation` (`role`, `technologie` optionnelle) et `ErreurComposant` (`code`, `message`, `composant`) -- c'est la frontière publique, aucun type Cordis n'y figure
- [x] `src/runtime/evenements.ts` -- définir l'union discriminée `EvenementRun` sur `type`, chaque variante portant `sequence`, plus les variantes `composant-cree`, `composant-active`, `composant-desactive`, `composant-libere`, `composant-en-erreur`, `message-emis`, `travail-termine` -- ajouter une information visible passera par ici
- [x] `src/runtime/noyau.ts` -- créer le contexte, `charger`, `liberer`, `introspecter`, l'abonnement au flux et le compteur de séquence ; convertir tout échec en événement d'erreur -- seul fichier qui importe `cordis`
- [x] `eslint.config.ts` -- ajouter `no-restricted-imports` sur `cordis` avec une exception pour `src/runtime/**` -- la règle est le mécanisme, pas la convention
- [x] `package.json` -- ajouter Vitest et le script `test` -- sans quoi rien n'est vérifiable
- [x] `src/runtime/__tests__/noyau.spec.ts` -- couvrir les huit scénarios de la matrice -- c'est la preuve de la story
- [x] `vitest.config.ts` -- environnement node, ciblage `src/**/__tests__/**/*.spec.ts` -- le noyau se teste sans navigateur
- [x] `.oxlintrc.json`, `.gitignore` -- exclure les sorties de build du spike du lint et du dépôt -- elles faisaient échouer `pnpm lint`

**Acceptance Criteria:**
- Étant donné un fichier hors de `src/runtime/`, quand il importe `cordis`, alors `pnpm lint` échoue.
- Étant donné l'API publique de `src/runtime/`, quand on la type-vérifie, alors aucune signature n'expose un type de `cordis`.
- Étant donné un run complet, quand on lit les événements dans l'ordre d'émission, alors leurs séquences sont strictement croissantes et sans trou.
- Étant donné n'importe quel instant d'un run, quand on appelle `introspecter`, alors l'ensemble rendu correspond exactement aux composants vivants du contexte.
- Étant donné `pnpm test`, quand la suite s'exécute, alors les huit scénarios de la matrice passent.

### Revue 2 — trois relecteurs indépendants en contexte vierge

- **Un abonné qui levait était compté comme un échec du composant.** `emettre` appelait les abonnés en synchrone à l'intérieur du `try` entourant `applique` : un seul écouteur d'interface fautif faisait basculer le composant en erreur et privait les abonnés suivants de l'événement. Amendé : diffusion isolée par abonné, l'incident devient un événement `abonne-en-erreur`. État évité : l'interface corrompant l'état du moteur.
- **`en-erreur` était écrasé par `en-attente`.** La sentinelle ne se gardait que du cas `libere`, si bien qu'un composant en échec qui perdait ensuite une dépendance émettait une désactivation sans avoir jamais été actif. Amendé : ni une libération ni un échec ne se requalifient.
- **Une erreur `dependance-inconnue` n'empêchait pas l'activation.** Publier ou lire un nom non déclaré émettait l'erreur puis laissait le composant être annoncé actif — l'invariant « jamais actif après un échec » ne tenait que pour les exceptions. Amendé : toute erreur marque l'activation ratée.
- **Un composant en échec gardait ses noms réservés.** Aucun remplaçant ne pouvait plus prendre sa place. Amendé : les noms sont relâchés dès que l'activation rate.
- **Un chargement encore en vol échappait à `libererTout`.** `liberer` était initialisé à une fonction vide jusqu'à la résolution de `plugin()`. Amendé : la demande est mémorisée et honorée à la résolution ; `libererTout` repasse tant que la population bouge.
- **Un rejet de `plugin()` laissait une entrée fantôme et des noms réservés à vie.** Amendé : capture, nettoyage, événement `echec-chargement`.
- **La façade restait utilisable après libération** et laissait alors remonter une `CordisError` brute — exactement la fuite que le module existe pour empêcher. Amendé : toutes les méthodes deviennent inertes.
- **`valeur-transmise` était supprimé quand la valeur était `undefined`.** Une valeur publiée indéfinie est un transit réel. Amendé.
- **`cause` confondait un nom de dépendance et la chaîne `'liberation'`.** Amendé : type discriminé `CauseDesactivation`, et tous les noms manquants sont rapportés, pas seulement le premier.
- **Une erreur de refus ne nommait pas le composant refusé.** Amendé : `ErreurComposant.nom` est toujours renseigné.
- **Un composant publiant et consommant le même nom se reliait à lui-même.** Amendé : le cycle est écarté de la topologie.
- **Deux libérations concurrentes émettaient deux `composant-libere`.** Amendé : la libération en cours est mémorisée.
- **La règle d'isolement avait deux portes de sortie** : `import()` dynamique et fichiers `.js`/`.mjs`/`.cjs`/`.jsx`. Amendé : `no-restricted-syntax` sur l'import dynamique et `require`, extensions élargies, `@cordisjs/*` et `cosmokit` ajoutés.
- **Les tests n'étaient pas type-vérifiés** et la moitié de la surface publique n'était pas couverte — `lire`, `emettre`, `terminer`, `dependance-inconnue`, le désabonnement, la charge de `introspecter`, la `cause`, `composant-libere`. Amendé : `tsconfig.vitest.json` référencé, `vitest.config.ts` fusionné avec la config Vite, et deux suites ajoutées. 12 tests devenus 34.
- **La règle d'isolement elle-même n'était vérifiée par rien.** Amendé : `isolement.spec.ts` lance ESLint par programme. Vérifié par mutation — élargir `ignores` à `src/**` fait rougir 5 tests.

À conserver : la cascade de libération tenue par le noyau, la réservation des noms à la déclaration, l'activation annoncée seulement après un `applique` réussi.

## Design Notes

`FiberState` est un `const enum` : ne pas tenter `FiberState[valeur]`. Traduire par une table explicite, comme dans le spike.

Le contrat s'aligne sur ce que Cordis attend, en français côté public :

```ts
export interface Composant {
  nom: string
  injecte?: readonly string[]
  fournit?: readonly string[]
  presentation: Presentation
  applique(contexte: ContexteComposant): void
}
```

`ContexteComposant` est notre propre façade — elle expose `effet()`, `fournir()`, `emettre()` et `charger()`, et rien d'autre. C'est ce qui empêche un composant d'atteindre Cordis directement au prochain sprint.

## Verification

**Commands:**
- `pnpm lint` -- attendu : succès, et échec si l'on ajoute un import de `cordis` dans `src/App.vue` (à tester puis annuler)
- `pnpm type-check` -- attendu : aucune erreur
- `pnpm test` -- attendu : les huit scénarios passent
- `pnpm build` -- attendu : succès, le projet reste buildable

## Suggested Review Order

**La frontière — ce qui fait ou défait la story**

- Point d'entrée : le contrat public, où aucun type Cordis n'apparaît.
  [`contrat.ts:1`](../../src/runtime/contrat.ts#L1)

- La façade étroite donnée à un composant : c'est elle qui l'empêche d'atteindre le moteur.
  [`contrat.ts:29`](../../src/runtime/contrat.ts#L29)

- La règle qui applique l'isolement. Sans elle, tout le reste est une convention orale.
  [`eslint.config.ts:36`](../../eslint.config.ts#L36)

**Le canal d'événements**

- L'union discriminée : ajouter une information visible passe forcément par ici.
  [`evenements.ts:1`](../../src/runtime/evenements.ts#L1)

- `Omit` sur une union n'est pas distributif — ce type rétablit la vérification par variante.
  [`evenements.ts:78`](../../src/runtime/evenements.ts#L78)

- L'attribution de séquence, en un seul endroit, jamais par l'appelant.
  [`noyau.ts:58`](../../src/runtime/noyau.ts#L58)

**Le cycle de vie, là où sont les pièges**

- L'activation n'est annoncée qu'après un `applique` réussi : un composant en échec n'a jamais été vu actif.
  [`noyau.ts:163`](../../src/runtime/noyau.ts#L163)

- La réservation du nom se fait à la déclaration, pas à la publication.
  [`noyau.ts:203`](../../src/runtime/noyau.ts#L203)

- La cascade est à nous, pas au moteur : attendue, donc observable et ordonnée.
  [`noyau.ts:229`](../../src/runtime/noyau.ts#L229)

- La traduction d'un composant en plugin Cordis — seul endroit où les deux mondes se touchent.
  [`noyau.ts:83`](../../src/runtime/noyau.ts#L83)

**Périphérie**

- Les douze scénarios, dont les huit de la matrice.
  [`noyau.spec.ts:1`](../../src/runtime/__tests__/noyau.spec.ts#L1)

- Environnement node : le noyau se teste sans navigateur.
  [`vitest.config.ts:1`](../../vitest.config.ts#L1)
