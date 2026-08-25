# 9 — Vie privée : registre des traitements

Ce que l'atelier collecte, pourquoi, où, combien de temps, et comment une
personne exerce ses droits. Tenu à jour avec le code.

## Données traitées

| Catégorie | Contenu | Finalité |
|---|---|---|
| Compte | email | Identifier une personne, rattacher ses runs |
| Organisation | identifiant, nom (= email en v1) | Isoler les données d'une équipe |
| Runs (archives) | flux d'événements, **pouvant contenir des prompts et sorties de modèle**, et des données que l'importateur y a mises | Rejouer, forker, mesurer une trajectoire d'agent |
| Jetons de lien magique | hash du jeton, expiration | Connexion sans mot de passe |
| Sessions | identifiant opaque, expiration | Maintenir la connexion |
| Journal d'audit | org, action, cible, date | Tracer les actions sensibles |

Aucune donnée de carte, aucun mot de passe. La clé du fournisseur et les secrets
de session vivent côté service, **jamais côté client**.

## Conservation et purge

| Donnée | Conservation | Mécanisme |
|---|---|---|
| Run vivant | tant que le propriétaire le garde | suppression → corbeille |
| Run en corbeille | fenêtre `RUN_TRASH_RETENTION_DAYS` (défaut 30 j) | `purge_expired` |
| Jeton de lien | jusqu'à expiration (~15 min) puis purge | `purge_expired` |
| Session | jusqu'à expiration (~30 j) puis purge | `purge_expired` |
| Journal d'audit | jusqu'à l'effacement du compte | `forget` (effacement) |

La purge s'exécute en commande, contre la base seule :

```sh
DATABASE_URL=… uv run python -m usine_api.maintenance
```

À planifier (cron Coolify). Sauvegardes : voir `deployment/BACKUP.md`.

## Localisation

Les données vivent dans PostgreSQL sur le VPS Memo Labs (Coolify). Le raisonnement
passe par un fournisseur externe nommé (voir `deployment/DPA-TEMPLATE.md`) ; les
emails de connexion par un fournisseur SMTP.

## Droits des personnes

Depuis l'atelier, une personne connectée peut, sur **ses propres** données :

- **Accès** — un résumé de ce qu'on détient : `GET /api/account`.
- **Portabilité** — exporter compte + tous ses runs : `GET /api/account/export`.
- **Effacement** — supprimer son compte et tout ce qui s'y rattache (runs,
  sessions, jetons, audit), en cascade : `DELETE /api/account`.

L'effacement retire la trace **interne**. Il ne défait pas un effet de bord
externe qu'un agent aurait produit ailleurs (garde-fou d'honnêteté, AD-41).

## Limite v1

L'atelier ne détecte ni ne caviarde automatiquement les données personnelles
contenues dans une trace **importée** : c'est la responsabilité de qui l'importe.
La rédaction automatique est un chantier ultérieur.
