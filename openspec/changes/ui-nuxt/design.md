## Context

L'application est une SPA Vue 3.5.41 sur Vite 8.2.1 (saveur rolldown), sans
Tailwind, sans routeur, sans bibliothèque de composants, sans pinia. L'état vit
dans un store écrit à la main (`src/state/`). Les neuf composants de `src/ui/`
totalisent 2235 lignes, dont 971 pour `FactoryApp.vue` qui porte à lui seul le
shell, la conversation, le composeur, les runs, le compte et toute la scène.

Le style est à 95 % du CSS global non scopé dans deux fichiers importés par
`main.ts` : `tokens.css` (60 lignes) et `app.css` (1205 lignes). Trois composants
sur neuf ont un bloc `<style scoped>`.

Deux contraintes d'isolation façonnent tout le reste : `sandbox.html` est une
seconde entrée Rollup servie sous `default-src 'none'` dans une iframe sablée
d'origine opaque, et `src/app/takeaway.ts` émet un fichier HTML hors ligne. Ni
l'une ni l'autre ne peut consommer la bibliothèque : elles gardent leur copie
manuelle des jetons.

## Goals / Non-Goals

**Goals:**
- Un seul système de commandes et de superpositions, avec des dialogues corrects.
- Une seule source de jetons, et une preuve automatisée que les copies coïncident.
- Une direction visuelle choisie, pas subie.
- Un shell découpé, lisible, prêt pour la scène à deux panneaux de `docs/7`.
- Des tests qui ne cassent plus au premier changement de classe CSS.

**Non-Goals:**
- Introduire du routage. `vue-router` est enregistré avec un tableau de routes
  vide parce que la bibliothèque l'attend, pas pour naviguer.
- Toucher au moteur, au flux d'événements ou au format d'archive.
- Construire les deux panneaux divergents de la cible `docs/7`.
- Faire évoluer `services/relay`, gelé.

## Decisions

- **Nuxt UI v4 en mode Vue, pas Nuxt.** La bibliothèque s'installe dans une
  application Vue 3 + Vite pure : `pnpm add @nuxt/ui tailwindcss`, plugin `ui()`
  après `vue()`, `@import "tailwindcss"` puis `@import "@nuxt/ui"`, `app.use(ui)`,
  racine `<UApp>`, `class="isolate"` sur `#app`.
  Source : https://ui.nuxt.com/docs/getting-started/installation/vue
  *Alt. écartée* : migrer vers Nuxt. Le produit n'a ni SSR, ni routage, ni besoin
  de rendu serveur ; la migration coûterait tout et ne rapporterait rien.
  *Alt. écartée* : écrire les primitives à la main. Un dialogue accessible avec
  piège de focus est précisément ce qu'on écrit mal, et on l'a déjà écrit mal
  quatre fois.
- **Le thème est piloté par variables, pas par du CSS qui lutte.** `--ui-radius`
  dans `:root`, alias sémantiques déclarés une fois, et `ui({ colorMode: false })`
  si le thème clair unique est maintenu.
  Source : https://ui.nuxt.com/docs/getting-started/theme/css-variables
- **Le reset `*` de `tokens.css` est supprimé, pas superposé** au Preflight de
  Tailwind. Deux resets qui font le même travail différemment se départagent par
  l'ordre d'import, ce qui est un piège silencieux. Le bloc
  `prefers-reduced-motion` reste, il porte une exigence produit.
- **Les tests cessent de sélectionner par classe de présentation.** Les huit
  suites navigateur ciblent aujourd'hui `.composer .button`, `.status-toggle`,
  `.node-frame`, `.my-runs-*`, et assertent `getComputedStyle` sur `.zone` et
  `.canvas`. Chaque composant remplacé les casse. Les sélecteurs passent à des
  attributs `data-*` stables, en anglais comme le reste du code.
  *Constat utile* : les dix-sept PNG de `__screenshots__` **ne sont pas comparés**
  (`toMatchScreenshot` est absent du dépôt, la change `atelier-redesign` l'a
  vérifié). Aucune référence visuelle à régénérer.
- **La direction visuelle est tranchée avant d'écrire un composant.** Sinon la
  bibliothèque impose ses défauts et on aura échangé un défaut d'IA contre un
  autre. Livrable de cette étape : `DESIGN.md` révisé et un `tokens.css` unique.
- **Les polices sont auto-hébergées.** La CSP de production n'autorise que
  `fonts.googleapis.com` et `fonts.gstatic.com`, et elle est écrite en double
  (`deployment/nginx.conf` et `deployment/nginx.compose.conf`, deux copies à
  garder synchrones). Une police auto-hébergée évite d'éditer les deux et de
  découvrir la casse en ligne.
- **Les trois copies de jetons sont vérifiées par un test.** L'isolation impose
  la duplication ; elle n'impose pas la divergence.

## Risks / Trade-offs

- **Nuxt UI v4 sur Vite 8 saveur rolldown** est la seule inconnue technique
  réelle. `pnpm-workspace.yaml` n'existe que pour débloquer
  `@rolldown/binding-*@1.2.5`. À vérifier par un `pnpm dev` et un `pnpm build`
  avant d'écrire le moindre composant, pas après.
- **Double entrée Rollup.** Le scan Tailwind ne doit pas tirer `sandbox.html` dans
  la feuille principale, et `vite-plugin-vue-devtools` a un historique d'ordre
  avec les plugins qui transforment du `.vue`.
- **`vue-tsc --build`** avec références de projet, TypeScript ~6.0 et les types
  génériques de la bibliothèque : le `type-check` va ralentir et probablement
  remonter des erreurs au premier passage. Le lancer tôt.
- **Poids de bundle.** L'application ne pesait que Vue et dagre. À mesurer après
  `pnpm build` et à assumer explicitement.
- **La direction visuelle est la partie qui peut rater**, pas l'installation.

## Ce que cette change révise

À amender dans le même lot, sinon la prochaine session lira la migration comme
une régression :

- `_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/EXPERIENCE.md`
  interdit toute bibliothèque de composants. L'interdit est levé, avec sa raison.
  Son renvoi vers `src/assets/usine.css` pointe en plus vers un fichier disparu.
- `_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/DESIGN.md`
  présente le thème clair unique, les coins carrés et l'absence d'ombre comme non
  négociables. Chaque interdit est explicitement levé ou maintenu, avec sa raison.
- `CLAUDE.md` gagne une ligne sur la stack UI.

## Ce qui ne se renégocie pas

Ces contraintes viennent de l'architecture, pas du goût :

- Quatre zones, et pas une de plus.
- 100vh, la page ne défile jamais.
- Chaque élément à l'écran est payé par un événement réel du run.
- Aucun état de nœud porté par la couleur seule.
- L'iframe de l'application est sablée, d'origine opaque, et ne partage rien avec
  la page hôte.
- La porte humaine garde ses deux gestes à poids visuel strictement égal.

## Migration Plan

Pas de migration de données ni de contrat. Changement front, réversible par
revert. Aucune action infra : un push sur `main` construit sur le runner du VPS,
`autodeploy` tire, sonde, et restaure la version précédente si la sonde échoue.

## Open Questions

- Le thème clair unique et les coins carrés : maintenus ou levés ? À trancher en
  ouvrant la direction visuelle, et à écrire ici plutôt qu'à laisser implicite.
- Quel appariement typographique. Le document de design réclame une display avec
  du caractère, une famille de lecture confortable à 14 px, et une monospace pour
  le code et les chiffres.
