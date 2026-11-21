import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { KIDS_SECTIONS } from "@shared/constants.ts";
import { ageWindow, babiesOf, babyTier, celebration } from "@shared/little-ones.ts";
import type { BabyTier, ChildGender } from "@shared/little-ones.ts";
import { useLanguage } from "@/components/providers/language.tsx";
import { useBabyAge } from "../_lib/baby-age.ts";
import { updateGuest, useGuest } from "../_lib/guest.ts";
import { useLittleOnes } from "../_lib/little-ones.ts";
import { CUE_EVENT } from "../_lib/baby-cue.ts";
import type { BabyCue } from "../_lib/baby-cue.ts";
import { GrowingBaby } from "./growing-baby.tsx";
import { Mom } from "./mom.tsx";
import { BIRTHDAYS_ON, useShoppingFor } from "../_lib/shopping-for.ts";
import type { BabyAction } from "./growing-baby.tsx";

type Actor = { key: string; tier: BabyTier; gender: ChildGender | null; name: string | null };
type Phase =
  | { kind: "hidden" }
  | { kind: "travel"; x: number; ms: number; action: BabyAction }
  | { kind: "corner"; action: BabyAction; bubble: "birthday" | "thanks" | null };

const SIZE = 84; // px, one baby
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The child (or two) growing with the customer, visiting the page now and
 * then: crawling or walking across the bottom edge, stopping to wave; babies
 * too young to crawl pop up in the corner instead. Never covers what you tap
 * (only the ✕ is clickable), pauses when the tab is hidden, and stays away
 * when the phone asks for less motion.
 */
