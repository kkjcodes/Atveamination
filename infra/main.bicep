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

// ── Runtime secrets (passed via azd env or CI secrets) ───────────────────
@secure()
param dbAdminPassword string

@secure()
param nextAuthSecret string

@secure()
param replicateApiToken string

@secure()
param anthropicApiKey string

@secure()
param falKey string

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
    nextAuthSecret: nextAuthSecret
    replicateApiToken: replicateApiToken
    anthropicApiKey: anthropicApiKey
    falKey: falKey
    appUrl: appUrl
  }
}

// ── Outputs consumed by azd ────────────────────────────────────────────────
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryLoginServer
output AZURE_RESOURCE_GROUP string = rg.name
output SERVICE_WEB_URI string = resources.outputs.appUri
output DATABASE_URL string = resources.outputs.databaseUrl
