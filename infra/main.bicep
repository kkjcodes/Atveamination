targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name prefix for all resources, e.g. "atveanimation-prod"')
param environmentName string

@minLength(1)
@description('Azure region, e.g. "eastus"')
param location string

@minLength(1)
@description('Azure region for PostgreSQL, e.g. "canadacentral"')
param postgresLocation string = location

@description('Container image to deploy, e.g. "myacr.azurecr.io/atveanimation:latest"')
param containerImage string

// Only used on first-time Postgres provisioning. Passed via deploy.sh.
@secure()
param dbAdminPassword string

// ── Container App management gate ─────────────────────────────────────────
// User-managed secret VALUES live in Container App → Secrets (Portal).
// Bicep re-declaring the Container App wipes them. So this flag controls
// whether Bicep touches the Container App at all.
//
// Set true only on: first-ever create, OR when adding a new secret name /
// changing env-var wiring / other Container App structural changes. Every
// other deploy uses `az containerapp update --image X` (bypasses Bicep
// for the Container App resource).
param provisionContainerApp bool = false

param appUrl string = ''

// ── Resource group ─────────────────────────────────────────────────────────
resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: '${environmentName}-rg'
  location: location
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    postgresLocation: postgresLocation
    environmentName: environmentName
    containerImage: containerImage
    dbAdminPassword: dbAdminPassword
    provisionContainerApp: provisionContainerApp
    appUrl: appUrl
  }
}

// ── Outputs consumed by azd ────────────────────────────────────────────────
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryLoginServer
output AZURE_RESOURCE_GROUP string = rg.name
output SERVICE_WEB_URI string = resources.outputs.appUri
output DATABASE_URL string = resources.outputs.databaseUrl
