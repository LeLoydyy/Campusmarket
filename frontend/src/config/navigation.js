import {
  LayoutDashboard,
  Home,
  Grid3X3,
  Package,
  ShoppingCart,
  ClipboardList,
  MessageSquare,
  Bell,
  Heart,
  User,
  Settings,
  Store,
  PlusCircle,
  CalendarDays,
  BarChart3,
  Star,
  Users,
  UserCheck,
  Tags,
  Calendar,
  Map,
  FileText,
  TrendingUp,
  AlertTriangle,
  LogOut,
  Search,
  KeyRound,
  Palette,
  ShieldCheck,
  History,
  Crown,
} from "lucide-react";

export const BUYER_NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/categories", label: "Categories", icon: Grid3X3 },
  { to: "/browse", label: "Products", icon: Package },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

export const SELLER_NAV = [
  { to: "/seller", label: "Dashboard", icon: LayoutDashboard },
  { to: "/seller/stall", label: "My Stall", icon: Store },
  { to: "/seller/stall/branding", label: "Stall Branding", icon: Palette },
  { to: "/seller/products", label: "Products", icon: Package },
  // `pro`: Premium feature — Free stalls see a PRO badge and land on the Plans page.
  { to: "/seller/pos", label: "Point of Sale", icon: ShoppingCart, pro: "pos" },
  { to: "/seller/orders", label: "Orders", icon: ClipboardList },
  { to: "/seller/reservations", label: "Events & Reservations", icon: CalendarDays },
  { to: "/seller/analytics", label: "Analytics", icon: BarChart3, pro: "analytics" },
  { to: "/seller/messages", label: "Messages", icon: MessageSquare },
  { to: "/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
  { to: "/seller/plans", label: "Premium", icon: Crown },
  { to: "/seller/reviews", label: "Reviews", icon: Star },
  { to: "/seller/settings", label: "Settings", icon: Settings },
  { to: "/account/password", label: "Password", icon: KeyRound },
  { to: "/account/logins", label: "Login History", icon: History },
];

export const ADMIN_NAV = [
  { to: "/admin/events", label: "Events", icon: CalendarDays },
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Registration & Users", icon: Users },
  { to: "/admin/stalls", label: "Stores & Plans", icon: Store },
  { to: "/admin/applications", label: "Event Applications", icon: FileText, permission: "marketplace" },
  { to: "/admin/admins", label: "Administrators", icon: ShieldCheck },
  { to: "/admin/logs", label: "Login Logs", icon: History, permission: "logs" },
  { to: "/account/password", label: "Password", icon: KeyRound },
  { to: "/account/logins", label: "Login History", icon: History },
];

export const BUYER_TOP_LINKS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/browse", label: "Shop", icon: Search },
  { to: "/events", label: "Events", icon: CalendarDays },
];

export const ROLE_LABELS = {
  buyer: "Buyer",
  seller: "Seller",
  admin: "Administrator",
};
