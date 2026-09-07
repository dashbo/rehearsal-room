# Deploying Rehearsal Room

A single Next.js server. All state lives under **`/app/data`** (one directory /
volume):

| Path                    | What                                      |
| ----------------------- | ----------------------------------------- |
| `/app/data/prod.db`     | SQLite database                           |
| `/app/data/storage/`    | uploaded score files (`.mxl`, `.mid`, …)  |

It's SQLite on one file, so run **one instance**. Migrate to Postgres + object
storage before scaling out.

Pick one:

- [A. Single host with Docker Compose](#a-single-host--docker-compose) — app + Caddy (automatic HTTPS)
- [B. Kubernetes](#b-kubernetes) — Kustomize manifests, ingress-nginx + cert-manager
- [C. Single host, bare Node + systemd](#c-single-host--bare-node--systemd) — no Docker

---

## Get the image

Only for A and B. The image is published to **GitHub Container Registry**
(`ghcr.io/dashbo/rehearsal-room`).

**Via GitHub Actions (no setup):** `.github/workflows/docker-image.yml` builds
on every push to `main` and on `v*` tags, authenticating with the built-in
`GITHUB_TOKEN`. Cut a versioned image:

```bash
git tag v0.1.0 && git push --tags
```

The package then appears under the repo's **Packages**. It starts **private**:

- **Make it public** (simplest): package → *Package settings* → *Change
  visibility* → Public. Hosts then pull with no credentials.
- **Keep it private:** `docker login ghcr.io -u dashbo` with a PAT that has
  `read:packages`, on every host that pulls. (k8s: create a
  `docker-registry` secret and add `imagePullSecrets`.)

**Build it yourself instead:**

```bash
docker build -t ghcr.io/dashbo/rehearsal-room:0.1.0 .
docker push ghcr.io/dashbo/rehearsal-room:0.1.0   # optional
```

---

## A. Single host — Docker Compose

Files: [`deploy/compose/`](compose/). Caddy fetches a Let's Encrypt cert
automatically, so you need a domain pointed at the host with ports **80 + 443**
open.

```bash
git clone git@github.com:dashbo/rehearsal-room.git
cd rehearsal-room/deploy/compose
cp .env.example .env
$EDITOR .env                 # set APP_DOMAIN (and TAG)

docker compose pull         # or: docker compose build
docker compose up -d
docker compose logs -f app  # watch "applying database migrations" → "starting"
```

Open `https://<APP_DOMAIN>`.

**No domain / just want a port?** Skip Caddy: uncomment `ports: ["3000:3000"]`
under `app` in `compose.yaml`, then `docker compose up -d app`. Reach it at
`http://<host>:3000` and put your own reverse proxy in front.

**Upgrade:**

```bash
docker compose pull && docker compose up -d   # migrations run on start
```

**Back up:** the `data` volume is everything.

```bash
docker compose cp app:/app/data/prod.db ./rehearsal-room-$(date +%F).db
# or archive the whole volume:
docker run --rm -v rehearsal-room_data:/d -v "$PWD":/out alpine \
  tar czf /out/rehearsal-room-data-$(date +%F).tgz -C /d .
```

---

## B. Kubernetes

Files: [`deploy/k8s/`](k8s/) (Kustomize). One replica, `Recreate` strategy, a
`ReadWriteOnce` PVC at `/app/data`, `Service`, and an `Ingress` for
ingress-nginx + cert-manager.

**Edit first:**

- `k8s/ingress.yaml` — `host:` / `tls.hosts:` → your domain;
  `cert-manager.io/cluster-issuer` → your ClusterIssuer
- `k8s/pvc.yaml` — set `storageClassName:` if there's no default
- `k8s/kustomization.yaml` — set the image `newTag:`

**Apply:**

```bash
kubectl apply -k deploy/k8s
kubectl -n rehearsal-room rollout status deploy/rehearsal-room
```

**Upgrade:** bump `newTag` in `kustomization.yaml` → `kubectl apply -k deploy/k8s`
(or `kubectl -n rehearsal-room set image deploy/rehearsal-room app=ghcr.io/dashbo/rehearsal-room:0.2.0`).

**Back up:**

```bash
POD=$(kubectl -n rehearsal-room get pod -l app=rehearsal-room -o name)
kubectl -n rehearsal-room cp "${POD#pod/}:/app/data/prod.db" ./rehearsal-room-$(date +%F).db
```

---

## C. Single host — bare Node + systemd

Needs Node 22+. Unit file: [`deploy/systemd/rehearsal-room.service`](systemd/rehearsal-room.service).

```bash
sudo useradd --system --home /opt/rehearsal-room --shell /usr/sbin/nologin rehearsal
sudo git clone git@github.com:dashbo/rehearsal-room.git /opt/rehearsal-room
cd /opt/rehearsal-room

sudo -u rehearsal npm ci
sudo -u rehearsal npx prisma generate
sudo -u rehearsal npm run build
sudo -u rehearsal npm prune --omit=dev      # keep runtime deps only

sudo mkdir -p /var/lib/rehearsal-room/storage
sudo chown -R rehearsal:rehearsal /var/lib/rehearsal-room /opt/rehearsal-room

sudo cp deploy/systemd/rehearsal-room.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rehearsal-room
```

The unit runs `prisma migrate deploy` (via `ExecStartPre`) then
`next start` on `0.0.0.0:3000`. Put nginx/Caddy in front for TLS.

**Upgrade:**

```bash
cd /opt/rehearsal-room
sudo -u rehearsal git pull
sudo -u rehearsal npm ci && sudo -u rehearsal npx prisma generate \
  && sudo -u rehearsal npm run build && sudo -u rehearsal npm prune --omit=dev
sudo systemctl restart rehearsal-room
```

**Back up:** copy `/var/lib/rehearsal-room/` while traffic is quiet.

---

## Notes / caveats

- **No authentication.** Scores are unlisted-by-ID; anyone who can reach the app
  can create and open scores. Front it with your own auth (oauth2-proxy,
  Authelia, Tailscale, a Caddy `basic_auth` block, …) if it shouldn't be open.
- **Outbound HTTPS.** "Import from URL" makes server-side requests (e.g. to
  churchofjesuschrist.org). Allow egress on `443` if you filter it.
- **Client-side CDN.** The piano instrument streams samples from
  `tonejs.github.io` in the visitor's browser. Offline users should pick the
  "Synth" instrument (no assets).
- **Uploads ≤ 5 MB**, enforced by the app. Caddy has no body-size cap by
  default; nginx-ingress is set to `8m` in `k8s/ingress.yaml`; if you use your
  own nginx, raise `client_max_body_size`.
- `GET /api/health` is the health endpoint and does not touch the database.
