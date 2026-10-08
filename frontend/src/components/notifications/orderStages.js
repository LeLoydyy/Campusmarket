import { Bike, ChefHat, CircleX, ClipboardCheck, PackageCheck, ShoppingBag, Store } from "lucide-react";

/**
 * Order stages in the order a buyer experiences them. Pickup and delivery
 * orders differ only in the last two steps.
 */
const BASE_STEPS = [
  { key: "pending", label: "Placed", icon: ClipboardCheck },
  { key: "confirmed", label: "Confirmed", icon: Store },
  { key: "preparing", label: "Preparing", icon: ChefHat },
];
const PICKUP_STEPS = [...BASE_STEPS,
  { key: "ready", label: "Ready for pickup", short: "Ready", icon: ShoppingBag },
  { key: "completed", label: "Picked up", icon: PackageCheck },
];
const DELIVERY_STEPS = [...BASE_STEPS,
  { key: "ready", label: "Ready for delivery", short: "Ready", icon: Bike },
  { key: "delivered", label: "Delivered", icon: PackageCheck },
];

export const orderSteps = (fulfillment) => (fulfillment === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS);

const CANCELLED = { key: "cancelled", label: "Cancelled", icon: CircleX };

/** Index of a status within its steps; "completed" and "delivered" both mean the last step. */
export const stepIndex = (status, fulfillment) => {
  const steps = orderSteps(fulfillment);
  if (status === "completed" || status === "delivered") return steps.length - 1;
  return Math.max(0, steps.findIndex((step) => step.key === status));
};

/**
 * Everything needed to draw one stage: its icon, a 0–100 progress value
 * (a little past the step so the bar reads as "in progress"), and a tone.
 */
export const stageFor = (status, fulfillment) => {
  if (status === "cancelled") return { ...CANCELLED, progress: 100, tone: "cancelled", index: -1 };
  const steps = orderSteps(fulfillment);
  const index = stepIndex(status, fulfillment);
  const done = index === steps.length - 1;
  return {
    ...steps[index],
    index,
    progress: done ? 100 : Math.round(((index + 0.5) / (steps.length - 1)) * 100),
    tone: done ? "done" : "active",
  };
};
