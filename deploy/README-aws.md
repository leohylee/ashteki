# Deploying ashteki onto the shared AWS LCG box

Run ashteki at **https://ashes.leohyl.app** on the **same** EC2 box that already
hosts DragnCards (`lcg.leohyl.app`), RingsDB (`ringsdb.leohyl.app`) and MarvelCDB
(`marvelcdb.leohyl.app`). It reuses that box's shared **Caddy** (TLS + reverse
proxy), the **`lcg.service`** systemd unit (boot-time Route 53 update + `docker
compose up`), and the **on/off Lambda** (start/stop the whole instance). The
DragnCards-side wiring lives in the `dragncards` repo under `deploy/` — this file
covers the ashteki side.

```
browser ──HTTPS──> ashes.leohyl.app ─┐
                                      │  (shared Caddy :443, network_mode: host)
                 /gamenode1/*  ───────┼──> 127.0.0.1:10000  gamenode  (socket.io)
                 everything else ─────┴──> 127.0.0.1:4100   lobby     (static dist + API + lobby socket.io)
                                            compose.prod.yml: lobby + gamenode + mongo + redis
```

ashteki is two Node processes plus Mongo + Redis:
- **lobby** (`node .`) serves the static `dist/` build, the REST API, and the lobby
  socket.io at `/socket.io/`. Bound to `127.0.0.1:4100` (PORT=4100 to avoid
  DragnCards' :4000).
- **gamenode** (`node server/gamenode`) is a separate socket.io server at path
  `/gamenode1/socket.io`, bound to `127.0.0.1:10000`. The browser connects to it
  **directly** after a runtime "handoff" — see "How the gamenode URL is resolved".
- **mongo** / **redis** are internal only. Redis is also the lobby↔gamenode channel.

Nothing here bakes the domain in at build time: the client uses
`window.location.origin` for the lobby and the handoff for the gamenode, so the build
is domain-agnostic and the lobby serves the static files itself.

## Loopback port map on the box (only 80/443/22 are public)
| App | Loopback port |
|-----|---------------|
| DragnCards backend | 4000 |
| MarvelCDB | 8000 |
| RingsDB | 8001 |
| **ashteki lobby** | **4100** |
| **ashteki gamenode** | **10000** |

## Files used here
- `compose.prod.yml` — prod stack: `lobby` (127.0.0.1:4100), `gamenode`
  (127.0.0.1:10000), `mongo`, `redis`. No Caddy (reuses the shared one). Named
  volumes `mongodata`, `redisdata`, `cards` persist on EBS across stop/start.
- `Dockerfile` (repo root) — `npm ci` + `npm run build` (→ `dist/`); default CMD
  `node .` (lobby); the gamenode service overrides the command.
- In the **dragncards** repo: `deploy/Caddyfile` (the `ashes.leohyl.app` block),
  `deploy/update-route53.sh` (the `ashes.leohyl.app` A-record), `deploy/lcg.service`
  (the `/srv/ashteki/compose.prod.yml` ExecStart/ExecStop).

## How the gamenode URL is resolved (why GAMENODE_HOST matters)
When a game starts, the lobby sends the browser a `handoff` with the gamenode's
`address`/`port`/`name`. The browser builds `//<address>[:port]` and connects with
socket.io `path: '/<name>/socket.io'`.

- `name` = `gameNode.name` = `gamenode1` (`config/production.json5`) → path
  `/gamenode1/socket.io`.
- `address` = `GAMENODE_HOST` (`server/gamenode/gameserver.js`). We set it to
  **`ashes.leohyl.app`** on the gamenode container.
- In production the advertised port is hard-coded to `80`
  (`server/gamenode/gamesocket.js`); 80 is "standard" so the browser strips it and
  connects over the page's HTTPS → `wss://ashes.leohyl.app/gamenode1/socket.io`.
- The gamenode has no TLS cert, so it serves plain HTTP on :10000 — **Caddy**
  terminates TLS and proxies the WebSocket upgrade. Caddy must match
  `/gamenode1/*` and **not** strip the prefix (the gamenode listens on the full path).

## 1. Instance size
The box already runs Postgres + Elixir + two MySQL/MariaDB DBs. Adding Mongo + Redis
+ two Node processes wants more headroom, so run on **t3.large** (8 GB) rather than
t3.medium (4 GB). To resize an existing box (everything on EBS persists):
```bash
aws ec2 stop-instances  --instance-ids i-02003176ba4106fcc
aws ec2 wait instance-stopped --instance-ids i-02003176ba4106fcc
aws ec2 modify-instance-attribute --instance-id i-02003176ba4106fcc \
    --instance-type '{"Value":"t3.large"}'
aws ec2 start-instances --instance-ids i-02003176ba4106fcc
```
Cost delta in eu-west-2: ~$0.046/hr → ~$0.091/hr while running; idle (EBS) unchanged.
For light stop-when-idle use that's roughly +$1–3/month. Alternatively add swap.

## 2. Get the code onto the box
```bash
sudo mkdir -p /srv && sudo chown ec2-user:ec2-user /srv
git clone <your-ashteki-fork-url> /srv/ashteki
```
`dist/`, `public/` and `node_modules/` are gitignored — `dist/` is built inside the
image and the card images are populated in step 4, so nothing is shipped from the Mac.

## 3. Build + start the stack
```bash
cd /srv/ashteki
docker compose -f compose.prod.yml up -d --build
```
This builds the image (`npm run build` → `dist/`) and starts lobby, gamenode, mongo,
redis. Re-run with `--build` whenever you change app code.

## 4. Seed data + card images (first boot only)
Card/precon data into Mongo (the documented import flow from the main README):
```bash
docker compose -f compose.prod.yml exec lobby node server/scripts/importdata
docker compose -f compose.prod.yml exec lobby node server/scripts/importprecons
```
Then populate the offline **card images** into the `cards` volume (mounted at
`/usr/src/app/public/cards`, served by the lobby). Use this repo's offline-image
tooling, e.g.:
```bash
docker compose -f compose.prod.yml exec lobby node scripts/download-card-images.js
docker compose -f compose.prod.yml exec lobby npm run images:check   # verify integrity
```
> Verify the download path: `scripts/download-card-images.js` writes to
> `path.join(__dirname, 'public/cards')`. Confirm the files land where the lobby
> serves them (`public/cards`, i.e. the mounted `cards` volume) and adjust the script
> path or the volume mount if they don't line up before relying on it.

## 5. Wire into the shared box (in the dragncards repo, on the box)
These are edited in `/srv/dragncards/deploy/` (already committed in that repo):
- **Caddyfile** has the `ashes.leohyl.app` block → reload Caddy:
  `docker compose -f /srv/dragncards/compose.prod.yml restart caddy` (or
  `... exec caddy caddy reload --config /etc/caddy/Caddyfile`).
- **update-route53.sh** includes `ashes.leohyl.app` → it's set on the next boot, or
  run `/srv/dragncards/deploy/update-route53.sh` once by hand now.
- **lcg.service** starts `/srv/ashteki/compose.prod.yml` on boot → after pulling the
  updated unit: `sudo cp /srv/dragncards/deploy/lcg.service /etc/systemd/system/ &&
  sudo systemctl daemon-reload`.

## Turning it on/off
Same box as the other apps, so the existing on/off Lambda / `aws ec2 start|stop`
powers ashteki up and down too — no separate button. On boot `lcg.service` repoints
DNS and brings every stack up; EBS persistence keeps Mongo data and card images, so a
restart is a fast container start, not a rebuild.

## Verify (end-to-end)
1. `docker compose -f compose.prod.yml ps` → mongo, redis, lobby (4100), gamenode
   (10000) up; lobby log shows it listening on 4100.
2. `curl -I https://ashes.leohyl.app` → 200 with a valid Let's Encrypt cert.
3. In a browser: register/log in; the lobby loads with card images (proves
   `dist/` + the `cards` volume are served through Caddy).
4. Start a game with a second account/spectator and take a realtime action — proves
   the handoff resolves to `wss://ashes.leohyl.app/gamenode1/socket.io` through Caddy.
   Watch the `gamenode` logs for the connection.
5. Stop via the button → all four sites down; start → DNS repoints, all back in
   ~2-3 min, no rebuild.
6. `free -m` / `docker stats` → confirm the box isn't memory-starved on t3.large.

## Notes / gotchas
- **Public registration:** the app is internet-reachable. If only you should use it,
  disable signups (or add a `respond ... 403` matcher on the register route in the
  Caddy block, mirroring the DragnCards setup).
- **Placeholder secrets:** `config/production.json5` ships placeholder `secret` /
  `hmacSecret`. For a public box, override them via env (see
  `config/custom-environment-variables.json5`).
