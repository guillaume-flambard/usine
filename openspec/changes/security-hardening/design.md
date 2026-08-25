## Context

Voir `proposal.md — Why`. Le socle est déjà défensif (bac à sable à capacités
retirées, iframe sablée nommant son hôte, clé jamais côté client, `cache-control:
no-store`), et les pièges connus ont leurs tests. Cette change formalise et
étend : en-têtes de durcissement, journal d'audit par org (la tenancy vient
d'arriver), hygiène des secrets, et un modèle de menace écrit.

## Goals / Non-Goals

**Goals :**
- En-têtes de durcissement sur toutes les réponses du service.
- Journal d'audit append-only des actions sensibles, par org (mém + Postgres).
- `.env.example` + garde au démarrage sans clé ; secrets jamais côté client.
- Modèle de menace écrit couvrant bac à sable, service, import, partage, auth.

**Non-Goals (v1) :**
- Engagement pentest réel (ops/infra).
- Rotation automatique des secrets (procédure documentée, pas de code).
- WAF / rate-limit avancé (le compteur existant suffit à ce stade).

## Decisions

- **En-têtes par middleware.** Un middleware FastAPI pose `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` sur chaque
  réponse, sans écraser le `cache-control: no-store` déjà posé. *Alt. écartée* :
  ajouter les en-têtes route par route — oublié à la première route neuve.
- **Audit derrière un port**, comme le reste : `AuditLog` (`record`, `entries`),
  impls mémoire et Postgres, injecté dans `create_app`. Écrit après le succès de
  l'action, et **jamais bloquant** : une panne d'écriture d'audit ne fait pas
  échouer un partage. *Alt. écartée* : audit transactionnel avec l'action — le
  couplage ferait échouer l'action utile pour un souci de journal.
- **Append-only par absence de chemin.** Aucune route ne modifie ni ne supprime
  une entrée ; la table n'a ni update ni delete applicatif.
- **Pas de secret dans l'audit.** On journalise org/action/cible, jamais un
  jeton ni une clé (exigence testée).
- **Secrets documentés par `.env.example`** (placeholders, aucune vraie valeur) ;
  au démarrage sans clé, le service le journalise (le mode que `/health` rapporte
  déjà). *Alt. écartée* : refuser de démarrer sans clé — casserait la démo
  rejouée, qui tourne volontairement sans clé.
- **Modèle de menace dans `docs/8-THREAT-MODEL.md`**, à côté des docs produit,
  avec les deux garde-fous d'honnêteté comme limites de périmètre.

## Risks / Trade-offs

- **`X-Frame-Options: DENY` sur le service** n'affecte pas l'iframe du bac à
  sable : celle-ci encadre `sandbox.html` servi par le **front**, pas les JSON du
  service. *Mitigation* : la politique de la frame reste nommée explicitement
  (piège connu, gardé) ; les en-têtes du service ne la touchent pas.
- **Audit non bloquant** → une entrée peut manquer si la base tombe. *Mitigation*
  : acceptable (l'action utile prime) ; la perte est un trou de journal, pas une
  action fantôme.
- **Audit = donnée personnelle légère** (org, quand). *Mitigation* : pas de
  secret, et il suivra la rétention/purge de `data-privacy-compliance`.

## Migration Plan

Additif : migration `0003_audit.sql` (table `audit_entries`). En-têtes et garde
de démarrage sont sans état. Rollback = retirer le middleware et la route
`/audit` ; la table peut rester (inerte).

## Open Questions

- Rétention des entrées d'audit — relève de `data-privacy-compliance` ; sans
  effet sur ce découpage.
