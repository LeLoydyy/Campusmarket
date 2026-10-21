import "dotenv/config";
import { closeDb, databaseLabel, query, transaction } from "../src/db/index.js";

// Permanently deletes an account (and its stall, products, orders and messages), e.g. demo accounts before a presentation.
// Stop the backend first when using the local database.
//   npm run account:remove -- seller@campusmarket.test            → preview only
//   npm run account:remove -- seller@campusmarket.test --confirm  → delete
const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const emails = args.filter((arg) => !arg.startsWith("--")).map((email) => email.trim().toLowerCase());
if (!emails.length) {
  console.log("Usage: npm run account:remove -- <email> [more emails] [--confirm]");
  process.exit(1);
}

const count = async (sql, id) => (await query(sql, [id]))[0].count;
console.log(`Database: ${databaseLabel()}\n`);
const found = [];
for (const email of emails) {
  const [user] = await query("SELECT id, name, email, role FROM users WHERE email = $1", [email]);
  if (!user) { console.log(`✗ ${email}: no account with this email`); continue; }
  const [stall] = await query("SELECT id, name FROM stalls WHERE owner_id = $1", [user.id]);
  console.log(`• ${user.name} <${user.email}> (${user.role})`);
  if (stall) console.log(`    stall "${stall.name}" with ${await count("SELECT count(*) FROM products WHERE stall_id = $1", stall.id)} product(s)`);
  console.log(`    ${await count("SELECT count(*) FROM orders WHERE buyer_id = $1 OR seller_id = $1", user.id)} order(s), `
    + `${await count("SELECT count(*) FROM pos_sales WHERE buyer_id = $1 OR seller_id = $1", user.id)} POS sale(s), `
    + `${await count("SELECT count(*) FROM messages WHERE sender_id = $1 OR receiver_id = $1", user.id)} message(s)`);
  found.push(user);
}

if (!found.length) {
  console.log("\nNothing to remove.");
} else if (!confirm) {
  console.log("\nPreview only. Add --confirm to delete everything listed above.");
} else {
  await transaction(async (run) => {
    for (const { id } of found) {
      // Orders and POS sales don't cascade from users, so clear them first; everything else cascades.
      await run("DELETE FROM orders WHERE buyer_id = $1 OR seller_id = $1", [id]);
      await run("DELETE FROM pos_sales WHERE buyer_id = $1 OR seller_id = $1", [id]);
      await run("DELETE FROM users WHERE id = $1", [id]);
    }
  });
  console.log(`\nDeleted ${found.length} account(s).`);
}
await closeDb();
