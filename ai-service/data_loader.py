"""
data_loader.py — database reads for the AI service.

Connects straight to the backend's PostgreSQL database (Supabase in production)
using the same DATABASE_URL as the backend. Centralises all reads so
recommender.py stays clean.
"""

import os

import pandas as pd
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv()

ACTION_WEIGHTS = {"view": 1, "cart_add": 3, "wishlist": 2, "purchase": 5}

# Every buyer-product interaction the recommender learns from, from three sources:
#   - user_behavior: views and add-to-cart clicks logged by the site
#   - orders:        sales data, one "purchase" per product in a completed or delivered order
#   - favorites:     one "wishlist" per product the buyer currently has saved
# Purchases and wishlist come from their own tables (not user_behavior) so past orders
# count too, and un-saving a favorite stops it counting.
INTERACTIONS = """
    SELECT user_id, product_id, action, created_at FROM user_behavior
    WHERE product_id IS NOT NULL AND action IN ('view', 'cart_add')
    UNION ALL
    SELECT o.buyer_id, i.product_id, 'purchase', o.created_at
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.status IN ('completed', 'delivered')
    UNION ALL
    SELECT user_id, product_id, 'wishlist', created_at FROM favorites
"""

# Products a buyer can actually see: active, in an approved and active stall
# whose owner is approved and not banned (mirrors the backend's rule).
PUBLIC_PRODUCT = """
    p.is_active AND s.status = 'approved' AND s.is_active
    AND u.status = 'approved' AND NOT u.is_banned
"""


def _query(sql: str, params: tuple = ()) -> list[dict]:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    with psycopg.connect(url, row_factory=dict_row, connect_timeout=5) as conn:
        return conn.execute(sql, params).fetchall()


def _with_scores(rows: list[dict], columns: list[str]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=[*columns, "score"])
    df = pd.DataFrame(rows)
    df["score"] = df["action"].map(ACTION_WEIGHTS).fillna(1)
    return df


def load_all_behavior() -> pd.DataFrame:
    """All interactions (views, carts, purchases, favorites): user_id, product_id, action, created_at, score."""
    rows = _query(f"SELECT user_id, product_id, action, created_at FROM ({INTERACTIONS}) interactions")
    return _with_scores(rows, ["user_id", "product_id", "action", "created_at"])


def load_behavior_scores() -> pd.DataFrame:
    """One row per user-product pair with the summed interaction score."""
    df = load_all_behavior()
    if df.empty:
        return pd.DataFrame(columns=["user_id", "product_id", "score"])
    return df.groupby(["user_id", "product_id"], as_index=False)["score"].sum()


def load_active_products() -> pd.DataFrame:
    """Publicly visible products with the fields used for content-based filtering."""
    rows = _query(
        f"""
        SELECT p.id, p.name, p.category, p.price::float8 AS price, p.stall_id
        FROM products p
        JOIN stalls s ON s.id = p.stall_id
        JOIN users u ON u.id = s.owner_id
        WHERE {PUBLIC_PRODUCT}
        """
    )
    return pd.DataFrame(rows) if rows else pd.DataFrame(columns=["id", "name", "category", "price", "stall_id"])


def get_popular_product_ids(n: int = 12) -> list:
    """Top-N visible products by interaction score (sales count most); newest products if there is no history."""
    rows = _query(
        f"""
        SELECT p.id
        FROM products p
        JOIN stalls s ON s.id = p.stall_id
        JOIN users u ON u.id = s.owner_id
        LEFT JOIN ({INTERACTIONS}) b ON b.product_id = p.id
        WHERE {PUBLIC_PRODUCT}
        GROUP BY p.id, p.created_at
        ORDER BY coalesce(sum(CASE b.action
            WHEN 'purchase' THEN 5 WHEN 'cart_add' THEN 3 WHEN 'wishlist' THEN 2 WHEN 'view' THEN 1 END), 0) DESC,
            p.created_at DESC
        LIMIT %s
        """,
        (n,),
    )
    return [row["id"] for row in rows]
