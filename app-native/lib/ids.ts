// Generate an id for text-PK tables (clients, bookings) the way the web does
// (`walkin-…`, `bk-…`). uuid-grade collisions aren't a concern at shop volume.
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
