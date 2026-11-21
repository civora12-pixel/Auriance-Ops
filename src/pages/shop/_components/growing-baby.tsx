import { useId } from "react";
import type { BabyTier, ChildGender } from "@shared/little-ones.ts";
import { cn } from "@/lib/utils.ts";

export type BabyAction = "idle" | "moving" | "waving" | "clapping";

/** Romper colours: pink for girls, blue for boys, mint when we don't know. */
const OUTFITS: Record<ChildGender | "none", React.CSSProperties> = {
  girls: {},
  boys: {
    ["--crawler-suit-1" as string]: "#dbeeff",
    ["--crawler-suit-2" as string]: "#9ac6ee",
    ["--crawler-suit-far" as string]: "#84b3df",
  },
  none: {
    ["--crawler-suit-1" as string]: "#e1f5ea",
    ["--crawler-suit-2" as string]: "#a6dcc0",
    ["--crawler-suit-far" as string]: "#8fcaab",
  },
};

export const HAIR = "#6b3f2a";
const INK = "#2b1a17";

/**
 * The baby that grows with the child: newborn on a cloud (0–3 m), tummy time
 * (3–6 m), crawling (6–12 m), first wobbly steps (1–2 y), walking (2 y+).
 * Drawn in code (a few KB) and animated with CSS only.
 */
export function GrowingBaby({
  tier,
  gender,
  action = "idle",
  className,
  style,
}: {
  tier: BabyTier;
  gender: ChildGender | null;
  action?: BabyAction;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = useId().replace(/:/g, "");
  const ids = { skin: `gbs${id}`, suit: `gbu${id}` };
  return (
    <span
      aria-hidden
      style={{ ...OUTFITS[gender ?? "none"], ...style }}
      className={cn(
        "gb crawler-flip inline-block",
        `gb-t${tier}`,
        action === "moving" && "is-moving",
        action === "waving" && "is-waving",
        action === "clapping" && "is-clapping",
        className,
      )}
    >
      <svg viewBox="0 0 120 120" className="block size-full overflow-visible">
        <defs>
          <radialGradient id={ids.skin} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="var(--crawler-skin-1)" />
            <stop offset="1" stopColor="var(--crawler-skin-2)" />
          </radialGradient>
          <linearGradient id={ids.suit} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--crawler-suit-1)" />
            <stop offset="1" stopColor="var(--crawler-suit-2)" />
          </linearGradient>
        </defs>
        {tier === 0 && <Newborn ids={ids} gender={gender} />}
        {tier === 1 && <TummyTime ids={ids} gender={gender} />}
        {tier === 2 && <Crawling ids={ids} gender={gender} />}
        {tier === 3 && <Toddler ids={ids} gender={gender} />}
        {tier === 4 && <Walker ids={ids} gender={gender} />}
      </svg>
    </span>
  );
}

type Ids = { skin: string; suit: string };
type Part = { ids: Ids; gender: ChildGender | null };

export function Cherry({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M1 -2 q2 -6 6 -8 M7 -10 q1 5 3 8" fill="none" stroke="#5b8a3a" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 -10 q4 -3 7 -1 q-3 2 -7 1z" fill="#6fa046" />
      <circle cx="1" cy="0" r="3" fill="var(--crawler-cherry)" />
      <circle cx="10" cy="-1" r="2.7" fill="var(--crawler-cherry)" />
      <circle cx="0" cy="-1" r=".9" fill="#fff" opacity=".7" />
    </g>
  );
}

function Bow({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 L-7 -4 L-7 4 Z M0 0 L7 -4 L7 4 Z" fill="#ff6f91" stroke="#d94b70" strokeWidth=".8" strokeLinejoin="round" />
      <circle r="2" fill="#d94b70" />
    </g>
  );
}

