# Campus Marketplace — CSUCC requirements audit

Reviewed and updated on September 8, 2026. Scope: Caraga State University Cabadbaran Campus students, faculty, and employees.

## Requirement coverage

| Requirement | Before this audit | Current implementation |
| --- | --- | --- |
| Working title: Campus Marketplace | CampusMarket browser title | Browser title is Campus Marketplace · CSUCC; existing visual brand retained. |
| Web platform accessible on mobile | Responsive pages; API hard-coded to localhost | Responsive storefront and new POS; LAN development host and same-origin API proxy configured. Physical-device acceptance testing remains necessary. |
| Campus members can open stores | Seller role existed; registration did not capture a store | Seller signup captures store name and campus location. Approved buyers can use Open a campus store, which switches their account to Seller. One store per seller. |
| Validated campus credentials | No ID or affiliation captured | ID number, student/faculty/employee affiliation, and college/program/office required. Admin must confirm a check against authorized CSUCC records and record a review note. Duplicate IDs rejected. |
| Free plan: limited listings and basic POS | 15-listing backend check; no POS | 5 total listings, including hidden listings. **Policy change (Oct 2026): the POS moved to Premium**; Free sellers keep read access to past receipts. |
| Premium plan: more limited listings, advertising, analytics, POS | No Premium listing cap or plan enforcement | 25 total listings; labeled landing-page product promotion; Premium-only sales/product/category analytics; Premium-only counter POS with verified buyer lookup, cash/change, stock updates, history, and printable receipts. Admin manages plans. |
| Buyer signup and verification before purchase | Buyers automatically approved | New buyers and sellers start pending. Cart, orders, messages, POS, and seller tools require current approved status on the server. |
| Landing page: featured products and store names | Product feed existed; store cards were hard-coded | Active stores come from API; Premium products appear in a promoted section; each product includes its store. |
| Display active stores currently selling | Store UI existed; public endpoints could return unapproved stores | Public directory/products require approved, open stores with approved, unsuspended owners. Sellers can open/close approved stores. |
| Buyer/seller messaging | Messaging existed | Retained; participants must be approved buyer/seller accounts. Public conversation profiles omit ID numbers and password hashes. |
| Super admin approves buyers and sellers | Admin could ban users and approve stores, but not approve registrations | The existing `admin` role is the super administrator. Registration & Users provides credential review, approval, correction requests, and suspension. Store approval is separate. |
| Identify deployment and operating costs | No task-specific costing report | See [deployment-costs.md](deployment-costs.md), with current provider references and explicit budget assumptions. |
| Database of products, stores, customers, prices, locations | Local JSON persistence behind REST endpoints | Retained and extended with credential reviews, plan metadata, POS sales, and audit records. This is a single-process file-backed prototype, not a deployed relational database. |
| Coordinate with ordering/payment/delivery group | Local cart and order prototype already present | Retained, with approval and stock checks; online payment and delivery integration are not connected. See [integration-contract.md](integration-contract.md). |

## Decisions used for this implementation

- Free: **5** listings, no POS. Premium: **25** listings plus POS, advertising and analytics. These are provisional capstone policy values in `backend/src/config/plans.js`; the plan selector labels should be updated if the policy changes.
- Hidden products still occupy listing slots. Deleting a listing releases a slot. An administrator cannot downgrade a store while its listing count exceeds the target plan.
- Premium is granted manually by an administrator. No subscription fee, payment collection, or automatic billing is claimed or implemented.
- Verification uses an ID **number**, not an uploaded ID photo. No campus registry integration or automatic proof of membership is claimed. CSUCC must designate the authorized verifier and the records they may consult.
- A seller registration creates a pending Free store. First approve the person's campus registration, then approve the store. Store approval fails if its owner's registration is not approved.
- Pending/rejected members can sign in to see their status and submit corrected credentials. They can still browse publicly. Changing an approved full name triggers another review.
- The existing sample accounts remain fixtures for local presentations. Their previous approved statuses are not proof of institutional verification. Use a separate data store and real verification for an institutional rollout.
- The current role model uses Buyer or Seller per account; opening a store switches a Buyer account to Seller. Simultaneous buyer/seller dashboards would require a separate role-model extension.

## Presentation walkthrough

1. Open `/` without logging in. Show active stores, promoted products, and linked events. Browse products without purchase access.
2. Register a Buyer with a test CSUCC ID and affiliation. Show `/account-status` and the blocked purchase access.
3. Sign in as the administrator in a separate browser profile. Open `/admin/users`, choose Pending review, inspect the credentials, record the verification method, and approve.
4. Return to the buyer and select Check approval status. Show cart and messaging access.
5. Register a Seller with a store name and campus location. Approve the registration at `/admin/users`, then the store at `/admin/stalls`.
6. Open the seller's Products page. Show the Free listing allowance; create products with prices and stock. Open `/seller/pos`.
7. In POS, find a verified Buyer by exact registered email or ID number. Select products, enter cash received, record the sale, and print or reopen the receipt. Confirm stock decreases once.
8. In `/admin/stalls`, switch the store to Premium. Show its allowance, promoted products on the landing page, and sales/product/category analytics.
9. Use My Stall → Close store for now. Refresh the public directory and confirm the store and its products are hidden. Reopen it to restore visibility.
10. Request a credential correction for a pending registration and demonstrate resubmission. Ban a test buyer and demonstrate that their existing access token can no longer transact.

## Verification

- `cd backend` then `npm test`: isolated HTTP integration suite with its own temporary data file and server; it does not modify the presentation database.
- Checks cover pending access, required credentials, rejection/resubmission, duplicate registration, current-session approval/ban changes, refresh-token misuse, owner-only product changes, Free and Premium caps, downgrade protection, public visibility, messaging privacy, POS validation, stock changes, retry idempotency, completed-sale analytics, order transitions, and buyer-to-seller onboarding.
- `cd frontend` then `npm run build`: production compilation. Existing large JavaScript chunk warning remains.
- Import filename casing was corrected for Linux hosting.
- Browser interaction, visual checks at narrow widths, printing on real devices, and usability testing with CSUCC participants still require acceptance testing. Compilation and HTTP tests do not substitute for those checks.

## Items requiring institutional or external work

CSUCC must approve the actual credential-validation process, final plan allowances and pricing, data-retention policy, and operational ownership. Hosting/domain purchases and deployment have not been performed. A scalable institutional deployment still requires moving the file store to a transactional database, configuring backups and recovery, provisioning real administrators, and coordinating the payment/delivery integration with the other group. Existing email/password-reset stubs, event application administration, and review features are separate work; this audit does not certify them as complete.
