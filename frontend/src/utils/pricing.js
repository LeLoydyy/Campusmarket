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
