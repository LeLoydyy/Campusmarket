/**
 * Checks the email settings in .env and sends a sample code email.
 * Usage: npm run email:test -- yourname@csucc.edu.ph
 */
import "dotenv/config";
import { checkEmailConfig, sendCodeEmail } from "../src/services/email.js";

const to = process.argv[2];
if (!to || !to.includes("@")) {
  console.error("Usage: npm run email:test -- yourname@csucc.edu.ph");
  process.exit(1);
}

await checkEmailConfig();
try {
  await sendCodeEmail(to, "123456", "register", 10);
  console.log(process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "smtp" && process.env.SMTP_PASS
    ? `Sent a test email to ${to}. Check the inbox (and Spam).`
    : "Printed above instead of sending — set EMAIL_PROVIDER=smtp and the SMTP_* values in backend/.env.");
} catch (error) {
  console.error(`Sending failed: ${error.message}`);
  process.exit(1);
}
