import { useId, useState } from "react";
import { cn } from "@/lib/utils.ts";
import { Cherry, FrontEyes, HAIR } from "./growing-baby.tsx";
import { ShopLogo } from "./shop-logo.tsx";

/**
 * The big logo with the shop's baby (the same one that crawls and grows
 * elsewhere: curl of hair, rosy cheeks, pink romper with a cherry) popping up
 * from behind it, smiling and waving, then ducking back down. Repeats every
 * few seconds; tapping the logo makes the baby pop up again straight away.
 * With "reduce motion" on, the baby just peeks out, still.
 */
export function LogoWithPeekingBaby({ className }: { className?: string }) {
  // A new key restarts the animation
  const [run, setRun] = useState(0);
  return (
    <span
      className={cn("relative mt-16 inline-block cursor-pointer select-none sm:mt-20", className)}
      onClick={() => setRun((n) => n + 1)}
    >
      <PeekingBaby key={run} className="absolute bottom-[90%] start-[8%] z-0 w-[44%]" />
      <ShopLogo className="relative z-10 h-32 w-auto sm:h-40" />
    </span>
  );
}

function PeekingBaby({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const skin = `pbs${id}`;
  const suit = `pbu${id}`;
  return (
    <span aria-hidden className={cn("gb peek-baby block", className)}>
      <svg viewBox="0 0 120 100" className="block w-full overflow-visible">
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
        {/* Shoulders and chest in the pink romper; the logo hides the rest */}
        <path d="M30 100 C30 76 42 64 60 64 C78 64 90 76 90 100 Z" fill={`url(#${suit})`} />
        <path d="M48 66 q12 7 24 0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".6" />
        <Cherry x={55} y={86} s={1.1} />
        {/* Waving arm, raised beside the head */}
        <g className="peek-wave" style={{ transformOrigin: "82px 74px" }}>
          <path d="M82 74 Q96 64 98 44" fill="none" stroke={`url(#${suit})`} strokeWidth="10" strokeLinecap="round" />
          <circle cx="98.5" cy="39" r="6" fill={`url(#${skin})`} />
          <path d="M94 34.5 v-3 M97.5 33 v-3.4 M101 33.4 v-3" stroke="var(--crawler-skin-2)" strokeWidth="2.6" strokeLinecap="round" />
        </g>
        {/* Head: ears, face, hair with the curl on top */}
        <circle cx="39" cy="42" r="5" fill="var(--crawler-skin-2)" />
        <circle cx="81" cy="42" r="5" fill="var(--crawler-skin-2)" />
        <circle cx="60" cy="40" r="23" fill={`url(#${skin})`} />
        <path d="M38 35 C40 15 80 13 82 35 C75 25 68 23 60 24 C52 24 45 27 38 35Z" fill={HAIR} />
        <path d="M56 16 q4 -11 13 -5" fill="none" stroke={HAIR} strokeWidth="2.8" strokeLinecap="round" />
        <FrontEyes y={41} gap={8.5} />
        <path d="M47 34.5 q4 -2.4 8 0 M65 34.5 q4 -2.4 8 0" fill="none" stroke="#9c6a4c" strokeWidth="1.1" strokeLinecap="round" opacity=".6" />
        <ellipse cx="45" cy="50" rx="5" ry="3.2" fill="#ff8fa0" opacity=".5" />
        <ellipse cx="75" cy="50" rx="5" ry="3.2" fill="#ff8fa0" opacity=".5" />
        {/* Big open smile with two little teeth */}
        <path d="M51 49.5 q9 10 18 0 q-9 3 -18 0z" fill="#c4505f" stroke="#a63a4b" strokeWidth=".9" strokeLinejoin="round" />
        <path d="M55 53.6 q5 2.6 10 0" fill="none" stroke="#ff8fa0" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
        <rect x="56.6" y="49.8" width="2.6" height="1.9" rx=".5" fill="#fff" />
        <rect x="60.8" y="49.8" width="2.6" height="1.9" rx=".5" fill="#fff" />
      </svg>
    </span>
  );
}
