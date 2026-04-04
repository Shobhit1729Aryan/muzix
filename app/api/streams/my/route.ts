import { prismaClient } from "@/app/lib/db";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession();
  const user = await prismaClient.user.findFirst({
    where: {
      email: session?.user?.email ?? "",
    },
  });

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const streams = await prismaClient.stream.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      id: "desc",
    },
  });

  return NextResponse.json(streams, { status: 200 });
}
