// Listing totals include hidden products. Delete a listing to release a slot.
// On Free, at most `listing_limit` products are visible; moving to Free hides the rest.
// `featured_limit`: products a stall can pick for the buyer home page (advertising).
export const PLANS = Object.freeze({
  free: { name: "Free", listing_limit: 5, featured_limit: 0, analytics: false, advertising: false, pos: false },
  premium: { name: "Premium", listing_limit: 25, featured_limit: 3, analytics: true, advertising: true, pos: true },
});
export const getPlan = (tier) => PLANS[tier] || PLANS.free;
