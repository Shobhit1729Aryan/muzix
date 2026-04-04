import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prismaClient } from '@/app/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

const CreateRoom = z.object({ password: z.string().optional() })

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any) as {
      user?: { email?: string | null }
    } | null
    if (!session?.user?.email) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

    const data = CreateRoom.parse(await req.json())
    const code = crypto.randomUUID().slice(0, 8)

    // Ensure Prisma client has the Room model generated
    if (!('room' in prismaClient) || typeof (prismaClient as any).room === 'undefined') {
      console.error('Prisma client missing `room` model. Have you run `prisma generate` after updating schema?')
      return NextResponse.json({ message: 'Prisma client missing `room` model. Run `npx prisma generate` and apply migrations.' }, { status: 500 })
    }

    // find or create the user record
    let user = await prismaClient.user.findFirst({ where: { email: session.user.email } })
    if (!user) {
      user = await prismaClient.user.create({
        data: {
          email: session.user.email,
          provider: 'Google',
        },
      })
    }

    const room = await (prismaClient as any).room.create({
      data: {
        code,
        password: data.password ?? null,
        hostId: user.id
      }
    })

    return NextResponse.json({ roomId: room.id, code: room.code })
  } catch (e: any) {
    console.error('Error creating room:', e)
    // return stack during local development to help debugging
    const body: any = { message: e?.message || 'Server error' }
    if (process.env.NODE_ENV !== 'production') body.stack = e?.stack
    return NextResponse.json(body, { status: 500 })
  }
}
