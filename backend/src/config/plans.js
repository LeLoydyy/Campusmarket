// Listing totals include hidden products. Delete a listing to release a slot.
export const PLANS = Object.freeze({
  free: { name: "Free", listing_limit: 5, analytics: false, advertising: false, pos: false },
  premium: { name: "Premium", listing_limit: 25, analytics: true, advertising: true, pos: true },
});
export const getPlan = (tier) => PLANS[tier] || PLANS.free;
