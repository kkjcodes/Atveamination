import QRCode from "qrcode"

// End-card QR code. Points at the website when present, else tel: link.
// Rendered dark-on-white at high margin so phone cameras catch it against the
// dark end-card background.

export function qrTarget(website: string | null | undefined, phone: string | null | undefined): string | null {
  const site = website?.trim()
  if (site) return /^https?:\/\//i.test(site) ? site : `https://${site}`
  const tel = phone?.trim()
  if (tel) return `tel:${tel.replace(/[^\d+]/g, "")}`
  return null
}

export async function writeQrPng(data: string, outPath: string): Promise<void> {
  await QRCode.toFile(outPath, data, {
    type: "png",
    width: 512,
    margin: 2,
    color: { dark: "#1C1917", light: "#FFFFFF" },
  })
}
