#!/usr/bin/env bash
set -euo pipefail

# ── AtVeAnimation — deploy using az CLI (no azd Bicep provider needed) ────
# Usage: ./deploy.sh [--env <name>] [--location <region>]

ENV_NAME="atveanimation-prod"
LOCATION="eastus"
POSTGRES_LOCATION="canadacentral"

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)               ENV_NAME="$2";          shift 2 ;;
    --location)          LOCATION="$2";           shift 2 ;;
    --postgres-location) POSTGRES_LOCATION="$2";  shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${GREEN}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $*${NC}"; }
fatal() { echo -e "${RED}✗ $*${NC}"; exit 1; }

SECRETS_FILE="$HOME/.atveanimation-secrets"

save_secrets() {
  cat > "$SECRETS_FILE" <<EOF
REPLICATE_API_TOKEN="$REPLICATE_API_TOKEN"
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
FAL_KEY="$FAL_KEY"
DB_ADMIN_PASSWORD="$DB_ADMIN_PASSWORD"
NEXT_AUTH_SECRET="$NEXT_AUTH_SECRET"
EOF
  chmod 600 "$SECRETS_FILE"
}

prompt_secret() {
  local var="$1" label="$2"
  if [[ -n "${!var:-}" ]]; then
    echo "  ✓ $label already set"
  else
    printf "  Enter %s: " "$label"
    read -rs val; echo
    [[ -z "$val" ]] && fatal "$label is required"
    export "$var"="$val"
  fi
}

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

# ── 3. Secrets ────────────────────────────────────────────────────────────
step "Collecting secrets"

# Load from saved secrets file if available
if [[ -f "$SECRETS_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +o allexport
  echo "  ✓ Loaded saved secrets"
fi

# Auto-generate if missing
if [[ -z "${DB_ADMIN_PASSWORD:-}" ]]; then
  DB_ADMIN_PASSWORD="$(openssl rand -hex 20)"
  echo "  ✓ DB_ADMIN_PASSWORD auto-generated"
fi
if [[ -z "${NEXT_AUTH_SECRET:-}" ]]; then
  NEXT_AUTH_SECRET="$(openssl rand -hex 32)"
  echo "  ✓ NEXT_AUTH_SECRET auto-generated"
fi

prompt_secret REPLICATE_API_TOKEN "Replicate API token"
prompt_secret ANTHROPIC_API_KEY   "Anthropic API key"
prompt_secret FAL_KEY             "fal.ai API key"

save_secrets

# ── 4. Resource group ──────────────────────────────────────────────────────
RG="${ENV_NAME}-rg"
step "Creating resource group: $RG"
az group create --name "$RG" --location "$LOCATION" --output none
echo "  ✓ $RG ready"

# ── 5. Get ACR details (create if first run) ──────────────────────────────
# Provision ACR first so we have a registry to push to
step "Provisioning Azure resources (5–7 min)"
ACR_NAME="${ENV_NAME//[-_]/}acr"
ACR_SERVER="${ACR_NAME}.azurecr.io"

# First pass: provision all infrastructure, use a tiny placeholder only for
# the very first deploy when no real image exists yet
EXISTING_IMAGE=$(az containerapp show --name atveanimation --resource-group "$RG" \
  --query "properties.template.containers[0].image" -o tsv 2>/dev/null || echo "")

if [[ -z "$EXISTING_IMAGE" || "$EXISTING_IMAGE" == *"helloworld"* ]]; then
  BOOTSTRAP_IMAGE="mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
else
  BOOTSTRAP_IMAGE="$EXISTING_IMAGE"
fi

az deployment sub create \
  --name "${ENV_NAME}-deploy" \
  --location "$LOCATION" \
  --template-file infra/main.bicep \
  --parameters \
      environmentName="$ENV_NAME" \
      location="$LOCATION" \
      postgresLocation="$POSTGRES_LOCATION" \
      containerImage="$BOOTSTRAP_IMAGE" \
      dbAdminPassword="$DB_ADMIN_PASSWORD" \
      nextAuthSecret="$NEXT_AUTH_SECRET" \
      replicateApiToken="$REPLICATE_API_TOKEN" \
      anthropicApiKey="$ANTHROPIC_API_KEY" \
      falKey="$FAL_KEY" \
  --output none
echo "  ✓ Infrastructure provisioned"

# ── 6. Get ACR details ─────────────────────────────────────────────────────
ACR_NAME=$(az acr list --resource-group "$RG" --query "[0].name" -o tsv)
ACR_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
APP_URL=$(az containerapp show --name atveanimation --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || echo "")
APP_URL="https://${APP_URL}"

step "Building Docker image"
docker build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  -t "${ACR_SERVER}/atveanimation:latest" \
  .
echo "  ✓ Image built"

# ── 7. Push to ACR ────────────────────────────────────────────────────────
step "Pushing image to Azure Container Registry"
az acr login --name "$ACR_NAME"
docker push "${ACR_SERVER}/atveanimation:latest"
echo "  ✓ Image pushed"

# ── 8. Final deploy with real image via Bicep ─────────────────────────────
step "Deploying real image (preserves all env vars)"
az deployment sub create \
  --name "${ENV_NAME}-deploy" \
  --location "$LOCATION" \
  --template-file infra/main.bicep \
  --parameters \
      environmentName="$ENV_NAME" \
      location="$LOCATION" \
      postgresLocation="$POSTGRES_LOCATION" \
      containerImage="${ACR_SERVER}/atveanimation:latest" \
      dbAdminPassword="$DB_ADMIN_PASSWORD" \
      nextAuthSecret="$NEXT_AUTH_SECRET" \
      replicateApiToken="$REPLICATE_API_TOKEN" \
      anthropicApiKey="$ANTHROPIC_API_KEY" \
      falKey="$FAL_KEY" \
  --output none
echo "  ✓ Container App updated with real image + env vars"

# ── 9. Done ───────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ Deployed!${NC}"
echo -e "${GREEN}    $APP_URL${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
warn "Next: point atveanimation.com at this app"
echo "  1. In your DNS registrar add:"
echo "     CNAME  @  →  $(echo "$APP_URL" | sed 's|https://||')"
echo ""
echo "  2. Then run:"
echo "     az containerapp hostname add --resource-group $RG --name atveanimation --hostname atveanimation.com"
echo "     az containerapp hostname bind --resource-group $RG --name atveanimation --hostname atveanimation.com --validation-method CNAME"
