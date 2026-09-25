# Campus Market redesign ("campus fair") — changelog

This changes how the site looks and feels, not what it does. Routes, auth, and existing API responses are unchanged. The backend only gained read-only endpoints and optional query parameters (listed below), so older clients keep working.

Branch: `redesign/campus-fair` (phases 1–10).

## Design system

| File | Change |
| --- | --- |
| `frontend/src/styles/tokens.css` (new) | The only colour source. Green, gold, cream, ink, teal and coral scales; category colours; Inter (display) and Plus Jakarta Sans (body); type sizes, radii, shadows, motion, focus ring, leaf texture. Legacy `--cm-*`, `--color-*` and `--gray-*` variables now point at these tokens. |
| `frontend/src/styles/ui.css` (new) | Shared styles for buttons (gold, gold-outline, on-dark), chips, product/stall/event cards, stat card, empty state, section headings, order stepper, and scroll wrappers. |
| `frontend/src/styles/global.css` | Imports tokens. Adds the heading font, a gold `:focus-visible` ring and `prefers-reduced-motion` handling. All hard-coded colours were replaced with tokens, and font sizes are at least 13px (11px only for count badges). |
| `frontend/index.html` | Font links and the `theme-color` meta tag. |
| `frontend/src/main.jsx` | Loads `ui.css`; toast colours use the palette. |
| `frontend/src/utils/chartColors.js` (new) | Chart palette and tooltip style shared by the seller and admin charts. |
| `frontend/src/utils/marketplace.js` (new) | Helpers for plurals, "new" badge, stall open/closed, event dates, calendar links and countdowns. |

## Shared components (`frontend/src/components/ui/`, all new)

- **`Illustration.jsx`**: one set of SVG "clay" spot illustrations: bag, calendar, chat, box, store, search, check, map, heart, bell, sprout.
- **`EmptyState.jsx`**: an illustration, title and description, with a primary and optional secondary action. Used for every empty list in the app.
- **Cards**:
  - `ProductCard.jsx`: shows the category, a "new" badge, stock and the stall.
  - `StallCard.jsx`: shows whether the stall is open.
  - `EventCard.jsx`: has a calendar link.
  - `StatCard.jsx`.
- **`Chip.jsx`**: CategoryChip, FilterChip and StatusChip.
- **`Skeleton.jsx`**: loading placeholders.
- **`OrderStepper.jsx`**: order progress from placed to completed.
- `components/common/ProductCard.jsx` re-exports the new card. `Ui.jsx`'s `EmptyState` wraps the illustration.

## Navigation and layout

- **`components/common/Navbar.jsx` / `.css`**:
  - Rebuilt in green-900 and gold.
  - Only one search bar per screen: the navbar search hides on Events, Orders, Messages and Stalls, which have their own.
- **`components/common/MobileTabBar.jsx`** (new): bottom tab bar on phones (Home, Browse, Events, Cart, Profile), plus a profile sheet.
- `components/common/accountLinks.js` (new): the account menu links, shared by the navbar and the profile sheet.
- **`components/common/Footer.jsx`** (new).
- **`components/common/Sidebar.css`**: green-900 dashboard sidebar with gold for the active item.
- **`components/layout/AuthLayout.jsx` / `.css`**: split-panel layout for Login and Register.

## Stall map (`frontend/src/components/map/`, new)

- **`StallMap.jsx` / `.css`**:
  - 24×16 grid with landmarks and a legend.
  - A read-only view for buyers and an edit mode for admins.
- **`StallMapEditor.jsx` / `.css`**:
  - Admins can drag, resize and use the keyboard to place stalls.
  - Overlapping and off-grid stalls are blocked.
  - Unsaved changes are flagged.

## Buyer pages (`frontend/src/pages/buyer/`)

- **`Home.jsx` / `.css`**:
  - New hero, real counts from `/api/stats/public`, category chips, and an events strip.
  - One product section instead of the duplicated ones.
- **`Browse.jsx` / `.css`**:
  - Filter chips, sort, pickup location and an "open now" filter.
  - The filters use the new optional query parameters.
- **`BuyerEvents.jsx`** and `BuyerEvents.css` (new): event cards with a countdown and a calendar link.
- **`EventStalls.jsx`** and `EventStalls.css` (new): buyers can view an event's stall map and the stalls on it.
- **`Orders.jsx` / `.css`**: order stepper and a pickup details strip.
- **`Messages.jsx` / `.css`**: the product being discussed is pinned in the chat, with timestamps.
- **`Stalls.jsx` / `.css`**: stall cards and new hero artwork.
- **Other**:
  - `Cart.jsx`, `Checkout.jsx`, `Favorites.jsx`, `Notifications.jsx`, `StallDetails.jsx`: now use the shared EmptyState.
  - `components/buyer/ChatWindow.jsx`: pinned product; fixes the timestamp field (`sent_at`) and the seller view.
  - `components/buyer/CartDrawer.jsx`: new palette.
  - `components/notifications/notifications.css`: new palette.

