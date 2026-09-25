import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { Modal } from "../../components/common/Ui.jsx";
import { productService, stallService } from "../../services/api.js";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiImage,
  FiPackage,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiTrendingDown,
  FiX,
} from "react-icons/fi";
import "./ManageProducts.css";
import EmptyState from "../../components/ui/EmptyState.jsx";

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
};

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
      stock: Number(form.stock),
      stall_id: stall?.id || form.stall_id,
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
          item.id === product.id ? { ...item, is_active: savedActive } : item,
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
          {stall?.plan && <p className="card" style={{ padding: "1rem" }}>{stall.plan.name} plan · {products.length} / {stall.plan.listing_limit} listings · POS included{stall.plan.analytics ? " · Product analytics and landing-page advertising included" : " · Contact the campus administrator for Premium analytics and advertising"}</p>}
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
                            {formatCurrency(product.price)}
                          </strong>
                        </td>
                        <td data-label="Stock">
                          <span
                            className={`manage-product-stock ${product.stock === 0 ? "out" : product.stock <= 5 ? "low" : ""}`}
                          >
                            {product.stock === 0
                              ? "Out of stock"
                              : `${product.stock} in stock`}
                          </span>
                        </td>
                        <td data-label="Visibility">
                          <span
                            className={`manage-product-visibility ${product.is_active ? "active" : "hidden"}`}
                          >
                            <i /> {product.is_active ? "Visible" : "Hidden"}
                          </span>
                        </td>
                        <td data-label="Actions">
                          <div className="manage-product-actions">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(product)}
                              disabled={togglingId === product.id}
                              title={
                                product.is_active
                                  ? "Hide product"
                                  : "Show product"
                              }
                              aria-label={
                                product.is_active
                                  ? `Hide ${product.name}`
                                  : `Show ${product.name}`
                              }
                            >
                              {togglingId === product.id ? (
                                <span className="manage-products-mini-spinner" />
                              ) : product.is_active ? (
                                <FiEyeOff />
                              ) : (
                                <FiEye />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(product)}
                              title="Edit product"
                              aria-label={`Edit ${product.name}`}
                            >
                              <FiEdit2 />
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDelete(product)}
                              disabled={deletingId === product.id}
                              title="Delete product"
                              aria-label={`Delete ${product.name}`}
                            >
                              {deletingId === product.id ? (
                                <span className="manage-products-mini-spinner" />
                              ) : (
                                <FiTrash2 />
                              )}
                            </button>
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
                value={form.stock}
                onChange={handleChange}
                placeholder="0"
              />
              {errors.stock && <small>{errors.stock}</small>}
            </div>
          </div>

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
