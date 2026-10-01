-- CampusMarket database schema (PostgreSQL 15+ / Supabase).
--
-- Applied automatically when the backend starts; every statement is idempotent.
-- To set up Supabase by hand, paste this file into the Supabase SQL editor.
--
-- IDs are TEXT (UUIDs by default) so existing records such as demo events keep their IDs.

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  campus_id           TEXT,
  affiliation         TEXT,
  department          TEXT,
  campus              TEXT,
  avatar_url          TEXT NOT NULL DEFAULT '',
  is_banned           BOOLEAN NOT NULL DEFAULT FALSE,
  review_note         TEXT,
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_campus_id_key ON users (lower(campus_id));

CREATE TABLE IF NOT EXISTS stalls (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owner_id        TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  banner_url      TEXT NOT NULL DEFAULT '',
  logo_url        TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'other',
  contact_number  TEXT,
  operating_hours TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stall_id    TEXT NOT NULL REFERENCES stalls (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  category    TEXT NOT NULL DEFAULT 'other',
  image_url   TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  view_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_stall_id_idx ON products (stall_id);

CREATE TABLE IF NOT EXISTS cart_items (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  buyer_id       TEXT NOT NULL REFERENCES users (id),
  seller_id      TEXT NOT NULL REFERENCES users (id),
  stall_id       TEXT REFERENCES stalls (id) ON DELETE SET NULL,
  total          NUMERIC(12, 2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'delivered', 'cancelled')),
  delivery_notes TEXT NOT NULL DEFAULT '',
  fulfillment    TEXT NOT NULL DEFAULT 'pickup' CHECK (fulfillment IN ('pickup', 'delivery')),
  cancelled_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_buyer_id_idx ON orders (buyer_id);
CREATE INDEX IF NOT EXISTS orders_seller_id_idx ON orders (seller_id);

-- Items keep the product name, image and price at purchase time, so no FK to products.
CREATE TABLE IF NOT EXISTS order_items (
  id         BIGSERIAL PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  image_url  TEXT,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS pos_sales (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id    TEXT NOT NULL,
  seller_id     TEXT NOT NULL REFERENCES users (id),
  buyer_id      TEXT NOT NULL REFERENCES users (id),
  buyer_name    TEXT NOT NULL,
  stall_id      TEXT REFERENCES stalls (id) ON DELETE SET NULL,
  stall_name    TEXT NOT NULL,
  total         NUMERIC(12, 2) NOT NULL,
  cash_received NUMERIC(12, 2) NOT NULL,
  change        NUMERIC(12, 2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'completed',
  source        TEXT NOT NULL DEFAULT 'pos',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, request_id)
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id         BIGSERIAL PRIMARY KEY,
  sale_id    TEXT NOT NULL REFERENCES pos_sales (id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS pos_sale_items_sale_id_idx ON pos_sale_items (sale_id);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sender_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id  TEXT,
  content     TEXT NOT NULL,
  read_status BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id, sent_at);
CREATE INDEX IF NOT EXISTS messages_receiver_idx ON messages (receiver_id, sent_at);

-- Read by the AI recommendation service.
CREATE TABLE IF NOT EXISTS user_behavior (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id TEXT,
  action     TEXT NOT NULL CHECK (action IN ('view', 'cart_add', 'purchase', 'wishlist')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_behavior_user_idx ON user_behavior (user_id);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name           TEXT NOT NULL,
  date           DATE NOT NULL,
  start_date     TIMESTAMPTZ,
  end_date       TIMESTAMPTZ,
  location       TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  image_url      TEXT,
  is_demo        BOOLEAN NOT NULL DEFAULT FALSE,
  layout_version INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_stalls (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id     TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  stall_number INTEGER NOT NULL CHECK (stall_number > 0),
  category     TEXT,
  status       TEXT,
  size         TEXT,
  price        NUMERIC(12, 2),
  stall_id     TEXT,
  seller_id    TEXT,
  name         TEXT,
  description  TEXT,
  location     TEXT,
  UNIQUE (event_id, stall_number)
);

CREATE TABLE IF NOT EXISTS seller_applications (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seller_id            TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_id             TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  stall_name           TEXT NOT NULL,
  business_name        TEXT NOT NULL,
  product_category     TEXT NOT NULL,
  product_list         TEXT NOT NULL,
  preferred_stall_size NUMERIC NOT NULL,
  duration             INTEGER NOT NULL,
  contact_info         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Added after the first release; ADD COLUMN IF NOT EXISTS upgrades existing databases.
-- Stall map geometry (grid units; NULL = auto-placed by stall number) and event landmarks.
ALTER TABLE event_stalls ADD COLUMN IF NOT EXISTS x INTEGER;
ALTER TABLE event_stalls ADD COLUMN IF NOT EXISTS y INTEGER;
ALTER TABLE event_stalls ADD COLUMN IF NOT EXISTS w INTEGER;
ALTER TABLE event_stalls ADD COLUMN IF NOT EXISTS h INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS landmarks JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE seller_applications ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE seller_applications ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE seller_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
-- Sign-in security: account recovery question, lockout after repeated wrong passwords.
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- One-time codes emailed to confirm a new address or a sign-in. Only a keyed hash is stored.
CREATE TABLE IF NOT EXISTS auth_codes (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_codes_lookup_idx ON auth_codes (email, purpose, created_at DESC);

-- One active application per seller per event.
CREATE UNIQUE INDEX IF NOT EXISTS seller_applications_active_key
  ON seller_applications (seller_id, event_id) WHERE status IN ('pending', 'approved', 'reserved');

-- In-app notifications (order progress for buyers, new orders for sellers).
-- `status` is the order stage the notification announces; the order itself may have moved on.
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'order',
  order_id   TEXT REFERENCES orders (id) ON DELETE CASCADE,
  status     TEXT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  target_id  TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase only: public bucket for product photos (PHOTO_STORAGE=supabase).
-- Skipped on plain PostgreSQL/PGlite, where the storage schema doesn't exist.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('product-images', 'product-images', TRUE, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Create the public "product-images" bucket in the Supabase dashboard (Storage).';
END $$;

-- Supabase exposes the public schema through its REST API using the public anon key.
-- Row level security with no policies blocks that path entirely; the backend connects
-- as the database owner and is not affected.
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE stalls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavior       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_stalls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_codes          ENABLE ROW LEVEL SECURITY;
