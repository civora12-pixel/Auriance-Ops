import { useId } from "react";
import { cn } from "@/lib/utils.ts";
import { Cherry } from "./growing-baby.tsx";

/**
 * The shop's mum, the baby's mother, drawn in the same family style:
 * dark hair in a messy bun with a pink scrunchie, rosy cheeks, a dusty-rose
 * cardigan over a cream top with the cherry, cream joggers and white trainers.
 *
 * Poses:
 * - "run": chasing the baby, arms out, bun bouncing (moving) or stopped to laugh
 * - "tea": standing with a cup of tea, steam curling, swaying a little
 */
export type MomPose = "run" | "tea";

const HAIR = "#3b2418";
const CARDIGAN_1 = "#f3a6b5";
const CARDIGAN_2 = "#d9788d";
const TOP = "#fff3e6";
const JOGGERS = "#f1e2cf";
const JOGGERS_SHADE = "#dcc7ad";

export function Mom({
  pose,
  moving = false,
  className,
}: {
  pose: MomPose;
  moving?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const skin = `mms${id}`;
  const card = `mmc${id}`;
  return (
    <span aria-hidden className={cn("mom crawler-flip inline-block", `mom-${pose}`, moving && "is-moving", className)}>
      <svg viewBox="0 0 100 160" className="block size-full overflow-visible">
        <defs>
          <radialGradient id={skin} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="var(--crawler-skin-1)" />
            <stop offset="1" stopColor="var(--crawler-skin-2)" />
          </radialGradient>
          <linearGradient id={card} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={CARDIGAN_1} />
            <stop offset="1" stopColor={CARDIGAN_2} />
          </linearGradient>
        </defs>
        <ellipse cx="50" cy="157" rx="26" ry="3" fill="#000" opacity=".08" />
        {pose === "run" ? <Running skin={skin} card={card} /> : <Tea skin={skin} card={card} />}
      </svg>
    </span>
  );
}

type Fill = { skin: string; card: string };

function Head({ skin, cx, cy, mouth }: { skin: string; cx: number; cy: number; mouth: "open" | "smile" }) {
  return (
    // A slightly big head, like the babies
    <g className="mom-head" transform={`translate(${cx} ${cy + 13}) scale(1.18) translate(${-cx} ${-(cy + 13)})`}>
      {/* Messy bun with the pink scrunchie */}
      <g className="mom-bun">
        <circle cx={cx - 4} cy={cy - 21} r="9" fill={HAIR} />
        <path d={`M${cx - 12} ${cy - 16} q8 -5 16 0`} fill="none" stroke="#f07f98" strokeWidth="3.4" strokeLinecap="round" />
        <path d={`M${cx - 9} ${cy - 27} q3 -4 7 -2`} fill="none" stroke={HAIR} strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <circle cx={cx + 13} cy={cy + 1} r="3.2" fill="var(--crawler-skin-2)" />
      <circle cx={cx} cy={cy} r="15" fill={`url(#${skin})`} />
      {/* Hair framing the face, a loose strand at the side */}
      <path
        d={`M${cx - 15} ${cy + 2} C${cx - 17} ${cy - 14} ${cx + 8} ${cy - 20} ${cx + 15} ${cy - 6} C${cx + 8} ${cy - 11} ${cx} ${cy - 10} ${cx - 6} ${cy - 8} C${cx - 9} ${cy - 3} ${cx - 11} ${cy + 3} ${cx - 15} ${cy + 6}Z`}
        fill={HAIR}
      />
      <path d={`M${cx + 14} ${cy - 3} q3 7 0 13`} fill="none" stroke={HAIR} strokeWidth="1.8" strokeLinecap="round" />
      {/* Eyes, lashes and cheeks */}
      <g className="blink">
        <ellipse cx={cx - 4} cy={cy + 1} rx="1.9" ry="2.3" fill="#2a1712" />
        <ellipse cx={cx + 6} cy={cy + 1} rx="1.9" ry="2.3" fill="#2a1712" />
        <circle cx={cx - 3.4} cy={cy + 0.2} r=".7" fill="#fff" />
        <circle cx={cx + 6.6} cy={cy + 0.2} r=".7" fill="#fff" />
      </g>
      <path d={`M${cx - 7} ${cy - 2.6} l-1.4 -1.2 M${cx + 9} ${cy - 2.6} l1.4 -1.2`} stroke="#2a1712" strokeWidth=".9" strokeLinecap="round" />
      <ellipse cx={cx - 8} cy={cy + 6} rx="3.2" ry="2" fill="#ff8fa0" opacity=".55" />
      <ellipse cx={cx + 10} cy={cy + 6} rx="3.2" ry="2" fill="#ff8fa0" opacity=".55" />
      {mouth === "open" ? (
        <path d={`M${cx - 1} ${cy + 7} q2.5 5 5 0 q-2.5 1.2 -5 0z`} fill="#b94559" />
      ) : (
        <path d={`M${cx - 2} ${cy + 7} q3 3 6 0`} fill="none" stroke="#a63a4b" strokeWidth="1.3" strokeLinecap="round" />
      )}
      {/* A little cherry earring */}
      <circle cx={cx + 13} cy={cy + 6} r="1.4" fill="var(--crawler-cherry)" />
    </g>
  );
}

/** Mid-stride, leaning forward, arms out to scoop the baby. */
function Running({ skin, card }: Fill) {
  return (
    <g className="mom-body">
      {/* Back leg and arm (further away, a shade darker) */}
      <g className="mom-leg-b" style={{ transformOrigin: "47px 100px" }}>
        <path d="M47 100 L36 126 L30 148" fill="none" stroke={JOGGERS_SHADE} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 150 q6 -6 12 -1 l1 4 h-14z" fill="#e9e4e0" />
      </g>
      <g className="mom-arm-b" style={{ transformOrigin: "52px 66px" }}>
        <path d="M52 66 Q70 72 82 66" fill="none" stroke={CARDIGAN_2} strokeWidth="7.5" strokeLinecap="round" />
        <circle cx="85" cy="65" r="4" fill="var(--crawler-skin-2)" />
      </g>
      {/* Front leg */}
      <g className="mom-leg-a" style={{ transformOrigin: "50px 100px" }}>
        <path d="M50 100 L62 124 L70 146" fill="none" stroke={JOGGERS} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M66 150 q6 -7 13 -2 l1 4 h-14z" fill="#fff" stroke="#e3dad3" strokeWidth=".8" />
      </g>
      {/* Body: cream top with the cherry, open cardigan */}
      <g transform="rotate(10 50 80)">
        <path d="M36 62 Q50 56 64 62 L66 100 Q50 105 34 100Z" fill={TOP} />
        <path d="M36 62 Q42 58 48 59 L44 102 Q38 101 34 100Z" fill={`url(#${card})`} />
        <path d="M64 62 Q58 58 53 59 L57 102 Q62 101 66 100Z" fill={`url(#${card})`} />
        <Cherry x={50} y={78} s={1.1} />
        <Head skin={skin} cx={52} cy={40} mouth="open" />
      </g>
      {/* Front arm reaching out */}
      <g className="mom-arm-a" style={{ transformOrigin: "58px 66px" }}>
        <path d="M58 66 Q76 64 90 56" fill="none" stroke={`url(#${card})`} strokeWidth="8" strokeLinecap="round" />
        <circle cx="93" cy="54" r="4.4" fill={`url(#${skin})`} />
      </g>
      {/* Sweat drop when she stops to catch her breath */}
      <path className="mom-drop" d="M74 26 q3 5 0 7 q-3 -2 0 -7z" fill="#8fd3ff" />
    </g>
  );
}

/** Standing with a cup of tea: a well-earned break. */
function Tea({ skin, card }: Fill) {
  return (
    <g className="mom-sway" style={{ transformOrigin: "50px 150px" }}>
      <path d="M40 100 L39 146 M58 100 L60 146" fill="none" stroke={JOGGERS} strokeWidth="11" strokeLinecap="round" />
      <path d="M32 150 q6 -6 13 -1 l1 4 h-15z M54 150 q6 -6 13 -1 l1 4 h-15z" fill="#fff" stroke="#e3dad3" strokeWidth=".8" />
      <path d="M34 62 Q49 56 64 62 L66 102 Q49 107 32 102Z" fill={TOP} />
      <path d="M34 62 Q40 58 46 59 L43 104 Q37 103 32 102Z" fill={`url(#${card})`} />
      <path d="M64 62 Q58 58 52 59 L55 104 Q61 103 66 102Z" fill={`url(#${card})`} />
      <Cherry x={49} y={78} s={1.1} />
      {/* Both hands round the mug */}
      <path d="M36 66 Q30 84 44 88 M62 66 Q70 84 56 88" fill="none" stroke={`url(#${card})`} strokeWidth="8" strokeLinecap="round" />
      <rect x="42" y="80" width="15" height="14" rx="3" fill="#fff" stroke="#f1c9d2" />
      <path d="M57 83 q5 0 5 4 q0 4 -5 4" fill="none" stroke="#f1c9d2" strokeWidth="2" />
      <Cherry x={49.5} y={87} s={0.6} />
      <circle cx="43" cy="88" r="3.6" fill={`url(#${skin})`} />
      <circle cx="56" cy="88" r="3.6" fill={`url(#${skin})`} />
      <g className="mom-steam" fill="none" stroke="#c9b8bd" strokeWidth="1.6" strokeLinecap="round" opacity=".8">
        <path d="M46 77 q-3 -5 0 -9 q3 -4 0 -8" />
        <path d="M52 77 q-3 -5 0 -9 q3 -4 0 -8" />
      </g>
      <Head skin={skin} cx={49} cy={40} mouth="smile" />
      {/* Content little hearts */}
      <g className="mom-hearts" fill="var(--crawler-cherry)" opacity=".85">
        <path d="M74 30 c-2 -3 -6 0 -3 3 l3 3 l3 -3 c3 -3 -1 -6 -3 -3z" />
        <path d="M82 20 c-1.4 -2 -4 0 -2 2 l2 2 l2 -2 c2 -2 -.6 -4 -2 -2z" />
      </g>
    </g>
  );
}
