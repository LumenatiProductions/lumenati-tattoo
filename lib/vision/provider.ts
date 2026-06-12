import Anthropic from "@anthropic-ai/sdk";

// Vision provider behind a small interface (POS 6d) so the snap features —
// receipt → expense, shelf → inventory count — are model-agnostic. Default is
// Claude; swapping in Gemini Flash later is a one-file change (add a
// geminiProvider and flip getProvider()). The app + the /api/vision route never
// change. SERVER ONLY.

export type VisionImage = { base64: string; mediaType: string };

export type ReceiptResult = {
  vendor: string | null;
  date: string | null; // ISO yyyy-mm-dd, best-effort
  amountCents: number;
  category: string; // supplies | equipment | rent | education | travel | other
};

export type InventoryItem = {
  name: string;
  brand: string | null;
  category: string; // needle | ink | glove | tube | aftercare | disposable | other
  estimatedQty: number;
  unit: string; // each | box | bottle
};

export type CashCount = {
  stacks: { denominationCents: number; count: number }[];
  totalCents: number;
  caveat: string | null; // anything that makes the count unreliable
};

export interface VisionProvider {
  receipt(img: VisionImage): Promise<ReceiptResult>;
  inventory(img: VisionImage): Promise<InventoryItem[]>;
  cash(img: VisionImage): Promise<CashCount>;
}

// Pull the first JSON value out of a model response, tolerating prose/code fences.
function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error("No JSON in vision response");
  // Walk to the matching close so trailing prose doesn't break the parse.
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === open) depth++;
    else if (body[i] === close && --depth === 0) {
      return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  return JSON.parse(body.slice(start)) as T;
}

const RECEIPT_PROMPT = `You read a photo of a receipt for a tattoo shop and extract structured data.
Return ONLY a JSON object, no prose:
{"vendor": string|null, "date": "YYYY-MM-DD"|null, "amountCents": integer, "category": one of "supplies"|"equipment"|"rent"|"education"|"travel"|"other"}
amountCents is the TOTAL in cents (e.g. $42.50 -> 4250). Best-effort the date and category; default category "supplies".`;

const INVENTORY_PROMPT = `You read a photo of a tattoo shop's supply shelf/drawer and list what you see.
Return ONLY a JSON array, no prose. Each element:
{"name": string, "brand": string|null, "category": one of "needle"|"ink"|"glove"|"tube"|"aftercare"|"disposable"|"other", "estimatedQty": integer, "unit": one of "each"|"box"|"bottle"}
estimatedQty is a ROUGH count for a human to confirm — do not overthink it. Only list items you can actually identify.`;

const CASH_PROMPT = `You read a photo of US cash laid out on a counter (a tattoo shop counting a drawer or a payment) and count the bills.
Return ONLY a JSON object, no prose:
{"stacks": [{"denominationCents": integer, "count": integer}], "totalCents": integer, "caveat": string|null}
denominationCents: 100, 200, 500, 1000, 2000, 5000 or 10000. Count ONLY bills you can individually see — bills should be spread out, not stacked.
If bills overlap or are stacked so you cannot count them reliably, count what you can see and explain the problem in caveat (e.g. "the twenties are stacked — fan them out and re-snap").
Ignore coins; if there are visibly a lot of coins, mention it in caveat. If there is no US currency in the photo, return {"stacks": [], "totalCents": 0, "caveat": "no cash visible"}.`;

class ClaudeProvider implements VisionProvider {
  private client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async ask(img: VisionImage, prompt: string): Promise<string> {
    // claude-opus-4-8 vision. No thinking field = no thinking (fast); the JSON
    // instruction keeps the output clean for parsing.
    const msg = await this.client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: prompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: img.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: img.base64,
              },
            },
            { type: "text", text: "Extract the data as instructed." },
          ],
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }

  async receipt(img: VisionImage): Promise<ReceiptResult> {
    const r = parseJson<Partial<ReceiptResult>>(await this.ask(img, RECEIPT_PROMPT));
    return {
      vendor: r.vendor ?? null,
      date: r.date ?? null,
      amountCents: Math.max(0, Math.round(Number(r.amountCents) || 0)),
      category: r.category || "supplies",
    };
  }

  async cash(img: VisionImage): Promise<CashCount> {
    const r = parseJson<Partial<CashCount>>(await this.ask(img, CASH_PROMPT));
    const stacks = (Array.isArray(r.stacks) ? r.stacks : [])
      .map((s) => ({
        denominationCents: Math.round(Number(s?.denominationCents) || 0),
        count: Math.max(0, Math.round(Number(s?.count) || 0)),
      }))
      .filter((s) => s.denominationCents > 0 && s.count > 0);
    // Trust the itemized stacks over the model's own arithmetic.
    const totalCents = stacks.reduce((a, s) => a + s.denominationCents * s.count, 0);
    return { stacks, totalCents, caveat: r.caveat ? String(r.caveat) : null };
  }

  async inventory(img: VisionImage): Promise<InventoryItem[]> {
    const items = parseJson<Partial<InventoryItem>[]>(await this.ask(img, INVENTORY_PROMPT));
    return (Array.isArray(items) ? items : [])
      .filter((i) => i && i.name)
      .map((i) => ({
        name: String(i.name),
        brand: i.brand ?? null,
        category: i.category || "other",
        estimatedQty: Math.max(0, Math.round(Number(i.estimatedQty) || 0)),
        unit: i.unit || "each",
      }));
  }
}

export const visionConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

// The single swap point. To default to Gemini Flash later: implement a
// GeminiProvider (plain fetch to the Google API) and return it here when
// VISION_PROVIDER=gemini + GEMINI_API_KEY is set.
export function getProvider(): VisionProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new ClaudeProvider(key);
}
