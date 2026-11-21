import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  Hourglass,
  PackageCheck,
  Languages,
  KeyRound,
  PencilLine,
  BookOpen,
  CalendarCheck,
  FileSpreadsheet,
  Truck,
  Landmark,
  ListTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  Settings,
  Settings2,
  Globe,
  ShieldAlert,
  ShieldOff,
  ShoppingCart,
  Contact,
  Sun,
  Users,
  Warehouse,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import ChangePasswordDialog from "@/components/change-password-dialog.tsx";
import { LanguageToggle } from "@/components/language-toggle.tsx";
import { BackInStockBar } from "@/components/back-in-stock-bar.tsx";
import NotificationBell from "@/components/notification-bell.tsx";
import { NameDialog } from "@/components/name-dialog.tsx";
import { useLanguage } from "@/components/providers/language.tsx";
import { EmptyState, NoAccessState } from "@/components/states.tsx";
import { api, useMutation } from "@/lib/api.ts";
import { useAdminMode, useAuth, useCurrentUser } from "@/lib/auth.tsx";
import { LANGUAGES, tk } from "@/lib/i18n.ts";
import { cn } from "@/lib/utils.ts";
import type { Section } from "@shared/constants.ts";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Package;
  end?: boolean;
};

type NavGroup = {
  /** Heading shown above the group (none for Dashboard). */
  label?: string;
  items: (NavItem & {
    /** Section that must be at least viewable. */
    section: Section;
    /** Extra section that must also be viewable. */
    also?: Section;
  })[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        to: "/",
        label: tk("Dashboard"),
        icon: LayoutDashboard,
        section: "dashboard",
        end: true,
      },
    ],
  },
  {
    label: tk("Inventory"),
    items: [
      {
        to: "/orders",
        label: tk("Orders"),
        icon: ShoppingCart,
        section: "orders",
      },
      {
        to: "/packing",
        label: tk("Packing queue"),
        icon: PackageCheck,
        section: "orders",
        also: "inventory",
      },
      {
        to: "/customers",
        label: tk("Customers"),
        icon: Contact,
        section: "orders",
      },
      {
        to: "/products",
        label: tk("Products"),
        icon: Package,
        section: "inventory",
      },
      {
        to: "/inventory",
        label: tk("Stock"),
        icon: Warehouse,
        section: "inventory",
        end: true,
      },
      {
        to: "/inventory/movements",
        label: tk("Movements"),
        icon: ArrowLeftRight,
        section: "inventory",
      },
    ],
  },
  {
    label: tk("Finance"),
    items: [
      {
        to: "/finance",
        label: tk("Overview"),
        icon: Landmark,
        section: "finance",
        end: true,
      },
      {
        to: "/finance/accounts",
        label: tk("Chart of accounts"),
        icon: ListTree,
        section: "finance",
      },
      {
        to: "/finance/cashflow",
        label: tk("Cash flow"),
        icon: Waves,
        section: "finance",
      },
      {
        to: "/finance/journal",
        label: tk("Journal entries"),
        icon: BookOpen,
        section: "finance",
      },
      {
        to: "/finance/courier",
        label: tk("Courier settlements"),
        icon: Truck,
        section: "finance",
      },
      {
        to: "/finance/statements",
        label: tk("Statements"),
        icon: FileSpreadsheet,
        section: "finance",
      },
      {
        to: "/finance/closing",
        label: tk("Monthly closing"),
        icon: CalendarCheck,
        section: "finance",
      },
    ],
  },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/team", label: tk("Team"), icon: Users },
  { to: "/settings", label: tk("Settings"), icon: Settings },
  { to: "/website", label: tk("Website controls"), icon: Globe },
  { to: "/admin/fields", label: tk("Manage fields"), icon: Settings2 },
];

/** Menu groups with only the pages this user may open. */
function useNavGroups(): NavGroup[] {
  const { canAccess } = useCurrentUser();
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => canAccess(i.section) && (!i.also || canAccess(i.also)),
    ),
  })).filter((g) => g.items.length > 0);
}

