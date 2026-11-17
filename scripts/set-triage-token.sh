#!/usr/bin/env bash
# Pose un jeton GitHub du tri quotidien dans le .env de l'usine sur le VPS (ADR 0003).
#
#   scripts/set-triage-token.sh guillaume-flambard
#   scripts/set-triage-token.sh memolabs-dev
#
# Le jeton se colle à l'invite, sans écho : il ne passe ni par l'historique du
# shell, ni par la ligne de commande distante, ni par un fichier local. Il est
# envoyé par l'entrée standard de ssh, et le .env reste en mode 600.
# Une fois les deux jetons posés : scripts/set-triage-token.sh --restart
set -euo pipefail

ENV_FILE=${USINE_ENV_FILE:-/opt/stacks/usine/.env}
HOST=lab

if [[ "${1:-}" == "--restart" ]]; then
  /usr/bin/ssh "$HOST" "cd /opt/stacks/usine && docker compose up -d --no-deps --force-recreate usine"
  exit 0
fi

case "${1:-}" in
  guillaume-flambard) var=USINE_TRIAGE_TOKEN_GUILLAUME_FLAMBARD ;;
  memolabs-dev) var=USINE_TRIAGE_TOKEN_MEMOLABS_DEV ;;
  *)
    echo "usage : $0 guillaume-flambard|memolabs-dev|--restart" >&2
    exit 2
    ;;
esac

read -rs -p "Jeton à grain fin pour $1 (collé, invisible) : " token
echo
if [[ ! "$token" =~ ^github_pat_[A-Za-z0-9_]+$ ]]; then
  echo "Ce n'est pas un jeton à grain fin (github_pat_...) : rien n'a été écrit." >&2
  exit 1
fi

# Côté VPS : la ligne de cette variable est remplacée, le reste du fichier gardé.
printf '%s=%s\n' "$var" "$token" | /usr/bin/ssh "$HOST" \
  "set -e; umask 077; f=$ENV_FILE; grep -v '^$var=' \$f > \$f.tmp || true; cat >> \$f.tmp; mv \$f.tmp \$f; chmod 600 \$f"
unset token
echo "$var posé sur $HOST. Relancer après les deux jetons : $0 --restart"
