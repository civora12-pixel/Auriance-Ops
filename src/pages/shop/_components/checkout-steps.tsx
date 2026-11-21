import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils.ts";
import { Crawler } from "./crawler.tsx";
import type { CrawlerKind } from "./crawler.tsx";

const STEPS = ["Cart", "Your details", "Confirm"] as const;

/**
 * Checkout progress: the character crawls along the line to the current step,
 * and waves once the order is placed. Still with reduced motion.
 */
export function CheckoutSteps({ step, done, kind }: { step: 0 | 1 | 2; done?: boolean; kind: CrawlerKind }) {
  const { t } = useTranslation();
  const previous = useRef(step);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (previous.current === step) return;
    previous.current = step;
    setMoving(true);
    const id = window.setTimeout(() => setMoving(false), 900);
    return () => window.clearTimeout(id);
  }, [step]);

  const at = (i: number) => `${6 + i * 44}%`;
  return (
    <nav aria-label={t("Checkout steps")} className="grid gap-2">
      <div className="relative h-20">
        <div className="absolute top-[3.6rem] inset-x-[6%] h-1 rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-[900ms] ease-in-out motion-reduce:transition-none"
            style={{ width: `${step * 50}%` }}
          />
        </div>
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "absolute top-[3.2rem] size-5 -translate-x-1/2 rounded-full border-[3px] transition-colors rtl:translate-x-1/2",
              i <= step ? "border-primary bg-primary" : "border-secondary bg-background",
            )}
            style={{ insetInlineStart: at(i) }}
          />
        ))}
        <Crawler
          kind={kind}
          state={moving ? "crawling" : done ? "waving" : "idle"}
          className="absolute top-0 h-12 w-16 -translate-x-1/2 transition-[inset-inline-start] duration-[900ms] ease-in-out motion-reduce:transition-none rtl:translate-x-1/2"
          style={{ insetInlineStart: at(step) }}
        />
      </div>
      <ol className="grid grid-cols-3 text-center text-xs sm:text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(i === step ? "font-semibold text-foreground" : "text-muted-foreground")}
          >
            {t(label)}
          </li>
        ))}
      </ol>
    </nav>
  );
}