/** Two open eyes facing us, with highlights; they blink now and then. */
export function FrontEyes({ y, gap = 7, cx = 60 }: { y: number; gap?: number; cx?: number }) {
  return (
    <g className="blink" style={{ transformOrigin: `${cx}px ${y}px` }}>
      <ellipse cx={cx - gap} cy={y} rx="2.9" ry="3.5" fill={INK} />
      <ellipse cx={cx + gap} cy={y} rx="2.9" ry="3.5" fill={INK} />
      <circle cx={cx - gap + 1.1} cy={y - 1.4} r="1.1" fill="#fff" />
      <circle cx={cx + gap + 1.1} cy={y - 1.4} r="1.1" fill="#fff" />
    </g>
  );
}

/** 0–3 months: swaddled and asleep on a little cloud, breathing, with the odd yawn. */
function Newborn({ ids }: Part) {
  return (
    <>
      <g className="breathe">
        <path
          d="M10 110 q-9 -13 6 -18 q2 -13 18 -10 q9 -11 22 -3 q13 -8 24 3 q15 -4 20 9 q12 3 7 19 z"
          fill="var(--gb-cloud)"
          stroke="var(--gb-cloud-edge)"
          strokeWidth="1.2"
        />
        <path
          d="M26 94 C24 80 42 74 60 76 C75 77 84 82 84 92 C84 102 70 106 53 106 C37 106 27 102 26 94Z"
          fill={`url(#${ids.suit})`}
        />
        <path d="M36 80 C50 90 66 89 82 83" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M30 98 q20 6 42 2" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
        <Cherry x={50} y={97} s={0.9} />
        <circle cx="80" cy="92" r="4" fill={`url(#${ids.skin})`} />
        <circle cx="92" cy="85" r="15" fill={`url(#${ids.skin})`} />
        <ellipse cx="81" cy="87" rx="3.2" ry="4" fill="var(--crawler-skin-2)" />
        <path d="M88 84 q2.8 2.4 5.6 0 M97.5 84 q2.8 2.4 5.6 0" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
        <ellipse cx="89" cy="90" rx="3.6" ry="2.2" fill="#ff8fa0" opacity=".45" />
        <ellipse cx="103" cy="90" rx="2.6" ry="2" fill="#ff8fa0" opacity=".4" />
        <ellipse className="yawn" cx="96" cy="94" rx="1.9" ry="1.2" fill="#c4505f" style={{ transformOrigin: "96px 94px" }} />
        <path d="M93 71 q2 -3 4 0" fill="none" stroke={HAIR} strokeWidth="1" strokeLinecap="round" opacity=".5" />
      </g>
      <g className="zz" fill="var(--shop-deep)" fontFamily="inherit" fontWeight="700">
        <text x="104" y="66" fontSize="10">z</text>
        <text x="112" y="55" fontSize="7">z</text>
      </g>
    </>
  );
}

