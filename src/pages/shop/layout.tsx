import { Suspense } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SOCIAL_URL } from "@shared/shop-site.ts";
import { useTheme } from "next-themes";
import { Megaphone, MessageCircle, Moon, ShoppingBag, Sun, UserRound } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useCart } from "./_lib/cart.ts";
import { useGuest } from "./_lib/guest.ts";
import { useCatalog, useShopConfig, useShopMe } from "./_lib/shop-api.ts";
import { Crawler } from "./_components/crawler.tsx";
import { ShopLogo } from "./_components/shop-logo.tsx";
import { BabyStage } from "./_components/baby-stage.tsx";
import { isKids } from "./_lib/sections.ts";

function Loader() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50svh] items-center justify-center" aria-busy="true">
      <Spinner className="size-6 text-primary" />
      <span className="sr-only">{t("Loading")}</span>
    </div>
  );
}

/** Pages anyone may open before choosing to sign in or shop as a guest. */
const OPEN_PATHS = /^\/shop\/(welcome|signin|signup|forgot|reset\/|verify\/)/;

function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 rounded-full text-shop-deep hover:bg-background/60"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? t("Light mode") : t("Dark mode")}
      title={dark ? t("Light mode") : t("Dark mode")}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

/** Help from a person: opens a Messenger chat with the Facebook page (a plain m.me link, no Facebook API). */
function messengerUrl(name: string) {
  return `https://m.me/${encodeURIComponent(name)}`;
}

function HelpButton({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={messengerUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-4 end-4 z-30 flex h-12 items-center gap-2 rounded-full bg-[#0866ff] ps-3 pe-4 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-[#0866ff]/40 focus-visible:outline-none"
      aria-label={t("Need help? Chat with us on Messenger")}
    >
      <MessageCircle className="size-6 fill-white/20" aria-hidden />
      <span>{t("Need help?")}</span>
    </a>
  );
}

/** Shown to the public until the shop opens (Settings → Shop), and while it's down for maintenance. */
function ComingSoon({ maintenance, messenger }: { maintenance: boolean; messenger?: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="shop flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <ShopLogo className="h-28 w-auto" />
      <Crawler kind="baby" state="crawling" className="h-16 w-20" />
      <div className="grid gap-2">
        <h1 className="font-display text-3xl font-bold text-shop-deep">
          {maintenance ? t("We're making a few updates") : t("Our shop opens soon")}
        </h1>
        <p className="text-muted-foreground">
          {maintenance ? t("We'll be back shortly. Thank you for waiting!") : t("We're getting everything ready. Check back soon!")}
        </p>
      </div>
      {messenger && (
        <a href={messengerUrl(messenger)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0866ff] underline-offset-4 hover:underline">
          {t("Need help? Chat with us on Messenger")}
        </a>
      )}
      <div className="flex items-center gap-2">
        <LanguageToggle className="text-shop-deep" />
        <ThemeToggle />
      </div>
      <Link to="/login?next=%2Fshop" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
        {t("Team sign-in")}
      </Link>
    </div>
  );
}

/**
 * The customer shop's frame: logo header with account and cart, then the page.
 * Before launch only signed-in team members can use it (preview).
 */
export default function ShopLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const config = useShopConfig();
  const usable = !!config && ((config.open && !config.maintenance) || config.preview);
  const me = useShopMe(usable);
  const guest = useGuest();
  const { count } = useCart();

  if (config === undefined)
    return (
      <div className="shop min-h-svh">
        <Loader />
      </div>
    );
  if (!usable) return <ComingSoon maintenance={!!config.maintenance} messenger={config.messenger} />;
  if (me === undefined)
    return (
      <div className="shop min-h-svh">
        <Loader />
      </div>
    );

  // First visit: sign in, create an account or continue as a guest
  if (!me.customer && !guest.guest && !OPEN_PATHS.test(location.pathname)) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/shop/welcome${next === "/shop" ? "" : `?next=${encodeURIComponent(next)}`}`} replace />;
  }

  return (
    <div className="shop flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-shop-band/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:h-20">
          <Link to="/shop" className="shrink-0" aria-label={t("Auriance shop home")}>
            <ShopLogo className="h-12 w-auto sm:h-16" />
          </Link>
          <div className="flex items-center">
            <LanguageToggle compact className="text-shop-deep hover:bg-background/60" />
            <ThemeToggle />
            <Link
              to={me.customer ? "/shop/account" : "/shop/signin"}
              className="flex size-11 items-center justify-center rounded-full text-shop-deep transition-colors hover:bg-background/60"
              aria-label={me.customer ? t("My account") : t("Sign in")}
              title={me.customer ? t("My account") : t("Sign in")}
            >
              <UserRound className="size-6" />
            </Link>
            <Link
              to="/shop/cart"
              className="relative flex size-11 items-center justify-center rounded-full text-shop-deep transition-colors hover:bg-background/60"
              aria-label={t("Cart ({{n}})", { n: count })}
            >
              <ShoppingBag className="size-6" />
              {count > 0 && (
                <span className="absolute -top-0.5 -end-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums">
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>
      {config.preview && (
        <div className="bg-shop-deep px-4 py-1.5 text-center text-xs font-medium text-background">
          {config.maintenance
            ? t("Maintenance mode: visitors see a 'back shortly' page. Only your team can shop.")
            : t("Shop preview: only your team can see this page until launch.")}
        </div>
      )}
      {config.announcement && (
        <div role="status" className="flex items-center justify-center gap-2 bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
          <Megaphone className="size-4 shrink-0" aria-hidden />
          <span>{config.announcement}</span>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Suspense fallback={<Loader />}>
          <Outlet />
        </Suspense>
      </main>
      <BabyStageGate path={location.pathname} />
      <footer className="border-t border-border bg-shop-band/60">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-muted-foreground">
          <p className="font-display text-base font-semibold text-shop-deep">Auriance · Cloud Touch</p>
          <p>{t("Cash on delivery all over Egypt")}</p>
          <nav aria-label={t("Contact us")} className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 font-semibold">
            <Link to="/shop/contact" className="text-shop-deep underline-offset-4 hover:underline">
              {t("Contact us")}
            </Link>
            {config.contact?.instagram && (
              <a href={SOCIAL_URL.instagram(config.contact.instagram)} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                Instagram
              </a>
            )}
            {config.contact?.tiktok && (
              <a href={SOCIAL_URL.tiktok(config.contact.tiktok)} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                TikTok
              </a>
            )}
            {config.contact?.facebook && (
              <a href={SOCIAL_URL.facebook(config.contact.facebook)} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                Facebook
              </a>
            )}
          </nav>
        </div>
      </footer>
      {config.messenger && <HelpButton name={config.messenger} />}
    </div>
  );
}

/**
 * The baby visits the home page, the kids sections and kids products, the cart
 * and the thank-you page; the women's section keeps the cherries.
 */
function BabyStageGate({ path }: { path: string }) {
  const productId = path.match(/^\/shop\/p\/([^/]+)/)?.[1];
  const products = useCatalog(!!productId);
  const show =
    /^\/shop\/?$/.test(path) ||
    /^\/shop\/(cart|thanks|checkout)\/?$/.test(path) ||
    /^\/shop\/s\/kids_/.test(path) ||
    (!!productId && !!products?.find((p) => p.productId === productId && isKids(p.section)));
  return show ? <BabyStage /> : null;
}
