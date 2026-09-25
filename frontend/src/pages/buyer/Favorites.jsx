import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Heart } from "lucide-react";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Navbar from "../../components/common/Navbar.jsx";
import ProductCard from "../../components/common/ProductCard.jsx";
import { SkeletonGrid } from "../../components/common/Ui.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import favoriteService from "../../services/favoriteService.js";

export default function Favorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.id) {
      setFavorites([]);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");

    favoriteService
      .getAll(user.id)
      .then((savedProducts) => {
        if (active) setFavorites(savedProducts);
      })
      .catch(() => {
        if (active) setError("We could not load your saved products.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = favoriteService.subscribe(user.id, (savedProducts) => {
      if (active) setFavorites(savedProducts);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.id]);

  return (
    <div className="favorites-shell">
      <Navbar />

      <main className="favorites-page">
        <header className="favorites-header">
          <div className="favorites-heading-copy">
            <span className="favorites-heading-icon" aria-hidden="true">
              <Heart />
            </span>
            <div>
              <span className="favorites-eyebrow">Your collection</span>
              <h1>Saved favorites</h1>
              <p>Keep the campus finds you love in one convenient place.</p>
            </div>
          </div>

          {!loading && favorites.length > 0 && (
            <div className="favorites-count">
              <strong>{favorites.length}</strong>
              <span>
                {favorites.length === 1 ? "saved product" : "saved products"}
              </span>
            </div>
          )}
        </header>

        {loading ? (
          <section className="favorites-loading" aria-label="Loading favorites">
            <SkeletonGrid count={8} />
          </section>
        ) : error ? (
          <section
            className="favorites-state-card favorites-error"
            role="alert"
          >
            <span>
              <Heart />
            </span>
            <h2>Favorites unavailable</h2>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </section>
        ) : favorites.length === 0 ? (
          <EmptyState
            illustration="heart"
            title="No favorites yet"
            description="Tap the heart on any product to save it here. Favorites are kept on this device."
            action={{ label: "Explore products", to: "/browse" }}
          />
        ) : (
          <section aria-labelledby="favorites-grid-heading">
            <div className="favorites-section-heading">
              <div>
                <span className="favorites-eyebrow">Saved for later</span>
                <h2 id="favorites-grid-heading">Products you liked</h2>
              </div>
              <Link to="/browse">
                Discover more <ArrowRight size={14} />
              </Link>
            </div>

            <div className="product-grid favorites-product-grid fade-in">
              {favorites.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
