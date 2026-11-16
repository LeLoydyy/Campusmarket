"""
Campus Market 2.0 — AI Recommendation Engine
Hybrid: user-based collaborative filtering + content-based filtering
"""

import numpy as np
import pandas as pd

from data_loader import get_popular_product_ids, load_active_products, load_behavior_scores


# ── Maths helpers (plain numpy, so the service stays small enough for Vercel) ──

def cosine_similarity(a, b=None) -> np.ndarray:
    """Cosine similarity between the rows of a and the rows of b (or of a with itself).
    Same result as sklearn.metrics.pairwise.cosine_similarity: all-zero rows score 0."""
    a = np.asarray(a, dtype=float)
    b = a if b is None else np.asarray(b, dtype=float)
    a_norm = np.linalg.norm(a, axis=1, keepdims=True)
    b_norm = np.linalg.norm(b, axis=1, keepdims=True)
    a_norm[a_norm == 0] = 1
    b_norm[b_norm == 0] = 1
    return (a / a_norm) @ (b / b_norm).T


def min_max_scale(values: pd.Series) -> pd.Series:
    """Scale to 0–1 like sklearn's MinMaxScaler; a column with one value becomes all 0."""
    low, high = values.min(), values.max()
    return (values - low) / (high - low) if high > low else values * 0.0


def build_user_item_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Build a user × product interaction matrix."""
    if df.empty:
        return pd.DataFrame()
    pivot = df.pivot_table(
        index="user_id",
        columns="product_id",
        values="score",
        aggfunc="sum",
        fill_value=0,
    )
    return pivot


# ── Collaborative filtering ───────────────────────────────────────────────────

def collaborative_filter(user_id: str, pivot: pd.DataFrame, n: int = 12) -> list:
    """
    User-based collaborative filtering.
    Finds the most similar users and recommends products they interacted with
    that the target user hasn't seen yet.
    """
    if pivot.empty or user_id not in pivot.index:
        return []

    user_vector = pivot.loc[[user_id]].values  # shape (1, n_products)
    all_vectors = pivot.values                  # shape (n_users, n_products)

    similarities = cosine_similarity(user_vector, all_vectors)[0]
    sim_series = pd.Series(similarities, index=pivot.index)

    # Exclude self
    sim_series = sim_series.drop(user_id, errors="ignore")
    top_similar = sim_series.nlargest(20).index

    # Weighted average of similar users' scores
    weights = sim_series[top_similar].values
    similar_matrix = pivot.loc[top_similar].values
    if weights.sum() == 0:
        return []

    weighted_scores = np.average(similar_matrix, axis=0, weights=weights)
    candidate_scores = pd.Series(weighted_scores, index=pivot.columns)

    # Remove products user already interacted with (score > 0)
    user_seen = pivot.loc[user_id]
    candidate_scores = candidate_scores[user_seen == 0]

    return candidate_scores.nlargest(n).index.tolist()


# ── Content-based filtering ───────────────────────────────────────────────────

def content_based_filter(product_id: str, products_df: pd.DataFrame, n: int = 8) -> list:
    """
    Content-based similarity using category encoding + normalised price.
    """
    if products_df.empty or product_id not in products_df["id"].values:
        return []

    df = products_df.copy()
    df["price_norm"] = min_max_scale(df["price"].astype(float))

    # One-hot encode category for better distance measurement
    cat_dummies = pd.get_dummies(df["category"], prefix="cat")
    features = pd.concat([cat_dummies, df[["price_norm"]]], axis=1).astype(float).values

    sim_matrix = cosine_similarity(features)
    product_idx = df[df["id"] == product_id].index[0]

    scores = sim_matrix[product_idx]
    sorted_idx = np.argsort(scores)[::-1]

    # Exclude the product itself
    result_ids = [
        df.iloc[i]["id"]
        for i in sorted_idx
        if df.iloc[i]["id"] != product_id
    ][:n]

    return result_ids


# ── Popular fallback ──────────────────────────────────────────────────────────

def get_popular_products(behavior_df: pd.DataFrame, n: int = 12) -> list:
    """Return the most interacted-with products (cold start fallback)."""
    if behavior_df.empty:
        return []
    popular = (
        behavior_df.groupby("product_id")["score"]
        .sum()
        .nlargest(n)
        .index.tolist()
    )
    return popular


# ── Main recommendation function ──────────────────────────────────────────────

def get_recommendations(user_id: str, n: int = 12) -> list:
    """
    Hybrid recommendation:
    1. Collaborative filtering (personalised), limited to currently visible products
    2. Fallback to popular products (cold start)
    """
    behavior_df = load_behavior_scores()

    # Needs a few interactions before personalising
    if (behavior_df["user_id"] == user_id).sum() >= 3:
        pivot = build_user_item_matrix(behavior_df)
        visible = set(load_active_products()["id"])
        cf_ids = [pid for pid in collaborative_filter(user_id, pivot, n=n * 2) if pid in visible][:n]
        if cf_ids:
            return cf_ids

    return get_popular_product_ids(n)


def get_similar(product_id: str, n: int = 8) -> list:
    """Return content-based similar products for a given product."""
    return content_based_filter(product_id, load_active_products(), n)
