# 8 — Modèle de menace

Une carte de la surface d'attaque de l'atelier et de ce qui la défend. Sans
elle, chaque durcissement est une intuition. Tenue à jour avec le code.

## Périmètre et limites (garde-fous d'honnêteté)

L'atelier tient **une primitive** — réversibilité runtime + fork visuel — pas une
plateforme de fiabilité ni un control plane. Deux limites de périmètre en
découlent, et elles bornent aussi ce que la sécurité promet :

1. **Le rollback est intra-runtime.** Il restaure la composition d'un agent, pas
   les effets de bord externes (une base supprimée, un e-mail parti). La sécurité
   ne prétend pas défaire le monde ; on se différencie sur *prévenir avant*
   (porte humaine, branche sandbox), pas *réparer après*.
2. **Pas de « plateforme de fiabilité ».** On durcit un produit, on ne vend pas
   de la sécurité d'agents.

## Surfaces

### 1. Le bac à sable (code écrit par un modèle)

- **Menace** : le code d'un comportement, ou d'une trace importée, est hostile —
  boucle infinie, exfiltration, accès à la page.
- **Mitigation** : exécution dans un Web Worker dont les capacités réseau sont
  **retirées du realm** (`fetch` vit sur `WorkerGlobalScope.prototype`, pas
  seulement `self`), arrêtable ; rendu dans une iframe sablée à **origine
  opaque**, dont la CSP **nomme son hôte explicitement** (une origine opaque ne
  correspond pas à `script-src 'self'`). Le code écrit par un modèle ne tourne
  **jamais** sur le fil de la page.
- **Risque résiduel** : une fuite via un canal non réseau (timing, taille de
  rendu) reste théorique ; pas d'isolation mémoire forte entre onglets.

### 2. Le service / relais de raisonnement

- **Menace** : vol de la clé fournisseur ; proxy ouvert ; abus de capacité.
- **Mitigation** : la clé vit dans l'environnement du service, **jamais côté
  client** (vérifié : aucune réponse ne la porte ; `/health` dit *s'il* y a une
  clé, pas laquelle). Un agent nomme une source ou un serveur d'outils, **jamais
  une adresse** — pas de proxy ouvert. Compteur par visiteur et par jour. En-têtes
  de durcissement sur chaque réponse (`nosniff`, `no-referrer`, `DENY`).
- **Risque résiduel** : pas de WAF ; le compteur est en mémoire (remis à zéro au
  redémarrage) ; pas encore de pentest externe (Deferred).

### 3. L'import de traces (donnée hostile)

- **Menace** : une trace importée est fabriquée à la main pour casser le rejeu ou
  faire exécuter du code.
- **Mitigation** : l'adaptateur **refuse** ce qu'il ne reconnaît pas plutôt que
  de le deviner ; une trace importée ne porte **aucun** `build.source`, donc rien
  n'est recompilé ni forkable (elle est rejouable et mesurable, pas plus). Le
  rejeu passe par le même bac à sable que tout le reste.
- **Risque résiduel** : un flux volumineux peut peser sur le client (borne de
  taille à durcir).

### 4. Le partage par lien

- **Menace** : fuite d'un run privé ; énumération d'existence.
- **Mitigation** : runs **privés par défaut** ; un run non partagé ou en corbeille
  répond **404** (indistinct d'un run absent — pas de fuite d'existence) ;
  identifiants de lien à haute entropie, filtrés. Le partage est explicite et
  révocable ; sa révocation referme le lien.
- **Risque résiduel** : un lien partagé reste public tant qu'il n'est pas révoqué
  (par conception).

### 5. L'authentification (sans mot de passe)

- **Menace** : vol de session ; réutilisation d'un lien ; énumération de comptes ;
  pilonnage du canal email.
- **Mitigation** : lien magique à **usage unique**, expirant, **stocké en hash**
  (jamais en clair) ; session par cookie **HTTP-only, SameSite=Lax, Secure**, non
  lisible par script ; **réponse uniforme** à la demande de lien (pas d'oracle de
  compte) et à la redemption (expiré/utilisé/inconnu indistincts) ; demandes de
  lien **sous le compteur**.
- **Risque résiduel** : pas de MFA ; dépend de la sécurité de la boîte email du
  visiteur ; pas de rotation automatique des secrets de session.

## Journalisation

Les actions sensibles (partage, révocation, corbeille, restauration, purge) sont
**auditées par org**, append-only, **sans secret**. Le journal permet de savoir
qui a fait quoi une fois la tenancy en place.

## À faire (Deferred)

- Pentest externe contre le service déployé, suivi des correctifs, re-test.
- Runbook de rotation de la clé fournisseur, exercé une fois.
- Rétention/purge du journal d'audit (suivra `data-privacy-compliance`).
