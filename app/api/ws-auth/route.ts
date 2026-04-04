import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prismaClient } from "@/app/lib/db";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "dev_secret";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions as any) as {
    user?: { email?: string | null }
  } | null;
  if (!session?.user?.email) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let user = await prismaClient.user.findFirst({ where: { email: session.user.email } });
  if (!user) {
    user = await prismaClient.user.create({
      data: {
        email: session.user.email,
        provider: "Google",
      },
    });
  }

  const ts = Date.now().toString();
  const mac = crypto.createHmac("sha256", WS_TOKEN_SECRET).update(`${user.id}:${ts}`).digest("hex");
  const token = Buffer.from(`${user.id}:${ts}:${mac}`).toString("base64");
  return NextResponse.json({ token, userId: user.id });
}
