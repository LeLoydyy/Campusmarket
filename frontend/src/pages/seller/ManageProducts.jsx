import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import { Modal } from "../../components/common/Ui.jsx";
import { productService, stallService } from "../../services/api.js";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiExternalLink,
  FiImage,
  FiMoreHorizontal,
  FiPackage,
  FiMinus,
  FiPlus,
  FiSearch,
  FiStar,
  FiTrash2,
  FiTrendingDown,
  FiX,
} from "react-icons/fi";
import "./ManageProducts.css";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { discountLabel, effectivePrice, isOnSale, productOptions } from "../../utils/pricing.js";

const CATEGORIES = [
  "food",
  "clothing",
  "electronics",
  "accessories",
  "student-made",
  "other",
];

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "food",
  image_url: "",
  stall_id: "",
  sale_price: "",
  images: [],
  options: [],
};
const MAX_EXTRA_PHOTOS = 4;
const MAX_OPTIONS = 12;
const OPTION_PRESETS = [["Sizes", ["S", "M", "L", "XL"]], ["Cup sizes", ["Small", "Medium", "Large"]]];

const extractStall = (payload) => {
  const value =
    payload?.data?.stall ?? payload?.stall ?? payload?.data ?? payload;
  return Array.isArray(value) ? value[0] || null : value || null;
};

