import { prismaClient } from "@/app/lib/db";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
const UpvoteSchema = z.object({
    streamId:z.string(),
})
export async function POST(req:NextRequest) {
    const session = await getServerSession() as {
        user?: { email?: string | null }
    } | null;
   
    const user=await prismaClient.user.findFirst({
        where:{
            email:session?.user?.email ?? "",
        }
    })
     if(!session?.user?.email) {
        return NextResponse.json({message:"Unauthorized"}, {status:401})
    }
 
    try {
        const data = UpvoteSchema.parse(await req.json());
        await prismaClient.upvote.create({
            data:{
                userId:user?.id ?? "",
                streamId:data.streamId,
            }
        });
        return NextResponse.json({ message: "Upvoted" }, { status: 200 })
    } catch(e){
        return NextResponse.json({message:"Invalid request body"}, {status:411})
    }
}
export async function GET(req:NextRequest) {
const createrId=req.nextUrl.searchParams.get("createrId") ?? "";
const streams=await prismaClient.stream.findMany({
    where:{
        userId:createrId ?? "",
    },
})
return NextResponse.json(streams)
}
