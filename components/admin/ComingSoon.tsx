import { Card } from "@/components/admin/ui";

// Placeholder for a scaffolded-but-not-yet-built command-center page. Each
// feature replaces ITS OWN page.tsx with the real screen (see BUILD-PLAN.md);
// this keeps the nav + providers settled so features never edit shared files.
export default function ComingSoon({
  title,
  blurb,
  starter,
}: {
  title: string;
  blurb: string;
  starter: string;
}) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-black/50">{blurb}</p>
      </div>
      <Card>
        <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
            Coming soon
          </span>
          <p className="max-w-sm text-sm text-black/45">
            This area is scaffolded and ready to build. Spec lives in{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 text-[11px]">{starter}</code>.
          </p>
        </div>
      </Card>
    </div>
  );
}
