import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AtSign, Camera, Mail, MessageCircle, Music2, Phone, Send } from "lucide-react";
import { SOCIAL_URL } from "@shared/shop-site.ts";
import { whatsAppChatUrl } from "@/lib/whatsapp.ts";
import { useShopConfig } from "./_lib/shop-api.ts";
import { Crawler } from "./_components/crawler.tsx";

/** Every way to reach us: chats, phone, email and our social pages (set in Website controls). */
export default function ShopContact() {
  const { t } = useTranslation();
  const config = useShopConfig();
  const c = config?.contact;
  const items: { icon: ReactNode; label: string; detail: string; href: string; color: string }[] = [];
  if (config?.whatsapp)
    items.push({ icon: <MessageCircle />, label: "WhatsApp", detail: `+${config.whatsapp}`, href: whatsAppChatUrl(config.whatsapp, ""), color: "bg-[#25d366]" });
  if (config?.messenger)
    items.push({ icon: <Send />, label: "Messenger", detail: t("Chat with our Facebook page"), href: `https://m.me/${encodeURIComponent(config.messenger)}`, color: "bg-[#0866ff]" });
  if (c?.phone) items.push({ icon: <Phone />, label: t("Call us"), detail: c.phone, href: `tel:${c.phone}`, color: "bg-primary" });
  if (c?.email) items.push({ icon: <Mail />, label: t("Email"), detail: c.email, href: `mailto:${c.email}`, color: "bg-shop-deep" });
  if (c?.instagram)
    items.push({ icon: <Camera />, label: "Instagram", detail: `@${c.instagram}`, href: SOCIAL_URL.instagram(c.instagram), color: "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]" });
  if (c?.tiktok) items.push({ icon: <Music2 />, label: "TikTok", detail: `@${c.tiktok}`, href: SOCIAL_URL.tiktok(c.tiktok), color: "bg-[#111]" });
  if (c?.facebook) items.push({ icon: <AtSign />, label: "Facebook", detail: c.facebook, href: SOCIAL_URL.facebook(c.facebook), color: "bg-[#1877f2]" });

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div className="flex items-center gap-3">
        <Crawler kind="baby" state="idle" className="h-14 w-16 shrink-0" />
        <div>
          <h1 className="font-display text-3xl font-bold text-shop-deep">{t("Contact us")}</h1>
          <p className="text-muted-foreground">{t("Questions about sizes, an order or delivery? We're happy to help.")}</p>
        </div>
      </div>
      <ul className="grid gap-3">
        {items.map((i) => (
          <li key={i.label}>
            <a
              href={i.href}
              target={i.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary"
            >
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-full text-white [&_svg]:size-6 ${i.color}`} aria-hidden>
                {i.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{i.label}</span>
                <span className="block truncate text-sm text-muted-foreground" dir="ltr">
                  {i.detail}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
