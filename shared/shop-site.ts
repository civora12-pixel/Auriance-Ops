/** Switches the team uses to run the customer website (Website controls page). */
export const SEASONS = ["all", "winter", "summer"] as const;
export type Season = (typeof SEASONS)[number];
/** A product's season: worn all year, or mainly in winter or summer. */
export const PRODUCT_SEASONS = SEASONS;
export const SEASON_LABELS: Record<Season, string> = {
  all: "All year",
  winter: "Winter",
  summer: "Summer",
};

/** Who a product is for: boys, girls or both (the "Picked for your boy / girl / twins" row). */
export const AUDIENCES = ["both", "boys", "girls"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABELS: Record<Audience, string> = { both: "Boys and girls", boys: "For boys", girls: "For girls" };

export type SiteSettings = {
  /** Closes the website to visitors with a "back shortly" page (the team can still preview) */
  maintenance: boolean;
  /** Visitors can browse, but checkout is paused */
  ordersPaused: boolean;
  /** New accounts can't be created (guests can still order) */
  signupsPaused: boolean;
  /** Sold-out products disappear instead of showing "Sold out" */
  hideSoldOut: boolean;
  /** A line at the top of every page ("" = none) */
  announcement: string;
  /** The season now: off-season products go to the end and aren't suggested ("all" = no season) */
  season: Season;
  /** The Facebook page's Messenger name (m.me/<name>), for the help button ("" = no button) */
  messenger: string;
  /** Products offered as a small extra at checkout (none chosen: the cheapest kids accessories) */
  checkoutExtras: string[];
  /** Where to find us (Contact us page and footer): usernames, phone and email ("" = not shown) */
  facebook: string;
  instagram: string;
  tiktok: string;
  phone: string;
  email: string;
};

export const DEFAULT_SITE: SiteSettings = {
  maintenance: false,
  ordersPaused: false,
  signupsPaused: false,
  hideSoldOut: true,
  announcement: "",
  season: "all",
  messenger: "",
  checkoutExtras: [],
  facebook: "",
  instagram: "",
  tiktok: "",
  phone: "",
  email: "",
};

/** A social username from whatever was pasted: "@name", "name" or a profile link. Null when it doesn't look like one. */
export function handleOf(input: string, site: "instagram" | "tiktok" | "facebook"): string | null {
  let s = input.trim();
  if (!s) return "";
  if (/\/share\//i.test(s) || /profile\.php/i.test(s)) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.|web\.|vm\.)/i, "");
  s = s.replace(site === "instagram" ? /^instagram\.com\//i : site === "tiktok" ? /^tiktok\.com\//i : /^(facebook\.com|fb\.com)\//i, "");
  s = s.replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._-]{2,60}$/.test(s) ? s : null;
}

export const SOCIAL_URL = {
  facebook: (h: string) => `https://www.facebook.com/${h}`,
  instagram: (h: string) => `https://www.instagram.com/${h}`,
  tiktok: (h: string) => `https://www.tiktok.com/@${h}`,
};

export const MAX_CHECKOUT_EXTRAS = 3;

/**
 * The Messenger name from whatever was pasted: "auriance", "@auriance",
 * "m.me/auriance", "facebook.com/auriance" or "https://www.facebook.com/auriance/".
 * Returns null when it doesn't look like a page name.
 */
export function messengerName(input: string): string | null {
  let s = input.trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.|web\.)/i, "");
  // A share link (facebook.com/share/…) or profile id hides the page name: it would open the wrong chat
  if (/^(facebook\.com|fb\.com)\/(share|profile\.php)/i.test(s)) return null;
  s = s.replace(/^(facebook\.com|fb\.com|me|messenger\.com\/t)\//i, "").replace(/^m\.me\//i, "");
  s = s.replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9.\-_]{2,80}$/.test(s) ? s : null;
}

/** Whether a product is out of season right now. */
export const isOffSeason = (productSeason: Season, now: Season) =>
  now !== "all" && productSeason !== "all" && productSeason !== now;
