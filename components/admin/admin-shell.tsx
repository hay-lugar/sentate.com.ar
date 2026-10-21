"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, ExternalLink, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, MapPin, QrCode, Settings, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { TenantLogo } from "@/components/ui/tenant-logo";
import { BRAND } from "@/lib/config/brand";
import { cn } from "@/lib/format";
import { themeStyle } from "@/lib/theme";
import { useDemo } from "./demo-provider";
import { DemoBanner } from "./demo-banner";
import { TrialBanner } from "./trial-banner";
import { signOutAction } from "@/app/(auth)/actions";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

const STORAGE_KEY = "sentate:sidebar-collapsed";

/**
 * Estructura del panel. La interfaz es la de la plataforma (neutra): el color del comercio solo aparece en su propio
 * logo cuando no subió uno, y en la vista previa de Ajustes.
 */
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
    { href: `${base}/qr`, label: "QR", icon: QrCode },
    ...(mode === "live" ? [{ href: `${base}/explorador`, label: "Mapa", icon: MapPin }] : []),
    { href: `${base}/ajustes`, label: "Ajustes", icon: Settings },
  ];
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));

  const logo = (className: string) => (
    <span style={themeStyle(state.profile.theme)} className="contents">
      <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className={className} />
    </span>
  );

  return (
    <div className="min-h-dvh bg-background lg:flex">
      {/* ── Sidebar desktop ── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 76 : 248 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-background p-3 lg:flex print:hidden!"
      >
        <div className="flex h-12 items-center justify-between">
          {!collapsed && (
            <Link href="/" aria-label={`${BRAND.name}, inicio`} className="inline-flex min-h-11 items-center pl-1">
              <Logo size="sm" />
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className={cn("pressable grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-foreground", collapsed && "mx-auto")}
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
        </div>

        <div className={cn("mt-4 flex items-center gap-3 border-y border-line py-3", collapsed && "justify-center")}>
          {logo("size-10 rounded-lg text-[14px]")}
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold">{tenant.name}</p>
              <p className="truncate type-help">{tenant.cuisine}</p>
            </div>
          )}
        </div>

        <nav aria-label="Panel" className="mt-4 flex flex-col gap-0.5">
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </nav>

        <div className="mt-auto space-y-0.5">
          <Link
            href={`/${tenant.slug}`}
            target="_blank"
            title="Ver menú público"
            className={cn("pressable flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] text-muted hover:bg-subtle hover:text-foreground", collapsed && "justify-center px-0")}
          >
            <ExternalLink className="size-[18px] shrink-0" aria-hidden />
            {collapsed ? <span className="sr-only">Ver menú público (nueva pestaña)</span> : "Ver menú público"}
          </Link>
          {live && (
            <form action={signOutAction}>
              <button
                type="submit"
                title={`Cerrar sesión (${live.email})`}
                className={cn("pressable flex h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-muted hover:bg-subtle hover:text-foreground", collapsed && "justify-center px-0")}
              >
                <LogOut className="size-[18px] shrink-0" aria-hidden />
                {collapsed ? <span className="sr-only">Cerrar sesión</span> : "Cerrar sesión"}
              </button>
            </form>
          )}
        </div>
      </motion.aside>

      {/* ── Barra superior mobile ── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-background px-4 lg:hidden print:hidden!">
        {logo("size-9 rounded-lg text-[13px]")}
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">{tenant.name}</p>
          <p className="type-help">
            {BRAND.name} · {mode === "demo" ? "Panel de la demo" : "Panel"}
          </p>
        </div>
        {live && (
          <form action={signOutAction} className="ml-auto">
            <button type="submit" aria-label="Cerrar sesión" className="pressable grid size-11 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-foreground">
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        )}
      </header>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:py-8 print:p-0">
        <div className="mx-auto max-w-5xl">
          <div className="print:hidden">{mode === "demo" ? <DemoBanner /> : <TrialBanner />}</div>
          {children}
        </div>
      </main>

      {/* ── Navegación inferior mobile ── */}
      <nav aria-label="Panel" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden!">
        <div className="mx-auto flex max-w-md">
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
                  "pressable relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[13px]",
                  active ? "font-semibold text-foreground" : "text-muted",
                )}
              >
                {active && <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-foreground" />}
                <span className="relative" aria-hidden>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                  {!!item.badge && (
                    <span className="absolute -top-1.5 -right-3 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-foreground px-1 text-[13px] leading-none font-medium text-background">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
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
        "pressable relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px]",
        active ? "bg-subtle font-semibold text-foreground" : "text-muted hover:bg-subtle hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!!item.badge && (
        <span
          aria-hidden
          className={cn("grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[13px] leading-none font-medium text-background", collapsed ? "absolute top-0.5 right-2" : "ml-auto")}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}
