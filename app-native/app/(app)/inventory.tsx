import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { Card, Button } from "@/components/ui";
import { LabeledInput, Chips } from "@/components/form";
import { snapInventory, type InventoryItem as Detected } from "@/lib/vision";

const CATS = ["needle", "ink", "glove", "tube", "aftercare", "disposable", "other"];
const UNITS = ["each", "box", "bottle"];

type Item = { id: string; name: string; brand: string | null; category: string; qty: number; reorder_at: number; unit: string; price_cents: number | null };

const isLow = (i: Item) => Number(i.qty) <= Number(i.reorder_at);
// Merch = an item with a shelf price (it shows up in Take payment). Everything
// else is a supply.
const isMerch = (i: Item) => Number(i.price_cents ?? 0) > 0;

// Inventory ported to the app (POS 6e) + the snap-to-count from 6d wired in.
// Reads/writes inventory_items directly under RLS (admin). Artists get
// an empty list (RLS), which is correct.
export default function Inventory() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [detected, setDetected] = useState<Detected[]>([]);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, brand, category, qty, reorder_at, unit, price_cents")
      .order("category")
      .order("name");
    setItems((data ?? []) as Item[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    setItems((p) => p.filter((i) => i.id !== id));
    await supabase.from("inventory_items").delete().eq("id", id);
  };

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
  const merch = items.filter(isMerch);
  const supplies = items.filter((i) => !isMerch(i));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Inventory", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label={scanning ? "Reading…" : "Snap to count"} tone="ghost" onPress={scan} disabled={scanning} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={adding || editing ? "Cancel" : "Add item"}
              tone={adding || editing ? "ghost" : "brand"}
              onPress={() => {
                setEditing(null);
                setAdding((v) => !v);
              }}
            />
          </View>
        </View>
        {note && <Text style={styles.note}>{note}</Text>}
        {(adding || editing) && (
          <ItemForm
            existing={editing ?? undefined}
            onSaved={() => {
              setAdding(false);
              setEditing(null);
              load();
            }}
          />
        )}

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
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            {low.length > 0 && (
              <>
                <Text style={styles.section}>Needs reordering</Text>
                <Card style={{ padding: 0 }}>
                  {low.map((it, i) => (
                    <ItemRow key={it.id} it={it} onAdjust={adjust} onRemove={remove} onEdit={(x) => { setAdding(false); setEditing(x); }} border={i > 0} />
                  ))}
                </Card>
              </>
            )}

            <Text style={styles.section}>Merch for sale</Text>
            <Card style={{ padding: 0 }}>
              {merch.length === 0 ? (
                <Text style={styles.empty}>Nothing for sale yet. Add an item with a sale price and it shows up here and in Take payment.</Text>
              ) : (
                merch.map((it, i) => <ItemRow key={it.id} it={it} onAdjust={adjust} onRemove={remove} onEdit={(x) => { setAdding(false); setEditing(x); }} border={i > 0} />)
              )}
            </Card>

            <Text style={styles.section}>Supplies</Text>
            <Card style={{ padding: 0 }}>
              {supplies.length === 0 ? (
                <Text style={styles.empty}>No supplies yet. Snap a shelf or add one above.</Text>
              ) : (
                supplies.map((it, i) => <ItemRow key={it.id} it={it} onAdjust={adjust} onRemove={remove} onEdit={(x) => { setAdding(false); setEditing(x); }} border={i > 0} />)
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}

function ItemForm({ existing, onSaved }: { existing?: Item; onSaved: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "needle");
  const [unit, setUnit] = useState(existing?.unit ?? "each");
  const [qty, setQty] = useState(existing ? String(existing.qty) : "");
  const [reorderAt, setReorderAt] = useState(existing ? String(existing.reorder_at) : "");
  const [price, setPrice] = useState(existing?.price_cents ? String(existing.price_cents / 100) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    // A sale price makes it merch (sellable in Take payment); blank = a supply.
    const cents = price.trim() ? Math.round(Number(price) * 100) : null;
    const fields = {
      name: name.trim(),
      category,
      unit,
      qty: Number(qty) || 0,
      reorder_at: Number(reorderAt) || 0,
      price_cents: cents && cents > 0 ? cents : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await supabase.from("inventory_items").update(fields).eq("id", existing.id)
      : await supabase.from("inventory_items").insert(fields);
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
      <LabeledInput
        label="Sale price (blank = supply, not for sale)"
        value={price}
        onChange={setPrice}
        keyboardType="numeric"
        placeholder="e.g. 25"
      />
      {err && <Text style={styles.errText}>{err}</Text>}
      <Button label={busy ? "Saving…" : existing ? "Save changes" : "Save item"} onPress={save} disabled={busy} />
    </Card>
  );
}

function ItemRow({
  it,
  onAdjust,
  onRemove,
  onEdit,
  border,
}: {
  it: Item;
  onAdjust: (id: string, d: number) => void;
  onRemove: (id: string) => void;
  onEdit: (it: Item) => void;
  border: boolean;
}) {
  return (
    <View style={[styles.row, border && styles.border]}>
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => onEdit(it)}>
          <Text style={styles.name}>
            {it.brand ? `${it.brand} ` : ""}
            {it.name}
          </Text>
          <Text style={[styles.sub, isLow(it) && { color: theme.warn }]}>
            {isMerch(it) ? `${money(it.price_cents ?? 0)} each` : it.category}
            {isLow(it) ? " · low" : ""}
          </Text>
        </Pressable>
        <Pressable onPress={() => onRemove(it.id)} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
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
  addBtn: { backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.borderStrong, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  addText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
  errText: { color: "#fb7185", fontSize: 13, marginBottom: 10 },
  remove: { color: theme.textFaint, fontSize: 11, marginTop: 4 },
});
