#!/usr/bin/env bash
# One-command deploy of ashteki to the shared LCG box (DragnCards/RingsDB/MarvelCDB).
#
# This is the "more automated" path: instead of the manual README-aws.md runbook,
# run this once per release. It is idempotent — safe to re-run for every update.
#
# It does NOT replace the boot-time automation already on the box (lcg.service +
# update-route53.sh). It does the things those don't: pull code, (re)build/start the
# ashteki stack, refresh the shared systemd unit, and reload the shared Caddy so the
# ashes.leohyl.app block goes live — without disturbing the other three apps.
#
# Why no GitHub Actions push-to-deploy: the box has a dynamic public IP (new IP on
# each start) and is stopped when idle, so CI usually can't reach it. A locally-run
# script that resolves the current IP via the AWS API is the reliable fit.
#
# Usage:
#   ./deploy/deploy.sh            # pull + build + start + wire shared infra
#   ./deploy/deploy.sh --seed     # also import card data + precons (first deploy)
#   HOST=1.2.3.4 ./deploy/deploy.sh   # skip the AWS lookup, use an explicit host
#
# Requires (on this Mac): aws CLI with creds, and an SSH key authorized for
# ec2-user@<box> and for cloning git@github.com:leohylee/ashteki.git from the box.
set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:-i-02003176ba4106fcc}"
ASHTEKI_REPO="${ASHTEKI_REPO:-git@github.com:leohylee/ashteki.git}"
SEED=0
[[ "${1:-}" == "--seed" ]] && SEED=1

# --- Make sure the box is running, then find its current public IP ---------------
if [[ -z "${HOST:-}" ]]; then
    state="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].State.Name' --output text)"
    if [[ "$state" != "running" ]]; then
        echo "Instance is '$state' — starting it..."
        aws ec2 start-instances --instance-ids "$INSTANCE_ID" >/dev/null
        aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
        echo "Started; giving the OS a moment to come up..."
        sleep 30
    fi
    HOST="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
fi
echo "==> Deploying to ec2-user@${HOST}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "ec2-user@${HOST}")

# --- 1. Pull the latest code (dragncards = shared infra; ashteki = the app) -------
echo "==> Pulling repos"
"${SSH[@]}" "set -e
    cd /srv/dragncards && git pull --ff-only
    if [ -d /srv/ashteki/.git ]; then
        cd /srv/ashteki && git pull --ff-only
    else
        git clone '${ASHTEKI_REPO}' /srv/ashteki
    fi"

# --- 2. Build + (re)start the ashteki stack only ----------------------------------
echo "==> Building + starting ashteki (mongo, redis, lobby, gamenode)"
"${SSH[@]}" "cd /srv/ashteki && docker compose -f compose.prod.yml up -d --build"

# --- 3. Optional first-time data seed ---------------------------------------------
if [[ "$SEED" == "1" ]]; then
    echo "==> Seeding card data + precons (first deploy)"
    "${SSH[@]}" "cd /srv/ashteki
        docker compose -f compose.prod.yml exec -T lobby node server/scripts/importdata
        docker compose -f compose.prod.yml exec -T lobby node server/scripts/importprecons"
    echo "    (card images: see step 4 of deploy/README-aws.md — verify the output path)"
fi

# --- 4. Refresh shared infra: systemd unit, DNS, and reload the shared Caddy -------
echo "==> Refreshing shared systemd unit + DNS + Caddy"
"${SSH[@]}" "set -e
    sudo cp /srv/dragncards/deploy/lcg.service /etc/systemd/system/lcg.service
    sudo systemctl daemon-reload
    /srv/dragncards/deploy/update-route53.sh
    docker compose -f /srv/dragncards/compose.prod.yml exec -T caddy \
        caddy reload --config /etc/caddy/Caddyfile"

echo "==> Done. Verify:  curl -I https://ashes.leohyl.app"
