import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prismaClient } from '@/app/lib/db'

const JoinRoom = z.object({ code: z.string(), password: z.string().optional() })

export async function POST(req: NextRequest) {
  try {
    const data = JoinRoom.parse(await req.json())
    const room = await prismaClient.room.findUnique({ where: { code: data.code } })
    if (!room) return NextResponse.json({ message: 'Room not found' }, { status: 404 })
    if (room.password && room.password !== data.password) return NextResponse.json({ message: 'Invalid password' }, { status: 401 })
    return NextResponse.json({ roomId: room.id, code: room.code })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 400 })
  }
}
