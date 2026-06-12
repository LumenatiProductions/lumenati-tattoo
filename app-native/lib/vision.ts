import * as ImagePicker from "expo-image-picker";
import { apiPost } from "./appApi";

// Snap features (POS 6d): take a photo, send it to /api/vision, get structured
// data back to confirm. Camera on a phone, library picker on web / no-camera.

export type ReceiptResult = {
  vendor: string | null;
  date: string | null;
  amountCents: number;
  category: string;
};
export type InventoryItem = {
  name: string;
  brand: string | null;
  category: string;
  estimatedQty: number;
  unit: string;
};

async function capture(): Promise<{ base64: string; mediaType: string } | null> {
  const cam = await ImagePicker.requestCameraPermissionsAsync();
  const opts: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.6, allowsEditing: false };
  const res = cam.granted
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  const a = res.assets[0];
  return { base64: a.base64!, mediaType: a.mimeType ?? "image/jpeg" };
}

export async function snapReceipt(): Promise<{ ok: boolean; receipt?: ReceiptResult; error?: string }> {
  const img = await capture();
  if (!img) return { ok: false, error: "canceled" };
  const r = await apiPost<{ receipt: ReceiptResult }>("/api/vision", {
    kind: "receipt",
    imageBase64: img.base64,
    mediaType: img.mediaType,
  });
  return r.ok && r.data?.receipt ? { ok: true, receipt: r.data.receipt } : { ok: false, error: r.error };
}

export type CashCount = {
  stacks: { denominationCents: number; count: number }[];
  totalCents: number;
  caveat: string | null;
};

export async function snapCash(): Promise<{ ok: boolean; cash?: CashCount; error?: string }> {
  const img = await capture();
  if (!img) return { ok: false, error: "canceled" };
  const r = await apiPost<{ cash: CashCount }>("/api/vision", {
    kind: "cash",
    imageBase64: img.base64,
    mediaType: img.mediaType,
  });
  return r.ok && r.data?.cash ? { ok: true, cash: r.data.cash } : { ok: false, error: r.error };
}

export async function snapInventory(): Promise<{ ok: boolean; items?: InventoryItem[]; error?: string }> {
  const img = await capture();
  if (!img) return { ok: false, error: "canceled" };
  const r = await apiPost<{ items: InventoryItem[] }>("/api/vision", {
    kind: "inventory",
    imageBase64: img.base64,
    mediaType: img.mediaType,
  });
  return r.ok ? { ok: true, items: r.data?.items ?? [] } : { ok: false, error: r.error };
}
