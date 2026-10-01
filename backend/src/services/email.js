/**
 * Outgoing email.
 *
 *  - EMAIL_PROVIDER=smtp    → sends through SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS,
 *                             e.g. a Gmail or Google Workspace account with an app password.
 *  - otherwise ("console")  → prints the message to the server log. Outside production the
 *                             one-time code is also returned to the browser so sign-up and
 *                             sign-in can be tested without a mailbox.
 *
 * Misconfiguration (an unknown provider, SMTP without credentials) falls back to console
 * and says so at startup instead of failing silently.
 */
const PROVIDERS = ["console", "smtp"];
const configuredProvider = () => (process.env.EMAIL_PROVIDER || "console").trim().toLowerCase();
const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const provider = () => (configuredProvider() === "smtp" && smtpReady() ? "smtp" : "console");

/** True when codes may be shown on screen (development and tests only). */
export const exposeDevCodes = () => provider() === "console" && process.env.NODE_ENV !== "production";

const isGmail = () => /(^|\.)gmail\.com$/i.test(process.env.SMTP_HOST || "");
const fromAddress = () => process.env.EMAIL_FROM || `"Campus Market" <${process.env.SMTP_USER}>`;

let transport = null;
const smtpTransport = async () => {
  if (!transport) {
    const { default: nodemailer } = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        // Google shows app passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it.
        pass: isGmail() ? process.env.SMTP_PASS.replace(/\s/g, "") : process.env.SMTP_PASS,
      },
    });
  }
  return transport;
};

/** Logs which provider is active and, for SMTP, whether the server accepts the login. */
export const checkEmailConfig = async () => {
  const configured = configuredProvider();
  if (!PROVIDERS.includes(configured)) {
    console.warn(`[email] EMAIL_PROVIDER="${configured}" isn't recognised (use "smtp" or "console"). Codes are printed here instead of emailed.`);
  } else if (configured === "smtp" && !smtpReady()) {
    console.warn("[email] EMAIL_PROVIDER=smtp but SMTP_HOST, SMTP_USER or SMTP_PASS is empty. Codes are printed here instead of emailed.");
  }
  if (provider() === "console") {
    if (process.env.NODE_ENV === "production") console.warn("[email] No mail server configured: users cannot receive sign-up or sign-in codes.");
    return;
  }
  try {
    await (await smtpTransport()).verify();
    console.log(`[email] Sending from ${process.env.SMTP_USER} via ${process.env.SMTP_HOST}`);
  } catch (error) {
    console.error(`[email] ${process.env.SMTP_HOST} rejected the login for ${process.env.SMTP_USER}: ${error.message}`);
    if (isGmail()) console.error("[email] Gmail needs an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password.");
  }
};

export const sendEmail = async ({ to, subject, text, html }) => {
  if (provider() === "smtp") {
    const mailer = await smtpTransport();
    await mailer.sendMail({ from: fromAddress(), to, subject, text, html });
    return;
  }
  console.log(`[email] To: ${to}\n[email] Subject: ${subject}\n${text}`);
};

const PURPOSE_TEXT = {
  register: ["Confirm your CSUCC email", "Use this code to confirm your email and finish creating your Campus Market account."],
  login: ["Your sign-in code", "Use this code to finish signing in to Campus Market. If this wasn't you, change your password now."],
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const sendCodeEmail = (to, code, purpose, minutes) => {
  const [heading, lead] = PURPOSE_TEXT[purpose];
  const warning = "Never share it with anyone — Campus Market staff will never ask for it.";
  return sendEmail({
    to,
    subject: `${code} is your Campus Market code`,
    text: `${heading}\n\n${lead}\n\n    ${code}\n\nThe code expires in ${minutes} minutes. ${warning}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#14201A">
  <p style="margin:0 0 4px;color:#13703C;font-weight:800;font-size:13px;letter-spacing:.04em">CAMPUS MARKET</p>
  <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(heading)}</h1>
  <p style="margin:0 0 20px;color:#4A5A50;line-height:1.5">${escapeHtml(lead)}</p>
  <p style="margin:0 0 20px;padding:16px;background:#E3F4E9;border-radius:12px;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#0B3D24">${escapeHtml(code)}</p>
  <p style="margin:0;color:#4A5A50;font-size:13px;line-height:1.5">The code expires in ${minutes} minutes. ${escapeHtml(warning)}</p>
</div>`,
  });
};
