import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";

// Pages load on demand so the first visit downloads only what it shows.
const AccountStatus = lazy(() => import("./pages/auth/AccountStatus.jsx"));
const ChangePassword = lazy(() => import("./pages/auth/ChangePassword.jsx"));
const PointOfSale = lazy(() => import("./pages/seller/PointOfSale.jsx"));
const OpenStore = lazy(() => import("./pages/seller/OpenStore.jsx"));

// Auth pages
const Login = lazy(() => import("./pages/auth/Login.jsx"));
const Register = lazy(() => import("./pages/auth/Register.jsx"));

// Buyer pages
const BuyerHome = lazy(() => import("./pages/buyer/Home.jsx"));
const Browse = lazy(() => import("./pages/buyer/Browse.jsx"));
const ProductDetail = lazy(() => import("./pages/buyer/ProductDetail.jsx"));
const Cart = lazy(() => import("./pages/buyer/Cart.jsx"));
const Orders = lazy(() => import("./pages/buyer/Orders.jsx"));
const Messages = lazy(() => import("./pages/buyer/Messages.jsx"));
const Stalls = lazy(() => import("./pages/buyer/Stalls.jsx"));
const Notifications = lazy(() => import("./pages/buyer/Notifications.jsx"));
const BuyerEvents = lazy(() => import("./pages/buyer/BuyerEvents.jsx"));
const EventStalls = lazy(() => import("./pages/buyer/EventStalls.jsx"));
const Checkout = lazy(() => import("./pages/buyer/Checkout.jsx"));
const Favorites = lazy(() => import("./pages/buyer/Favorites.jsx"));
const StallDetails = lazy(() => import("./pages/buyer/StallDetails.jsx"));

// Seller pages
const SellerDashboard = lazy(() => import("./pages/seller/Dashboard.jsx"));
const MyStall = lazy(() => import("./pages/seller/Mystall.jsx"));
const StallBranding = lazy(() => import("./pages/seller/StallBranding.jsx"));
const ManageProducts = lazy(() => import("./pages/seller/ManageProducts.jsx"));
const SellerOrders = lazy(() => import("./pages/seller/SellerOrders.jsx"));
const Analytics = lazy(() => import("./pages/seller/Analytics.jsx"));
const SellerMessages = lazy(() => import("./pages/seller/SellerMessages.jsx"));
const SellerApplicationForm = lazy(() => import("./pages/seller/SellerApplicationForm.jsx"));
const SellerReservations = lazy(() => import("./pages/seller/SellerReservations.jsx"));
const Reviews = lazy(() => import("./pages/seller/Reviews.jsx"));
const Settings = lazy(() => import("./pages/seller/Settings.jsx"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const ManageUsers = lazy(() => import("./pages/admin/ManageUsers.jsx"));
const ManageStalls = lazy(() => import("./pages/admin/ManageStalls.jsx"));
const AdminEvents = lazy(() => import("./pages/admin/AdminEvents.jsx"));
const AdminApplications = lazy(() => import("./pages/admin/AdminApplications.jsx"));

function LoadingScreen() {
  return (
    <div className="full-center" role="status" aria-label="Loading application">
      <div className="spinner spinner-dark" />
    </div>
  );
}

function getDashboardPath(role) {
  if (role === "admin") return "/admin";
  if (role === "seller") return "/seller";
  return "/";
}

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.status !== "approved") return <Navigate to="/account-status" replace />;

  if (role && user.role !== role) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Navigate to={user.status === "approved" ? getDashboardPath(user.role) : "/account-status"} replace />;
  }

  return children;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/account-status" element={<AccountStatus />} />
        <Route path="/account/password" element={<ChangePassword />} />
        <Route path="/open-store" element={<ProtectedRoute><OpenStore /></ProtectedRoute>} />
        <Route path="/seller/pos" element={<ProtectedRoute role="seller"><PointOfSale /></ProtectedRoute>} />
        {/* Authentication */}
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />

        <Route
          path="/register"
          element={
            <GuestRoute>
              <Register />
            </GuestRoute>
          }
        />

        {/* Buyer pages */}
        <Route path="/" element={<BuyerHome />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/stalls" element={<Stalls />} />
        <Route path="/stalls/:stallId" element={<StallDetails />} />
        <Route path="/events" element={<BuyerEvents />} />
        <Route path="/events/:eventId/stalls" element={<EventStalls />} />

        <Route
          path="/favorites"
          element={
            <ProtectedRoute role="buyer">
              <Favorites />
            </ProtectedRoute>
          }
        />

        <Route
          path="/checkout"
          element={
            <ProtectedRoute role="buyer">
              <Checkout />
            </ProtectedRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <ProtectedRoute role="buyer">
              <Notifications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/cart"
          element={
            <ProtectedRoute role="buyer">
              <Cart />
            </ProtectedRoute>
          }
        />

        <Route
          path="/orders"
          element={
            <ProtectedRoute role="buyer">
              <Orders />
            </ProtectedRoute>
          }
        />

        <Route
          path="/messages"
          element={
            <ProtectedRoute role="buyer">
              <Messages />
            </ProtectedRoute>
          }
        />

        <Route
          path="/messages/:partnerId"
          element={
            <ProtectedRoute role="buyer">
              <Messages />
            </ProtectedRoute>
          }
        />

        {/* Seller pages */}
        <Route
          path="/seller"
          element={
            <ProtectedRoute role="seller">
              <SellerDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/stall"
          element={
            <ProtectedRoute role="seller">
              <MyStall />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/stall/branding"
          element={
            <ProtectedRoute role="seller">
              <StallBranding />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/apply"
          element={
            <ProtectedRoute role="seller">
              <SellerApplicationForm />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/products"
          element={
            <ProtectedRoute role="seller">
              <ManageProducts />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/orders"
          element={
            <ProtectedRoute role="seller">
              <SellerOrders />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/reservations"
          element={
            <ProtectedRoute role="seller">
              <SellerReservations />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/analytics"
          element={
            <ProtectedRoute role="seller">
              <Analytics />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/messages"
          element={
            <ProtectedRoute role="seller">
              <Messages sellerMode />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/reviews"
          element={
            <ProtectedRoute role="seller">
              <Reviews />
            </ProtectedRoute>
          }
        />

        <Route
          path="/seller/settings"
          element={
            <ProtectedRoute role="seller">
              <Settings />
            </ProtectedRoute>
          }
        />

        {/* Admin pages */}
        <Route path="/admin/events" element={<ProtectedRoute role="admin"><AdminEvents /></ProtectedRoute>} />
        <Route path="/admin/events/:eventId/map" element={<ProtectedRoute role="admin"><AdminEvents /></ProtectedRoute>} />
        <Route path="/admin/applications" element={<ProtectedRoute role="admin"><AdminApplications /></ProtectedRoute>} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute role="admin">
              <ManageUsers />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/stalls"
          element={
            <ProtectedRoute role="admin">
              <ManageStalls />
            </ProtectedRoute>
          }
        />

        {/* Unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
