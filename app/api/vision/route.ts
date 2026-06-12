import { NextResponse } from "next/server";
import { userFromBearer } from "@/lib/api-auth";
import { getProvider, visionConfigured } from "@/lib/vision/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Bearer-authed (app) vision endpoint (POS 6d). The app sends a photo; we return
// structured data for the human to confirm — a receipt → an expense, or a shelf
// → a rough inventory count. Model-agnostic via lib/vision/provider.
export async function POST(req: Request) {
  if (!visionConfigured) {
    return NextResponse.json({ error: "Vision not configured." }, { status: 503 });
  }
  const me = await userFromBearer(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    kind?: string;
    imageBase64?: string;
    mediaType?: string;
  };
  if (!b.imageBase64) return NextResponse.json({ error: "Missing image" }, { status: 400 });
  const img = { base64: b.imageBase64, mediaType: b.mediaType || "image/jpeg" };

  const provider = getProvider();
  if (!provider) return NextResponse.json({ error: "Vision not configured." }, { status: 503 });

  try {
    if (b.kind === "inventory") {
      return NextResponse.json({ items: await provider.inventory(img) });
    }
    if (b.kind === "cash") {
      return NextResponse.json({ cash: await provider.cash(img) });
    }
    return NextResponse.json({ receipt: await provider.receipt(img) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read the photo." },
      { status: 502 },
    );
  }
}