/** 3–6 months: tummy time, head up, legs kicking, a few wisps of hair. */
function TummyTime({ ids, gender }: Part) {
  return (
    <>
      <rect x="6" y="110" width="108" height="6" rx="3" fill="var(--gb-mat)" />
      <g className="kick-a" style={{ transformOrigin: "36px 102px" }}>
        <path d="M36 102 Q25 98 21 85" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="11" strokeLinecap="round" />
        <ellipse cx="20" cy="81" rx="4.6" ry="6" fill="var(--crawler-skin-far)" />
      </g>
      <g className="kick-b" style={{ transformOrigin: "40px 104px" }}>
        <path d="M40 104 Q31 101 28 90" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="12" strokeLinecap="round" />
        <ellipse cx="27" cy="86" rx="5" ry="6.4" fill={`url(#${ids.skin})`} />
      </g>
      <ellipse cx="57" cy="101" rx="28" ry="11.5" fill={`url(#${ids.suit})`} />
      <Cherry x={50} y={100} s={0.85} />
      <path d="M74 99 L80 109" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="9.5" strokeLinecap="round" />
      <ellipse cx="83" cy="110" rx="5.5" ry="3.2" fill={`url(#${ids.skin})`} />
      <g className="head-bob" style={{ transformOrigin: "80px 96px" }}>
        <circle cx="87" cy="80" r="17" fill={`url(#${ids.skin})`} />
        <ellipse cx="77" cy="83" rx="3.8" ry="4.8" fill="var(--crawler-skin-2)" />
        <path d="M78 64 q4 -7 9 -3 M85 62 q3 -6 8 -1 M91 64 q4 -3 6 1" fill="none" stroke={HAIR} strokeWidth="1.6" strokeLinecap="round" />
        {gender === "girls" && <Bow x={96} y={66} s={0.6} />}
        <g className="blink" style={{ transformOrigin: "95px 79px" }}>
          <ellipse cx="91" cy="79" rx="2.8" ry="3.3" fill={INK} />
          <ellipse cx="100.5" cy="79" rx="2.3" ry="3" fill={INK} />
          <circle cx="92" cy="77.6" r="1.1" fill="#fff" />
          <circle cx="101.3" cy="77.8" r=".9" fill="#fff" />
        </g>
        <ellipse cx="92" cy="87" rx="4.4" ry="2.8" fill="#ff8fa0" opacity=".45" />
        <path d="M96.5 88 q4 4.4 8 0.2 q-4 1.3 -8 -0.2z" fill="#c4505f" stroke="#a63a4b" strokeWidth=".8" strokeLinejoin="round" />
      </g>
    </>
  );
}

/** 6–12 months: crawling on all fours, short hair and a first tooth. */
function Crawling({ ids, gender }: Part) {
  return (
    <g transform="translate(0 26)">
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
        <path d="M20 54 C20 38 38 33 57 35 C75 37 84 45 81 59 C78 71 61 73 45 72 C29 71 20 66 20 54Z" fill={`url(#${ids.suit})`} />
        <path d="M30 70 q14 4 30 2" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
        <Cherry x={46} y={49} />
        <g className="limb-a" style={{ transformOrigin: "34px 60px" }}>
          <path d="M34 60 L42 80 L22 81" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="13" cy="77" rx="6.5" ry="4.4" transform="rotate(-35 13 77)" fill={`url(#${ids.skin})`} />
        </g>
        <g className="limb-b">
          <g className="wave-arm" style={{ transformOrigin: "66px 55px" }}>
            <path d="M66 55 Q72 69 70 81" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="12" strokeLinecap="round" />
            <ellipse cx="72" cy="84" rx="7" ry="3.8" fill={`url(#${ids.skin})`} />
          </g>
        </g>
        <circle cx="88" cy="35" r="22" fill={`url(#${ids.skin})`} />
        <ellipse cx="76" cy="38" rx="4.6" ry="5.6" fill="var(--crawler-skin-2)" />
        <path d="M76 35 q2.2 3 0 6" fill="none" stroke="#dc9a7a" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M70 24 C72 12 96 8 106 20 C98 16 90 15 84 17 C80 18 74 20 70 24Z" fill={HAIR} opacity=".85" />
        <path d="M86 14 c-2 -7 7 -10 9 -4 c1 3 -3 5 -5 2" fill="none" stroke={HAIR} strokeWidth="2.2" strokeLinecap="round" />
        {gender === "girls" && <Bow x={80} y={16} s={0.75} />}
        <g className="blink" style={{ transformOrigin: "98px 35px" }}>
          <ellipse cx="92" cy="35" rx="3.3" ry="3.9" fill={INK} />
          <circle cx="93.3" cy="33.5" r="1.3" fill="#fff" />
          <ellipse cx="103.5" cy="35" rx="2.7" ry="3.5" fill={INK} />
          <circle cx="104.5" cy="33.6" r="1.05" fill="#fff" />
        </g>
        <path d="M109 39 q2.4 1.4 0.2 3.4" fill="none" stroke="#dc9a7a" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="94" cy="44" rx="5.2" ry="3.3" fill="#ff8fa0" opacity=".45" />
        <path d="M99.5 46 q4 4.2 8 0.2 q-4 1.2 -8 -0.2z" fill="#c4505f" stroke="#a63a4b" strokeWidth=".8" strokeLinejoin="round" />
        <rect x="102.6" y="46.1" width="2" height="1.6" rx=".4" fill="#fff" />
      </g>
    </g>
  );
}

