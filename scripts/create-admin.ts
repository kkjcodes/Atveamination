/**
 * Creates or resets the admin user.
 * Run with: npx tsx scripts/create-admin.ts
 *
 * Prints the one-time password once — copy it immediately.
 * The plain-text password is never stored.
 */
import { prisma } from "@/lib/db/client"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"

const ADMIN_EMAIL = "admin@atveanimation.com"
const ADMIN_NAME  = "SeriousKK7189"

function generateOTP(): string {
  // 4 groups of 4 alphanumeric chars separated by dashes, e.g. X3kP-9mQr-T2nA-8vWs
  return Array.from({ length: 4 }, () =>
    randomBytes(3).toString("base64url").slice(0, 4)
  ).join("-")
}

async function main() {
  const otp      = generateOTP()
  const hashed   = await bcrypt.hash(otp, 12)

  await prisma.user.upsert({
    where:  { email: ADMIN_EMAIL },
    update: { password: hashed, role: "ADMIN", name: ADMIN_NAME },
    create: { email: ADMIN_EMAIL, password: hashed, name: ADMIN_NAME, role: "ADMIN" },
  })

  console.log("\n✅ Admin user created / reset")
  console.log("   Email   :", ADMIN_EMAIL)
  console.log("   Username:", ADMIN_NAME)
  console.log("   Password:", otp)
  console.log("\n⚠️  Copy this password now — it will not be shown again.\n")
}

main().catch((e) => { console.error(e); process.exit(1) })
