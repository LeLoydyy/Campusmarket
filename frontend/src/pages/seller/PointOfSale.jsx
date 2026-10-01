import { useEffect, useRef, useState } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import api, { productService, stallService } from "../../services/api.js";
import EmptyState from "../../components/ui/EmptyState.jsx";
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
  const requestId = useRef(newRequestId());
  const load = async () => {
    const [store, history] = await Promise.all([stallService.getMy(), api.get("/pos/sales")]);
    setStall(store.data); setSales(history.data);
    if (store.data) {
      const { data } = await productService.getAll({ mine: true, limit: 100 });
      setProducts(data.data);
    }
  };
  useEffect(() => { load().catch((err) => setError(err.response?.data?.error || "Could not load the point of sale.")).finally(() => setLoading(false)); }, []);
  const lines = products.filter((product) => cart[product.id]).map((product) => ({ ...product, quantity: cart[product.id] }));
  const total = lines.reduce((sum, line) => sum + Math.round(line.price * 100) * line.quantity, 0) / 100;
  const changeCart = (id, quantity) => {
    requestId.current = newRequestId();
    setCart((current) => ({ ...current, [id]: Math.max(0, quantity) }));
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
        items: lines.map((line) => ({ product_id: line.id, quantity: line.quantity })), cash_received: Number(cash) });
      setReceipt(data); setCart({}); setCash(""); setBuyer(null); setBuyerQuery(""); requestId.current = newRequestId();
      await load();
    } catch (err) { setError(err.response?.data?.error || "Could not record sale. Retry to check the same transaction."); }
    finally { setBusy(false); }
  };
  return <div className="dashboard-layout"><Sidebar /><main className="dashboard-main">
    <div className="topbar"><div><h1>Point of sale</h1><p>Record campus counter sales and keep stock up to date.</p></div></div>
    <div className="dashboard-content pos-page">
      {error && <p className="pos-error" role="alert">{error}</p>}
      {loading ? <p role="status">Loading your store…</p> : !stall || stall.status !== "approved" || !stall.is_active ? <EmptyState illustration="store" title="Your counter opens with your stall" description="Once your stall is approved and open in My Stall, you can record cash sales here." action={{ label: "Go to My Stall", to: "/seller/stall" }} /> : !stall.plan?.pos ? <EmptyState illustration="store" title="The point of sale is a Premium feature" description="Premium adds counter sales with printable receipts, product analytics, landing-page advertising and up to 25 listings. Contact the campus administrator to request a plan change." action={{ label: "Back to my products", to: "/seller/products" }} /> : <>
        <p className="pos-plan">{stall.name} · {stall.plan?.name || "Free"} plan · POS included</p>
        <div className="pos-layout">
          <section className="card pos-panel" aria-label="Products">
            <label>Find a product<input className="form-input" type="search" placeholder="Search your products" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <div className="pos-products">{products.filter((product) => product.is_active && product.name.toLowerCase().includes(query.toLowerCase())).map((product) => <button className="pos-product" key={product.id} disabled={busy || product.stock <= (cart[product.id] || 0)} onClick={() => changeCart(product.id, (cart[product.id] || 0) + 1)}>
              {product.image_url && <img src={product.image_url} alt="" />}<strong>{product.name}</strong><span>{money(product.price)}</span><small>{product.stock} in stock</small>
            </button>)}</div>
            {!products.length && <p>Add products to your store to start a sale.</p>}
          </section>
          <section className="card pos-panel" aria-label="Current sale">
            <h2>Current sale</h2>
            <form onSubmit={findBuyer} className="pos-buyer-search"><label>Buyer’s exact email or CSUCC ID<input id="pos-buyer" required minLength={3} className="form-input" value={buyerQuery} disabled={busy} onChange={(e) => { setBuyerQuery(e.target.value); setBuyer(null); }} /></label><button className="btn btn-outline" disabled={busy || findingBuyer}>{findingBuyer ? "Finding…" : "Find verified buyer"}</button></form>
            {buyer && <p className="pos-plan">Verified buyer: {buyer.name}</p>}
            {!lines.length && <p>Select products to start a sale.</p>}
            {lines.map((line) => <div className="pos-line" key={line.id}><div><strong>{line.name}</strong><span>{money(line.price)} each</span></div><label className="sr-only" htmlFor={`qty-${line.id}`}>Quantity for {line.name}</label><input id={`qty-${line.id}`} type="number" min={0} max={line.stock} step={1} value={line.quantity} disabled={busy} onChange={(e) => changeCart(line.id, Math.min(line.stock, Math.max(0, Math.floor(Number(e.target.value) || 0))))} /><button aria-label={`Remove ${line.name}`} disabled={busy} onClick={() => changeCart(line.id, 0)}>×</button></div>)}
            <p className="pos-total">Total <strong>{money(total)}</strong></p>
            <label>Cash received<input className="form-input" type="number" min={0} step="0.01" value={cash} disabled={busy} onChange={(e) => { setCash(e.target.value); requestId.current = newRequestId(); }} /></label>
            <p>Change: <strong>{money(Math.max(0, Number(cash) - total))}</strong></p>
            <button className="btn btn-primary" disabled={busy || !buyer || !lines.length || cash === "" || Number(cash) < total} onClick={recordSale}>{busy ? "Recording…" : "Record cash sale"}</button>
          </section>
        </div>
        <section className="card pos-panel pos-history"><h2>Sales history</h2>{!sales.length && <EmptyState compact illustration="check" title="No counter sales yet" description="Cash sales you record above will be listed here with printable receipts." action={{ label: "Find a buyer", onClick: () => document.getElementById("pos-buyer")?.focus() }} />}{sales.slice(0, 20).map((sale) => <button className="pos-history-row" key={sale.id} onClick={() => setReceipt(sale)}><span>{new Date(sale.created_at).toLocaleString("en-PH")} · {sale.buyer_name}</span><strong>{money(sale.total)} · View receipt</strong></button>)}</section>
      </>}
      {receipt && <section className="card pos-panel pos-receipt" aria-label="Sale receipt" aria-live="polite"><h2>{receipt.stall_name}</h2><p>Counter sale receipt · {receipt.id}</p><p>{new Date(receipt.created_at).toLocaleString("en-PH")} · {receipt.buyer_name}</p>{receipt.items.map((line) => <p key={line.product_id}>{line.quantity} × {line.name} — {money(line.quantity * line.unit_price)}</p>)}<hr /><p>Total: <strong>{money(receipt.total)}</strong></p><p>Cash: {money(receipt.cash_received)} · Change: {money(receipt.change)}</p><button className="btn btn-outline" onClick={() => window.print()}>Print receipt</button><button className="btn btn-ghost" onClick={() => setReceipt(null)}>Close receipt</button></section>}
    </div>
  </main></div>;
}
