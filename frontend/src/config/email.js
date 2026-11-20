// Which email addresses can create accounts. Keep in step with the API
// (ALLOWED_EMAIL_DOMAIN and BUYER_EMAIL_DOMAINS in backend/.env).

/** Sellers and administrators must use this campus domain. */
export const CAMPUS_DOMAIN = "csucc.edu.ph";

/** Buyers can also sign up with a personal address on these domains (VITE_BUYER_EMAIL_DOMAINS, default gmail.com). */
export const BUYER_DOMAINS = [CAMPUS_DOMAIN, ...String(import.meta.env.VITE_BUYER_EMAIL_DOMAINS ?? "gmail.com")
  .split(",").map((domain) => domain.trim().toLowerCase().replace(/^@/, "")).filter(Boolean)];

export const isCampusEmail = (email) => String(email || "").toLowerCase().endsWith(`@${CAMPUS_DOMAIN}`);
