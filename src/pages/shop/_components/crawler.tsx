import { useId } from "react";
import { cn } from "@/lib/utils.ts";

export type CrawlerKind = "baby" | "cherries";
export type CrawlerState = "idle" | "crawling" | "waving";

/** The shop's characters: a crawling baby (kids sections) and the logo's cherries (women's section). */
export function Crawler({
  kind,
  state = "idle",
  className,
  style,
}: {
  kind: CrawlerKind;
  state?: CrawlerState;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "crawler crawler-flip inline-block",
        state === "crawling" && "is-crawling",
        state === "waving" && "is-waving",
        className,
      )}
    >
      {kind === "baby" ? <Baby /> : <Cherries />}
    </span>
  );
}

function Baby() {
  // Gradient ids must be unique on the page (several babies can show at once)
  const id = useId().replace(/:/g, "");
  const skin = `skin${id}`;
  const suit = `suit${id}`;
  return (
    <svg viewBox="0 0 120 92" className="block size-full overflow-visible">
      <defs>
        <radialGradient id={skin} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="var(--crawler-skin-1)" />
          <stop offset="1" stopColor="var(--crawler-skin-2)" />
        </radialGradient>
        <linearGradient id={suit} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--crawler-suit-1)" />
          <stop offset="1" stopColor="var(--crawler-suit-2)" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="87" rx="46" ry="3.6" fill="var(--crawler-cherry-deep)" opacity=".14" />
      <g className="bob">
        <g className="limb-b" style={{ transformOrigin: "38px 60px" }}>
          <path d="M38 60 L46 79 L26 80" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="18" cy="76" rx="6" ry="4" transform="rotate(-30 18 76)" fill="var(--crawler-skin-far)" />
        </g>
        <g className="limb-a" style={{ transformOrigin: "72px 54px" }}>
          <path d="M72 54 Q78 68 78 80" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="11" strokeLinecap="round" />
          <ellipse cx="80" cy="83" rx="6" ry="3.6" fill="var(--crawler-skin-far)" />
        </g>
        <path d="M20 54 C20 38 38 33 57 35 C75 37 84 45 81 59 C78 71 61 73 45 72 C29 71 20 66 20 54Z" fill={`url(#${suit})`} />
        <path d="M30 70 q14 4 30 2" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
        <circle cx="38" cy="70.8" r="1.2" fill="#fff" />
        <circle cx="46" cy="72" r="1.2" fill="#fff" />
        <g transform="translate(46 49)">
          <path d="M1 -2 q2 -6 6 -8 M7 -10 q1 5 3 8" fill="none" stroke="#5b8a3a" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M7 -10 q4 -3 7 -1 q-3 2 -7 1z" fill="#6fa046" />
          <circle cx="1" cy="0" r="3" fill="var(--crawler-cherry)" />
          <circle cx="10" cy="-1" r="2.7" fill="var(--crawler-cherry)" />
          <circle cx="0" cy="-1" r=".9" fill="#fff" opacity=".7" />
        </g>
        <g className="limb-a" style={{ transformOrigin: "34px 60px" }}>
          <path d="M34 60 L42 80 L22 81" fill="none" stroke={`url(#${suit})`} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="13" cy="77" rx="6.5" ry="4.4" transform="rotate(-35 13 77)" fill={`url(#${skin})`} />
        </g>
        <g className="limb-b">
          <g className="wave-arm" style={{ transformOrigin: "66px 55px" }}>
            <path d="M66 55 Q72 69 70 81" fill="none" stroke={`url(#${suit})`} strokeWidth="12" strokeLinecap="round" />
            <ellipse cx="72" cy="84" rx="7" ry="3.8" fill={`url(#${skin})`} />
          </g>
        </g>
        <circle cx="88" cy="35" r="22" fill={`url(#${skin})`} />
        <ellipse cx="76" cy="38" rx="4.6" ry="5.6" fill="var(--crawler-skin-2)" />
        <path d="M76 35 q2.2 3 0 6" fill="none" stroke="#dc9a7a" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M86 14 c-2 -7 7 -10 9 -4 c1 3 -3 5 -5 2" fill="none" stroke="#6b3f2a" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M76 20 q3 -3 7 -3 M80 16 q4 -2 8 -1" fill="none" stroke="#6b3f2a" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
        <ellipse cx="92" cy="35" rx="3.3" ry="3.9" fill="#2b1a17" />
        <circle cx="93.3" cy="33.5" r="1.3" fill="#fff" />
        <circle cx="91" cy="36.6" r=".6" fill="#fff" opacity=".8" />
        <ellipse cx="103.5" cy="35" rx="2.7" ry="3.5" fill="#2b1a17" />
        <circle cx="104.5" cy="33.6" r="1.05" fill="#fff" />
        <path d="M88.5 29.5 q3.5 -2.2 7 0 M101 29.8 q2.5 -1.6 5 0" fill="none" stroke="#9c6a4c" strokeWidth="1" strokeLinecap="round" opacity=".6" />
        <path d="M109 39 q2.4 1.4 0.2 3.4" fill="none" stroke="#dc9a7a" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="94" cy="44" rx="5.2" ry="3.3" fill="#ff8fa0" opacity=".45" />
        <path d="M99.5 46 q4 4.2 8 0.2 q-4 1.2 -8 -0.2z" fill="#c4505f" stroke="#a63a4b" strokeWidth=".8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function Cherries() {
  return (
    <svg viewBox="0 0 64 50" className="block size-full overflow-visible">
      <ellipse cx="34" cy="48" rx="24" ry="2" fill="var(--crawler-cherry-deep)" opacity=".14" />
      <g className="bob">
        <path d="M24 22 C26 10 34 6 38 2 M44 22 C42 12 40 7 38 2" fill="none" stroke="#5b8a3a" strokeWidth="2" strokeLinecap="round" />
        <path d="M38 3 C44 -3 54 0 56 4 C50 7 43 7 38 3Z" fill="#6fa046" />
        <g className="limb-a" style={{ transformOrigin: "19px 38px" }}>
          <rect x="17" y="38" width="4" height="9" rx="2" fill="var(--crawler-cherry-deep)" />
        </g>
        <g className="limb-b" style={{ transformOrigin: "29px 38px" }}>
          <rect x="27" y="38" width="4" height="9" rx="2" fill="var(--crawler-cherry-deep)" />
        </g>
        <g className="limb-b" style={{ transformOrigin: "41px 38px" }}>
          <rect x="39" y="38" width="4" height="9" rx="2" fill="var(--crawler-cherry-deep)" />
        </g>
        <g className="limb-a" style={{ transformOrigin: "50px 38px" }}>
          <rect x="48" y="38" width="4" height="9" rx="2" fill="var(--crawler-cherry-deep)" />
        </g>
        <circle cx="24" cy="30" r="11" fill="var(--crawler-cherry)" stroke="var(--crawler-cherry-deep)" strokeWidth="1.5" />
        <circle cx="45" cy="30" r="10" fill="var(--crawler-cherry)" stroke="var(--crawler-cherry-deep)" strokeWidth="1.5" />
        <circle cx="20" cy="26" r="2.5" fill="#fff" opacity=".55" />
        <circle cx="21" cy="30" r="1.5" fill="#2a0a10" />
        <circle cx="28" cy="30" r="1.5" fill="#2a0a10" />
        <path d="M22 34 q2.5 2.5 5 0" fill="none" stroke="#2a0a10" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="42" cy="30" r="1.5" fill="#2a0a10" />
        <circle cx="48" cy="30" r="1.5" fill="#2a0a10" />
        <path d="M43 34 q2 2 4 0" fill="none" stroke="#2a0a10" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="19" cy="33" r="2" fill="#ff8fa0" opacity=".5" />
        <circle cx="50" cy="33" r="1.8" fill="#ff8fa0" opacity=".5" />
        <g className="wave-arm" style={{ transformOrigin: "54px 30px" }}>
          <circle cx="57" cy="27" r="2.6" fill="var(--crawler-cherry-deep)" />
        </g>
      </g>
    </svg>
  );
}
