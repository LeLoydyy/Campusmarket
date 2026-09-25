import { Grid3X3, Heart, KeyRound, MessageSquare, Package, Store, UserRound } from "lucide-react";

/** Account links shared by the desktop account menu and the mobile Profile sheet. */
export const accountLinks = (user) => [
  user.status !== "approved" && { to: "/account-status", label: "Registration status", icon: UserRound },
  user.role === "buyer" && user.status === "approved" && { to: "/open-store", label: "Open a campus stall", icon: Store },
  user.role === "buyer" && { to: "/orders", label: "My orders", icon: Package },
  user.role === "buyer" && { to: "/favorites", label: "Favorites", icon: Heart },
  user.role === "buyer" && { to: "/messages", label: "Messages", icon: MessageSquare },
  user.role === "seller" && { to: "/seller", label: "Seller dashboard", icon: Grid3X3 },
  ["admin", "super_admin"].includes(user.role) && { to: "/admin", label: "Admin panel", icon: Grid3X3 },
  { to: "/account/password", label: "Change password", icon: KeyRound },
].filter(Boolean);
