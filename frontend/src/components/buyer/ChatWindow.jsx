import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../utils/formatCurrency.js";
import {
  ArrowLeft,
  CheckCheck,
  MessageCircle,
  MoreHorizontal,
  Send,
  ShieldCheck,
  ShoppingBag,
  XCircle,
} from "lucide-react";

const MESSAGE_LIMIT = 1000;

const getName = (partner) =>
  partner?.full_name || partner?.name || partner?.username || "Campus seller";

const getInitials = (name) =>
  String(name || "CM")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const getMessageText = (message) => message.content ?? message.text ?? "";
const sentAt = (message) => message.sent_at || message.created_at;

const isOwnMessage = (message, currentUserId) =>
  message.isUser === true ||
  String(message.sender_id || message.sender?.id) === String(currentUserId);

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const dayLabel = (value) => {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export default function ChatWindow({
  partner,
  messages = [],
  currentUserId,
  viewerRole = "buyer",
  loading = false,
  error = "",
  sending = false,
  onRetry,
  onBack,
  onSendMessage,
  pinnedProduct = null,
  onOrderProduct,
  ordering = false,
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);
  const textareaRef = useRef(null);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(sentAt(a) || 0) - new Date(sentAt(b) || 0),
      ),
    [messages],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [sortedMessages.length]);

  useEffect(() => {
    setDraft("");
  }, [partner?.id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    const sent = await onSendMessage(content);
    if (sent !== false) {
      setDraft("");
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const partnerName = getName(partner);

  return (
    <section
      className="chat-window"
      aria-label={`Conversation with ${partnerName}`}
    >
      <header className="chat-window-header">
        <button
          type="button"
          className="chat-back-btn"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft />
        </button>
        <span className="chat-partner-avatar">
          {partner?.avatar_url || partner?.profile_image ? (
            <img src={partner.avatar_url || partner.profile_image} alt="" />
          ) : (
            getInitials(partnerName)
          )}
        </span>
        <div className="chat-partner-copy">
          <strong>{partnerName}</strong>
          <span>
            <i />
            {partner?.stall_name ||
              (partner?.role === "seller"
                ? "Campus seller"
                : "Campus Market member")}
          </span>
        </div>
        <button
          type="button"
          className="chat-more-btn"
          aria-label="Conversation options"
          disabled
        >
          <MoreHorizontal />
        </button>
      </header>

      <div className="chat-trust-strip">
        <ShieldCheck />
        {viewerRole === "seller"
          ? "Keep order details clear and never request sensitive payment information in chat."
          : "Keep payments and personal information private when coordinating with sellers."}
      </div>

      {pinnedProduct && (
        <div className="chat-pinned" aria-label="Product in this conversation">
          <span className="chat-pinned-img">
            {pinnedProduct.image_url ? <img src={pinnedProduct.image_url} alt="" /> : <ShoppingBag aria-hidden="true" />}
          </span>
          <span className="chat-pinned-text">
            <small>Asking about</small>
            <strong>{pinnedProduct.name}</strong>
            <span>
              {formatCurrency(pinnedProduct.price)}
              {pinnedProduct.stalls?.location ? ` · pickup at ${pinnedProduct.stalls.location}` : ""}
              {Number(pinnedProduct.stock) <= 0 ? " · sold out" : ""}
            </span>
          </span>
          <span className="chat-pinned-actions">
            <Link className="btn btn-outline btn-sm" to={`/products/${pinnedProduct.id}`}>View</Link>
            {viewerRole !== "seller" && onOrderProduct && (
              <button type="button" className="btn btn-gold btn-sm" onClick={() => onOrderProduct(pinnedProduct)} disabled={ordering || Number(pinnedProduct.stock) <= 0}>
                {ordering ? "Adding…" : "Order this"}
              </button>
            )}
          </span>
        </div>
      )}

      <div className="chat-message-area">
        {loading ? (
          <MessageSkeleton />
        ) : error ? (
          <div className="chat-state is-error">
            <span>
              <XCircle />
            </span>
            <strong>Messages unavailable</strong>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onRetry}
            >
              Try again
            </button>
          </div>
        ) : !sortedMessages.length ? (
          <div className="chat-state">
            <span>
              <MessageCircle />
            </span>
            <strong>Start the conversation</strong>
            <p>
              Ask about availability, pickup details, or anything else you need
              to know.
            </p>
          </div>
        ) : (
          <div className="chat-message-list">
            {sortedMessages.map((message, index) => {
              const own = isOwnMessage(message, currentUserId);
              const previous = sortedMessages[index - 1];
              const showDay =
                !previous ||
                dayLabel(sentAt(previous)) !== dayLabel(sentAt(message));
              const text = getMessageText(message);

              return (
                <div
                  className="chat-message-entry"
                  key={
                    message.id || `${sentAt(message) || "message"}-${index}`
                  }
                >
                  {showDay && (
                    <div className="chat-day-divider">
                      <span>{dayLabel(sentAt(message))}</span>
                    </div>
                  )}
                  <div
                    className={`chat-bubble-row ${own ? "is-own" : "is-other"}`}
                  >
                    {!own && (
                      <span className="chat-mini-avatar">
                        {getInitials(partnerName)}
                      </span>
                    )}
                    <div className="chat-bubble">
                      <p>{text}</p>
                      <span>
                        {formatTime(sentAt(message))}
                        {own && <CheckCheck aria-label="Sent" />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form className="chat-composer" onSubmit={handleSubmit}>
        <div className="chat-compose-field">
          <textarea
            ref={textareaRef}
            rows={1}
            maxLength={MESSAGE_LIMIT}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${partnerName}`}
            disabled={loading || Boolean(error) || sending}
            aria-label="Message"
          />
          <span>
            {draft.length}/{MESSAGE_LIMIT}
          </span>
        </div>
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!draft.trim() || loading || Boolean(error) || sending}
          aria-label="Send message"
        >
          {sending ? <span className="spinner chat-send-spinner" /> : <Send />}
        </button>
        <small>Press Enter to send · Shift + Enter for a new line</small>
      </form>
    </section>
  );
}

function MessageSkeleton() {
  return (
    <div className="message-skeleton" aria-label="Loading messages">
      <span className="skeleton" />
      <span className="skeleton" />
      <span className="skeleton" />
      <span className="skeleton" />
    </div>
  );
}
