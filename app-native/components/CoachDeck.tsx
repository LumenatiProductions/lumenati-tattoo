import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { tap } from "@/lib/haptics";
import { theme } from "@/lib/theme";
import { Card } from "@/components/ui";

// The coach deck: shows the top tips, each one swipeable away. A dismissed tip
// sits out for two weeks (they're computed from live numbers, so a tip that
// still matters comes back); the next-ranked tip slides into the freed slot.
// Dismissals are keyed on tip title and stored on-device only.

export type DeckTip = { title: string; body: string; href?: string };

const STORE_KEY = "coach-dismissed:v1";
const SIT_OUT_MS = 14 * 24 * 60 * 60 * 1000;

async function loadDismissed(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    const live: Record<string, number> = {};
    for (const [k, t] of Object.entries(all)) if (now - t < SIT_OUT_MS) live[k] = t;
    return live;
  } catch {
    return {};
  }
}

function SwipeableCard({ tip, onDismiss, first }: { tip: DeckTip; onDismiss: () => void; first: boolean }) {
  const router = useRouter();
  const x = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      // Claim the gesture only for clearly horizontal drags so the page scroll wins otherwise.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => x.setValue(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) > 90 || Math.abs(g.vx) > 1.2) {
          tap();
          Animated.timing(x, {
            toValue: g.dx > 0 ? 500 : -500,
            duration: 180,
            useNativeDriver: true,
          }).start(onDismiss);
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const fade = x.interpolate({ inputRange: [-200, 0, 200], outputRange: [0.25, 1, 0.25] });
  return (
    <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }], opacity: fade }}>
      <Card style={{ marginTop: first ? 0 : 10 }}>
        <Text style={styles.title}>{tip.title}</Text>
        <Text style={styles.body}>{tip.body}</Text>
        {tip.href ? (
          <Pressable
            onPress={() => {
              tap();
              router.push(tip.href as never);
            }}
            hitSlop={6}
            style={{ marginTop: 8 }}
          >
            <Text style={styles.link}>Open →</Text>
          </Pressable>
        ) : null}
        {first ? <Text style={styles.hint}>Swipe a tip away when you&apos;re done with it.</Text> : null}
      </Card>
    </Animated.View>
  );
}

export default function CoachDeck({ tips, max = 3 }: { tips: DeckTip[]; max?: number }) {
  const [dismissed, setDismissed] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    loadDismissed().then(setDismissed);
  }, []);

  const dismiss = useCallback(
    (title: string) => {
      setDismissed((cur) => {
        const next = { ...(cur ?? {}), [title]: Date.now() };
        AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  if (dismissed === null) return null;
  const visible = tips.filter((t) => !(t.title in dismissed)).slice(0, max);
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((tip, i) => (
        <SwipeableCard key={tip.title} tip={tip} first={i === 0} onDismiss={() => dismiss(tip.title)} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 15.5, fontWeight: "700", marginBottom: 6 },
  body: { color: theme.textDim, fontSize: 13.5, lineHeight: 19 },
  link: { color: theme.text, fontSize: 13, fontWeight: "700" },
  hint: { color: theme.textFaint, fontSize: 11.5, marginTop: 10 },
});
