# MEM-25 — Scène divergente : deux branches côte à côte

## Découpage

1. **ComparisonBanner.vue** — bandeau au-dessus des deux panneaux : premier point de divergence, sorties (réponses finales de chaque branche), coût/latence/score éval (M6, affiché comme indisponible tant que M6 n'est pas livré).
2. **DivergentScene.vue** — deux panneaux côte à côte, chacun avec son RunScene + sa propre GateDialog, alimentés par deux threadIds. Chaque panneau est indépendant : graphe, porte, validation.
3. **Bouton « forker ici » sur la ligne du temps des checkpoints** — dans RunsSheet, chaque entrée de run expose un bouton "forker ici" qui ouvre le ForkPanel pour ce run (fork depuis ce point de la timeline).
4. **ChatPanel** — après un fork, bascule en mode divergent (original + branche côte à côte) au lieu de remplacer le run courant. Émet un événement `forked` avec les deux threadIds.
5. **App.vue** — gère le mode divergent : rend DivergentScene au lieu de ChatPanel quand deux threadIds sont actifs.
6. **Test navigateur** — `DivergentScene.browser.spec.ts` : fork depuis un run, deux panneaux apparaissent, validation d'une branche aboutit, aux 4 largeurs (375/768/1024/1440), sans défilement horizontal.
7. **PR vers `v2`** avec capture vidéo jointe.

## Critères d'acceptation

- Deux panneaux affichés simultanément, chacun avec son graphe et sa porte indépendante.
- Bandeau de comparaison présent (premier point de divergence, sorties).
- Bouton « forker ici » présent sur au moins une entrée de la ligne du temps (RunsSheet).
- Test navigateur passe : fork depuis un run → deux panneaux → validation d'une branche.
- Responsive : 375/768/1024/1440 px, pas de défilement horizontal.
- PR ouverte vers `v2`, CI verte.
