import { Check, ChefHat, ClipboardCheck, PackageCheck, ShoppingBag, Bike, X } from "lucide-react";

/**
 * Four-step order progress: Placed → Preparing → Ready → Completed.
 * "confirmed" counts as preparing. Cancelled orders show a single closed state.
 */
export default function OrderStepper({ status, fulfillment = "pickup" }) {
  const delivery = fulfillment === "delivery";
  const steps = [
    { key: "placed", label: "Placed", icon: ClipboardCheck },
    { key: "preparing", label: "Preparing", icon: ChefHat },
    { key: "ready", label: delivery ? "Ready for delivery" : "Ready for pickup", icon: delivery ? Bike : ShoppingBag },
    { key: "done", label: delivery ? "Delivered" : "Completed", icon: PackageCheck },
  ];
  const s = String(status || "pending").toLowerCase();
  if (s === "cancelled" || s === "canceled") {
    return (
      <p className="ostep-cancelled" role="status"><X aria-hidden="true" /> This order was cancelled — any payment is not collected and stock was returned.</p>
    );
  }
  const current = s === "pending" ? 0 : ["confirmed", "processing", "preparing"].includes(s) ? 1 : ["ready", "ready-for-pickup", "out-for-delivery"].includes(s) ? 2 : 3;
  const finished = current === 3;
  return (
    <ol className="ostep" aria-label="Order progress">
      {steps.map((step, index) => {
        const state = index < current || (finished && index === 3) ? "done" : index === current ? "current" : "todo";
        const Icon = state === "done" ? Check : step.icon;
        return (
          <li key={step.key} className={`ostep-item is-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="ostep-dot"><Icon aria-hidden="true" /></span>
            <span className="ostep-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