/** First page this user may open (the packing queue for a warehouse-only account). */
export function useHomePath(): string | null {
  const { isAdmin } = useCurrentUser();
  const first = useNavGroups()[0]?.items[0];
  if (first) return first.to;
  return isAdmin ? "/team" : null;
}

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="size-4" aria-hidden />
            {t(item.label)}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function SidebarBody({
  onNavigate,
  onAdminMode,
}: {
  onNavigate?: () => void;
  onAdminMode: () => void;
}) {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const { isAdmin } = useCurrentUser();
  const { isAdminMode, exitAdminMode } = useAdminMode();
  const groups = useNavGroups();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <img
          src="/brand/mark.png"
          alt=""
          className="size-9 shrink-0 rounded-lg border border-sidebar-border object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight">
            {settings.businessName}
          </p>
          <p className="text-xs text-sidebar-foreground/60">
            {t("Operations")}
          </p>
        </div>
      </div>
      <nav
        aria-label={t("Main")}
        className="flex-1 space-y-6 overflow-y-auto px-3 py-4"
      >
        {groups.map((group, i) => (
          <div key={group.label ?? i} className="space-y-1">
            {group.label && (
              <p className="px-3 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                {t(group.label)}
              </p>
            )}
            <NavList items={group.items} onNavigate={onNavigate} />
          </div>
        ))}
        {isAdmin && (
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
              {t("Admin")}
            </p>
            <NavList items={ADMIN_NAV} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      {isAdmin && (
        <div className="border-t border-sidebar-border p-3">
          {isAdminMode ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => void exitAdminMode()}
            >
              <ShieldOff className="size-3.5" />
              {t("Exit Admin Mode")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={onAdminMode}
            >
              <ShieldAlert className="size-3.5" />
              {t("Enter Admin Mode")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function UserMenu({ onChangePassword }: { onChangePassword: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [renaming, setRenaming] = useState(false);
  const updateProfile = useMutation(api.users.updateProfile);
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  if (!user) return null;
  const initials = (user.name || user.email)
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-1.5 sm:px-2"
          aria-label={t("Account menu")}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </span>
          <span className="hidden max-w-40 truncate text-sm sm:inline">
            {user.name || user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {user.role === "admin" ? t("Admin") : t("Member")}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setRenaming(true)}>
          <PencilLine />
          {t("Your name")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onChangePassword}>
          <KeyRound />
          {t("Change password")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? (
              <Moon />
            ) : theme === "light" ? (
              <Sun />
            ) : (
              <Monitor />
            )}
            {t("Theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme ?? "system"}
              onValueChange={setTheme}
            >
              <DropdownMenuRadioItem value="light">
                {t("Light")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                {t("Dark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                {t("System")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages />
            {t("Language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={language}
              onValueChange={(code) => setLanguage(code === "ar" ? "ar" : "en")}
            >
              {LANGUAGES.map((l) => (
                <DropdownMenuRadioItem
                  key={l.code}
                  value={l.code}
                  lang={l.code}
                >
                  {l.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut className="rtl:rotate-180" />
          {t("Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t("Your name")}
        initial={user.name}
        onSave={(name) => updateProfile({ name })}
      />
    </DropdownMenu>
  );
}

function AdminModeBanner() {
  const { t } = useTranslation();
  const { isAdminMode, remainingMs, exitAdminMode } = useAdminMode();
  if (!isAdminMode) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive md:px-6 print:hidden"
    >
      <span className="flex items-center gap-2 font-medium">
        <ShieldAlert className="size-4" aria-hidden />
        {t("Admin Mode is on. Permanent deletes are unlocked.")}
        <span className="tabular-nums opacity-80">
          {t("({{time}} left)", { time: formatCountdown(remainingMs) })}
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10"
        onClick={() => void exitAdminMode()}
      >
        {t("Exit")}
      </Button>
    </div>
  );
}

function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background"
      aria-busy="true"
    >
      <Spinner className="size-6 text-muted-foreground" />
      <span className="sr-only">{t("Loading")}</span>
    </div>
  );
}

/** Signed-in shell: sidebar (a drawer on phones), top bar, Admin Mode banner, page outlet. */
export default function AppLayout() {
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const { me } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // Close the drawer on navigation (including back/forward)
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  if (me === undefined) return <FullScreenLoader />;
  if (me.needsSetup) return <Navigate to="/setup" replace />;
  if (!me.user) {
    const next = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }

  const openAdminMode = () => {
    setDrawerOpen(false);
    setAdminDialogOpen(true);
  };

  return (
    <div className="flex h-svh bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:start-2"
      >
        {t("Skip to content")}
      </a>
      <aside className="hidden w-60 shrink-0 border-e border-sidebar-border md:block print:hidden">
        <SidebarBody onAdminMode={openAdminMode} />
      </aside>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("Navigation")}</SheetTitle>
            <SheetDescription>{t("Go to a section")}</SheetDescription>
          </SheetHeader>
          <SidebarBody
            onNavigate={() => setDrawerOpen(false)}
            onAdminMode={openAdminMode}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-4 md:px-6 print:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t("Open navigation")}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <p className="truncate font-semibold md:hidden">
            {me.settings.businessName}
          </p>
          <div className="ms-auto flex items-center gap-1">
            <LanguageToggle compact />
            <NotificationBell />
            <UserMenu onChangePassword={() => setPasswordOpen(true)} />
          </div>
        </header>
        <AdminModeBanner />
        <BackInStockBar />
        <main
          id="main"
          className="flex-1 overflow-y-auto print:overflow-visible"
        >
          <Outlet />
        </main>
      </div>

      <AdminModeDialog
        open={adminDialogOpen}
        onOpenChange={setAdminDialogOpen}
      />
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  );
}

/** Renders the page only if the user may open its section. */
export function SectionGuard({
  section,
  children,
}: {
  section: Section;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { canAccess } = useCurrentUser();
  const home = useHomePath();
  if (canAccess(section)) return <>{children}</>;
  if (!home) return <WaitingForAccess />;
  // The dashboard is the default landing page; send members elsewhere quietly
  if (section === "dashboard") return <Navigate to={home} replace />;
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <NoAccessState
        description={t(
          "You don't have access to this section. Ask an admin if you need it.",
        )}
      />
    </div>
  );
}

/** Renders the page only for admins. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isAdmin } = useCurrentUser();
  if (isAdmin) return <>{children}</>;
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <NoAccessState description={t("Only admins can open this page.")} />
    </div>
  );
}

function WaitingForAccess() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <EmptyState
        icon={<Hourglass />}
        title={t("Waiting for access")}
        description={t(
          "You're signed in as {{email}}, but an admin hasn't given you access to any section yet. Ask them to update your permissions on the Team page.",
          { email: user?.email },
        )}
        action={
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            {t("Check again")}
          </Button>
        }
      />
    </div>
  );
}
