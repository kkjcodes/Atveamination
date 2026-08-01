#!/usr/bin/env bash
set -euo pipefail

# ── AtVeAnimation deploy ───────────────────────────────────────────────────
# Usage:
#   ./deploy.sh                          # normal deploy (image update only)
#   ./deploy.sh --bootstrap              # first-time / rebuild Container App
#   ./deploy.sh --env <name>             # override env (default: atveanimation-prod)
#   ./deploy.sh --location <region>      # override region (default: eastus)
#
# ── Secret handling ───────────────────────────────────────────────────────
# Container App → Secrets (Portal) is the ONE source of truth for user
# secrets. Bicep never touches them:
#   • This script does NOT prompt for user secrets.
#   • This script does NOT store secrets on your laptop.
#   • Regular deploys use `az containerapp update --image` — the container
#     image is the ONLY thing that changes. Portal secrets are preserved.
#
# The one exception is `--bootstrap` (first-time or when adding a new
# secret NAME / env-var wiring change): Bicep re-declares the Container
# App with EMPTY user-secret placeholders. After that, you must re-set
# any user secrets in Portal → Container App → Secrets (they were wiped).
#
# What Bicep DOES manage: acr-password (derived from ACR resource lookup),
# infra resources (ACR, Postgres, storage, log analytics, env), and the
# secret NAMES / env-var references. Never secret values.

ENV_NAME="atveanimation-prod"
LOCATION="eastus"
POSTGRES_LOCATION="canadacentral"
BOOTSTRAP=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)               ENV_NAME="$2";           shift 2 ;;
    --location)          LOCATION="$2";           shift 2 ;;
    --postgres-location) POSTGRES_LOCATION="$2";  shift 2 ;;
    --bootstrap)         BOOTSTRAP=1;             shift ;;
    -h|--help)           grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; NC=$'\033[0m'
