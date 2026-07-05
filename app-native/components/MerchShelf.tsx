import { Pressable, StyleSheet, Text, View } from "react-native";
import { picked } from "@/lib/haptics";
import { theme, money } from "@/lib/theme";
import type { Product, MerchTotals } from "@/lib/merch";

// The quick-tap shelf on the Take payment screen: every product the desk gave
// a retail price, one tap to ring it up. Renders nothing when the shop has no
// priced products, so the POS looks exactly like before until merch exists.

export default function MerchShelf({
  products,
  cart,
  add,
  remove,
  totals,
  taxBps,
  disabled,
}: {
  products: Product[];
  cart: Record<string, number>;
  add: (id: string) => void;
  remove: (id: string) => void;
  totals: MerchTotals | null;
  taxBps: number;
  disabled?: boolean;
}) {
  if (products.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Shop merch</Text>
      <View style={styles.grid}>
        {products.map((p) => {
          const inCart = cart[p.id] ?? 0;
          const out = p.qty <= 0;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                if (disabled) return;
                picked();
                add(p.id);
              }}
              disabled={disabled}
              style={({ pressed }) => [
                styles.tile,
                inCart > 0 && styles.tileOn,
                pressed && styles.tilePressed,
                disabled && { opacity: 0.4 },
              ]}
            >
              {inCart > 0 && (
                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyBadgeText}>{inCart}</Text>
                </View>
              )}
              <Text style={styles.tileName} numberOfLines={2}>
                {p.brand ? `${p.brand} ` : ""}
                {p.name}
              </Text>
              <Text style={styles.tilePrice}>{money(p.price_cents)}</Text>
              {out && <Text style={styles.tileOut}>none counted in stock</Text>}
            </Pressable>
          );
        })}
      </View>

      {totals && (
        <View style={styles.cart}>
          {totals.lines.map((l) => (
            <View key={l.id} style={styles.cartRow}>
              <Pressable
                onPress={() => {
                  if (disabled) return;
                  picked();
                  remove(l.id);
                }}
                disabled={disabled}
                hitSlop={8}
                style={styles.minus}
              >
                <Text style={styles.minusText}>−</Text>
              </Pressable>
              <Text style={styles.cartName} numberOfLines={1}>
                {l.qty} × {l.name}
              </Text>
              <Text style={styles.cartAmt}>{money(l.price_cents * l.qty)}</Text>
            </View>
          ))}
          {totals.taxCents > 0 && (
            <View style={styles.cartRow}>
              <View style={styles.minusSpacer} />
              <Text style={styles.cartDim}>Sales tax ({(taxBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)</Text>
              <Text style={styles.cartDimAmt}>{money(totals.taxCents)}</Text>
            </View>
          )}
          <View style={[styles.cartRow, styles.cartTotalRow]}>
            <View style={styles.minusSpacer} />
            <Text style={styles.cartTotal}>Total</Text>
            <Text style={styles.cartTotalAmt}>{money(totals.totalCents)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  label: {
    color: theme.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    width: "48.5%",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tileOn: { borderColor: theme.borderStrong, borderTopColor: theme.glassEdge, backgroundColor: theme.surfaceRaised },
  tilePressed: { backgroundColor: theme.surfaceRaised },
  tileName: { color: theme.text, fontSize: 14, fontWeight: "600" },
  tilePrice: { color: theme.textDim, fontSize: 13, marginTop: 3, fontVariant: ["tabular-nums"] },
  tileOut: { color: theme.textFaint, fontSize: 11, marginTop: 2 },
  qtyBadge: {
    position: "absolute",
    top: -7,
    right: -7,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    zIndex: 1,
  },
  qtyBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  cart: {
    marginTop: 12,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  cartRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  minus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  minusSpacer: { width: 22 },
  minusText: { color: theme.textDim, fontSize: 15, lineHeight: 17, fontWeight: "700" },
  cartName: { flex: 1, color: theme.text, fontSize: 14 },
  cartAmt: { color: theme.text, fontSize: 14, fontVariant: ["tabular-nums"] },
  cartDim: { flex: 1, color: theme.textDim, fontSize: 13 },
  cartDimAmt: { color: theme.textDim, fontSize: 13, fontVariant: ["tabular-nums"] },
  cartTotalRow: { borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 8 },
  cartTotal: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "700" },
  cartTotalAmt: { color: theme.text, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