export function BabyStage() {
  const { t } = useTranslation();
  const rtl = useLanguage().dir === "rtl";
  const guest = useGuest();
  const { ready, children, active, today } = useLittleOnes();
  const { ageMonths } = useBabyAge();
  const [phase, setPhase] = useState<Phase>({ kind: "hidden" });
  const [hearts, setHearts] = useState(0);
  const timers = useRef<number[]>([]);
  const celebrated = useRef(false);

  // Who shows: the child being shopped for, plus one more; or a baby of the estimated age
  // Twins count as two babies
  const shopping = useShoppingFor();
  const actors: Actor[] = !BIRTHDAYS_ON
    ? shopping.babies.map((gender, i) => ({ key: `baby-${i}`, tier: babyTier(ageMonths ?? 8), gender, name: null }))
    : children.length
    ? [active!, ...children.filter((c) => c.id !== active!.id)]
        .flatMap((c) => babiesOf(c).map((gender, i) => ({ key: `${c.id}-${i}`, tier: c.tier, gender, name: c.name })))
        .slice(0, 2)
    : [{ key: "baby", tier: babyTier(ageMonths ?? 8), gender: null, name: null }];
  const travels = actors.some((a) => a.tier >= 2);
  const party = active ? celebration(active.birthday, today) : null;

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const visit = useCallback(() => {
    clear();
    if (document.hidden) {
      later(5000, visit);
      return;
    }
    const width = window.innerWidth;
    const showParty = !!party && !celebrated.current;
    if (showParty) celebrated.current = true;
    if (!travels || showParty) {
      // Pops up in the corner, does its thing, then goes
      setPhase({ kind: "corner", action: showParty ? "waving" : "idle", bubble: showParty ? "birthday" : null });
      later(showParty ? 12_000 : 8_000, () => setPhase({ kind: "hidden" }));
      later(showParty ? 12_000 + rand(25_000, 40_000) : rand(30_000, 50_000), visit);
      return;
    }
    // Crawl or walk in, stop to wave, then carry on off the other side
    const speed = actors.every((a) => a.tier === 2) ? 70 : 80; // px per second
    const group = SIZE * actors.length + 72; // babies and mum
    // Far enough in that mum, running behind, is on screen too
    const from = Math.max(width * 0.25, 80);
    const stop = rand(from, Math.max(from, width * 0.7 - group));
    setPhase({ kind: "travel", x: -group - 20, ms: 0, action: "moving" });
    later(60, () => setPhase({ kind: "travel", x: stop, ms: ((stop + group) / speed) * 1000, action: "moving" }));
    const arrive = 60 + ((stop + group) / speed) * 1000;
    later(arrive, () => setPhase({ kind: "travel", x: stop, ms: 0, action: "waving" }));
    later(arrive + 2000, () =>
      setPhase({ kind: "travel", x: width + 20, ms: ((width + 20 - stop) / speed) * 1000, action: "moving" }),
    );
    const gone = arrive + 2000 + ((width + 20 - stop) / speed) * 1000;
    later(gone, () => setPhase({ kind: "hidden" }));
    later(gone + rand(20_000, 40_000), visit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travels, party?.kind, actors.length, actors.map((a) => a.tier).join()]);

  const off = guest.hideBaby || reducedMotion();

  useEffect(() => {
    if (!ready || off) return;
    later(4000, visit);
    return clear;
  }, [ready, off, visit]);

  // Reactions: clap for the cart, wave goodbye after an order
  useEffect(() => {
    if (off) return;
    const onCue = (e: Event) => {
      const cue = (e as CustomEvent<BabyCue>).detail;
      clear();
      setHearts((n) => n + 1);
      setPhase((p) =>
        p.kind === "travel"
          ? { ...p, ms: 0, action: cue === "cart-added" ? "clapping" : "waving" }
          : { kind: "corner", action: cue === "cart-added" ? "clapping" : "waving", bubble: cue === "order-placed" ? "thanks" : null },
      );
      later(cue === "order-placed" ? 6000 : 3000, () => setPhase({ kind: "hidden" }));
      later(rand(20_000, 35_000), visit);
    };
    window.addEventListener(CUE_EVENT, onCue);
    return () => window.removeEventListener(CUE_EVENT, onCue);
  }, [off, visit]);

  if (!ready || off || phase.kind === "hidden") return null;

  const dir = rtl ? -1 : 1;
  const firstName = actors[0].name;
  const window_ = active ? ageWindow(active.ageMonths) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-1 z-20 h-28 overflow-x-clip" aria-hidden={phase.kind === "travel"}>
      <div
        className="absolute bottom-0 flex items-end"
        style={
          phase.kind === "travel"
            ? {
                insetInlineStart: 0,
                transform: `translateX(${dir * phase.x}px)`,
                transition: phase.ms ? `transform ${phase.ms}ms linear` : "none",
              }
            : { insetInlineStart: 12 }
        }
      >
        {/* Mum chasing after them (she trails behind, so she comes first in the row) */}
        {phase.kind === "travel" && (
          <Mom pose="run" moving={phase.action === "moving"} className="me-1 h-[108px] w-[68px]" />
        )}
        {actors.map((a) => (
          <GrowingBaby
            key={a.key}
            tier={a.tier}
            gender={a.gender}
            action={phase.action}
            className={a.tier <= 1 ? "h-[76px] w-[96px]" : "h-[84px] w-[84px]"}
          />
        ))}
        {hearts > 0 && (
          <span key={hearts} className="pointer-events-none absolute -top-2 start-8 flex gap-3 text-lg text-primary">
            <span className="gb-heart" style={{ ["--dx" as string]: "-10px" }}>♥</span>
            <span className="gb-heart" style={{ ["--dx" as string]: "6px", animationDelay: "0.2s" }}>♥</span>
            <span className="gb-heart" style={{ ["--dx" as string]: "14px", animationDelay: "0.4s" }}>♥</span>
          </span>
        )}
        {phase.kind === "corner" && phase.bubble && (
          <div className="pointer-events-auto mb-14 ms-1 max-w-56 rounded-2xl rounded-es-sm border border-border bg-card px-3 py-2 text-sm shadow-md">
            {phase.bubble === "thanks" ? (
              <p className="font-medium text-shop-deep">{t("Thank you! See you soon")} 👋</p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 font-semibold text-shop-deep">
                  <Balloon />
                  {party?.kind === "birthday"
                    ? firstName
                      ? t("Happy birthday, {{name}}! {{n}} today", { name: firstName, n: party.years })
                      : t("Happy birthday! {{n}} today", { n: party.years })
                    : party?.kind === "months"
                      ? firstName
                        ? t("{{name}} is {{n}} months old today!", { name: firstName, n: party.months })
                        : t("{{n}} months old today!", { n: party.months })
                      : null}
                </p>
                {window_ && (
                  <Link to={`/shop/s/${KIDS_SECTIONS[0]}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                    {window_.unit === "months"
                      ? t("See sizes for {{from}}–{{to}} months", { from: window_.from, to: window_.to })
                      : t("See sizes for {{from}}–{{to}} years", { from: window_.from, to: window_.to })}
                  </Link>
                )}
              </>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            clear();
            setPhase({ kind: "hidden" });
            updateGuest({ hideBaby: true });
          }}
          className="pointer-events-auto mb-16 flex size-7 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm hover:text-foreground"
          aria-label={t("Hide the baby")}
          title={t("Hide the baby")}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function Balloon() {
  return (
    <svg viewBox="0 0 20 30" className="h-6 w-4 shrink-0" aria-hidden>
      <ellipse cx="10" cy="10" rx="8" ry="9.5" fill="var(--crawler-cherry)" />
      <ellipse cx="7" cy="6.5" rx="2" ry="3" fill="#fff" opacity=".5" />
      <path d="M8.5 19.5 h3 l-1.5 2z" fill="var(--crawler-cherry-deep)" />
      <path d="M10 21.5 q-3 3 0 5 q3 2 0 3.5" fill="none" stroke="var(--muted-foreground)" strokeWidth=".8" />
    </svg>
  );
}
