// Accountant export helpers (POS-STARTER-7). Pure CSV builders — the page calls
// these to hand the bookkeeper/accountant a clean file instead of QuickBooks.

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

type Expense = { date: string; category: string; vendor: string | null; amount_cents: number; note: string };

export function expensesCsv(expenses: Expense[]): string {
  return toCsv(
    ["Date", "Category", "Vendor", "Amount", "Note"],
    expenses.map((e) => [e.date, e.category, e.vendor ?? "", dollars(e.amount_cents), e.note]),
  );
}

// Trigger a client-side download of a CSV string.
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