## Auth pages

- **`pages/auth/Register.jsx`**: two steps, with account-type cards for buyer and seller. The fields and the API call are the same as before.
- **`pages/auth/AccountStatus.jsx`**: clearer "pending approval" state.

## Seller pages (`frontend/src/pages/seller/`)

- **`Dashboard.jsx` / `.css`**: stat cards, a to-do list, a sales chart and top products.
- **`Analytics.jsx` / `.css`**:
  - Chart colours come from the palette.
  - Empty charts use EmptyState.
  - The header now wraps on phones.
- **Empty states**: `ManageProducts.jsx`, `SellerOrders.jsx`, `Reviews.jsx`, `SellerReservations.jsx` and `PointOfSale.jsx` now use EmptyState, each with a next step.
- **Stylesheets**:
  - `ManageProducts.css`, `Mystall.css`, `PointOfSale.css`, `Reviews.css`, `SellerApplicationForm.css`, `SellerOrders.css`, `SellerReservations.css`, `Settings.css`, `StallBranding.css`: colours now use tokens.
  - Also fixed 57 invalid `var(--ink-600))` declarations.

## Admin pages (`frontend/src/pages/admin/`)

- **`AdminDashboard.jsx`** and `AdminDashboard.css` (new): the "Action items" list shows real counts of pending registrations, stalls and event applications, and each one links to where it is handled. Also shows POS revenue.
- **`ManageUsers.jsx`** and `ManageUsers.css` (new): a side drawer for user details and actions.
- **`AdminEvents.jsx`**: uses the stall map editor. The empty state has a "Create event" action.
- `AdminWorkspace.css`: colours now use tokens.

## API client

`frontend/src/services/api.js` gains three additions:

- `productService.getLocations`
- `productService.getPreview` (loads a product without counting a view)
- `statsService.getPublic`

## Backend (additions only)

| File | Change |
| --- | --- |
| `src/routes/stats.routes.js` (new), `src/app.js` | `GET /api/stats/public` returns anonymous counts and a recent-activity feed. It never includes who ordered. |
| `src/routes/product.routes.js`, `src/controllers/product.controller.js` | `GET /api/products/locations`. The product list accepts optional `sort`, `location` and `open_now`. `?preview=1` on a product skips the view count. |
| `src/services/openingHours.js` (new) | "Open now" check in Asia/Manila time. |
| `src/data/marketStore.js` | Stall map positions and landmarks, with validation. Event stalls include the seller's stall name and logo. Order lists include `buyer_name`. Admin stats include pending counts and POS totals. |
| `database/schema.sql` | Adds `event_stalls.x/y/w/h` and `events.landmarks` columns, safe to re-run. |
| `src/app.js`, `.env.example` | The rate limit can be set with `RATE_LIMIT_MAX` (default 300 per IP per 15 minutes). |
| `tests/public-stats.test.js`, `tests/product-filters.test.js`, `tests/stall-map.test.js` (new) | Tests for the new endpoints. |

## Removed

29 frontend files that nothing imported:

- `components/admin/*`: PlatformStats, StallApprovalCard, StallMapBuilder, UserTable
- `components/buyer/`: CatergoryFilter, ProductGrid, RecommendationRow
- `components/common/`: Badge, Modal, SkeletonCard, Toast, TopBar
- `components/layout/DashboardLayout`
- `components/seller/*`: OrderTable, ProductForm, SalesChart, StallForm
- `components/ui/`: Badge, DataTable, PageSection, StatusBadge, index
- `data/mockData`
- `hooks/`: useAuth, useProducts, useRecommendations
- `services/`: authService, productService
- `utils/roleGuard`

## Known deviations from the brief

- **Hover colour**: button hovers use green-900 instead of green-500, because white text on green-500 or coral-500 fails AA contrast.
- **Artwork**: no new 3D artwork was made. Existing photos keep a common frame, and all new artwork is one set of SVG illustrations.
- **Reported items**: the admin "Action items" list has no "reported items" entry because the app has no reporting feature yet.
- **Unrouted pages**: `Reports.jsx`, `EmailVerification.jsx` and `ForgotPassword.jsx` aren't reachable from any route and were left as they are, since the brief forbids routing changes.

## Verification

- **Contrast**: axe-core colour-contrast checks found 0 failures on 35+ pages at 375, 768 and 1440 px, for guests, buyers, sellers and admins.
- **Layout**: no horizontal overflow and no console errors at any of those widths.
- **Tests and build**: the production build succeeds and all backend tests pass.
