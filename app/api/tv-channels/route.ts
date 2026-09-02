import { NextResponse } from "next/server";
import { MUSIC_VIDEO_MIN, SHOP_TV_CHANNELS } from "@/lib/kiosk/tv-channels";

// The shop TV lineup for pickers (the phone app's My Page). Public, static.
export function GET() {
  return NextResponse.json(
    {
      musicVideoMin: MUSIC_VIDEO_MIN,
      channels: SHOP_TV_CHANNELS.map((c) => ({ id: c.id, num: c.num, name: c.name })),
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
