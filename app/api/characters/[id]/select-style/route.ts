import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 })
  }

  const { option_id } = await req.json()
  if (!option_id) {
    return NextResponse.json({ error: "option_id is required" }, { status: 400 })
  }

  const option = await prisma.characterOption.findFirst({
    where: { id: option_id, characterId: id },
  })
  if (!option) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 })
  }

  await prisma.character.update({
    where: { id },
    data: { selectedStyleUrl: option.styleUrl, selectedStyle: option.styleName },
  })

  return NextResponse.json({ success: true })
}
