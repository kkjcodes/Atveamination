import { EmailClient } from "@azure/communication-email"

const FROM_ADDRESS = "AtVeAnimation <donotreply@atveanimation.com>"

function getClient(): EmailClient {
  const conn = process.env.AZURE_COMMUNICATION_CONNECTION_STRING
  if (!conn) throw new Error("AZURE_COMMUNICATION_CONNECTION_STRING not set")
  return new EmailClient(conn)
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = getClient()
  const poller = await client.beginSend({
    senderAddress: FROM_ADDRESS,
    recipients: { to: [{ address: to }] },
    content: { subject, html },
  })
  await poller.pollUntilDone()
}

export function passwordResetEmail(resetUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#7c3aed;margin-bottom:8px">Reset your password</h2>
      <p style="color:#52525b;margin-bottom:24px">
        Click the button below to set a new password. This link expires in 1 hour.
        If you did not request a reset, you can ignore this email.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Reset Password
      </a>
      <p style="color:#a1a1aa;font-size:12px;margin-top:32px">
        Or copy this link: ${resetUrl}
      </p>
      <hr style="border:none;border-top:1px solid #f4f4f5;margin:24px 0"/>
      <p style="color:#a1a1aa;font-size:12px">AtVeAnimation · You are receiving this because a password reset was requested for your account.</p>
    </div>
  `
}

export function adminContactEmail(subject: string, body: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#7c3aed;margin-bottom:8px">${subject}</h2>
      <div style="color:#52525b;line-height:1.6;white-space:pre-wrap">${body}</div>
      <hr style="border:none;border-top:1px solid #f4f4f5;margin:24px 0"/>
      <p style="color:#a1a1aa;font-size:12px">
        AtVeAnimation · You are receiving this because you have an account at atveanimation.com.<br/>
        To stop receiving non-transactional emails, reply to this message or contact contact@atveanimation.com.
      </p>
    </div>
  `
}
