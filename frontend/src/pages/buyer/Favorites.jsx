import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Heart } from "lucide-react";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import ProductCard from "../../components/ui/ProductCard.jsx";
import { SkeletonGrid } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import favoriteService from "../../services/favoriteService.js";
import { productService } from "../../services/api.js";
import { plural } from "../../utils/marketplace.js";
import "./Favorites.css";

// Below this many saved items, suggest popular products so the page isn't empty.
const SUGGEST_UNDER = 4;

export default function Favorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [popular, setPopular] = useState([]);

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

  useEffect(() => {
    let active = true;
    productService.getAll({ sort: "popular", limit: 12 })
      .then(({ data }) => { if (active) setPopular(Array.isArray(data?.data) ? data.data : []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const suggestions = useMemo(() => {
    const saved = new Set(favorites.map((item) => String(item.id)));
    return popular.filter((item) => !saved.has(String(item.id))).slice(0, 4);
  }, [favorites, popular]);
  const showSuggestions = !loading && !error && favorites.length < SUGGEST_UNDER && suggestions.length > 0;

  return (
    <div className="fav-shell">
      <Navbar />

      <main className="fav-page">
        <header className="fav-hero">
          <span className="fav-hero-icon" aria-hidden="true"><Heart /></span>
          <div>
            <p className="cm-eyebrow">Your collection</p>
            <h1>Saved favorites</h1>
            <p>{!loading && favorites.length ? `${plural(favorites.length, "product")} saved on this device.` : "Tap the heart on any product to keep it here."}</p>
          </div>
          {!loading && favorites.length > 0 && <Link to="/browse" className="btn btn-outline btn-sm fav-more">Discover more <ArrowRight aria-hidden="true" /></Link>}
        </header>

        {loading ? (
          <SkeletonGrid count={4} />
        ) : error ? (
          <EmptyState compact illustration="heart" title="Favorites unavailable" description={error} action={{ label: "Try again", onClick: () => window.location.reload() }} />
        ) : favorites.length === 0 ? (
          <EmptyState
            compact
            illustration="heart"
            title="No favorites yet"
            description="Tap the heart on a product to save it for later. Favorites are kept on this device."
            action={{ label: "Explore products", to: "/browse" }}
          />
        ) : (
          <section aria-label="Saved products">
            <div className="pc-grid fav-grid">
              {favorites.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          </section>
        )}

        {showSuggestions && (
          <section className="fav-suggest" aria-labelledby="fav-suggest-title">
            <div className="cm-section-head">
              <div>
                <p className="cm-eyebrow">Popular on campus</p>
                <h2 id="fav-suggest-title">{favorites.length ? "You might also like" : "Start with these"}</h2>
              </div>
              <Link to="/browse" className="cm-link">Browse all <ArrowRight aria-hidden="true" /></Link>
            </div>
            <div className="pc-grid fav-grid">
              {suggestions.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
