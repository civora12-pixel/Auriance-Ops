import { cn } from "@/lib/utils.ts";

/** The Auriance logo. Its pink background sits in a rounded tile in dark mode. */
export function ShopLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/shop-logo.webp"
      alt="Auriance"
      className={cn("dark:rounded-xl", className)}
      width={560}
      height={446}
    />
  );
}
