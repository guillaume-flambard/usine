---
title: 'Story 1.2 — Le store et les états dérivés'
type: 'feature'
created: '2026-08-20'
status: 'in-review'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le noyau émet un flux d'événements que personne ne consomme. Sans une réduction unique, chaque futur composant d'interface calculerait son propre état à partir du flux — et deux vues du même nœud finiraient par diverger.

**Approach:** Un module `src/etat/` avec un modèle de lecture, un réducteur pur, et une fonction unique qui traduit le cycle de vie en l'un des six états affichables. Le store expose l'état en lecture seule et n'a qu'une voie d'écriture.

## Boundaries & Constraints

**Always:**
- Le réducteur est pur : même suite d'événements, même état final. Ni horloge, ni aléatoire, ni entrée/sortie.
- L'état exposé est en lecture seule. Aucun composant Vue ne peut le muter.
- L'état affiché d'un nœud est produit par **une seule** fonction, à partir du cycle de vie et des événements — jamais poussé par un composant.
- Les six états affichables sont exactement : `inactif`, `en-attente-de-dependance`, `en-cours`, `termine`, `en-erreur`, `libere`.
- La narration est le message de plus haute séquence. Un seul à la fois.
- `src/etat/` n'importe pas `cordis` et ne connaît pas Vue en dehors du fichier de store.

**Ask First:**
- Toute modification de `src/runtime/`, `src/usine/run.ts` ou `src/App.vue`.
- Tout ajout de dépendance.

**Never:**
- Pas de rendu, pas de disposition, pas de SVG — c'est la story 1.4.
- Pas de notion de phase ni de scénario — ils arrivent avec la story 1.3.
- Pas de `console.log`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création | `composant-cree` | un nœud apparaît, état `inactif` s'il ne déclare rien, `en-attente-de-dependance` s'il injecte | N/A |
| Activation | `composant-active` | le nœud passe `en-cours` | N/A |
| Fin de travail | `travail-termine` sur un nœud actif | le nœud passe `termine` | N/A |
| Désactivation | `composant-desactive` | le nœud repasse `en-attente-de-dependance` et la cause est retenue | N/A |
| Erreur | `composant-en-erreur` avec identifiant | le nœud passe `en-erreur` et y reste | N/A |
| Erreur sans identifiant | refus de chargement | aucun nœud ne change d'état, l'incident entre au journal | N/A |
| Libération | `composant-libere` | le nœud passe `libere` et reste visible | N/A |
| Narration | plusieurs `message-emis` | seul le message de plus haute séquence est la narration courante | N/A |
| Journal | toute la suite | chaque message est conservé, attribué et ordonné par séquence | N/A |
| Arête | `valeur-transmise` | l'arête correspondante est marquée comme ayant transité | N/A |
| Rejeu | la même suite réduite deux fois | états finaux identiques | N/A |
| Événement inconnu d'un nœud absent | événement portant un identifiant inconnu | ignoré sans lever | N/A |

</frozen-after-approval>

## Code Map

- `src/runtime/evenements.ts` -- l'union `EvenementRun` à réduire. Neuf variantes, chacune séquencée.
- `src/runtime/contrat.ts` -- `EtatComposant` (cycle de vie), `CauseDesactivation`, `Presentation`, `IdComposant`.
- `src/runtime/noyau.ts` -- `abonner` rend la fonction de désabonnement que le store doit conserver.
- `src/runtime/__tests__/facade.spec.ts` -- montre l'ordre réel du flux : création, puis activation, puis ce que le composant émet.
- `_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/EXPERIENCE.md` -- les six états et leur signal non chromatique.

## Tasks & Acceptance

**Execution:**
- [x] `src/etat/modele.ts` -- le modèle de lecture : `NoeudVue`, `AreteVue`, `MessageJournal`, `EtatRun`, et `EtatAffiche`
- [x] `src/etat/etats-affiches.ts` -- la fonction unique de dérivation, isolée pour être testable seule
- [x] `src/etat/reducteur.ts` -- `reduire(etat, evenement)` pur, plus `etatInitial()`
- [x] `src/etat/store.ts` -- l'enveloppe Vue : état en lecture seule, branchement au noyau, désabonnement
- [x] `src/etat/__tests__/reducteur.spec.ts` -- les douze scénarios de la matrice
- [x] `src/etat/__tests__/store.spec.ts` -- lecture seule, branchement, désabonnement

**Acceptance Criteria:**
- Étant donné une suite d'événements, quand on la réduit deux fois, alors les états finaux sont identiques.
- Étant donné le store, quand un composant tente de muter l'état exposé, alors TypeScript le refuse et la valeur ne change pas.
- Étant donné un nœud, quand on demande son état affiché, alors il vient de la fonction unique de dérivation et d'aucune autre source.
- Étant donné `pnpm test`, quand la suite s'exécute, alors tous les scénarios de la matrice passent.

## Verification

**Commands:**
- `pnpm type-check` -- attendu : aucune erreur
- `pnpm lint` -- attendu : succès
- `pnpm test` -- attendu : tout passe

## Spec Change Log

- **La lecture seule n'était garantie que par les types.** `readonly()` sur un `shallowRef` ne gèle pas les tableaux internes : un `push` sur `etat.noeuds` passait. Amendé : le réducteur gèle la vue et ses tableaux à chaque réduction. État évité : une vue corrompue en silence par un composant maladroit.
- **Le typage du constructeur d'événements de test répétait le défaut trouvé en story 1.1.** `Omit<T, 'sequence'>` sur l'union n'est pas distributif. Amendé : le helper utilise `SansSequence`.
