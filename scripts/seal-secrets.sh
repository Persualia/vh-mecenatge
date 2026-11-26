#!/usr/bin/env bash
# Segella els secrets de vh-mecenatge per al clúster albert-cluster (netcup).
#
#   scripts/seal-secrets.sh env    → deploy/env-sealed.yaml        (a partir del .env)
#   scripts/seal-secrets.sh ghcr   → deploy/ghcr-pull-sealed.yaml  (cal GHCR_PULL_USER i GHCR_PULL_TOKEN)
#   scripts/seal-secrets.sh all    → tots dos
#
# Només fa servir la clau PÚBLICA del controlador (deploy/sealed-secrets-cert.pem): no toca el
# clúster. Els fitxers segellats es poden publicar; només el clúster els pot desxifrar.
# Si el clúster es reconstrueix, cal tornar a baixar el certificat i tornar a segellar:
#   kubeseal --context netcup --controller-name=sealed-secrets \
#     --controller-namespace=kube-system --fetch-cert > deploy/sealed-secrets-cert.pem
set -euo pipefail

cd "$(dirname "$0")/.."
NAMESPACE=vh-mecenatge
CERT=deploy/sealed-secrets-cert.pem
# Variables del .env que no tenen sentit dins del clúster.
SKIP_KEYS="VHIR_CREDENTIALS_DIR VHIR_OVERRIDES_FILE"

seal() { kubeseal --cert "$CERT" --format yaml --scope strict; }

seal_env() {
  [[ -f .env ]] || { echo "✗ No hi ha .env" >&2; exit 1; }
  # util.parseEnv llegeix el .env igual que Node: treu les cometes i els comentaris de final de línia.
  SKIP_KEYS="$SKIP_KEYS" NAMESPACE="$NAMESPACE" node -e '
    const { parseEnv } = require("node:util");
    const env = parseEnv(require("node:fs").readFileSync(".env", "utf8"));
    const skip = new Set(process.env.SKIP_KEYS.split(" "));
    const data = {};
    for (const [key, value] of Object.entries(env)) if (!skip.has(key) && value !== "") data[key] = value;
    console.log(JSON.stringify({
      apiVersion: "v1", kind: "Secret", type: "Opaque",
      metadata: { name: "vh-mecenatge-env", namespace: process.env.NAMESPACE },
      stringData: data,
    }));
    console.error("→ vh-mecenatge-env: " + Object.keys(data).join(", "));
  ' | seal > deploy/env-sealed.yaml
  echo "✓ deploy/env-sealed.yaml"
}

seal_ghcr() {
  : "${GHCR_PULL_USER:?Cal GHCR_PULL_USER (usuari de GitHub del token)}"
  : "${GHCR_PULL_TOKEN:?Cal GHCR_PULL_TOKEN (un PAT classic amb només read:packages)}"
  kubectl create secret docker-registry ghcr-pull --namespace "$NAMESPACE" \
    --docker-server=ghcr.io --docker-username="$GHCR_PULL_USER" --docker-password="$GHCR_PULL_TOKEN" \
    --dry-run=client -o json | seal > deploy/ghcr-pull-sealed.yaml
  echo "✓ deploy/ghcr-pull-sealed.yaml"
}

case "${1:-}" in
  env) seal_env ;;
  ghcr) seal_ghcr ;;
  all) seal_env; seal_ghcr ;;
  *) echo "Ús: $0 env|ghcr|all" >&2; exit 2 ;;
esac
