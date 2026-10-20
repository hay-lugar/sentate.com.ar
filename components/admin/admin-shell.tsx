"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  ExternalLink,
  LogOut,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { TenantLogo } from "@/components/ui/tenant-logo";
import { ThemeScope } from "@/components/ui/theme-scope";
import { cn } from "@/lib/format";
import { useDemo } from "./demo-provider";
import { DemoBanner } from "./demo-banner";
import { TrialBanner } from "./trial-banner";
import { signOutAction } from "@/app/(auth)/actions";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

const STORAGE_KEY = "sentate:sidebar-collapsed";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, mode, live } = useDemo();
  const { reservations } = state;
  const tenant = { slug: state.slug, name: state.profile.name, cuisine: state.profile.cuisine, logoUrl: state.profile.logoUrl };
  const pending = reservations.filter((r) => r.status === "pending").length;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia de UI leída tras hidratar
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  const base = `/admin/${tenant.slug}`;
  const items: NavItem[] = [
    { href: base, label: "Inicio", icon: LayoutDashboard },
    { href: `${base}/reservas`, label: "Reservas", icon: CalendarDays, badge: pending },
    { href: `${base}/menu`, label: "Menú", icon: UtensilsCrossed },
    { href: `${base}/ajustes`, label: "Ajustes", icon: Settings },
  ];
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));

  return (
    <ThemeScope theme={state.profile.theme} className="min-h-dvh bg-background lg:flex">
      {/* ── Sidebar desktop ── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 92 : 280 }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="sticky top-0 hidden h-dvh shrink-0 flex-col p-3 lg:flex"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-surface p-3 shadow-soft ring-1 ring-line/70">
          <div className="flex h-12 items-center justify-between pl-2">
            <AnimatePresence initial={false} mode="popLayout">
              {!collapsed && (
                <motion.div key="logo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Link href="/">
                    <Logo className="text-lg" />
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
              className={cn(
                "pressable grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-background hover:text-foreground",
                collapsed && "mx-auto -translate-x-1",
              )}
            >
              {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </button>
          </div>

          {/* Tenant */}
          <div className={cn("mt-4 flex items-center gap-3 rounded-2xl bg-background p-2", collapsed && "justify-center bg-transparent p-0")}>
            <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-11 rounded-[0.9rem] text-[15px] shadow-brand" />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="truncate font-display font-bold">{tenant.name}</p>
                <p className="truncate text-[12px] text-muted">{tenant.cuisine}</p>
              </div>
            )}
          </div>

          <nav className="mt-6 flex flex-col gap-1">
            {items.map((item) => (
              <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </nav>

          <div className="mt-auto space-y-2">
            <Link
              href={`/${tenant.slug}`}
              target="_blank"
              title="Ver menú público"
              className={cn(
                "pressable flex h-12 items-center gap-3 rounded-2xl px-3.5 text-[14px] font-semibold text-muted ring-1 ring-line hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <ExternalLink className="size-[18px] shrink-0" aria-hidden />
              {collapsed ? <span className="sr-only">Ver menú público (nueva pestaña)</span> : "Ver menú público"}
            </Link>
            {live && (
              <form action={signOutAction}>
                <button
                  type="submit"
                  title={`Cerrar sesión (${live.email})`}
                  className={cn(
                    "pressable flex h-12 w-full items-center gap-3 rounded-2xl px-3.5 text-[14px] font-semibold text-muted hover:bg-background hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <LogOut className="size-[18px] shrink-0" aria-hidden />
                  {collapsed ? <span className="sr-only">Cerrar sesión</span> : "Cerrar sesión"}
                </button>
              </form>
            )}
          </div>
        </div>
      </motion.aside>

      {/* ── Top bar mobile ── */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-background/85 px-4 backdrop-blur-xl lg:hidden">
        <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-10 rounded-xl text-[14px] shadow-brand" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display font-bold">{tenant.name}</p>
          <p className="text-[12px] text-muted">{mode === "demo" ? "Panel · demo" : "Panel"}</p>
        </div>
        <Link
          href={`${base}/reservas`}
          aria-label={`Solicitudes pendientes: ${pending}`}
          className="pressable relative ml-auto grid size-11 place-items-center rounded-2xl bg-surface shadow-soft ring-1 ring-line/70"
        >
          <Bell className="size-5" aria-hidden />
          {pending > 0 && (
            <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-fg ring-2 ring-background">
              {pending}
            </span>
          )}
        </Link>
        {live && (
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="pressable grid size-11 place-items-center rounded-2xl bg-surface shadow-soft ring-1 ring-line/70"
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        )}
      </header>

      <main className="min-w-0 flex-1 px-4 pt-2 pb-36 sm:px-6 lg:px-8 lg:py-8">
        {mode === "demo" ? <DemoBanner /> : <TrialBanner />}
        {children}
      </main>

      {/* ── Bottom nav mobile ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-safe lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around rounded-[1.6rem] bg-surface/90 p-1.5 shadow-lift ring-1 ring-line/70 backdrop-blur-xl">
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.badge ? `${item.label} (${item.badge} pendientes)` : undefined}
                className={cn(
                  "pressable relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-semibold",
                  active ? "text-brand" : "text-muted",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="absolute inset-0 rounded-2xl bg-brand-soft"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative" aria-hidden>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.5 : 2} />
                  {!!item.badge && (
                    <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </ThemeScope>
  );
}

function SidebarLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed || item.badge ? `${item.label}${item.badge ? ` (${item.badge} pendientes)` : ""}` : undefined}
      className={cn(
        "pressable relative flex h-12 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold",
        active ? "text-brand-fg" : "text-muted hover:bg-background hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-pill"
          className="absolute inset-0 rounded-2xl bg-brand shadow-brand"
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      )}
      <Icon className="relative size-5 shrink-0" strokeWidth={active ? 2.5 : 2} aria-hidden />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
      {!!item.badge && (
        <span
          aria-hidden
          className={cn(
            "relative grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold",
            active ? "bg-white/25 text-brand-fg" : "bg-brand text-brand-fg",
            collapsed ? "absolute! top-1.5 right-3" : "ml-auto",
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}
