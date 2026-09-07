# Deploying Rehearsal Room

A single-replica Next.js server. State lives on **one ReadWriteOnce
PersistentVolume** mounted at `/app/data`:

| Path                    | What                                       |
| ----------------------- | ------------------------------------------ |
| `/app/data/prod.db`     | SQLite database                            |
| `/app/data/storage/`    | uploaded score files (`.mxl`, `.mid`, …)   |

Because it's SQLite on one volume, the Deployment runs **`replicas: 1`** with
`strategy: Recreate`. Migrate to Postgres + object storage before scaling out.

## 1. Build and push the image

The image goes to **GitHub Container Registry** (`ghcr.io/dashbo/rehearsal-room`).
No separate account or registry credentials — GitHub Actions authenticates with
the built-in `GITHUB_TOKEN`.

### Option A — GitHub Actions (recommended)

`.github/workflows/docker-image.yml` builds on every push to `main` and on
`v*` tags. Nothing to configure; just tag a release:

```bash
git tag v0.1.0 && git push --tags
```

After the first successful run, the package appears at
`https://github.com/dashbo/rehearsal-room/pkgs/container/rehearsal-room`.
It starts **private** — do one of:

- **Make it public** (simplest for a homelab): package page → *Package settings*
  → *Change visibility* → Public. The cluster then pulls with no credentials.
- **Keep it private**: create a classic PAT with `read:packages`, then
  ```bash
  kubectl -n rehearsal-room create secret docker-registry ghcr \
    --docker-server=ghcr.io --docker-username=dashbo --docker-password=<PAT>
  ```
  and add `imagePullSecrets: [{ name: ghcr }]` to the Deployment's pod spec.

### Option B — locally

```bash
echo "<PAT with write:packages>" | docker login ghcr.io -u dashbo --password-stdin
docker build -t ghcr.io/dashbo/rehearsal-room:0.1.0 .
docker push ghcr.io/dashbo/rehearsal-room:0.1.0
```

## 2. Point the manifests at your cluster

Edit **`deploy/k8s/ingress.yaml`**:

- `host:` and `tls.hosts:` → your domain
- `cert-manager.io/cluster-issuer` → your ClusterIssuer name

Edit **`deploy/k8s/pvc.yaml`** if you have no default StorageClass
(`storageClassName:`).

Set the image tag once in **`deploy/k8s/kustomization.yaml`** (`newTag:`).

## 3. Apply

```bash
kubectl apply -k deploy/k8s
kubectl -n rehearsal-room rollout status deploy/rehearsal-room
```

The entrypoint runs `prisma migrate deploy` before the server starts, so a
fresh volume is initialised automatically and upgrades apply pending
migrations on rollout.

## 4. Upgrades

```bash
# after a new image is pushed
kubectl -n rehearsal-room set image deploy/rehearsal-room app=ghcr.io/dashbo/rehearsal-room:0.2.0
# or bump newTag in kustomization.yaml and: kubectl apply -k deploy/k8s
```

## Backups

The whole app state is the one PVC. Snapshot it with your CSI driver, or copy
the database out:

```bash
POD=$(kubectl -n rehearsal-room get pod -l app=rehearsal-room -o name)
kubectl -n rehearsal-room exec "$POD" -- \
  node ./node_modules/prisma/build/index.js db execute --stdin <<< ".backup '/app/data/backup.db'" || true
kubectl -n rehearsal-room cp "${POD#pod/}:/app/data/prod.db" ./rehearsal-room-$(date +%F).db
```

(Or just `kubectl cp` `prod.db` while traffic is quiet — SQLite tolerates it
for a small single-writer app.)

## Notes / caveats

- **No authentication.** Scores are unlisted-by-ID; anyone who can reach the
  Ingress can create and open scores. Put it behind your own auth proxy
  (oauth2-proxy, Authelia, Tailscale, …) if it shouldn't be open.
- **Egress required.** The "import from URL" feature makes server-side HTTPS
  requests (e.g. to churchofjesuschrist.org). If you run a default-deny
  `NetworkPolicy`, allow egress to `443`.
- **Client-side CDN.** The piano instrument streams samples from
  `tonejs.github.io` in the visitor's browser. Offline/air-gapped users should
  pick the "Synth" instrument (no assets) — or vendor the samples later.
- **Uploads ≤ 5 MB**, enforced by the app; the Ingress `proxy-body-size` is set
  to `8m` for headroom.
- `/api/health` is the probe endpoint and does not touch the database.
