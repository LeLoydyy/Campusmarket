import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import { CATEGORY_TILES } from "../../config/categories.js";
import { productService } from "../../services/api.js";
import { plural } from "../../utils/marketplace.js";
import "./Home.css";

/** Every category with how many products it has; each tile opens Browse filtered to it. */
export default function Categories() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let active = true;
    Promise.allSettled(CATEGORY_TILES.map(({ key }) => productService.getAll({ category: key, limit: 1 })))
      .then((results) => {
        if (!active) return;
        setCounts(Object.fromEntries(results.map((result, index) => [
          CATEGORY_TILES[index].key,
          result.status === "fulfilled" ? Number(result.value.data?.total ?? 0) : null,
        ])));
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="home">
      <Navbar />
      <main className="home-wrap categories-page">
        <section className="home-section" aria-labelledby="categories-title">
          <div className="cm-section-head">
            <div>
              <p className="cm-eyebrow">Find it fast</p>
              <h1 id="categories-title">Shop by category</h1>
            </div>
            <Link to="/browse" className="cm-link">All products <ArrowRight aria-hidden="true" size={16} /></Link>
          </div>
          <div className="home-bento">
            {CATEGORY_TILES.map(({ key, label, blurb, icon: Icon, size }) => (
              <Link key={key} to={`/browse?category=${key}`} className={`home-tile home-tile--${key} ${size ? `home-tile--${size}` : ""}`}>
                <span className="home-tile-icon" aria-hidden="true"><Icon /></span>
                <span className="home-tile-text">
                  <strong>{label}</strong>
                  <span>{blurb}</span>
                  <small>{counts[key] == null ? "Browse" : counts[key] ? plural(counts[key], "item") : "Nothing yet"}</small>
                </span>
                {key === "student-made" && <span className="home-tile-sticker" aria-hidden="true">Made at CSUCC</span>}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
