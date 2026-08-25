# Accord de sous-traitance (DPA) — modèle

Modèle à compléter avant de confier des données d'un client entreprise. Les
valeurs entre crochets sont à renseigner (les sous-processeurs exacts sont à
confirmer — tâche d'infra).

## Parties

- **Responsable de traitement** : le client (l'organisation qui utilise l'atelier).
- **Sous-traitant** : Memo Labs, éditeur de l'atelier agentique.

## Objet

Traitement des données que le client dépose dans l'atelier (comptes, archives de
runs, journaux) aux seules fins de fournir le service (rejeu, fork, mesure de
trajectoires d'agents).

## Sous-processeurs

| Rôle | Fournisseur | Localisation | Données concernées |
|---|---|---|---|
| Hébergement + base | [hébergeur du VPS] | [région] | toutes |
| Envoi d'email | [fournisseur SMTP] | [région] | email (lien de connexion) |
| Raisonnement (modèle) | [fournisseur de modèle] | [région] | instructions/contexte envoyés au modèle pendant un run |

## Mesures de sécurité

- Secrets côté service, jamais côté client ; sessions par cookie HTTP-only.
- Isolation par organisation (tenancy) ; runs privés par défaut.
- Code écrit par un modèle exécuté en bac à sable (Web Worker à capacités
  retirées, iframe sablée). Voir `docs/8-THREAT-MODEL.md`.
- En-têtes de durcissement ; journal d'audit des actions sensibles.
- Sauvegardes chiffrées hors-hôte ; purge de rétention planifiée.

## Droits des personnes

Le sous-traitant fournit les moyens techniques de l'accès, de la portabilité et
de l'effacement (voir `docs/9-PRIVACY.md`).

## Durée et sort des données

Les données sont conservées selon `docs/9-PRIVACY.md` et effacées sur demande du
responsable ou de la personne concernée, ou à la fin du contrat.

_Ce modèle n'est pas un avis juridique ; le faire relire avant usage._
