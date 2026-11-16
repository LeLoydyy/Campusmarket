"""
TC06 — algorithm-level tests for the AI recommendation engine.

Runs the real recommender code (recommender.py, data_loader.py) on a small,
fixed scenario held in memory, so no database is needed:

  Products: 4 food items (F1–F4) and 4 school supplies (S1–S4).
  Buyer B bought F1–F4.          Buyer A added F1–F3 to cart (similar to B).
  Buyer D bought S1–S4.          Buyer C added S1–S3 to cart (similar to D).
  Buyer E has no activity.       Buyer G viewed only 2 products (below the 3-product threshold).

Run from the ai-service folder:
    venv\\Scripts\\python -m unittest tests.test_recommender -v
"""

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import data_loader  # noqa: E402
import recommender  # noqa: E402

PRODUCTS = pd.DataFrame(
    [
        ("F1", "Siomai", "food", 30.0), ("F2", "Turon", "food", 25.0),
        ("F3", "Banana Cue", "food", 20.0), ("F4", "Chicken Rice", "food", 60.0),
        ("S1", "Notebook", "school-supplies", 45.0), ("S2", "Ballpen Set", "school-supplies", 35.0),
        ("S3", "Highlighter", "school-supplies", 40.0), ("S4", "Scientific Calculator", "school-supplies", 450.0),
    ],
    columns=["id", "name", "category", "price"],
).assign(stall_id="stall-1")

ACTIONS = (
    [("B", p, "purchase") for p in ("F1", "F2", "F3", "F4")]
    + [("A", p, "cart_add") for p in ("F1", "F2", "F3")]
    + [("D", p, "purchase") for p in ("S1", "S2", "S3", "S4")]
    + [("C", p, "cart_add") for p in ("S1", "S2", "S3")]
    + [("G", "F1", "view"), ("G", "S1", "view")]
)


def fake_behavior():
    """Same shape load_all_behavior() returns, scored by the real ACTION_WEIGHTS."""
    rows = [{"user_id": u, "product_id": p, "action": a, "created_at": None} for u, p, a in ACTIONS]
    return data_loader._with_scores(rows, ["user_id", "product_id", "action", "created_at"])


def fake_popular(n=12):
    """Mirrors get_popular_product_ids(): most total points first."""
    scores = fake_behavior().groupby("product_id")["score"].sum().sort_values(ascending=False, kind="stable")
    return scores.index.tolist()[:n]


class RecommenderTC06(unittest.TestCase):
    results = {}

    def setUp(self):
        self._saved = (data_loader.load_all_behavior, recommender.load_active_products, recommender.get_popular_product_ids)
        data_loader.load_all_behavior = fake_behavior
        recommender.load_active_products = lambda: PRODUCTS.copy()
        recommender.get_popular_product_ids = fake_popular

    def tearDown(self):
        data_loader.load_all_behavior, recommender.load_active_products, recommender.get_popular_product_ids = self._saved

    def recommend(self, user):
        recs = recommender.get_recommendations(user, n=8)
        RecommenderTC06.results[f"Recommended for Buyer {user}"] = recs
        return recs

    def test_1_interaction_weights(self):
        """Purchases weigh most, then cart, favorites, and views (5 > 3 > 2 > 1)."""
        w = data_loader.ACTION_WEIGHTS
        self.assertEqual((w["purchase"], w["cart_add"], w["wishlist"], w["view"]), (5, 3, 2, 1))

    def test_2_collaborative_filtering_food_buyer(self):
        """Buyer A (like B) gets F4 first — the item B bought that A has not seen."""
        recs = self.recommend("A")
        self.assertEqual(recs[0], "F4")
        self.assertFalse({"F1", "F2", "F3"} & set(recs), "already-seen products must not be recommended")

    def test_3_collaborative_filtering_supplies_buyer(self):
        """Buyer C (like D) gets S4 first."""
        recs = self.recommend("C")
        self.assertEqual(recs[0], "S4")
        self.assertFalse({"S1", "S2", "S3"} & set(recs))

    def test_4_personalized(self):
        """Buyers with different histories receive different lists."""
        self.assertNotEqual(self.recommend("A"), self.recommend("C"))

    def test_5_cold_start_new_buyer(self):
        """Buyer E (no history) receives the popular-products fallback."""
        self.assertEqual(self.recommend("E"), fake_popular(8))

    def test_6_cold_start_below_threshold(self):
        """Buyer G (2 products, below the 3-product minimum) also receives popular products."""
        self.assertEqual(self.recommend("G"), fake_popular(8))

    def test_7_content_based_similar_products(self):
        """Similar products for F1 are the other food items first, excluding F1 itself."""
        similar = recommender.get_similar("F1", n=4)
        RecommenderTC06.results["Similar to F1"] = similar
        self.assertNotIn("F1", similar)
        self.assertEqual(set(similar[:3]), {"F2", "F3", "F4"})

    def test_8_hidden_products_excluded(self):
        """A product that is no longer visible (e.g. deactivated) is never recommended."""
        recommender.load_active_products = lambda: PRODUCTS[PRODUCTS["id"] != "S4"].copy()
        self.assertNotIn("S4", recommender.get_recommendations("C", n=8))

    @classmethod
    def tearDownClass(cls):
        names = dict(zip(PRODUCTS["id"], PRODUCTS["name"]))
        print("\nTC06 recommendation outputs:")
        for label, ids in cls.results.items():
            print(f"  {label}: " + ", ".join(f"{i} ({names[i]})" for i in ids))


if __name__ == "__main__":
    unittest.main(verbosity=2)
