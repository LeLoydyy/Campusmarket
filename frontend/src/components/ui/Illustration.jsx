import { useId } from "react";

/**
 * Spot illustrations in one style: soft "clay" shapes (top-lit gradients,
 * rounded forms, ground shadow) in the green/gold palette. Used by EmptyState
 * and anywhere a page needs art without mixing styles.
 *
 * <Illustration name="bag" size={160} />
 */
const NAMES = ["bag", "calendar", "chat", "box", "store", "search", "check", "map", "heart", "bell", "sprout"];

export default function Illustration({ name = "bag", size = 160, title }) {
  const uid = useId().replace(/:/g, "");
  const id = (key) => `${key}-${uid}`;
  const url = (key) => `url(#${id(key)})`;
  const art = ART[NAMES.includes(name) ? name : "bag"](url);
  return (
    <svg
      width={size}
      height={size * 0.8}
      viewBox="0 0 200 160"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className="cm-illustration"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={id("green")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2FAE66" /><stop offset="1" stopColor="#13703C" /></linearGradient>
        <linearGradient id={id("greenDeep")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#13703C" /><stop offset="1" stopColor="#0B3D24" /></linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFD366" /><stop offset="1" stopColor="#E9A21C" /></linearGradient>
        <linearGradient id={id("cream")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#F3EAD6" /></linearGradient>
        <linearGradient id={id("coral")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F6A58C" /><stop offset="1" stopColor="#E8603C" /></linearGradient>
        <radialGradient id={id("shine")} cx=".3" cy=".25" r=".6"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("ground")} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#0B3D24" stopOpacity=".22" /><stop offset="1" stopColor="#0B3D24" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="142" rx="70" ry="12" fill={url("ground")} />
      {art}
      <Sparkles />
    </svg>
  );
}

const Sparkles = () => (
  <g fill="#F5B82E">
    <path d="M166 34l2.5 6.5L175 43l-6.5 2.5L166 52l-2.5-6.5L157 43l6.5-2.5z" />
    <circle cx="36" cy="44" r="3.2" />
    <circle cx="176" cy="92" r="2.4" opacity=".7" />
  </g>
);

const Leaf = ({ x, y, flip = false, url }) => (
  <g transform={`translate(${x} ${y}) ${flip ? "scale(-1 1)" : ""}`}>
    <path d="M0 0c6-16 22-22 34-18-4 14-18 22-34 18z" fill={url("green")} />
    <path d="M2 -1c10-5 20-9 30-16" stroke="#0B3D24" strokeOpacity=".35" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </g>
);

const ART = {
  bag: (url) => (
    <g>
      <path d="M78 58c0-18 10-30 22-30s22 12 22 30" fill="none" stroke={url("greenDeep")} strokeWidth="7" strokeLinecap="round" />
      <rect x="56" y="54" width="88" height="86" rx="18" fill={url("cream")} />
      <rect x="56" y="54" width="88" height="86" rx="18" fill={url("shine")} />
      <path d="M100 86c-10 4-14 14-10 24 10-2 14-10 10-24zM100 86c10 4 14 14 10 24-10-2-14-10-10-24z" fill={url("green")} />
      <circle cx="100" cy="80" r="6" fill={url("gold")} />
      <Leaf x={138} y={126} url={url} />
    </g>
  ),
  calendar: (url) => (
    <g>
      <rect x="50" y="38" width="100" height="100" rx="20" fill={url("cream")} />
      <path d="M50 58a20 20 0 0 1 20-20h60a20 20 0 0 1 20 20v8H50z" fill={url("green")} />
      <rect x="70" y="28" width="10" height="22" rx="5" fill={url("greenDeep")} />
      <rect x="120" y="28" width="10" height="22" rx="5" fill={url("greenDeep")} />
      <g fill="#E3F4E9">{[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={68 + c * 24} y={78 + r * 18} width="16" height="11" rx="4" />))}</g>
      <rect x="116" y="96" width="16" height="11" rx="4" fill={url("gold")} />
      <rect x="50" y="38" width="100" height="100" rx="20" fill={url("shine")} />
    </g>
  ),
  chat: (url) => (
    <g>
      <path d="M44 50a18 18 0 0 1 18-18h56a18 18 0 0 1 18 18v28a18 18 0 0 1-18 18H80l-20 16v-16a18 18 0 0 1-16-18z" fill={url("green")} />
      <path d="M86 78a16 16 0 0 1 16-16h50a16 16 0 0 1 16 16v26a16 16 0 0 1-16 16h-2v14l-18-14h-30a16 16 0 0 1-16-16z" fill={url("cream")} />
      <g fill="#E3F4E9"><rect x="58" y="52" width="50" height="8" rx="4" /><rect x="58" y="68" width="34" height="8" rx="4" /></g>
      <g fill={url("gold")}><circle cx="112" cy="92" r="5" /><circle cx="127" cy="92" r="5" /><circle cx="142" cy="92" r="5" /></g>
    </g>
  ),
  box: (url) => (
    <g>
      <path d="M100 40l48 20v58l-48 22-48-22V60z" fill={url("gold")} />
      <path d="M100 62l48-2v58l-48 22z" fill="#E9A21C" />
      <path d="M52 60l48-20 48 20-48 22z" fill="#FFE39A" />
      <path d="M76 50l48 20v18l-10-4-2 8-12-6V74L66 56z" fill={url("green")} />
      <Leaf x={40} y={128} flip url={url} />
    </g>
  ),
  store: (url) => (
    <g>
      <rect x="54" y="72" width="92" height="66" rx="10" fill={url("cream")} />
      <path d="M46 56l10-24h88l10 24z" fill={url("green")} />
      <g>{[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${46 + i * 21.6} 56h21.6v6a10.8 10.8 0 0 1-21.6 0z`} fill={i % 2 ? url("gold") : url("green")} />)}</g>
      <rect x="88" y="100" width="24" height="38" rx="6" fill={url("greenDeep")} />
      <rect x="62" y="88" width="18" height="16" rx="4" fill="#E3F4E9" />
      <rect x="120" y="88" width="18" height="16" rx="4" fill="#E3F4E9" />
      <Leaf x={146} y={132} url={url} />
    </g>
  ),
  search: (url) => (
    <g>
      <rect x="112" y="98" width="16" height="44" rx="8" transform="rotate(-45 120 120)" fill={url("greenDeep")} />
      <circle cx="90" cy="76" r="40" fill={url("green")} />
      <circle cx="90" cy="76" r="29" fill={url("cream")} />
      <circle cx="90" cy="76" r="29" fill={url("shine")} />
      <path d="M80 70a12 12 0 0 1 12-10" stroke="#F5B82E" strokeWidth="5" strokeLinecap="round" fill="none" />
    </g>
  ),
  check: (url) => (
    <g>
      <circle cx="100" cy="80" r="52" fill={url("green")} />
      <circle cx="100" cy="80" r="52" fill={url("shine")} />
      <path d="M76 82l16 16 32-34" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="148" cy="46" r="12" fill={url("gold")} />
      <Leaf x={40} y={126} flip url={url} />
    </g>
  ),
  map: (url) => (
    <g>
      <path d="M40 50l40-14 40 14 40-14v92l-40 14-40-14-40 14z" fill={url("cream")} />
      <path d="M80 36v92l40 14V50z" fill="#EFE3C7" />
      <path d="M52 70h18M52 84h12M92 66h18M130 80h18M130 94h10" stroke="#13703C" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" />
      <path d="M118 44c-13 0-22 9-22 21 0 16 22 36 22 36s22-20 22-36c0-12-9-21-22-21z" fill={url("coral")} />
      <circle cx="118" cy="64" r="8" fill="#fff" />
    </g>
  ),
  heart: (url) => (
    <g>
      <path d="M100 136S46 104 46 68c0-18 14-30 30-30 11 0 19 6 24 14 5-8 13-14 24-14 16 0 30 12 30 30 0 36-54 68-54 68z" fill={url("coral")} />
      <path d="M100 136S46 104 46 68c0-18 14-30 30-30 11 0 19 6 24 14 5-8 13-14 24-14 16 0 30 12 30 30 0 36-54 68-54 68z" fill={url("shine")} />
      <Leaf x={140} y={128} url={url} />
    </g>
  ),
  bell: (url) => (
    <g>
      <path d="M100 30c-26 0-40 20-40 44v24l-12 16h104l-12-16V74c0-24-14-44-40-44z" fill={url("gold")} />
      <path d="M100 30c-26 0-40 20-40 44v24l-12 16h104l-12-16V74c0-24-14-44-40-44z" fill={url("shine")} />
      <circle cx="100" cy="124" r="12" fill={url("greenDeep")} />
      <circle cx="136" cy="44" r="12" fill={url("coral")} />
    </g>
  ),
  sprout: (url) => (
    <g>
      <path d="M72 104h56l-8 36H80z" fill={url("gold")} />
      <rect x="66" y="96" width="68" height="14" rx="7" fill="#E9A21C" />
      <path d="M100 98V62" stroke={url("greenDeep")} strokeWidth="6" strokeLinecap="round" />
      <path d="M100 74c-4-20-22-28-36-24 2 16 16 28 36 24zM100 64c4-22 24-30 40-24-2 18-18 30-40 24z" fill={url("green")} />
    </g>
  ),
};
