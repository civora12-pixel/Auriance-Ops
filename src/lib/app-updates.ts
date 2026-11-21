import { useEffect } from "react";
import i18n from "i18next";
import { toast } from "sonner";

const CHECK_EVERY_MS = 2 * 60_000;
const RELOAD_KEY = "auriance.reloaded-at";

/** The entry script this page was loaded with ("/assets/index-abc.js"); none in development. */
function loadedEntry(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  return script ? new URL(script.src, location.href).pathname : null;
}

/** Nothing half-typed on screen: no open dialog and no field being edited. */
function safeToReload(): boolean {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return false;
  if (location.pathname.startsWith("/shop/checkout")) return false;
  return true;
}

/** Reloads at most once a minute, so a broken deploy can't loop. */
function reload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway
  }
  location.reload();
  return true;
}

/**
 * Keeps every open page on the latest version: after a deploy, a page (or a
 * home-screen shortcut) still showing the old app reloads itself when that's
 * safe, or offers a Reload button. Also recovers when an old page can't load
 * a part of the app that the new deploy replaced.
 */
export function useAppUpdates() {
  useEffect(() => {
    const loaded = loadedEntry();
    if (!loaded) return; // development
    let warned = false;

    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { entry } = (await res.json()) as { entry: string | null };
        if (!entry || entry === loaded) return;
        if (safeToReload() && reload()) return;
        if (warned) return;
        warned = true;
        toast.info(i18n.t("A new version of the app is ready"), {
          duration: Infinity,
          action: { label: i18n.t("Reload"), onClick: () => location.reload() },
        });
      } catch {
        // Offline: try again later
      }
    };

    const onVisible = () => {
      if (!document.hidden) void check();
    };
    // A part of the old app was removed by the deploy: load the new one
    const onPreloadError = (e: Event) => {
      e.preventDefault();
      reload();
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("vite:preloadError", onPreloadError);
    };
  }, []);
}
