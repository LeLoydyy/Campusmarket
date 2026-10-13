import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Banknote, Download, Minus, PackageSearch, Plus, Printer, ReceiptText, Search, ShoppingBasket, Store, Trash2, UserRound, X } from "lucide-react";
import Sidebar from "../../components/common/Sidebar.jsx";
import api, { productService, stallService } from "../../services/api.js";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { discountLabel, effectivePrice, isOnSale, productOptions } from "../../utils/pricing.js";
import { csvDate, downloadCsv } from "../../utils/csv.js";
import "./PointOfSale.css";

const money = (amount) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
// getRandomValues also works on a phone using an HTTP LAN development address.
const newRequestId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const LOW_STOCK = 3;
// The exact amount plus the next round bills a buyer is likely to hand over.
const quickCash = (total) => [...new Set([total, ...[50, 100, 500, 1000].map((bill) => Math.ceil(total / bill) * bill)])].filter((amount) => amount > 0).slice(0, 4);
const isToday = (date) => new Date(date).toDateString() === new Date().toDateString();

export default function PointOfSale() {
  const [products, setProducts] = useState([]);
  const [stall, setStall] = useState(null);
  const [sales, setSales] = useState([]);
  const [cart, setCart] = useState({});
  const [query, setQuery] = useState("");
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyer, setBuyer] = useState(null);
  const [cash, setCash] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [findingBuyer, setFindingBuyer] = useState(false);
  const [choosing, setChoosing] = useState(null); // product whose option is being picked
  const requestId = useRef(newRequestId());
  const receiptClose = useRef(null);
  const load = async () => {
    const [store, history] = await Promise.all([stallService.getMy(), api.get("/pos/sales")]);
    setStall(store.data); setSales(history.data);
    if (store.data) {
      const { data } = await productService.getAll({ mine: true, limit: 100 });
      setProducts(data.data);
    }
  };
  useEffect(() => { load().catch((err) => setError(err.response?.data?.error || "Could not load the point of sale.")).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!receipt) return undefined;
    receiptClose.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") setReceipt(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [receipt]);
  // Cart keys are "productId" or "productId:optionId" (sizes and flavours are separate lines).
  useEffect(() => {
    if (!choosing) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setChoosing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choosing]);
  const lines = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([key, quantity]) => {
    const [productId, optionId] = key.split(":");
    const product = products.find((item) => item.id === productId);
    if (!product) return null;
    const option = optionId ? productOptions(product).find((item) => item.id === optionId) : null;
    if (optionId && !option) return null;
    return {
      key, id: product.id, option_id: option?.id || null, quantity,
      name: option ? `${product.name} (${option.label})` : product.name,
      price: effectivePrice(product),
      stock: option ? option.stock : product.stock,
    };
  }).filter(Boolean);
  const inSaleFor = (productId) => Object.entries(cart).reduce((sum, [key, quantity]) => (key.split(":")[0] === productId ? sum + quantity : sum), 0);
  const total = lines.reduce((sum, line) => sum + Math.round(line.price * 100) * line.quantity, 0) / 100;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const cashValue = cash === "" ? null : Number(cash);
  const short = cashValue !== null && cashValue < total;
  const visibleProducts = products.filter((product) => product.is_active && product.name.toLowerCase().includes(query.trim().toLowerCase()));
  const todaySales = sales.filter((sale) => isToday(sale.created_at));
  const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const changeCart = (id, quantity) => {
    requestId.current = newRequestId();
    setCart((current) => ({ ...current, [id]: Math.max(0, quantity) }));
  };
  const changeCash = (value) => { setCash(value); requestId.current = newRequestId(); };
  const clearSale = () => { requestId.current = newRequestId(); setCart({}); setCash(""); };
  const changeBuyer = () => {
    setBuyer(null); requestId.current = newRequestId();
    setTimeout(() => document.getElementById("pos-buyer")?.focus());
  };
  const findBuyer = async (event) => {
    event.preventDefault(); setError(""); setBuyer(null); setFindingBuyer(true);
    try {
      const { data } = await api.get("/pos/customers", { params: { q: buyerQuery.trim() } });
      if (!data.length) setError("No approved buyer found. Enter their exact CSUCC ID or account email.");
      else { setBuyer(data[0]); requestId.current = newRequestId(); }
    } catch (err) { setError(err.response?.data?.error || "Could not find the buyer."); }
    finally { setFindingBuyer(false); }
  };
  const recordSale = async () => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/pos/sales", { request_id: requestId.current, buyer_id: buyer.id,
        items: lines.map((line) => ({ product_id: line.id, ...(line.option_id ? { option_id: line.option_id } : {}), quantity: line.quantity })), cash_received: Number(cash) });
      setReceipt(data); setCart({}); setCash(""); setBuyer(null); setBuyerQuery(""); requestId.current = newRequestId();
      await load();
    } catch (err) { setError(err.response?.data?.error || "Could not record sale. Retry to check the same transaction."); }
    finally { setBusy(false); }
  };
  const exportSales = () => downloadCsv(`campus-market-counter-sales-${csvDate()}.csv`,
    ["Date", "Receipt", "Buyer", "Items", "Total (PHP)", "Cash (PHP)", "Change (PHP)"],
    sales.map((sale) => [
      new Date(sale.created_at).toLocaleString("en-PH"),
      sale.id,
      sale.buyer_name,
      (sale.items || []).map((line) => `${line.quantity} × ${line.name}`).join("; "),
      Number(sale.total).toFixed(2),
      Number(sale.cash_received).toFixed(2),
      Number(sale.change).toFixed(2),
    ]));

  // Why the record button is disabled, shown under it so the seller knows the next step.
  const blocker = !buyer ? "Find a verified buyer first." : !lines.length ? "Add at least one product." : cash === "" ? "Enter the cash received." : short ? `Cash is short by ${money(total - cashValue)}.` : "";

  return <div className="dashboard-layout"><Sidebar /><main className="dashboard-main">
    <div className="topbar"><div><h1>Point of sale</h1><p>Record campus counter sales and keep stock up to date.</p></div></div>
    <div className="dashboard-content pos-page">
      {error && <p className="pos-error" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss message" onClick={() => setError("")}><X size={16} /></button></p>}
      {loading ? <p role="status">Loading your store…</p> : !stall || stall.status !== "approved" || !stall.is_active ? <EmptyState illustration="store" title="Your counter opens with your stall" description="Once your stall is approved and open in My Stall, you can record cash sales here." action={{ label: "Go to My Stall", to: "/seller/stall" }} /> : !stall.plan?.pos ? <EmptyState illustration="store" title="The point of sale is a Premium feature" description="Premium adds counter sales with printable receipts, product analytics, 3 featured products on the buyer home page and up to 25 listings." action={{ label: "See Premium", to: "/seller/plans?feature=pos" }} /> : <>
        <div className="pos-summary">
          <div className="pos-summary-store">
            <span className="pos-summary-icon"><Store size={20} aria-hidden="true" /></span>
            <div><strong>{stall.name}</strong><span className="pos-chip">{stall.plan?.name || "Free"} plan · POS included</span></div>
          </div>
          <dl className="pos-summary-stats">
            <div><dt>Sales today</dt><dd>{todaySales.length}</dd></div>
            <div><dt>Earned today</dt><dd>{money(todayTotal)}</dd></div>
          </dl>
        </div>

        <div className="pos-layout">
          <section className="card pos-panel" aria-labelledby="pos-products-title">
            <div className="pos-panel-head"><h2 id="pos-products-title">Products</h2><span>{visibleProducts.length} available · tap to add</span></div>
            <label className="pos-input-icon pos-search"><span className="sr-only">Find a product</span><Search size={18} aria-hidden="true" /><input className="form-input" type="search" placeholder="Search your products" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <div className="pos-products">{visibleProducts.map((product) => {
              const inSale = inSaleFor(product.id);
              const left = product.stock - inSale;
              const hasOptions = productOptions(product).length > 0;
              return <button type="button" className={`pos-product${inSale ? " is-selected" : ""}`} key={product.id} disabled={busy || left <= 0}
                onClick={() => (hasOptions ? setChoosing(product) : changeCart(product.id, (cart[product.id] || 0) + 1))}
                aria-label={`${hasOptions ? "Choose an option for" : "Add"} ${product.name}, ${money(effectivePrice(product))}, ${left} left${inSale ? `, ${inSale} in this sale` : ""}`}>
                <span className="pos-product-media">
                  {product.image_url ? <img src={product.image_url} alt="" /> : <ShoppingBasket size={32} aria-hidden="true" />}
                  {inSale > 0 && <span className="pos-product-count">{inSale}</span>}
                  {isOnSale(product) && <span className="pos-sale-tag">{discountLabel(product)}</span>}
                </span>
                <span className="pos-product-body">
                  <strong>{product.name}</strong>
                  <span className="pos-product-foot">
                    <span className="pos-product-price">
                      {money(effectivePrice(product))}
                      {isOnSale(product) && <s className="pos-price-was">{money(product.price)}</s>}
                    </span>
                    <span className={`pos-stock${left <= 0 ? " is-out" : left <= LOW_STOCK ? " is-low" : ""}`}>{left <= 0 ? "Sold out" : `${left} left`}</span>
                  </span>
                </span>
                <span className="pos-product-add" aria-hidden="true"><Plus size={16} /></span>
              </button>;
            })}</div>
            {!products.length && <div className="pos-empty"><PackageSearch size={28} aria-hidden="true" /><p>Add products to your store to start a sale.</p></div>}
            {products.length > 0 && !visibleProducts.length && <div className="pos-empty"><PackageSearch size={28} aria-hidden="true" /><p>No products match “{query}”.</p></div>}
          </section>

          <section className="card pos-panel pos-sale" aria-labelledby="pos-sale-title">
            <div className="pos-panel-head"><h2 id="pos-sale-title">Current sale</h2>{lines.length > 0 && <button type="button" className="pos-link" disabled={busy} onClick={clearSale}>Clear items</button>}</div>

            <div className={`pos-step${buyer ? " is-done" : ""}`}>
              <h3><span className="pos-step-num">1</span>Buyer</h3>
              {buyer ? <div className="pos-buyer-card">
                <BadgeCheck size={22} aria-hidden="true" />
                <div><strong>{buyer.name}</strong><span>Verified · {buyerQuery.trim()}</span></div>
                <button type="button" className="pos-link" disabled={busy} onClick={changeBuyer}>Change</button>
              </div> : <form onSubmit={findBuyer} className="pos-buyer-search">
                <label htmlFor="pos-buyer" className="sr-only">Buyer’s exact email or CSUCC ID</label>
                <span className="pos-input-icon"><UserRound size={18} aria-hidden="true" /><input id="pos-buyer" required minLength={3} className="form-input" placeholder="Buyer’s exact email or CSUCC ID" value={buyerQuery} disabled={busy} onChange={(e) => setBuyerQuery(e.target.value)} /></span>
                <button className="btn btn-outline" disabled={busy || findingBuyer}>{findingBuyer ? "Finding…" : "Find buyer"}</button>
              </form>}
            </div>

            <div className={`pos-step${lines.length ? " is-done" : ""}`}>
              <h3><span className="pos-step-num">2</span>Items{itemCount > 0 && <small>{itemCount} item{itemCount === 1 ? "" : "s"}</small>}</h3>
              {!lines.length ? <div className="pos-cart-empty"><ShoppingBasket size={22} aria-hidden="true" /><p>Tap a product to add it to this sale.</p></div>
                : <ul className="pos-lines">{lines.map((line) => <li className="pos-line" key={line.key}>
                  <div className="pos-line-info"><strong>{line.name}</strong><span>{money(line.price)} each</span></div>
                  <div className="pos-qty">
                    <button type="button" aria-label={line.quantity === 1 ? `Remove ${line.name}` : `One less ${line.name}`} disabled={busy} onClick={() => changeCart(line.key, line.quantity - 1)}>{line.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button>
                    <label className="sr-only" htmlFor={`qty-${line.key}`}>Quantity for {line.name}</label>
                    <input id={`qty-${line.key}`} type="number" inputMode="numeric" min={0} max={line.stock} step={1} value={line.quantity} disabled={busy} onChange={(e) => changeCart(line.key, Math.min(line.stock, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
                    <button type="button" aria-label={`One more ${line.name}`} disabled={busy || line.quantity >= line.stock} onClick={() => changeCart(line.key, line.quantity + 1)}><Plus size={15} /></button>
                  </div>
                  <strong className="pos-line-total">{money(line.price * line.quantity)}</strong>
                </li>)}</ul>}
            </div>

            <div className="pos-step pos-pay">
              <h3><span className="pos-step-num">3</span>Payment</h3>
              <p className="pos-total"><span>Total</span><strong>{money(total)}</strong></p>
              <label htmlFor="pos-cash" className="pos-field-label">Cash received</label>
              <span className="pos-input-icon"><Banknote size={18} aria-hidden="true" /><input id="pos-cash" className="form-input" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={cash} disabled={busy} onChange={(e) => changeCash(e.target.value)} /></span>
              {total > 0 && <div className="pos-quick-cash" role="group" aria-label="Quick cash amounts">{quickCash(total).map((amount, index) => <button type="button" key={amount} disabled={busy} className={cashValue === amount ? "is-active" : ""} onClick={() => changeCash(String(amount))}>{index === 0 ? "Exact" : money(amount).replace(".00", "")}</button>)}</div>}
              <p className={`pos-change${short ? " is-short" : ""}`} aria-live="polite"><span>{short ? "Short by" : "Change"}</span><strong>{money(short ? total - cashValue : Math.max(0, (cashValue ?? 0) - total))}</strong></p>
              <button className="btn btn-primary btn-lg pos-record" disabled={busy || Boolean(blocker)} onClick={recordSale}><ReceiptText size={18} aria-hidden="true" />{busy ? "Recording…" : total > 0 ? `Record sale · ${money(total)}` : "Record cash sale"}</button>
              {blocker && !busy && <p className="pos-hint">{blocker}</p>}
            </div>
          </section>
        </div>

        <section className="card pos-panel pos-history" aria-labelledby="pos-history-title">
          <div className="pos-panel-head"><h2 id="pos-history-title">Sales history</h2>{sales.length > 0 && <span className="pos-history-tools">Latest {Math.min(20, sales.length)} of {sales.length}<button type="button" className="pos-link" onClick={exportSales}><Download size={14} aria-hidden="true" /> Export CSV</button></span>}</div>
          {!sales.length && <EmptyState compact illustration="check" title="No counter sales yet" description="Cash sales you record above will be listed here with printable receipts." action={{ label: "Find a buyer", onClick: () => document.getElementById("pos-buyer")?.focus() }} />}
          {sales.length > 0 && <ul className="pos-history-list">{sales.slice(0, 20).map((sale) => <li key={sale.id}><button type="button" className="pos-history-row" onClick={() => setReceipt(sale)}>
            <span className="pos-history-icon"><ReceiptText size={18} aria-hidden="true" /></span>
            <span className="pos-history-main">
              <strong>{sale.buyer_name}</strong>
              <span>{new Date(sale.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}{sale.items?.length ? ` · ${sale.items.reduce((sum, line) => sum + line.quantity, 0)} items` : ""}</span>
            </span>
            <strong className="pos-history-total">{money(sale.total)}</strong>
            <span className="pos-history-view">View receipt</span>
          </button></li>)}</ul>}
        </section>
      </>}

      {choosing && <div className="pos-receipt-backdrop" onClick={() => setChoosing(null)}>
        <section className="pos-receipt pos-option-picker" role="dialog" aria-modal="true" aria-labelledby="pos-option-title" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="pos-receipt-close" aria-label="Close" onClick={() => setChoosing(null)}><X size={18} /></button>
          <h2 id="pos-option-title">{choosing.name}</h2>
          <p>Which one? {money(effectivePrice(choosing))} each.</p>
          <div className="pos-option-grid">
            {productOptions(choosing).map((option) => {
              const key = `${choosing.id}:${option.id}`;
              const left = option.stock - (cart[key] || 0);
              return (
                <button type="button" key={option.id} disabled={left <= 0} autoFocus={left > 0 && option === productOptions(choosing).find((item) => item.stock - (cart[`${choosing.id}:${item.id}`] || 0) > 0)}
                  onClick={() => { changeCart(key, (cart[key] || 0) + 1); setChoosing(null); }}>
                  <strong>{option.label}</strong>
                  <small>{left <= 0 ? "Sold out" : `${left} left`}{cart[key] ? ` · ${cart[key]} in sale` : ""}</small>
                </button>
              );
            })}
          </div>
        </section>
      </div>}

      {receipt && <div className="pos-receipt-backdrop" onClick={() => setReceipt(null)}>
        <section className="pos-receipt" role="dialog" aria-modal="true" aria-labelledby="pos-receipt-title" onClick={(e) => e.stopPropagation()}>
          <button type="button" ref={receiptClose} className="pos-receipt-close" aria-label="Close receipt" onClick={() => setReceipt(null)}><X size={18} /></button>
          <header><h2 id="pos-receipt-title">{receipt.stall_name}</h2><p>Counter sale receipt</p></header>
          <dl className="pos-receipt-meta">
            <div><dt>Date</dt><dd>{new Date(receipt.created_at).toLocaleString("en-PH")}</dd></div>
            <div><dt>Buyer</dt><dd>{receipt.buyer_name}</dd></div>
            <div><dt>Receipt no.</dt><dd className="pos-receipt-id">{receipt.id}</dd></div>
          </dl>
          <ul className="pos-receipt-items">{receipt.items.map((line) => <li key={line.product_id}><span>{line.quantity} × {line.name}</span><span>{money(line.quantity * line.unit_price)}</span></li>)}</ul>
          <dl className="pos-receipt-totals">
            <div className="is-total"><dt>Total</dt><dd>{money(receipt.total)}</dd></div>
            <div><dt>Cash</dt><dd>{money(receipt.cash_received)}</dd></div>
            <div><dt>Change</dt><dd>{money(receipt.change)}</dd></div>
          </dl>
          <p className="pos-receipt-thanks">Thank you for shopping at Campus Market!</p>
          <div className="pos-receipt-actions"><button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print receipt</button><button type="button" className="btn btn-ghost" onClick={() => setReceipt(null)}>Done</button></div>
        </section>
      </div>}
    </div>
  </main></div>;
}
