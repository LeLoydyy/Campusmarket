import { Link } from "react-router-dom";

const shopFromText = (shops) => {
  const [first, second] = shops.map((stall) => stall.name);
  if (shops.length === 1) return `Shop from ${first}`;
  if (shops.length === 2) return `Shop from ${first} & ${second}`;
  return `Shop from ${first}, ${second} & more`;
};

/**
 * Overlapping stall logos + "Shop from A, B & more". Used while the counts are still too small to brag about.
 * Pass `to={null}` for a plain (non-link) row, e.g. on the Stalls page itself.
 */
export default function ShopFrom({ stalls, to = "/stalls", max = 5, className = "" }) {
  const shown = stalls.slice(0, max);
  if (!shown.length) return null;
  const Wrapper = to ? Link : "div";
  return (
    <Wrapper {...(to ? { to } : {})} className={`cm-shopfrom ${className}`}>
      <span className="cm-shopfrom-avatars" aria-hidden="true">
        {shown.map((stall) => (
          <span key={stall.id} className="cm-shopfrom-avatar">
            {stall.logo_url ? <img src={stall.logo_url} alt="" loading="lazy" /> : stall.name.charAt(0)}
          </span>
        ))}
      </span>
      <span className="cm-shopfrom-text">{shopFromText(shown)}</span>
    </Wrapper>
  );
}
