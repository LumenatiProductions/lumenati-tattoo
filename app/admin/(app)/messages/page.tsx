"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRole } from "@/lib/admin/role-context";
import { FilterChips, PageHeader } from "@/components/admin/ui";
import QueueTab from "@/components/admin/messages/QueueTab";
import AutomaticTab from "@/components/admin/messages/AutomaticTab";
import BlastsTab from "@/components/admin/messages/BlastsTab";
import WordingTab from "@/components/admin/messages/WordingTab";
import ReviewVelocity from "@/components/admin/ReviewVelocity";

// Messages. Everything the shop sends, one page (Scott, 2026-09-01: four
// messaging pages became one). Queue = what's going out and when. Automatic =
// the switches. Wording = what each chair's texts say. Blasts = one message to
// a group. Owners get all four; an artist gets the wording for their chair.
type TabKey = "queue" | "automatic" | "wording" | "blasts" | "reviews";
const TABS: { key: TabKey; label: string; roles: string[] }[] = [
  { key: "queue", label: "Queue", roles: ["owner"] },
  { key: "automatic", label: "Automatic", roles: ["owner"] },
  { key: "wording", label: "Wording", roles: ["owner", "artist"] },
  { key: "blasts", label: "Blasts", roles: ["owner"] },
  { key: "reviews", label: "Reviews", roles: ["owner"] },
];

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const { role } = useRole();
  const router = useRouter();
  const params = useSearchParams();
  const tabs = TABS.filter((t) => t.roles.includes(role));
  const wanted = params.get("tab") as TabKey | null;
  const tab: TabKey = tabs.some((t) => t.key === wanted) ? (wanted as TabKey) : tabs[0]?.key ?? "wording";

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle={
          role === "owner"
            ? "Every text and email the shop sends: what is queued, what goes out on its own, what it says."
            : "What your clients get around a visit, in your words."
        }
      />
      <FilterChips
        filters={tabs.map((t) => ({ key: t.key, label: t.label }))}
        value={tab}
        onChange={(k) => router.replace(`/admin/messages?tab=${k}`, { scroll: false })}
      />
      <div className="mt-2">
        {tab === "queue" && <QueueTab />}
        {tab === "automatic" && <AutomaticTab />}
        {tab === "wording" && <WordingTab />}
        {tab === "blasts" && <BlastsTab />}
        {tab === "reviews" && <ReviewVelocity />}
      </div>
    </div>
  );
}
