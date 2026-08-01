param location string
param postgresLocation string
param environmentName string
param containerImage string

// Only used on first-time provisioning of the DB. Bicep sets this ONCE when
// Postgres is created; changing later requires updating the DB directly.
@secure()
param dbAdminPassword string

// ── Container App management gate ─────────────────────────────────────────
// The Container App resource is only re-declared by Bicep when explicitly
// requested. Reason: re-declaring wipes the `secrets` array (Container Apps
// PUT semantics — the array is source-of-truth every deploy). We want
// Portal-managed secrets to survive subsequent deploys.
//
// Flow:
//   First-time provisioning (Container App doesn't exist yet):
//     deploy.sh detects absence → passes provisionContainerApp=true →
//     Bicep creates Container App with empty user-secret placeholders →
//     user then sets values in Portal.
//
//   Subsequent deploys (Container App exists):
//     deploy.sh passes provisionContainerApp=false → Bicep skips the app →
//     deploy.sh runs `az containerapp update --image X` for image bumps.
//     Portal-managed secrets untouched.
//
// New env vars OR new secret NAMES: bump this to true for one deploy, then
// re-populate any user secrets in Portal that Bicep placeholder'd to empty.
param provisionContainerApp bool = false

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

// ── Container App (guarded — only touched on first-time bootstrap) ──────
//
// User-secret VALUES are managed in Portal → Container App → Secrets. Bicep
// only sets the acr-password (which it derives from the ACR resource
// itself) and declares placeholder empty values for named user-secrets so
// env-var `secretRef` references resolve on first-time provisioning.
//
// After first-time provisioning, subsequent Bicep runs pass
// provisionContainerApp=false, and this resource is skipped entirely.
// Portal-managed secret values survive because Bicep never touches them.
//
// If you add a new secret NAME later, set provisionContainerApp=true for
// ONE deploy to make Bicep re-declare the secrets array, then re-populate
// the placeholder-cleared values in Portal.
resource app 'Microsoft.App/containerApps@2023-05-01' = if (provisionContainerApp) {
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
        // Bicep-derived (safe to overwrite — comes from ACR resource lookup):
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        // User-managed placeholders. Set actual values in Portal after
        // first-time provisioning. Empty string here means env vars come
        // up empty and code paths that check `!process.env.X` skip cleanly
        // (e.g. webhook verify returns 401 until you set WEBHOOK_SECRET).
        { name: 'nextauth-secret', value: '' }
        { name: 'replicate-api-token', value: '' }
        { name: 'anthropic-api-key', value: '' }
        { name: 'fal-key', value: '' }
        { name: 'webhook-secret', value: '' }
        { name: 'replicate-webhook-secret', value: '' }
        { name: 'azure-comms-connection', value: '' }
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
            // Webhook HMAC secret — verified in lib/webhooks/verify.ts.
            // fal.ai and Replicate callbacks 401 without it.
            { name: 'WEBHOOK_SECRET', secretRef: 'webhook-secret' }
            { name: 'REPLICATE_WEBHOOK_SECRET', secretRef: 'replicate-webhook-secret' }
            // Azure Communication Services — password reset email sender.
            { name: 'AZURE_COMMUNICATION_CONNECTION_STRING', secretRef: 'azure-comms-connection' }
            // Kill switch: unset means off. Set to "1" via portal for
            // ops-controlled pause of all model-calling routes.
            { name: 'KILL_SWITCH', value: '' }
            // Cost cap — set via Portal to override the '' default.
            { name: 'MAX_MONTHLY_MODEL_CALLS', value: '' }
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
// appUri output only makes sense when we own the Container App resource
// on this run. deploy.sh falls back to `az containerapp show` when this
// is empty (subsequent deploys where provisionContainerApp=false).
output appUri string = provisionContainerApp ? 'https://${app.properties.configuration.ingress.fqdn}' : ''
output databaseUrl string = 'postgresql://${dbUser}:***@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'
output AZURE_STORAGE_ACCOUNT_NAME string = storageAccount.name
output DATABASE_SERVER_FQDN string = postgres.properties.fullyQualifiedDomainName
