import { prismaClient } from "@/app/lib/db";
import { url } from "inspector";
import { NextRequest, NextResponse } from "next/server";
import {z} from "zod";
import youtubesearchapi from "youtube-search-api";

 var YT_REGEX = /^(?:(?:https?:)?\/\/)?(?:www\.)?(?:m\.)?(?:youtu(?:be)?\.com\/(?:v\/|embed\/|watch(?:\/|\?v=))|youtu\.be\/)((?:\w|-){11})(?:\S+)?$/;
const CreateStreamSchema = z.object({
    creatorId:z.string(),
    url:z.string() //youtube ,spotify 
})


export async function POST(req:NextRequest){
  try{
    const data = CreateStreamSchema.parse(await req.json());

    const isYt = data.url.match(YT_REGEX);
    if(!isYt) {
      return NextResponse.json({message:"Only youtube url is allowed"}, {status:400})
    }

    const extractId = isYt[1]; // better extraction

    // 👇 PUT YOUR BLOCK HERE
    let videoDetails: any;
    try {
      videoDetails = await youtubesearchapi.GetVideoDetails(extractId);
    } catch (err) {
      console.log("YT ERROR:", err);
      return NextResponse.json(
        { message: "Failed to fetch video details" },
        { status: 400 }
      );
    }

    // 👇 then Prisma create
    const stream = await prismaClient.stream.create({
      data:{
        userId: data.creatorId,
        url: data.url,
        extractedId: extractId,
        type: "Youtube",
        title: videoDetails.title ?? "Unknown",
        smallImg: videoDetails.thumbnail.thumbnails[0].url,
        bigImg: videoDetails.thumbnail.thumbnails.slice(-1)[0].url
      }
    });

   return NextResponse.json({
  message: "Stream created successfully",
  id: stream.id,
  title: videoDetails?.title,
  smallImg: videoDetails?.thumbnail?.thumbnails?.[0]?.url,
  bigImg: videoDetails?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url
}, { status: 201 })

  }catch (e: any) {
  console.log("ACTUAL ERROR => ", e);
  return NextResponse.json(
    { message: e?.message || "Invalid request body" },
    { status: 400 }
  );
}
}
export async function GET(req: NextRequest) {
  try {
    const creatorId = req.nextUrl.searchParams.get("creatorId");

    if (!creatorId) {
      return NextResponse.json(
        { message: "creatorId query param required" },
        { status: 400 }
      );
    }

    const streams = await prismaClient.stream.findMany({
      where: { userId: creatorId },
      orderBy: { id: "desc" }
    });

    return NextResponse.json(streams, { status: 200 });
  } catch (e: any) {
    console.log("GET ERROR =>", e);
    return NextResponse.json(
      { message: "Failed to fetch streams" },
      { status: 500 }
    );
  }
}