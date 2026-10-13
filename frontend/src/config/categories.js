import { Gem, Headphones, Package, Shirt, Soup, Sparkles } from "lucide-react";

/** Product categories as shown to buyers (Home and Categories). `size` shapes the bento tile. */
export const CATEGORY_TILES = [
  { key: "food", label: "Food & drinks", blurb: "Rice meals, snacks, iced coffee", icon: Soup, size: "lg" },
  { key: "clothing", label: "Clothing", blurb: "Varsity tees, hoodies, org shirts", icon: Shirt },
  { key: "electronics", label: "Electronics", blurb: "Chargers, earbuds, flash drives", icon: Headphones },
  { key: "accessories", label: "Accessories", blurb: "Totes, pins, keychains", icon: Gem },
  { key: "student-made", label: "Student Made", blurb: "Handmade by CSUCC students", icon: Sparkles, size: "wide" },
  { key: "other", label: "Everything else", blurb: "School supplies & more", icon: Package },
];
