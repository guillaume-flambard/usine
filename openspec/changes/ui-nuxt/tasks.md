## 1. Fondations techniques

- [ ] 1.1 Vérifier la compatibilité avant tout le reste : `pnpm add @nuxt/ui tailwindcss vue-router`, plugin `ui()` après `vue()` dans `vite.config.ts`, CSS `@import "tailwindcss"` puis `@import "@nuxt/ui"`, `app.use(ui)` dans `src/main.ts`, `<UApp>` dans `src/App.vue`, `class="isolate"` sur `#app` dans `index.html`. Verify: `pnpm dev` sert la page, `pnpm build` produit les deux entrées (`index.html` et `sandbox.html`) sans que le CSS principal aspire `sandbox.html`, et `pnpm type-check` passe.
- [ ] 1.2 Supprimer le reset `*` de `src/assets/tokens.css` au profit du Preflight de Tailwind ; garder le bloc `prefers-reduced-motion`. Verify: la suite navigateur reste verte sur la géométrie, `prefers-reduced-motion` toujours honoré.
- [ ] 1.3 Thème : `--ui-radius` et les alias sémantiques déclarés une seule fois ; `ui({ colorMode: false })` si le thème clair unique est maintenu. Verify: aucun composant ne rend de coin arrondi non voulu, aucune bascule sombre.

## 2. Direction visuelle

- [ ] 2.1 Trancher la direction visuelle et l'écrire dans `design.md` : appariement typographique (display, lecture, monospace), palette par les rôles, et pour chaque interdit de `DESIGN.md` (thème clair unique, coins carrés, absence d'ombre) la mention explicite « levé » ou « maintenu », avec sa raison. Verify: aucune Open Question de `design.md` ne reste ouverte.
- [ ] 2.2 Polices auto-hébergées, aucune nouvelle origine externe. Verify: la page se charge sans requête vers un domaine absent de la CSP de `deployment/nginx.conf` ; aucun avertissement CSP en console.
- [ ] 2.3 `src/assets/tokens.css` réécrit comme source unique ; contrastes AA vérifiés, y compris le texte secondaire du fil qui échoue aujourd'hui. Verify: mesure de contraste sur chaque style de texte, minimum 4,5:1.
- [ ] 2.4 Test qui compare les trois copies de jetons (`tokens.css`, `sandbox.html`, `src/app/takeaway.ts`) et nomme le jeton qui diverge. Verify: le test échoue si on modifie une seule copie, passe une fois les trois alignées.

## 3. Composants

- [ ] 3.1 Découper `src/ui/FactoryApp.vue` (971 lignes) en shell plus composants de zone (marque et état, conversation, composeur, scène, mes runs, compte). Verify: `pnpm test:browser` vert, aucune cinquième zone à l'écran.
- [ ] 3.2 Un seul système de commandes : `.button`, `.button-ghost`, `.picker` et les cinq rôles de `.status-toggle` remplacés par des variantes nommées. Verify: l'action destructive du compte est un bouton destructif, plus un lien déguisé.
- [ ] 3.3 Les quatre superpositions deviennent de vrais dialogues là où c'en sont (porte humaine, panneau de nœud, connexion du modèle) : rôle, piège de focus, `Escape`, fond inerte, retour du focus. La feuille du bas reste du layout là où elle en est. Verify: test navigateur `Escape` ferme, focus piégé, focus rendu au déclencheur.
- [ ] 3.4 Onglets des runs conformes : panneaux référencés, un seul tabulable, flèches actives. Verify: test navigateur au clavier.
- [ ] 3.5 Champs du composeur, de `ModelSwitch` et du formulaire de fork sur les composants de saisie. Verify: le composeur reste vide au chargement, sans chip d'exemple, et la touche `⌘↵` lance toujours.
- [ ] 3.6 Corriger `ModelSwitch` : `FactoryApp.vue` écoute `@use-relay` et `@use-key`, le composant émet `connectRelay` et `connectKey`. Écrire le test manquant. Verify: nouveau test navigateur — clé saisie et consentement coché, le modèle se branche et la ligne d'état nomme la source.
- [ ] 3.7 Purger `src/assets/app.css` : les treize sélecteurs morts, les quatorze déclarations dupliquées, et le quatrième accent `#c4633a` en repli. Verify: aucune règle sans élément correspondant, aucun sélecteur déclaré deux fois.
- [ ] 3.8 `LiveGraph` et `GraphNode` gardent leur principe (SVG à la main, `viewBox`, disposition automatique) et leurs signaux non colorés. Verify: les six états restent distinguables sans couleur.

## 4. Tests

- [ ] 4.1 Migrer les sélecteurs des huit suites de `src/ui/__tests__/` vers des attributs `data-*` stables, en anglais. Verify: aucune suite ne sélectionne sur une classe de présentation.
- [ ] 4.2 Conserver intactes les assertions qui portent une affirmation produit : non-défilement du document, état vide honnête de `LiveApplication`, poids égal des deux gestes de la porte, absence de chips d'exemple. Verify: ces tests existent toujours et passent.
- [ ] 4.3 Mesurer le poids du bundle avant et après. Verify: chiffres notés dans `design.md`, et assumés explicitement.

## 5. Documents

- [x] 5.1 `EXPERIENCE.md` : lever l'interdit de bibliothèque de composants avec sa raison, et corriger le renvoi vers `src/assets/usine.css`, fichier disparu. Verify: aucun renvoi vers un fichier inexistant.
- [x] 5.2 `DESIGN.md` : frontmatter de jetons à jour, section Typography réécrite, Do's et Don'ts alignés sur les interdits levés. Verify: `DESIGN.md` et `tokens.css` déclarent les mêmes valeurs.
- [x] 5.3 `CLAUDE.md` : une ligne sur la stack UI. Verify: la stack se lit sans ouvrir `package.json`.

## 6. Vérification complète

- [ ] 6.1 `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm test:browser`, `pnpm build`, `openspec validate ui-nuxt --strict`. Verify: tout vert.
- [ ] 6.2 Contrôle visuel sur `pnpm dev`, chaque écran : repos, amorçage, porte, application servie, fork, panneau de nœud, mes runs, compte. Verify: aucun écran cassé, aucune régression de lisibilité contre `docs/3-CLAUDE-DESIGN-BRIEF.md`.
