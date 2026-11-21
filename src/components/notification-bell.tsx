import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PauseCircle,
  PlayCircle,
  CalendarClock,
  AlertTriangle,
  Bell,
  CheckCheck,
  PackageCheck,
  RotateCcw,
  ShoppingCart,
  XCircle,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { NotificationType } from "@shared/constants.ts";

type Notification = Output<typeof api.notifications.list>[number];

const ICONS: Record<NotificationType, typeof Bell> = {
  low_stock: AlertTriangle,
  order_new: ShoppingCart,
  order_shipped: PackageCheck,
  order_returned: RotateCcw,
  order_swapped: Repeat,
  order_cancelled: XCircle,
  order_on_hold: PauseCircle,
  order_released: PlayCircle,
  payment_due: CalendarClock,
};

export default function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unread = useQuery(api.notifications.unreadCount, undefined, {
    refetchInterval: 15_000,
  });
  // Only load the full list while the panel is open
  const notifications = useQuery(
    api.notifications.list,
    open ? undefined : "skip",
  );
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const navigate = useNavigate();
  const { formatRelative, formatDateTime } = useFormat();

  const handleClick = (n: Notification) => {
    if (!n.read) void markRead({ notificationId: n._id }).catch(() => {});
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const count = unread ?? 0;
  const label =
    count > 0
      ? t("Notifications, {{unread}} unread", {
          unread: count >= 100 ? "99+" : count,
        })
      : t("Notifications");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={label}
        >
          <Bell className="size-5" />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
            >
              {count >= 100 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t("Notifications")}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={count === 0}
            onClick={() => void markAllRead().catch(() => {})}
          >
            <CheckCheck className="size-3.5" />
            {t("Mark all read")}
          </Button>
        </div>
        <div className="max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain">
          {notifications === undefined ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <Bell className="size-6 opacity-40" />
              {t("You're all caught up")}
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <li key={n._id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full gap-3 px-3 py-2.5 text-start hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none",
                        !n.read && "bg-primary/5",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          n.type === "low_stock"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "line-clamp-2 text-sm break-words",
                            !n.read && "font-semibold",
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="line-clamp-2 text-xs break-words text-muted-foreground">
                          {n.body}
                        </span>
                        <time
                          className="block text-[11px] text-muted-foreground/80"
                          dateTime={n.createdAt}
                          title={formatDateTime(n.createdAt)}
                        >
                          {formatRelative(n.createdAt)}
                          {n.byMe
                            ? ` · ${t("by you")}`
                            : n.actorName &&
                              ` · ${t("by {{name}}", { name: n.actorName })}`}
                        </time>
                      </span>
                      {!n.read && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                          <span className="sr-only">{t("Unread")}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