/** 1–2 years: standing, a wobbly waddle, more hair. */
function Toddler({ ids, gender }: Part) {
  return (
    <>
      <ellipse cx="60" cy="116" rx="24" ry="3" fill="var(--crawler-cherry-deep)" opacity=".14" />
      <g className="sway" style={{ transformOrigin: "60px 116px" }}>
        <g className="hop">
          <g className="leg-a" style={{ transformOrigin: "52px 86px" }}>
            <path d="M52 86 L51 106" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="12" strokeLinecap="round" />
            <ellipse cx="49" cy="110" rx="7.5" ry="4.2" fill="var(--crawler-cherry)" />
          </g>
          <g className="leg-b" style={{ transformOrigin: "68px 86px" }}>
            <path d="M68 86 L69 106" fill="none" stroke="var(--crawler-suit-far)" strokeWidth="12" strokeLinecap="round" />
            <ellipse cx="71" cy="110" rx="7.5" ry="4.2" fill="var(--crawler-cherry)" />
          </g>
          <g className="arm-l" style={{ transformOrigin: "45px 60px" }}>
            <path d="M45 60 Q37 70 37 78" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="9" strokeLinecap="round" />
            <circle cx="37" cy="81" r="4.6" fill={`url(#${ids.skin})`} />
          </g>
          <path d="M43 64 C43 54 50 50 60 50 C70 50 77 54 77 64 L80 86 C80 95 40 95 40 86 Z" fill={`url(#${ids.suit})`} />
          <path d="M48 64 h24 v10 q-12 5 -24 0z" fill="#fff" opacity=".45" />
          <Cherry x={56} y={70} s={0.9} />
          <g className="wave-arm" style={{ transformOrigin: "75px 60px" }}>
            <path d="M75 60 Q83 70 83 78" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="9" strokeLinecap="round" />
            <circle cx="83" cy="81" r="4.6" fill={`url(#${ids.skin})`} />
          </g>
          <circle cx="41" cy="34" r="4.2" fill="var(--crawler-skin-2)" />
          <circle cx="79" cy="34" r="4.2" fill="var(--crawler-skin-2)" />
          <circle cx="60" cy="32" r="19" fill={`url(#${ids.skin})`} />
          <path d="M42 28 C44 12 76 10 78 28 C72 20 66 18 60 19 C53 19 47 22 42 28Z" fill={HAIR} />
          <path d="M57 13 q4 -9 11 -4" fill="none" stroke={HAIR} strokeWidth="2.4" strokeLinecap="round" />
          {gender === "girls" && <Bow x={72} y={16} s={0.8} />}
          <FrontEyes y={34} />
          <ellipse cx="48" cy="41" rx="4" ry="2.6" fill="#ff8fa0" opacity=".45" />
          <ellipse cx="72" cy="41" rx="4" ry="2.6" fill="#ff8fa0" opacity=".45" />
          <path d="M53.5 41.5 q6.5 6 13 0 q-6.5 2 -13 0z" fill="#c4505f" stroke="#a63a4b" strokeWidth=".8" strokeLinejoin="round" />
          <rect x="57.2" y="41.8" width="2.2" height="1.6" rx=".4" fill="#fff" />
          <rect x="60.6" y="41.8" width="2.2" height="1.6" rx=".4" fill="#fff" />
        </g>
      </g>
    </>
  );
}