step()  { echo -e "\n${GREEN}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $*${NC}"; }
fatal() { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── 1. Prerequisites ───────────────────────────────────────────────────────
step "Checking prerequisites"
command -v az     &>/dev/null || fatal "Azure CLI not found. Install: https://aka.ms/install-azure-cli"
command -v docker &>/dev/null || fatal "Docker not found."
az bicep version  &>/dev/null || az bicep install
echo "  ✓ az, docker, bicep ready"

# ── 2. Login ───────────────────────────────────────────────────────────────
step "Authenticating"
az account show &>/dev/null || az login
SUB_ID=$(az account show --query id -o tsv)
echo "  ✓ Subscription: $SUB_ID"

# ── 3. Resource group ─────────────────────────────────────────────────────
RG="${ENV_NAME}-rg"
step "Ensuring resource group: $RG"
az group create --name "$RG" --location "$LOCATION" --output none
echo "  ✓ $RG ready"

# ── 4. Detect existing Container App ──────────────────────────────────────
EXISTING_IMAGE=$(az containerapp show --name atveanimation --resource-group "$RG" \
  --query "properties.template.containers[0].image" -o tsv 2>/dev/null || echo "")

if [[ -z "$EXISTING_IMAGE" ]]; then
  echo "  ${DIM}No existing Container App — forcing --bootstrap${NC}"
  BOOTSTRAP=1
fi

# ── 5. Auto-generate DB password on first-time only ──────────────────────
# Only needed if we're provisioning Postgres for the first time. We ask
# Bicep to skip the password param on subsequent runs (Postgres already
# exists with a password Bicep can't retrieve).
DB_ADMIN_PASSWORD=""
if [[ "$BOOTSTRAP" == "1" ]]; then
  DB_ADMIN_PASSWORD="$(openssl rand -hex 20)"
  echo "  ${DIM}Generated DB admin password (used only on Postgres provisioning)${NC}"
fi

# ── 6. Bicep runs ONLY on --bootstrap ─────────────────────────────────────
# On regular deploys, we skip Bicep entirely. Rationale: every resource in
# resources.bicep — Postgres (admin password), storage account (public
# access setting), Container App (secrets) — has some property that gets
# reset on re-declaration. Portal-managed state should win; Bicep is only
# the tool that provisioned the resource the first time.
if [[ "$BOOTSTRAP" == "1" ]]; then
  step "Bootstrap: Bicep provisions/refreshes all infrastructure"
  warn "Container App secrets will be reset to empty placeholders — you MUST"
  warn "re-set them in Portal after this deploy completes."

  BOOTSTRAP_IMAGE="${EXISTING_IMAGE:-mcr.microsoft.com/azuredocs/containerapps-helloworld:latest}"

  az deployment sub create \
    --name "${ENV_NAME}-bootstrap" \
    --location "$LOCATION" \
    --template-file infra/main.bicep \
    --parameters \
        environmentName="$ENV_NAME" \
        location="$LOCATION" \
        postgresLocation="$POSTGRES_LOCATION" \
        containerImage="$BOOTSTRAP_IMAGE" \
        dbAdminPassword="$DB_ADMIN_PASSWORD" \
        provisionContainerApp=true \
    --output none
  echo "  ✓ Bootstrap complete"
else
  step "Skipping Bicep (regular deploy — no infra changes)"
  echo "  ${DIM}Regular deploys only update the container image via 'az containerapp update'.${NC}"
  echo "  ${DIM}Portal-managed secrets and env vars are preserved.${NC}"
  echo "  ${DIM}To refresh infra, run: ./deploy.sh --bootstrap${NC}"
fi

# ── 7. Get ACR details + current app URL ─────────────────────────────────
ACR_NAME=$(az acr list --resource-group "$RG" --query "[0].name" -o tsv)
ACR_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
APP_HOST=$(az containerapp show --name atveanimation --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)
APP_URL="https://${APP_HOST}"

# ── 8. Build image ─────────────────────────────────────────────────────────
step "Building Docker image"
docker build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  -t "${ACR_SERVER}/atveanimation:latest" \
  .
echo "  ✓ Image built"

# ── 9. Push to ACR ────────────────────────────────────────────────────────
step "Pushing image to Azure Container Registry"
az acr login --name "$ACR_NAME"
docker push "${ACR_SERVER}/atveanimation:latest"
echo "  ✓ Image pushed"

# ── 10. Deploy new image via az CLI (NOT Bicep) ──────────────────────────
# This is the key change: image updates go through `az containerapp update`
# which only replaces the container image. Env vars, secrets, ingress, and
# every other property is preserved. Bicep is NOT re-run here.
#
# --revision-suffix forces a new revision on every deploy. Without it, if
# the image tag stays :latest and the manifest digest is the same, Container
# Apps deduplicates — no new revision is created and the running pod keeps
# serving the OLD image. Epoch timestamp makes each revision uniquely named.
REVISION_SUFFIX="v$(date +%s)"
step "Updating Container App image (revision: $REVISION_SUFFIX, secrets + env preserved)"
az containerapp update \
  --name atveanimation \
  --resource-group "$RG" \
  --image "${ACR_SERVER}/atveanimation:latest" \
  --revision-suffix "$REVISION_SUFFIX" \
  --output none
echo "  ✓ Image updated on Container App"

# ── 11. Done ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ Deployed!${NC}"
echo -e "${GREEN}    $APP_URL${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [[ "$BOOTSTRAP" == "1" ]]; then
  warn "Post-bootstrap action required:"
  echo ""
  echo "  Portal → Container Apps → atveanimation → Settings → Secrets"
  echo "  Set VALUES for these secrets (Bicep just declared their names):"
  echo ""
  echo "    nextauth-secret            (openssl rand -hex 32)"
  echo "    replicate-api-token        (replicate.com dashboard)"
  echo "    anthropic-api-key          (console.anthropic.com)"
  echo "    fal-key                    (fal.ai dashboard)"
  echo "    webhook-secret             (openssl rand -hex 32 — also paste into fal.ai webhook config)"
  echo "    replicate-webhook-secret   (openssl rand -hex 32 — also paste into Replicate → Account → Webhook signing)"
  echo "    azure-comms-connection     (Azure Communication Services → Keys → primary connection string)"
  echo ""
  echo "  Then restart the Container App:"
  echo "    az containerapp revision restart --resource-group $RG --name atveanimation"
  echo ""
fi

echo "  Custom domain (optional):"
echo "    az containerapp hostname add --resource-group $RG --name atveanimation --hostname atveanimation.com"
echo "    az containerapp hostname bind --resource-group $RG --name atveanimation --hostname atveanimation.com --validation-method CNAME"
