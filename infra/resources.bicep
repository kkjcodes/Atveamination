param location string
param postgresLocation string
param environmentName string
param containerImage string

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

param appUrl string

var appName = 'atveanimation'
var acrName = replace('${environmentName}acr', '-', '')
var dbUser = 'atveadmin'
var dbName = 'atveanimation'
var blobContainer = 'atveanimation'

// ── Container Registry ─────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// ── Log Analytics (required by Container Apps) ─────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${environmentName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ── Container Apps Environment ─────────────────────────────────────────────
resource caEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${environmentName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ── PostgreSQL Flexible Server ─────────────────────────────────────────────
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${environmentName}-pg-${replace(postgresLocation, ' ', '')}'
  location: postgresLocation
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: dbUser
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource appDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: dbName
}

// ── Firewall rule: allow Azure services to connect ─────────────────────────
resource pgFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Storage Account for blob uploads ──────────────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: replace('${environmentName}store', '-', '')
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: { accessTier: 'Hot', allowBlobPublicAccess: true }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource appContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: blobContainer
  properties: { publicAccess: 'Blob' }
}

// ── Container App ──────────────────────────────────────────────────────────
resource app 'Microsoft.App/containerApps@2023-05-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'nextauth-secret', value: nextAuthSecret }
        { name: 'replicate-api-token', value: replicateApiToken }
        { name: 'anthropic-api-key', value: anthropicApiKey }
        { name: 'fal-key', value: falKey }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: containerImage
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              value: 'postgresql://${dbUser}:${dbAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'
            }
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
            }
            { name: 'AZURE_STORAGE_CONTAINER_NAME', value: blobContainer }
            { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret' }
            {
              name: 'NEXTAUTH_URL'
              value: empty(appUrl) ? 'https://${appName}.${caEnv.properties.defaultDomain}' : appUrl
            }
            { name: 'REPLICATE_API_TOKEN', secretRef: 'replicate-api-token' }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'FAL_KEY', secretRef: 'fal-key' }
            {
              name: 'NEXT_PUBLIC_APP_URL'
              value: empty(appUrl) ? 'https://${appName}.${caEnv.properties.defaultDomain}' : appUrl
            }
            { name: 'NODE_ENV', value: 'production' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: { metadata: { concurrentRequests: '20' } }
          }
        ]
      }
    }
  }
}

output registryLoginServer string = acr.properties.loginServer
output appUri string = 'https://${app.properties.configuration.ingress.fqdn}'
output databaseUrl string = 'postgresql://${dbUser}:***@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'
output AZURE_STORAGE_ACCOUNT_NAME string = storageAccount.name
output DATABASE_SERVER_FQDN string = postgres.properties.fullyQualifiedDomainName
