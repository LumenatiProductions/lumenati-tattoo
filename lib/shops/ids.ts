// Lumenati's fixed shop id (seeded by the M2 seam migration). Server code that
// serves a single-shop integration (the Square sync, the Twilio inbound number,
// the physical kiosk) pins to this explicitly instead of relying on a DB
// default — every other service-role query must scope to the caller's own
// shop_id resolved from their profile.
export const LUMENATI_SHOP_ID = "11111111-1111-1111-1111-111111111111";
