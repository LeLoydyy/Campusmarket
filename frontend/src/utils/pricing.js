/** A product is on sale when it has a sale price below its regular price. */
export const isOnSale = (product) =>
  product?.sale_price != null && product.sale_price !== "" && Number(product.sale_price) < Number(product.price);

/** What the buyer pays per unit (the sale price when on sale). */
export const effectivePrice = (product) => Number(isOnSale(product) ? product.sale_price : product?.price) || 0;

/** "−33%" style badge text for a product on sale. */
export const discountLabel = (product) =>
  isOnSale(product) ? `−${Math.round((1 - Number(product.sale_price) / Number(product.price)) * 100)}%` : "";

/** Options (sizes, flavours) with their own stock; empty when the product has none. */
export const productOptions = (product) => (Array.isArray(product?.options) ? product.options : []);

/** What a product's options are, for sentences: "size", "cup size"… (falls back to "option"). */
export const optionNoun = (product) => String(product?.option_type || "").trim().toLowerCase() || "option";
/** "a size", "an option". */
export const withArticle = (noun) => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
/** Short line for cards: "Size: S · M · L · XL". */
export const optionSummary = (product) => {
  const options = productOptions(product);
  if (!options.length) return "";
  const type = String(product?.option_type || "").trim();
  return `${type || "Options"}: ${options.map((option) => option.label).join(" · ")}`;
};
