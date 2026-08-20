#!/usr/bin/env bash
# Reconstruit l'image sur le VPS et relance le déploiement Coolify.
#
# Tant que le dépôt GitHub `guillaume-flambard/usine` n'existe pas, Coolify
# ne peut pas tirer le code lui-même : l'application est de type « image
# Docker » et l'image est construite sur le serveur, puis poussée dans un
# registre local. Ce script fait les deux.
#
# Le jour où le dépôt existe, ce script devient inutile : il suffira de
# basculer l'application en build pack `dockerfile` avec la source git, et
# `git push` déclenchera le déploiement.
set -euo pipefail

HOTE="${1:-memo-labs}"
IMAGE="127.0.0.1:5000/usine-agentique:latest"

echo "→ vérification locale avant envoi"
pnpm lint
pnpm type-check
pnpm test

echo "→ envoi de la source"
tar --exclude-vcs --exclude=node_modules --exclude=dist --exclude=_bmad \
    --exclude=_bmad-output --exclude=.claude --exclude=spike --exclude='._*' \
    -czf /tmp/usine.tgz .
scp -q /tmp/usine.tgz "$HOTE:/tmp/usine.tgz"
rm -f /tmp/usine.tgz

echo "→ construction et publication de l'image"
ssh "$HOTE" "rm -rf /opt/usine && mkdir -p /opt/usine && cd /opt/usine \
  && tar xzf /tmp/usine.tgz && rm -f /tmp/usine.tgz \
  && find . -name '._*' -delete \
  && docker build -q -t $IMAGE . >/dev/null \
  && docker push -q $IMAGE >/dev/null"

echo "→ déploiement Coolify"
ssh "$HOTE" "docker exec coolify php artisan tinker --execute='
\$a = \App\Models\Application::where(\"name\",\"usine\")->first();
queue_application_deployment(application: \$a, deployment_uuid: strtolower(\Illuminate\Support\Str::random(24)), no_questions_asked: true);
' >/dev/null 2>&1"

echo "→ vérification"
sleep 30
curl -sI https://usine.memolabs.dev --max-time 25 | head -1
