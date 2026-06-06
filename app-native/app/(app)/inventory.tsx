import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Card, Button } from "@/components/ui";
import { LabeledInput, Chips } from "@/components/form";
import { snapInventory, type InventoryItem as Detected } from "@/lib/vision";

const CATS = ["needle", "ink", "glove", "tube", "aftercare", "disposable", "other"];
const UNITS = ["each", "box", "bottle"];

type Item = { id: string; name: string; brand: string | null; category: string; qty: number; reorder_at: number; unit: string };

const isLow = (i: Item) => Number(i.qty) <= Number(i.reorder_at);

// Inventory ported to the app (POS 6e) + the snap-to-count from 6d wired in.
// Reads/writes inventory_items directly under RLS (owner/frontdesk). Artists get
// an empty list (RLS), which is correct.
export default function Inventory() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [detected, setDetected] = useState<Detected[]>([]);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, brand, category, qty, reorder_at, unit")
      .order("category")
      .order("name");
    setItems((data ?? []) as Item[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const adjust = async (id: string, delta: number) => {
    setItems((p) => p.map((i) => (i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i)));
    const cur = items.find((i) => i.id === id);
    const next = Math.max(0, (cur?.qty ?? 0) + delta);
    const { error } = await supabase.from("inventory_items").update({ qty: next, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) load();
  };

  const scan = async () => {
    setScanning(true);
    setNote(null);
    const r = await snapInventory();
    setScanning(false);
    if (r.ok && r.items) {
      setDetected(r.items);
      if (!r.items.length) setNote("Didn't spot anything to add — try a closer photo.");
    } else if (r.error && r.error !== "canceled") {
      setNote(r.error);
    }
  };

  const addDetected = async (d: Detected, idx: number) => {
    await supabase.from("inventory_items").insert({
      name: d.name,
      brand: d.brand,
      category: d.category,
      qty: d.estimatedQty,
      unit: d.unit,
    });
    setDetected((p) => p.filter((_, i) => i !== idx));
    load();
  };

  const low = items.filter(isLow);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Inventory", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label={scanning ? "Reading…" : "Snap to count"} tone="ghost" onPress={scan} disabled={scanning} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={adding ? "Cancel" : "Add item"} tone={adding ? "ghost" : "brand"} onPress={() => setAdding((v) => !v)} />
          </View>
        </View>
        {note && <Text style={styles.note}>{note}</Text>}
        {adding && <NewItem onSaved={() => { setAdding(false); load(); }} />}

        {detected.length > 0 && (
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.section}>Spotted — tap to add</Text>
            {detected.map((d, i) => (
              <View key={i} style={[styles.row, i > 0 && styles.border]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {d.brand ? `${d.brand} ` : ""}
                    {d.name}
                  </Text>
                  <Text style={styles.sub}>
                    {d.category} · ~{d.estimatedQty} {d.unit}
                  </Text>
                </View>
                <Pressable onPress={() => addDetected(d, i)} style={styles.addBtn}>
                  <Text style={styles.addText}>Add</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        {loading ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            {low.length > 0 && (
              <>
                <Text style={styles.section}>Needs reordering</Text>
                <Card style={{ padding: 0 }}>
                  {low.map((it, i) => (
                    <ItemRow key={it.id} it={it} onAdjust={adjust} border={i > 0} />
                  ))}
                </Card>
              </>
            )}

            <Text style={styles.section}>All stock</Text>
            <Card style={{ padding: 0 }}>
              {items.length === 0 ? (
                <Text style={styles.empty}>No items yet. Snap a shelf or add on the web.</Text>
              ) : (
                items.map((it, i) => <ItemRow key={it.id} it={it} onAdjust={adjust} border={i > 0} />)
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}

function NewItem({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("needle");
  const [unit, setUnit] = useState("each");
  const [qty, setQty] = useState("");
  const [reorderAt, setReorderAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("inventory_items").insert({
      name: name.trim(),
      category,
      unit,
      qty: Number(qty) || 0,
      reorder_at: Number(reorderAt) || 0,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <LabeledInput label="Name" value={name} onChange={setName} placeholder="e.g. 3RL cartridges" />
      <Chips label="Category" value={category} options={CATS} onChange={setCategory} />
      <Chips label="Unit" value={unit} options={UNITS} onChange={setUnit} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label="On hand" value={qty} onChange={setQty} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Reorder at" value={reorderAt} onChange={setReorderAt} keyboardType="numeric" placeholder="0" />
        </View>
      </View>
      {err && <Text style={styles.errText}>{err}</Text>}
      <Button label={busy ? "Saving…" : "Save item"} onPress={save} disabled={busy} />
    </Card>
  );
}

function ItemRow({ it, onAdjust, border }: { it: Item; onAdjust: (id: string, d: number) => void; border: boolean }) {
  return (
    <View style={[styles.row, border && styles.border]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>
          {it.brand ? `${it.brand} ` : ""}
          {it.name}
        </Text>
        <Text style={[styles.sub, isLow(it) && { color: theme.warn }]}>
          {it.category}
          {isLow(it) ? " · low" : ""}
        </Text>
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={() => onAdjust(it.id, -1)} style={styles.step} disabled={it.qty <= 0}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.qty}>{it.qty}</Text>
        <Pressable onPress={() => onAdjust(it.id, 1)} style={styles.step}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { color: theme.textDim, fontSize: 13, marginTop: 10 },
  section: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "600", marginTop: 22, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  name: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  step: { height: 30, width: 30, borderRadius: 8, borderColor: theme.border, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepText: { color: theme.text, fontSize: 18, lineHeight: 20 },
  qty: { color: theme.text, fontSize: 16, fontWeight: "700", minWidth: 28, textAlign: "center" },
  addBtn: { backgroundColor: theme.brand, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  addText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
  errText: { color: "#fb7185", fontSize: 13, marginBottom: 10 },
});
