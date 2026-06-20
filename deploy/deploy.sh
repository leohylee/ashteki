#!/usr/bin/env bash
# One-command deploy of ashteki to the shared LCG box (DragnCards/RingsDB/MarvelCDB).
#
# This reflects how the box is ACTUALLY managed (verified during the first deploy):
#   - The box has NO GitHub access and /srv/* are plain rsync'd trees (not git
#     clones), so we rsync from this Mac rather than `git pull` on the box.
#   - Its buildx (0.12.1) is too old for `docker compose build`, so we build the
#     image with `docker build` and then `docker compose up -d` (no --build).
#   - The import scripts don't self-exit after finishing, so we run them under
#     `timeout` and then restart the lobby to load the freshly imported data.
#
# It does NOT replace the boot-time automation on the box (lcg.service +
# update-route53.sh); it does the things those don't: ship code, (re)build/start the
# ashteki stack, refresh the shared systemd unit, and reload the shared Caddy so the
# ashes.leohyl.app block goes live — without disturbing the other three apps.
#
# Usage (run from the ashteki repo root on the Mac):
#   ./deploy/deploy.sh            # rsync + build + start + wire shared infra
#   ./deploy/deploy.sh --seed     # also import card data + precons (first deploy)
#   HOST=1.2.3.4 ./deploy/deploy.sh     # skip the AWS lookup, use an explicit host
#
# Requires on this Mac: aws CLI with creds, rsync, and the box's EC2 key
# (~/.ssh/dragncards.pem; override with SSH_KEY=...). The dragncards repo is expected
# at ../dragncards so its updated deploy/ files (Caddyfile, lcg.service,
# update-route53.sh) can be shipped too.
set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:-i-02003176ba4106fcc}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/dragncards.pem}"
DRAGNCARDS_DIR="${DRAGNCARDS_DIR:-$(cd "$(dirname "$0")/../../dragncards" 2>/dev/null && pwd || true)}"
SEED=0
[[ "${1:-}" == "--seed" ]] && SEED=1
cd "$(dirname "$0")/.."   # ashteki repo root

# --- Make sure the box is running, then find its current public IP ---------------
if [[ -z "${HOST:-}" ]]; then
    state="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].State.Name' --output text)"
    if [[ "$state" != "running" ]]; then
        echo "Instance is '$state' — starting it..."
        aws ec2 start-instances --instance-ids "$INSTANCE_ID" >/dev/null
        aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
        sleep 30
    fi
    HOST="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
fi
echo "==> Deploying to ec2-user@${HOST}"

SSHO=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -i "$SSH_KEY")
ssh_box() { ssh "${SSHO[@]}" "ec2-user@${HOST}" "$@"; }
RSH="ssh ${SSHO[*]}"

# --- 1. Ship code: ashteki app + the shared dragncards deploy files ---------------
echo "==> Rsyncing ashteki -> /srv/ashteki"
ssh_box 'mkdir -p /srv/ashteki'
rsync -az --delete -e "$RSH" \
    --exclude '.git' --exclude 'node_modules' --exclude 'dist' \
    --exclude 'public/cards' --exclude 'redis-data' --exclude 'dump.rdb' \
    --exclude '*.log' --exclude 'server/logs' --exclude 'config/local*' \
    --exclude '.DS_Store' \
    ./ "ec2-user@${HOST}:/srv/ashteki/"

if [[ -n "$DRAGNCARDS_DIR" && -d "$DRAGNCARDS_DIR/deploy" ]]; then
    echo "==> Shipping shared infra files from $DRAGNCARDS_DIR/deploy"
    rsync -az -e "$RSH" \
        "$DRAGNCARDS_DIR/deploy/Caddyfile" \
        "$DRAGNCARDS_DIR/deploy/lcg.service" \
        "$DRAGNCARDS_DIR/deploy/update-route53.sh" \
        "ec2-user@${HOST}:/srv/dragncards/deploy/"
    ssh_box 'chmod +x /srv/dragncards/deploy/update-route53.sh'
else
    echo "!! dragncards repo not found at ../dragncards — skipping shared-infra sync."
    echo "   Set DRAGNCARDS_DIR=... if the Caddyfile/lcg.service/DNS need updating."
fi

# --- 2. Build the image (classic build; compose build needs newer buildx) ---------
echo "==> Building image + (re)starting ashteki stack"
ssh_box 'cd /srv/ashteki && docker build -t ashteki . \
    && docker compose -f compose.prod.yml up -d'

# --- 3. Optional first-time data seed (scripts hang on completion -> timeout) ------
if [[ "$SEED" == "1" ]]; then
    echo "==> Seeding card data + precons (first deploy)"
    ssh_box 'cd /srv/ashteki
        timeout 240 docker compose -f compose.prod.yml exec -T lobby node server/scripts/importdata    || true
        timeout 240 docker compose -f compose.prod.yml exec -T lobby node server/scripts/importprecons || true
        docker exec ashteki-lobby-1 sh -c "pkill -f importdata; pkill -f importprecons" 2>/dev/null || true
        docker compose -f compose.prod.yml restart lobby'
    echo "    (card images load from the CDN by default; offline images are optional —"
    echo "     see deploy/README-aws.md, and mind the download script's output path.)"
fi

# --- 4. Refresh shared infra: systemd unit, DNS, and reload the shared Caddy -------
echo "==> Refreshing shared systemd unit + DNS + Caddy"
ssh_box 'set -e
    sudo cp /srv/dragncards/deploy/lcg.service /etc/systemd/system/lcg.service
    sudo systemctl daemon-reload
    /srv/dragncards/deploy/update-route53.sh
    docker compose -f /srv/dragncards/compose.prod.yml exec -T caddy \
        caddy reload --config /etc/caddy/Caddyfile'

echo "==> Done. Verify:  curl -I https://ashes.leohyl.app"