/** 2 years and up: taller, full hair (pigtails for girls), t-shirt and shorts. */
function Walker({ ids, gender }: Part) {
  return (
    <>
      <ellipse cx="60" cy="116" rx="22" ry="3" fill="var(--crawler-cherry-deep)" opacity=".14" />
      <g className="sway" style={{ transformOrigin: "60px 116px" }}>
        <g className="hop">
          <g className="leg-a" style={{ transformOrigin: "53px 80px" }}>
            <path d="M53 80 L52 106" fill="none" stroke={`url(#${ids.skin})`} strokeWidth="9" strokeLinecap="round" />
            <path d="M44 110 q0 -6 7 -6 q6 0 6 6z" fill="var(--crawler-cherry)" />
          </g>
          <g className="leg-b" style={{ transformOrigin: "67px 80px" }}>
            <path d="M67 80 L68 106" fill="none" stroke={`url(#${ids.skin})`} strokeWidth="9" strokeLinecap="round" />
            <path d="M63 110 q0 -6 6 -6 q7 0 7 6z" fill="var(--crawler-cherry)" />
          </g>
          <path d="M45 74 h30 l2 14 h-14 l-3 -6 l-3 6 h-14z" fill="var(--crawler-suit-far)" />
          <g className="arm-l" style={{ transformOrigin: "46px 52px" }}>
            <path d="M46 52 Q38 62 38 72" fill="none" stroke={`url(#${ids.skin})`} strokeWidth="7.5" strokeLinecap="round" />
            <path d="M46 52 Q41 57 40 61" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="10" strokeLinecap="round" />
            <circle cx="38" cy="75" r="4.2" fill={`url(#${ids.skin})`} />
          </g>
          <path d="M44 56 C44 47 50 44 60 44 C70 44 76 47 76 56 L76 76 H44 Z" fill={`url(#${ids.suit})`} />
          <Cherry x={56} y={62} />
          <g className="wave-arm" style={{ transformOrigin: "74px 52px" }}>
            <path d="M74 52 Q82 62 82 72" fill="none" stroke={`url(#${ids.skin})`} strokeWidth="7.5" strokeLinecap="round" />
            <path d="M74 52 Q79 57 80 61" fill="none" stroke={`url(#${ids.suit})`} strokeWidth="10" strokeLinecap="round" />
            <circle cx="82" cy="75" r="4.2" fill={`url(#${ids.skin})`} />
          </g>
          {gender === "girls" && (
            <>
              <circle cx="40" cy="22" r="6.5" fill={HAIR} />
              <circle cx="80" cy="22" r="6.5" fill={HAIR} />
              <Bow x={44} y={16} s={0.6} />
              <Bow x={76} y={16} s={0.6} />
            </>
          )}
          <circle cx="43" cy="27" r="3.8" fill="var(--crawler-skin-2)" />
          <circle cx="77" cy="27" r="3.8" fill="var(--crawler-skin-2)" />
          <circle cx="60" cy="26" r="17" fill={`url(#${ids.skin})`} />
          {gender === "girls" ? (
            <path d="M43 24 C43 7 77 7 77 24 C72 17 66 15 60 18 C54 15 48 17 43 24Z" fill={HAIR} />
          ) : (
            <path d="M43 25 C42 8 76 5 77 22 C73 18 64 13 54 17 C50 19 46 21 43 25Z" fill={HAIR} />
          )}
          <FrontEyes y={28} gap={6.5} />
          <ellipse cx="49" cy="34" rx="3.6" ry="2.3" fill="#ff8fa0" opacity=".45" />
          <ellipse cx="71" cy="34" rx="3.6" ry="2.3" fill="#ff8fa0" opacity=".45" />
          <path d="M54 34.5 q6 5.5 12 0 q-6 2 -12 0z" fill="#c4505f" stroke="#a63a4b" strokeWidth=".8" strokeLinejoin="round" />
        </g>
      </g>
    </>
  );
}
