import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Package, Store } from "lucide-react";
import { orderSteps, stageFor, stepIndex } from "./orderStages.js";
import "./notifications.css";

export const timeAgo = (value) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

const peso = (value) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One order update, drawn like a phone notification: stage title, progress bar,
 * stage illustration and product photo. Expands to show every step of the order.
 *
 * `variant="toast"` is the compact pop-up version (whole card opens the order).
 */
export default function OrderNotificationCard({ notification, variant = "list", defaultExpanded = false, onOpen, onRead }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const order = notification.order;
  const fulfillment = order?.fulfillment;
  const stage = stageFor(notification.status, fulfillment);
  const Art = stage.icon;
  const image = order?.first_item?.image_url;
  const unread = !notification.read;

  const toggle = () => {
    setExpanded((value) => !value);
    if (unread) onRead?.(notification);
  };
  const open = () => {
    if (unread) onRead?.(notification);
    onOpen?.(notification);
  };

  const summary = (
    <>
      <span className="onc-app" aria-hidden="true">
        {order?.stall_logo ? <img src={order.stall_logo} alt="" /> : <Store />}
      </span>
      <span className="onc-text">
        <span className="onc-title-row">
          <strong>{notification.title}</strong>
          <time dateTime={notification.created_at}>{timeAgo(notification.created_at)}</time>
        </span>
        {order && notification.type === "order" ? (
          <span
            className="onc-bar"
            role="progressbar"
            aria-label={`Order progress: ${stage.label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stage.progress}
          >
            <i style={{ width: `${stage.progress}%` }} />
          </span>
        ) : null}
        <span className="onc-body">{notification.body}</span>
      </span>
      <span className={`onc-art onc-art--${stage.key}`} aria-hidden="true"><Art /></span>
      <span className="onc-thumb" aria-hidden="true">
        {image ? <img src={image} alt="" loading="lazy" /> : <Package />}
      </span>
    </>
  );

  if (variant === "toast") {
    return (
      <button type="button" className={`onc onc--toast onc--${stage.tone}`} onClick={open}>
        <span className="onc-main">{summary}</span>
      </button>
    );
  }

  const steps = orderSteps(fulfillment);
  const current = order ? stepIndex(order.status, fulfillment) : stage.index;
  const cancelled = order?.status === "cancelled";

  return (
    <article className={`onc onc--${stage.tone}${unread ? " is-unread" : ""}${expanded ? " is-expanded" : ""}`}>
      <button type="button" className="onc-main" onClick={toggle} aria-expanded={expanded}>
        {summary}
        <span className="onc-chevron"><ChevronDown aria-hidden="true" /></span>
        {unread && <span className="onc-unread" aria-label="Unread" />}
      </button>

      {expanded && (
        <div className="onc-details">
          {order && (
            <>
              <ol className={`onc-steps${cancelled ? " is-cancelled" : ""}`} aria-label="Order steps">
                {steps.map((step, index) => {
                  const state = cancelled ? "skipped" : index < current || (index === current && index === steps.length - 1) ? "done" : index === current ? "current" : "todo";
                  return (
                    <li key={step.key} className={`is-${state}`}>
                      <span>{state === "done" ? <Check /> : <step.icon />}</span>
                      <small>{step.label}</small>
                    </li>
                  );
                })}
              </ol>
              {cancelled && <p className="onc-cancelled-note">This order was cancelled.</p>}
              <dl className="onc-meta">
                <div><dt>Stall</dt><dd>{order.stall_name || "Campus seller"}</dd></div>
                <div><dt>Items</dt><dd>{order.item_count} · {order.first_item?.name}{order.item_count > 1 ? " and more" : ""}</dd></div>
                <div><dt>Total</dt><dd>{peso(order.total)} · {fulfillment === "delivery" ? "Delivery" : "Pickup"}</dd></div>
                <div><dt>Status now</dt><dd>{cancelled ? "Cancelled" : stageFor(order.status, fulfillment).label}</dd></div>
              </dl>
            </>
          )}
          {notification.link && (
            <Link className="btn btn-primary btn-sm onc-open" to={notification.link} onClick={open}>
              View order
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
