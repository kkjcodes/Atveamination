import { BlobServiceClient } from "@azure/storage-blob"

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "atveanimation"

function getClient() {
  return BlobServiceClient.fromConnectionString(connectionString)
}

export async function uploadBlob(
  blobPath: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const client = getClient()
  const container = client.getContainerClient(containerName)
  await container.createIfNotExists({ access: "blob" })
  const blob = container.getBlockBlobClient(blobPath)
  await blob.uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } })
  return blob.url
}

export async function deleteBlob(blobPath: string): Promise<void> {
  const client = getClient()
  const blob = client.getContainerClient(containerName).getBlockBlobClient(blobPath)
  await blob.deleteIfExists()
}

// Deletes all blobs whose name starts with the given prefix.
export async function deleteBlobsByPrefix(prefix: string): Promise<void> {
  const container = getClient().getContainerClient(containerName)
  const deletes: Promise<void>[] = []
  for await (const item of container.listBlobsFlat({ prefix })) {
    deletes.push(container.getBlockBlobClient(item.name).deleteIfExists().then(() => {}))
  }
  await Promise.all(deletes)
}

// Extracts the blob path from an Azure Blob Storage URL.
// Works for both Azurite (local) and production Azure URLs.
export function urlToBlobPath(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean)
    const idx = parts.indexOf(containerName)
    if (idx === -1) return null
    return parts.slice(idx + 1).join("/")
  } catch {
    return null
  }
}

export async function mirrorUrlToBlob(sourceUrl: string, blobPath: string): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`)
  const contentType = res.headers.get("content-type") ?? "application/octet-stream"
  const data = Buffer.from(await res.arrayBuffer())
  return uploadBlob(blobPath, data, contentType)
}
