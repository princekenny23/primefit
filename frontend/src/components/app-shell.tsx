"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowRight, Bell, CalendarDays, ChevronRight, Home, Leaf, ShieldCheck, Trophy, UserRound, Users } from "lucide-react";
import { Avatar } from "@/components/product-ui";
import { apiRequest } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";

const navigation = [
  { label: "Home", href: "/" },
  { label: "Events", href: "/events" },
  { label: "Challenges", href: "/challenges" },
  { label: "Diet plan", href: "/nutrition" },
  { label: "Community", href: "/community" },
  { label: "Profile", href: "/profile" },
];
function Icon({ label }: { label: string }) {
  const props = { size: 18, strokeWidth: 1.8 };
  if (label === "Home") return <Home {...props} />;
  if (label === "Trainer portal" || label === "Admin portal") return <ShieldCheck {...props} />;
  if (label === "Events") return <CalendarDays {...props} />;
  if (label === "Challenges") return <Trophy {...props} />;
  if (label === "Diet plan") return <Leaf {...props} />;
  if (label === "Community") return <Users {...props} />;
  return <UserRound {...props} />;
}
function subscribeToDate() {
  return () => {};
}
function getCurrentDate() {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { profile, role, authenticated, apiOnline, apiError, notify } = usePrimeFit();
  const date = useSyncExternalStore(subscribeToDate, getCurrentDate, () => "");
  const name = profile.display_name || "PrimeFit member";
  const currentNavigation = navigation.find((item) => path === item.href || (item.href !== "/" && path.startsWith(`${item.href}/`)));
  useEffect(() => {
    if (!authenticated) return;
    let reportedFailure = false;
    const heartbeat = () => {
      apiRequest<{ online: boolean }>("/presence/", { method: "POST" })
        .then(() => { reportedFailure = false; })
        .catch((error: unknown) => {
          if (!reportedFailure) {
            notify(error instanceof Error ? error.message : "Could not update your online status.");
            reportedFailure = true;
          }
        });
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [authenticated, notify]);
  const trainerLink = { label: "Trainer portal", href: "/trainer" };
  const visibleNavigation = role === "admin"
    ? [{ label: "Admin portal", href: "/admin" }]
    : role === "trainer"
    ? [...navigation.slice(0, 1), trainerLink, ...navigation.slice(1)]
    : navigation;
  const adminNavigation = { label: "Admin portal", href: "/admin" };
  const navigationLabel = path.startsWith("/admin") ? adminNavigation.label : currentNavigation?.label ?? (path === "/trainer" ? "Trainer portal" : "PrimeFit");
  return <div className="app-shell">
    <main className="main-area">
      <header className="topbar"><div className="crumb"><span>Workspace</span><ChevronRight size={14} /><strong>{navigationLabel}</strong></div>{role !== "admin" && <Link href="/community" className="icon-button notification-button" aria-label="Open community"><Bell size={18} /><i /></Link>}{authenticated ? <Link href={role === "admin" ? "/admin" : "/profile"} className="top-avatar" aria-label={role === "admin" ? "Open admin portal" : "Open profile"}><Avatar name={name} photo={profile.photo} /></Link> : <div className="auth-actions"><Link className="auth-login-link" href="/login">Login</Link></div>}</header>
      <div className="page-content">{path === "/" && authenticated && <div className="welcome-row"><div><span className="eyebrow"><span className="sun-dot" />{date}</span><h1>Good morning, {name.split(" ")[0]}<span className="wave">✦</span></h1><p>Ready to show up for yourself today?</p></div><div className="date-pill"><span className="date-icon">◷</span> Your weekly rhythm <strong>One day at a time</strong><ArrowRight size={14} /></div></div>}{children}</div>
    </main>
    <nav className="mobile-bottom-nav floating-nav" aria-label="Main navigation">{visibleNavigation.map((item) => {
      const active = path === item.href || (item.href !== "/" && path.startsWith(`${item.href}/`));
      return <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} aria-current={active ? "page" : undefined} className={active ? "mobile-nav-active" : ""}><Icon label={item.label} /><span>{item.label}</span></Link>;
    })}</nav>
    {!apiOnline && <div className="connection-note"><span />{apiError || "API unavailable · data cannot be loaded or saved"}</div>}
  </div>;
}
