import { NextRequest, NextResponse } from "next/server";
import youtubesearchapi from "youtube-search-api";

type SearchItem = {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
};

function mapItem(item: any): SearchItem | null {
  if (!item?.id || !item?.title) return null;

  const thumbnail =
    item.thumbnail?.thumbnails?.[0]?.url ??
    item.thumbnail?.thumbnails?.slice?.(-1)?.[0]?.url ??
    "";

  return {
    id: item.id,
    title: item.title,
    thumbnail,
    url: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (!query) {
      const suggestions = await youtubesearchapi.GetSuggestData(8);
      const items = (suggestions.items ?? []).map(mapItem).filter(Boolean);
      return NextResponse.json({ items }, { status: 200 });
    }

    const results = await youtubesearchapi.GetListByKeyword(query, false, 8, [{ type: "video" }]);
    const items = (results.items ?? []).map(mapItem).filter(Boolean);
    return NextResponse.json({ items }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Failed to search YouTube" },
      { status: 500 },
    );
  }
}