const extractProducts = (payload) => {
  const value =
    payload?.data?.products ?? payload?.products ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const extractProduct = (payload) =>
  payload?.data?.product || payload?.product || payload?.data || payload || {};

const normalizeProduct = (product) => ({
  ...product,
  id: product.id || product.product_id,
  name: product.name || product.product_name || "Untitled product",
  description: product.description || "",
  price: Number(product.price) || 0,
  stock: Number(product.stock ?? product.quantity ?? 0),
  category: product.category || "other",
  image_url: product.image_url || product.image || "",
  is_active: product.is_active !== false,
});

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatCategory = (value) =>
  String(value || "Other")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const MENU_HEIGHT = 200;

// The table scrolls sideways, so the menu is fixed to the viewport instead of
// the cell; otherwise the table's overflow would clip it.
function ProductActionsMenu({ product, busy, onToggle, onEdit, onDelete, featuring }) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const open = Boolean(position);

  const close = useCallback((returnFocus = true) => {
    setPosition(null);
    if (returnFocus) trigger.current?.focus();
  }, []);

  const toggleMenu = () => {
    if (open) return close();
    const rect = trigger.current.getBoundingClientRect();
    const opensUp = rect.bottom + MENU_HEIGHT > window.innerHeight;
    setPosition({
      right: Math.max(8, window.innerWidth - rect.right),
      ...(opensUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector("[role=menuitem]")?.focus();
    const onPointerDown = (event) => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
      else if (event.key === "Tab") close(false);
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [...menu.current.querySelectorAll("[role=menuitem]:not(:disabled)")];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0
          : event.key === "End" ? items.length - 1
          : event.key === "ArrowDown" ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    const onViewportChange = () => close(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, close]);

  const run = (action) => () => {
    close(false);
    action(product);
  };

  return (
    <div className="manage-product-menu">
      <button
        ref={trigger}
        type="button"
        className={`manage-product-menu-trigger${open ? " is-open" : ""}`}
        onClick={toggleMenu}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${product.name}`}
        title="Options"
      >
        {busy ? <span className="manage-products-mini-spinner" /> : <FiMoreHorizontal />}
      </button>
      {open && (
        <div
          ref={menu}
          className="manage-product-menu-list"
          role="menu"
          aria-label={`Options for ${product.name}`}
          style={position}
        >
          <p className="manage-product-menu-title">{product.name}</p>
          <button type="button" role="menuitem" onClick={run(onEdit)}>
            <FiEdit2 aria-hidden="true" />
            <span>Edit product<small>Name, price, stock and photo</small></span>
          </button>
          <button type="button" role="menuitem" onClick={run(onToggle)}>
            {product.is_active ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
            <span>
              {product.is_active ? "Hide from buyers" : "Show to buyers"}
              <small>{product.is_active ? "Keep it, but remove it from the store" : "List it in your store again"}</small>
            </span>
          </button>
          {featuring && (
            <button
              type="button"
              role="menuitem"
              onClick={run(featuring.onToggle)}
              disabled={!product.is_featured && (!product.is_active || featuring.full)}
            >
              <FiStar aria-hidden="true" className={product.is_featured ? "is-filled" : ""} />
              <span>
                {product.is_featured ? "Stop featuring" : "Feature on home page"}
                <small>
                  {product.is_featured
                    ? "Remove it from the buyer home page"
                    : !product.is_active
                      ? "Show it to buyers first"
                      : featuring.full
                        ? `All ${featuring.limit} featured spots are used`
                        : `${featuring.count} of ${featuring.limit} featured spots used`}
                </small>
              </span>
            </button>
          )}
          {product.is_active && (
            <Link role="menuitem" to={`/products/${product.id}`} target="_blank" rel="noopener" onClick={() => close(false)}>
              <FiExternalLink aria-hidden="true" />
              <span>View as buyer<small>Opens in a new tab</small></span>
            </Link>
          )}
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={run(onDelete)}>
            <FiTrash2 aria-hidden="true" />
            <span>Delete product<small>This cannot be undone</small></span>
          </button>
        </div>
      )}
    </div>
  );
}

/** After a move to Free: pick which products (up to the plan limit) buyers can see. */
function VisibleChooser({ products, limit, onClose, onSaved }) {
  const candidates = products.filter((product) => product.is_active || product.hidden_by_plan);
  const [picked, setPicked] = useState(() => new Set(candidates.filter((product) => product.is_active).map((product) => product.id)));
  const [saving, setSaving] = useState(false);
  const full = picked.size >= limit;
  const toggle = (id) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else if (next.size < limit) next.add(id);
    return next;
  });
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await productService.chooseVisible([...picked]);
      onSaved(extractProducts(data).map(normalizeProduct));
      toast.success("Visible products updated");
      onClose();
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "Couldn't update visible products");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Choose up to ${limit} visible products`} maxWidth={560}>
      <p className="manage-chooser-help">
        Your Free plan shows {limit} products to buyers. The rest stay saved and come back automatically if you move to Premium.
      </p>
      <p className={`manage-chooser-count${full ? " is-full" : ""}`} aria-live="polite">{picked.size} of {limit} selected</p>
      <ul className="manage-chooser-list">
        {candidates.map((product) => {
          const checked = picked.has(product.id);
          return (
            <li key={product.id}>
              <label className={`manage-chooser-item${checked ? " is-checked" : ""}${!checked && full ? " is-disabled" : ""}`}>
                <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(product.id)} />
                <span className="manage-product-thumb">{product.image_url ? <img src={product.image_url} alt="" /> : <FiImage />}</span>
                <span className="manage-chooser-name"><strong>{product.name}</strong><small>{formatCurrency(product.price)} · {product.stock} in stock</small></span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="manage-product-form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save visible products"}</button>
      </div>
    </Modal>
  );
}

export default function ManageProducts() {
  const [products, setProducts] = useState([]);
  const [stall, setStall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  useEffect(() => {
    if (!photo) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const selectPhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, image_url: "Choose a JPG, PNG, or WebP photo up to 5 MB." }));
      return;
    }
    setPhoto(file);
    setErrors((current) => ({ ...current, image_url: "" }));
  };

  const removePhoto = () => {
    setPhoto(null);
    setForm((current) => ({ ...current, image_url: "" }));
    setErrors((current) => ({ ...current, image_url: "" }));
  };
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [featuringId, setFeaturingId] = useState(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const stallResponse = await stallService.getMy();
      const myStall = extractStall(stallResponse.data);
      setStall(myStall);

      if (!myStall?.id) {
        setProducts([]);
        return;
      }

      const productResponse = await productService.getAll({
        stall_id: myStall.id,
        limit: 100,
        mine: true,
      });
      const records = extractProducts(productResponse.data)
        .filter(
          (product) =>
            !product.stall_id ||
            String(product.stall_id) === String(myStall.id),
        )
        .map(normalizeProduct);
      setProducts(records);
    } catch (requestError) {
      setProducts([]);
      setError(
        requestError.response?.data?.error ||
          "We couldn't load your products. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const stallStatus = String(stall?.status || "").toLowerCase();
  const canManageProducts = ["approved", "active"].includes(stallStatus);
  const featuredLimit = stall?.plan?.featured_limit ?? 0;
  const featuredCount = products.filter((product) => product.is_featured).length;
  const planHidden = products.filter((product) => product.hidden_by_plan).length;
  const visibleCount = products.filter((product) => product.is_active).length;

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const matchesSearch =
        !query ||
        [product.name, product.description, product.category]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;
      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "active"
          ? product.is_active
          : !product.is_active);
      return matchesSearch && matchesCategory && matchesVisibility;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price-low") return a.price - b.price;
      if (sortBy === "price-high") return b.price - a.price;
      if (sortBy === "stock-low") return a.stock - b.stock;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [categoryFilter, products, search, sortBy, visibilityFilter]);

  const inventory = useMemo(
    () => ({
      active: products.filter((product) => product.is_active).length,
      hidden: products.filter((product) => !product.is_active).length,
      lowStock: products.filter(
        (product) => product.stock > 0 && product.stock <= 5,
      ).length,
      outOfStock: products.filter((product) => product.stock === 0).length,
      value: products.reduce(
        (total, product) =>
          total + Number(product.price || 0) * Number(product.stock || 0),
        0,
      ),
    }),
    [products],
  );

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditTarget(null);
    setErrors({});
    setPhoto(null);
  };

  const openCreate = () => {
    if (!stall) {
      toast.error("Create a seller stall before adding products");
      return;
    }
    if (!canManageProducts) {
      toast.error("Your stall must be approved before adding products");
      return;
    }

    setForm({ ...EMPTY_FORM, stall_id: stall.id });
    setPhoto(null);
    setEditTarget(null);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setPhoto(null);
    setForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      stock: String(product.stock),
      category: product.category,
      image_url: product.image_url || "",
      stall_id: product.stall_id || stall?.id || "",
      sale_price: product.sale_price != null && product.sale_price !== "" ? String(Number(product.sale_price)) : "",
      images: Array.isArray(product.images) ? product.images : [],
      options: productOptions(product).map((option) => ({ label: option.label, stock: String(option.stock) })),
    });
    setEditTarget(product);
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const nextErrors = {};
    const name = form.name.trim();
    const price = Number(form.price);
    const stock = Number(form.stock);

    if (name.length < 2) nextErrors.name = "Enter at least 2 characters.";
    if (!Number.isFinite(price) || price <= 0) {
      nextErrors.price = "Enter a price greater than zero.";
    }
    if (!Number.isInteger(stock) || stock < 0) {
      nextErrors.stock = "Stock must be a whole number of 0 or more.";
    }
    if (!CATEGORIES.includes(form.category)) {
      nextErrors.category = "Choose a valid category.";
    }
    if (errors.image_url) nextErrors.image_url = errors.image_url;
    if (form.sale_price !== "") {
      const sale = Number(form.sale_price);
      if (!Number.isFinite(sale) || sale <= 0) nextErrors.sale_price = "Enter a sale price greater than zero, or leave it empty.";
      else if (Number.isFinite(price) && sale >= price) nextErrors.sale_price = "The sale price must be lower than the regular price.";
    }
    if (form.options.length) {
      delete nextErrors.stock;
      const labels = form.options.map((option) => option.label.trim().toLowerCase());
      if (labels.some((label) => !label)) nextErrors.options = "Give every option a name, or remove the empty one.";
      else if (new Set(labels).size !== labels.length) nextErrors.options = "Each option needs a different name.";
      else if (form.options.some((option) => !Number.isInteger(Number(option.stock)) || Number(option.stock) < 0)) nextErrors.options = "Option stock must be a whole number of 0 or more.";
    }

    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      price: Number(form.price),
      stock: form.options.length ? optionStockTotal : Number(form.stock),
      stall_id: stall?.id || form.stall_id,
      sale_price: form.sale_price === "" ? null : Number(form.sale_price),
      images: form.images,
      options: form.options.map((option) => ({ label: option.label.trim(), stock: Number(option.stock) || 0 })),
    };

    try {
      setSaving(true);
      if (photo) {
        const { data } = await productService.uploadPhoto(photo);
        payload.image_url = data.image_url;
        setForm((current) => ({ ...current, image_url: data.image_url }));
        setPhoto(null);
      }
      if (editTarget) {
        const response = await productService.update(editTarget.id, payload);
        const savedProduct = normalizeProduct({
          ...editTarget,
          ...payload,
          ...extractProduct(response.data),
        });
        setProducts((current) =>
          current.map((product) =>
            product.id === editTarget.id ? savedProduct : product,
          ),
        );
        toast.success("Product updated");
      } else {
        const response = await productService.create(payload);
        const savedProduct = normalizeProduct({
          ...payload,
          is_active: true,
          ...extractProduct(response.data),
        });
        setProducts((current) => [savedProduct, ...current]);
        toast.success("Product created");
      }
      setModalOpen(false);
      setEditTarget(null);
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error || "Failed to save product",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (
      !window.confirm(`Remove “${product.name}”? This action cannot be undone.`)
    )
      return;

    try {
      setDeletingId(product.id);
      await productService.remove(product.id);
      setProducts((current) =>
        current.filter((item) => item.id !== product.id),
      );
      toast.success("Product removed");
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error || "Failed to remove product",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (product) => {
    const nextActive = !product.is_active;
    try {
      setTogglingId(product.id);
      const response = await productService.update(product.id, {
        is_active: nextActive,
      });
      const result = extractProduct(response.data);
      const savedActive = result.is_active ?? nextActive;
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id
            ? { ...item, is_active: savedActive, hidden_by_plan: false, is_featured: savedActive && item.is_featured }
            : item,
        ),
      );
      toast.success(savedActive ? "Product is now visible" : "Product hidden");
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error || "Failed to update product",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleFeature = async (product) => {
    try {
      setFeaturingId(product.id);
      const { data } = await productService.setFeatured(product.id, !product.is_featured);
      const saved = extractProduct(data);
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_featured: Boolean(saved.is_featured) } : item));
      toast.success(saved.is_featured ? "Featured on the buyer home page" : "No longer featured");
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "Couldn't change the featured products");
    } finally {
      setFeaturingId(null);
    }
  };

  const optionStockTotal = form.options.reduce((sum, option) => sum + (Number(option.stock) || 0), 0);
  const clearOptionsError = () => setErrors((current) => (current.options ? { ...current, options: "" } : current));
  const changeOption = (index, key, value) => {
    setForm((current) => ({ ...current, options: current.options.map((option, at) => (at === index ? { ...option, [key]: value } : option)) }));
    clearOptionsError();
  };
  const addOption = (label = "") => setForm((current) => (current.options.length >= MAX_OPTIONS ? current
    : { ...current, options: [...current.options, { label, stock: current.options.length ? "0" : current.stock || "0" }] }));
  const removeOption = (index) => {
    setForm((current) => ({ ...current, options: current.options.filter((_, at) => at !== index) }));
    clearOptionsError();
  };
  const usePreset = (labels) => setForm((current) => ({ ...current, options: labels.map((label) => ({ label, stock: "0" })) }));

  // Extra photos upload right away, so the form only keeps their links.
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const addExtraPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error("Choose a JPG, PNG, or WebP photo up to 5 MB.");
      return;
    }
    try {
      setUploadingExtra(true);
      const { data } = await productService.uploadPhoto(file);
      setForm((current) => ({ ...current, images: [...current.images, data.image_url].slice(0, MAX_EXTRA_PHOTOS) }));
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "The photo could not be uploaded.");
    } finally {
      setUploadingExtra(false);
    }
  };
  const removeExtraPhoto = (url) => setForm((current) => ({ ...current, images: current.images.filter((image) => image !== url) }));

  // Quick stock edit from the table (products without options).
  const [stockSavingId, setStockSavingId] = useState(null);
  const adjustStock = async (product, delta) => {
    const next = Math.max(0, Number(product.stock) + delta);
    if (next === Number(product.stock)) return;
    try {
      setStockSavingId(product.id);
      await productService.update(product.id, { stock: next });
      setProducts((current) => current.map((item) => (item.id === product.id ? { ...item, stock: next } : item)));
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "Stock could not be updated.");
    } finally {
      setStockSavingId(null);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: "" }));
    }
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setVisibilityFilter("all");
  };

  return (
    <div className="dashboard-layout manage-products-shell">
      <Sidebar />

      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Manage Products</h1>
              <p>Keep your catalog accurate, visible, and ready for buyers.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary manage-products-add-top"
            onClick={openCreate}
            disabled={loading || !canManageProducts}
          >
            <FiPlus /> Add product
          </button>
        </header>

        <div className="dashboard-content manage-products-content">
          {stall?.plan && (
            <div className={`manage-plan-bar${planHidden ? " is-warning" : ""}`}>
              <p>
                <strong>{stall.plan.name} plan</strong> · {products.length} / {stall.plan.listing_limit} listings
                {featuredLimit > 0 && <> · <FiStar aria-hidden="true" className="is-filled" /> {featuredCount} / {featuredLimit} featured</>}
                {stall.plan.analytics
                  ? " · Point of sale and product analytics included"
                  : <> · Premium gives 25 listings, 3 featured products, point of sale and analytics. <Link to="/seller/plans" className="cm-link">See Premium</Link></>}
              </p>
              {planHidden > 0 && (
                <div className="manage-plan-hidden">
                  <span>
                    <FiEyeOff aria-hidden="true" /> {planHidden} product{planHidden === 1 ? " was" : "s were"} hidden when your stall moved to Free.
                    Buyers see {visibleCount} of {stall.plan.listing_limit}.
                  </span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setChooserOpen(true)}>Choose visible products</button>
                </div>
              )}
            </div>
          )}
          {!loading && stall && !canManageProducts && (
            <div className="manage-products-notice" role="status">
              <FiAlertCircle />
              <div>
                <strong>
                  Your stall is {formatCategory(stallStatus || "pending")}
                </strong>
                <p>
                  You can manage existing listings after an administrator
                  approves your stall.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="manage-products-error" role="alert">
              <FiAlertCircle />
              <span>{error}</span>
              <button type="button" onClick={loadProducts}>
                Retry
              </button>
            </div>
          )}

          <section
            className="manage-products-summary"
            aria-label="Inventory summary"
          >
            <article>
              <span className="tone-green">
                <FiPackage />
              </span>
              <div>
                <small>Total products</small>
                <strong>{loading ? "—" : products.length}</strong>
              </div>
            </article>
            <article>
              <span className="tone-blue">
                <FiEye />
              </span>
              <div>
                <small>Visible</small>
                <strong>{loading ? "—" : inventory.active}</strong>
              </div>
            </article>
            <article>
              <span className="tone-orange">
                <FiTrendingDown />
              </span>
              <div>
                <small>Low or out of stock</small>
                <strong>
                  {loading ? "—" : inventory.lowStock + inventory.outOfStock}
                </strong>
              </div>
            </article>
            <article>
              <span className="tone-gold">₱</span>
              <div>
                <small>Inventory value</small>
                <strong>
                  {loading ? "—" : formatCurrency(inventory.value)}
                </strong>
              </div>
            </article>
          </section>

          {!loading && products.length > 0 && (
            <section
              className="manage-products-toolbar"
              aria-label="Product filters"
            >
              <label className="manage-products-search">
                <FiSearch />
                <input
                  type="search"
                  placeholder="Search products"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <FiX />
                  </button>
                )}
              </label>

              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {formatCategory(category)}
                  </option>
                ))}
              </select>

              <select
                value={visibilityFilter}
                onChange={(event) => setVisibilityFilter(event.target.value)}
                aria-label="Filter by visibility"
              >
                <option value="all">All visibility</option>
                <option value="active">Visible</option>
                <option value="hidden">Hidden</option>
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                aria-label="Sort products"
              >
                <option value="newest">Newest first</option>
                <option value="name">Name A–Z</option>
                <option value="price-low">Lowest price</option>
                <option value="price-high">Highest price</option>
                <option value="stock-low">Lowest stock</option>
              </select>
            </section>
          )}

          {loading ? (
            <div
              className="manage-products-skeleton"
              aria-label="Loading products"
            >
              {Array.from({ length: 5 }).map((_, index) => (
                <i key={index} />
              ))}
            </div>
          ) : error ? null : products.length === 0 ? (
            <EmptyState
              illustration="box"
              title={canManageProducts ? "Add your first product" : "Products open after approval"}
              description={canManageProducts ? "A clear photo, price and stock count is all it takes. Buyers see new listings right away." : "Once an administrator approves your stall, you can list products for campus buyers."}
              action={canManageProducts ? { label: "Add product", onClick: openCreate } : { label: "Check your stall", to: "/seller/stall" }}
            />
          ) : filteredProducts.length === 0 ? (
            <EmptyState compact illustration="search" title="No matching products" description="Try another keyword or clear the filters." action={{ label: "Clear filters", onClick: clearFilters }} />
          ) : (
            <section className="manage-products-panel">
              <div className="manage-products-panel-heading">
                <div>
                  <small>Product catalog</small>
                  <h2>
                    {filteredProducts.length} product
                    {filteredProducts.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <span>{inventory.hidden} hidden</span>
              </div>

              <div className="manage-products-table-wrap">
                <table className="manage-products-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Visibility</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td data-label="Product">
                          <div className="manage-product-identity">
                            <div className="manage-product-thumb">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <FiImage />
                              )}
                            </div>
                            <div>
                              <strong title={product.name}>
                                {product.is_featured && (
                                  <FiStar className="manage-product-featured" aria-label="Featured" />
                                )}
                                {product.name}
                              </strong>
                              <small title={product.description}>
                                {product.description || "No description"}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td data-label="Category">
                          <span
                            className={`manage-product-category cat-${product.category}`}
                          >
                            {formatCategory(product.category)}
                          </span>
                        </td>
                        <td data-label="Price">
                          <strong className="manage-product-price">
                            {formatCurrency(effectivePrice(product))}
                          </strong>
                          {isOnSale(product) && (
                            <small className="manage-product-sale">
                              <s>{formatCurrency(product.price)}</s> {discountLabel(product)}
                            </small>
                          )}
                        </td>
                        <td data-label="Stock">
                          {productOptions(product).length ? (
                            <span className="manage-product-stock-options">
                              <span className={`manage-product-stock ${product.stock === 0 ? "out" : product.stock <= 5 ? "low" : ""}`}>
                                {product.stock === 0 ? "Out of stock" : `${product.stock} in stock`}
                              </span>
                              <small title={productOptions(product).map((option) => `${option.label}: ${option.stock}`).join(", ")}>
                                {productOptions(product).map((option) => `${option.label} ${option.stock}`).join(" · ")}
                              </small>
                            </span>
                          ) : (
                            <span className={`manage-stock-stepper ${product.stock === 0 ? "out" : product.stock <= 5 ? "low" : ""}`}>
                              <button type="button" onClick={() => adjustStock(product, -1)} disabled={stockSavingId === product.id || product.stock <= 0} aria-label={`One less ${product.name} in stock`}><FiMinus /></button>
                              <span aria-live="polite">{product.stock === 0 ? "Out" : product.stock}</span>
                              <button type="button" onClick={() => adjustStock(product, 1)} disabled={stockSavingId === product.id} aria-label={`One more ${product.name} in stock`}><FiPlus /></button>
                            </span>
                          )}
                        </td>
                        <td data-label="Visibility">
                          <span
                            className={`manage-product-visibility ${product.is_active ? "active" : "hidden"}`}
                          >
                            <i /> {product.is_active ? "Visible" : product.hidden_by_plan ? "Hidden by plan" : "Hidden"}
                          </span>
                        </td>
                        <td data-label="Actions">
                          <div className="manage-product-actions">
                            <ProductActionsMenu
                              product={product}
                              busy={togglingId === product.id || deletingId === product.id || featuringId === product.id}
                              onToggle={handleToggleActive}
                              onEdit={openEdit}
                              onDelete={handleDelete}
                              featuring={featuredLimit > 0 ? { limit: featuredLimit, count: featuredCount, full: featuredCount >= featuredLimit, onToggle: handleFeature } : null}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>

      {chooserOpen && stall?.plan && (
        <VisibleChooser
          products={products}
          limit={stall.plan.listing_limit}
          onClose={() => setChooserOpen(false)}
          onSaved={setProducts}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editTarget ? "Edit Product" : "Add New Product"}
        maxWidth={580}
      >
        <form
          className="manage-product-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="manage-product-field">
            <label htmlFor="product-name">
              Product name <span>*</span>
            </label>
            <input
              id="product-name"
              className={errors.name ? "is-invalid" : ""}
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Adobong Rice Bucket"
              maxLength={100}
            />
            {errors.name && <small>{errors.name}</small>}
          </div>

          <div className="manage-product-field">
            <label htmlFor="product-description">Description</label>
            <textarea
              id="product-description"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="What should buyers know about this product?"
              rows={4}
              maxLength={600}
            />
            <span className="manage-product-character-count">
              {form.description.length}/600
            </span>
          </div>

          <div className="manage-product-form-grid">
            <div className="manage-product-field">
              <label htmlFor="product-price">
                Price (₱) <span>*</span>
              </label>
              <input
                id="product-price"
                className={errors.price ? "is-invalid" : ""}
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={handleChange}
                placeholder="0.00"
              />
              {errors.price && <small>{errors.price}</small>}
            </div>
            <div className="manage-product-field">
              <label htmlFor="product-sale-price">Sale price (₱) <em>optional</em></label>
              <input
                id="product-sale-price"
                className={errors.sale_price ? "is-invalid" : ""}
                name="sale_price"
                type="number"
                min="0.01"
                step="0.01"
                value={form.sale_price}
                onChange={handleChange}
                placeholder="No sale"
              />
              {errors.sale_price ? <small>{errors.sale_price}</small> : <span className="manage-product-photo-help">Buyers pay this instead, and see the regular price crossed out.</span>}
            </div>
            <div className="manage-product-field">
              <label htmlFor="product-stock">
                Available stock <span>*</span>
              </label>
              <input
                id="product-stock"
                className={errors.stock ? "is-invalid" : ""}
                name="stock"
                type="number"
                min="0"
                step="1"
                value={form.options.length ? String(optionStockTotal) : form.stock}
                onChange={handleChange}
                placeholder="0"
                disabled={form.options.length > 0}
              />
              {errors.stock ? <small>{errors.stock}</small> : form.options.length > 0 && <span className="manage-product-photo-help">Total of the options below.</span>}
            </div>
          </div>

          <fieldset className="manage-product-options">
            <legend>Options <em>optional</em></legend>
            <p className="manage-product-photo-help">Sizes, flavours or colours, each with its own stock. Buyers must pick one.</p>
            {form.options.length > 0 ? (
              <ul>
                {form.options.map((option, index) => (
                  <li key={index}>
                    <input aria-label={`Option ${index + 1} name`} value={option.label} maxLength={30} placeholder="e.g. Medium"
                      onChange={(event) => changeOption(index, "label", event.target.value)} />
                    <input aria-label={`Stock for ${option.label || `option ${index + 1}`}`} type="number" min="0" step="1" value={option.stock}
                      onChange={(event) => changeOption(index, "stock", event.target.value)} />
                    <button type="button" onClick={() => removeOption(index)} aria-label={`Remove option ${option.label || index + 1}`}><FiX /></button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="manage-product-option-presets">
                {OPTION_PRESETS.map(([label, labels]) => (
                  <button type="button" key={label} onClick={() => usePreset(labels)}>{label}: {labels.join(", ")}</button>
                ))}
              </div>
            )}
            {errors.options && <small className="manage-product-options-error" role="alert">{errors.options}</small>}
            {form.options.length < MAX_OPTIONS && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => addOption()}><FiPlus /> Add option</button>
            )}
          </fieldset>

          <div className="manage-product-field">
            <label htmlFor="product-category">
              Category <span>*</span>
            </label>
            <select
              id="product-category"
              name="category"
              value={form.category}
              onChange={handleChange}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {formatCategory(category)}
                </option>
              ))}
            </select>
            {errors.category && <small>{errors.category}</small>}
          </div>

          <div className="manage-product-field">
            <label htmlFor="product-image">Product photo</label>
            <input
              id="product-image"
              className={errors.image_url ? "is-invalid" : ""}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectPhoto}
              disabled={saving}
              aria-describedby="product-photo-help product-photo-error"
              aria-invalid={Boolean(errors.image_url)}
            />
            <span id="product-photo-help" className="manage-product-photo-help">Choose a photo from your device. JPG, PNG, or WebP, up to 5 MB.</span>
            <small id="product-photo-error" role="alert">{errors.image_url}</small>
            {(photoPreview || form.image_url) && (
              <div className="manage-product-image-preview">
                <img
                  key={photoPreview || form.image_url}
                  src={photoPreview || form.image_url}
                  alt="Product preview"
                />
                <span>{photo?.name || "Current product photo"}</span>
                <button type="button" onClick={removePhoto} disabled={saving} aria-label="Remove product photo"><FiTrash2 /> Remove</button>
              </div>
            )}
            {errors.image_url && <button type="button" onClick={removePhoto} disabled={saving}>Clear photo selection</button>}
          </div>

          <div className="manage-product-field">
            <span className="manage-product-extra-label">More photos <em>optional, up to {MAX_EXTRA_PHOTOS}</em></span>
            <div className="manage-product-extra-photos">
              {form.images.map((url, index) => (
                <span key={url} className="manage-product-extra-photo">
                  <img src={url} alt={`Extra photo ${index + 1}`} />
                  <button type="button" onClick={() => removeExtraPhoto(url)} disabled={saving} aria-label={`Remove extra photo ${index + 1}`}><FiX /></button>
                </span>
              ))}
              {form.images.length < MAX_EXTRA_PHOTOS && (
                <label className={`manage-product-extra-add${uploadingExtra ? " is-busy" : ""}`}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={addExtraPhoto} disabled={saving || uploadingExtra} />
                  {uploadingExtra ? <span className="manage-products-mini-spinner" /> : <FiPlus />}
                  <span>{uploadingExtra ? "Uploading…" : "Add photo"}</span>
                </label>
              )}
            </div>
          </div>

          <div className="manage-product-form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner" /> Saving...
                </>
              ) : editTarget ? (
                "Save changes"
              ) : (
                "Add product"
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
