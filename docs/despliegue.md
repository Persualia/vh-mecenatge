# Despliegue en albert-cluster

La app corre en el cluster `albert-cluster` (VPS netcup) y se publica en
`https://vh-mecenatge.albertperez.dev`. Este repo **nunca modifica el cluster**:
el cluster vigila la carpeta `deploy/` de la rama `main` y despliega lo que hay.

```
push a main ──► GitHub Actions: lint + tests ──► imagen ghcr.io/persualia/vh-mecenatge:<sha>
                                             └─► commit "deploy: <sha>" en deploy/kustomization.yaml
ArgoCD (albert-cluster) ──vigila deploy/ en main──► aplica Deployment, Service, HTTPRoute y SealedSecrets
```

| Pieza | Dónde |
|-------|-------|
| Imagen | `Dockerfile` (Next `output: "standalone"`, usuario 1000, sin secretos dentro) |
| Manifests | `deploy/` (Kustomize) |
| Pipeline | `.github/workflows/deploy.yaml` |
| Secretos | `deploy/*-sealed.yaml`, generados con `scripts/seal-secrets.sh` |
| Correcciones manuales y última lectura de cada API | S3 (`AWS_S3_BUCKET` / `AWS_S3_PATH`, copias en `snapshots/`); el pod no guarda estado |

## Secretos

Los secretos viajan cifrados en el repo como `SealedSecret`. Se sellan con la clave
**pública** del cluster (`deploy/sealed-secrets-cert.pem`), así que sellar no toca el
cluster y solo el cluster puede descifrarlos.

```bash
scripts/seal-secrets.sh env     # tras cambiar el .env → deploy/env-sealed.yaml
GHCR_PULL_USER=<usuario> GHCR_PULL_TOKEN=<pat> scripts/seal-secrets.sh ghcr
git add deploy/*-sealed.yaml && git commit -m "Reseal secrets" && git push
```

`seal-secrets.sh env` mete en el Secret todas las variables del `.env` salvo
`VHIR_CREDENTIALS_DIR` y `VHIR_OVERRIDES_FILE`, que no tienen sentido en el cluster.

> ⚠️ Si se reconstruye el cluster, su clave cambia: hay que volver a bajar el
> certificado (comando en la cabecera de `scripts/seal-secrets.sh`) y volver a sellar.

## Puesta en marcha (una sola vez)

### 1. En este repo

- [ ] Crear un **PAT classic** con solo `read:packages` (el cluster lo usa para bajar la
      imagen privada de GHCR) y sellarlo: `scripts/seal-secrets.sh ghcr` (ver arriba).
      Hasta que exista `deploy/ghcr-pull-sealed.yaml`, `deploy/` no compila.
- [ ] En GitHub, *Settings → Actions → General → Workflow permissions*: permitir
      escritura (*Read and write*), o que la organización Persualia no la limite. El
      workflow necesita `contents: write` (commit del tag) y `packages: write` (GHCR).
- [ ] Si `main` está protegida, permitir que GitHub Actions haga push.
- [ ] Hacer push a `main` y comprobar que el workflow publica la imagen y el commit
      `deploy: <sha>`.

### 2. En albert-cluster (pasar estas instrucciones a su agente)

> **Alta de una app externa: vh-mecenatge (una sola vez)**
>
> La app vive en el repo **privado** `https://github.com/Persualia/vh-mecenatge.git` y trae
> sus propios manifests (Kustomize) en `deploy/`, rama `main`. El cluster solo tiene que
> vigilarla: no hay chart ni values que añadir. Nada de esto debe cambiar el resto del
> cluster ni el ApplicationSet `cluster-apps`.
>
> 1. **Credencial del repo para ArgoCD**: Secret con label
>    `argocd.argoproj.io/secret-type: repository` para
>    `https://github.com/Persualia/vh-mecenatge.git`, sellado en `infra/bootstrap/secrets/`
>    y generado por `generate-credentials.sh` (componente nuevo, p. ej. `vh-mecenatge-repo`).
>    Credencial: fine-grained PAT (o GitHub App) con solo *Contents: read* sobre ese repo.
> 2. **Namespace `vh-mecenatge`** con PSS `enforce: restricted`, con el patrón de
>    `infra/bootstrap/namespaces/`. El pod ya cumple `restricted` (runAsNonRoot, uid 1000,
>    readOnlyRootFilesystem, drop ALL, seccomp RuntimeDefault, requests/limits).
> 3. **Políticas** en `infra/apps/policies/values.yaml` (copiando el bloque de `hello`):
>    entrada solo desde Traefik al puerto 3000; salida a internet por 443 (Meta Graph,
>    Google Ads, StockCrowd, AWS S3) y DNS. Quota pequeña: 1 réplica, requests
>    50m/192Mi, limit 512Mi.
> 4. **Application de ArgoCD independiente** (fuera del ApplicationSet, porque su origen es
>    otro repo): `repoURL: https://github.com/Persualia/vh-mecenatge.git`,
>    `targetRevision: main`, `path: deploy`, Kustomize normal (**sin** el plugin helmfile),
>    `destination.namespace: vh-mecenatge`, `syncPolicy.automated` con `prune: true` y
>    `selfHeal: true`. Opcional: label `cluster: netcup` para que la CI de prod la
>    sincronice y espere su health.
> 5. **Recursos que trae la app** (para que no sorprendan): `Deployment`, `Service`,
>    `HTTPRoute` al Gateway `traefik-gateway` (namespace `traefik`, sectionName
>    `websecure`) con hostname `vh-mecenatge.albertperez.dev`, y dos `SealedSecret`
>    (`vh-mecenatge-env` y `ghcr-pull`) sellados con la clave pública actual del
>    controller `sealed-secrets` de `kube-system`. El wildcard DNS y el certificado
>    wildcard ya cubren el hostname.
> 6. **Dominio extra `vh-mecenatge.persualia.com`** (DNS en cdmon, no en Cloudflare; no se
>    va a mover): `*.albertperez.dev` pasa por el proxy de Cloudflare, así que un CNAME
>    simple desde cdmon no funciona. Estudiar y proponer: (a) Custom Hostname de
>    Cloudflare for SaaS sobre la zona `albertperez.dev`, que depende del modo SSL de la
>    zona (Full o Full strict) y del certificado que presenta el Gateway; o (b) un registro
>    A en cdmon directo a la IP del VPS con un certificado HTTP-01 propio para ese host.
>    Devolver los registros exactos que hay que crear en cdmon y si la app tiene que
>    añadir el hostname a su `HTTPRoute`.

### 3. Dominio persualia.com

Cuando el agente del cluster diga qué opción usar: crear los registros en cdmon y añadir
`vh-mecenatge.persualia.com` a `hostnames` en `deploy/httproute.yaml`.

## Día a día

- **Desplegar**: push a `main`. En ~3 min ArgoCD aplica el nuevo tag.
- **Volver atrás**: `git revert` del commit `deploy: <sha>` (o de los cambios de código) y push.
- **Cambiar un secreto**: editar `.env`, `scripts/seal-secrets.sh env`, commit y push.
- **Probar la imagen en local**:
  `docker build -t vh-mecenatge . && docker run --rm -p 3000:3000 --env-file <env sin comillas> vh-mecenatge`.
  Ojo: `docker --env-file` no quita las comillas del `.env`.
