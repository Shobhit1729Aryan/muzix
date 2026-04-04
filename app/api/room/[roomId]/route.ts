import { NextRequest, NextResponse } from 'next/server'
import { prismaClient } from '@/app/lib/db'

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.pathname.split('/').pop()
  if (!roomId) return NextResponse.json({ message: 'Missing room id' }, { status: 400 })
  const room = await prismaClient.room.findUnique({ where: { id: roomId }, include: { users: { include: { user: true } }, songs: true } })
  if (!room) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  return NextResponse.json({ room })
}
