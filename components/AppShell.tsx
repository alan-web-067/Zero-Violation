"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Separator from "@radix-ui/react-separator";
import { LayoutDashboard, Trophy, TrendingUp, FileText, Settings2, Briefcase, Users, Calculator, type LucideIcon } from "lucide-react";
import { AUTH_TOKEN_KEY, ME_KEY, apiClient, getMe, clearStoredAuth } from "@/lib/apiClient";
import AloxChat from "@/components/AloxChat";
import AloxHelpButton from "@/components/AloxHelpButton";
import AdminProfileMenu from "@/components/AdminProfileMenu";
import type { Role } from "@/lib/auth";

type User = { username: string; role: Role; avatarUrl?: string | null };

// RBAC FEATURE — nav items can carry an optional `roles` allow-list. Items
// without one stay visible to everyone (unchanged previous behavior). To
// remove the RBAC nav entries, delete the two items below that declare `roles`.
const NAV: Array<{
  section: string;
  items: Array<{ href: string; label: string; icon: LucideIcon; badge?: string; roles?: Role[] }>;
}> = [
  {
    section: "Main",
    items: [
      // RBAC FEATURE — Dashboard stays visible to everyone: HR/Accounting
      // land on the same /dashboard URL, but DashboardClient renders them a
      // dedicated people-count / fleet-count view instead of the KPI
      // dashboard (see HrDashboardClient / AccountingDashboardClient).
      // Leaderboard, Analytics, and Reports are all KPI/violation-ranking
      // views with nothing relevant to HR/Accounting's job, so they're
      // hidden from those two roles here.
      { href: "/dashboard",   label: "Dashboard",      icon: LayoutDashboard },
      { href: "/leaderboard", label: "Leaderboard",    icon: Trophy,    roles: ["admin", "super_admin", "block_manager", "viewer"] },
      { href: "/analytics",   label: "Analytics",      icon: TrendingUp, roles: ["admin", "super_admin", "block_manager", "viewer"] },
      { href: "/reports",     label: "Reports",        icon: FileText,  roles: ["admin", "super_admin", "block_manager", "viewer"] },
      { href: "/scoring",     label: "How Scoring Works", icon: Calculator },
    ],
  },
  {
    section: "Tools",
    items: [
      { href: "/workspace",   label: "My Workspace",   icon: Briefcase,  roles: ["block_manager", "super_admin", "admin"] },
      { href: "/admin",       label: "Admin / Edit",   icon: Settings2,  roles: ["admin", "super_admin"] },
      { href: "/users",       label: "User Management",icon: Users,      roles: ["super_admin", "admin"] },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Read cached user synchronously so the nav renders on first paint.
  // The API call below keeps it fresh; on logout ME_KEY is cleared.
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = JSON.parse(localStorage.getItem(ME_KEY) ?? "null");
      return cached && typeof cached.username === "string" ? cached : null;
    } catch { return null; }
  });

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) { router.replace("/"); return; }
      const res = await getMe();
      localStorage.setItem(ME_KEY, JSON.stringify(res.user));
      setUser(res.user);
    } catch {
      clearStoredAuth();
      router.replace("/");
    }
  }, [router]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const handleLogout = async () => {
    // Saved preferences (theme etc.) are kept for the next sign-in.
    clearStoredAuth();
    router.replace("/");
  };

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="app-shell">
        <nav className="sidebar">
          {/* Logo */}
          <div className="sidebar-logo">
            <Image
              src="/F1NAL.jpg"
              alt="ALGO GROUP"
              width={36}
              height={36}
              style={{ borderRadius: 8, objectFit: "contain", background: "rgba(255,255,255,0.15)", padding: 3, flexShrink: 0 }}
            />
            <div className="sidebar-logo-text">
              <span className="brand-name">ALGO GROUP LLC</span>
              <span className="brand-sub">Zero Violations</span>
            </div>
          </div>

          {/* Navigation */}
          <div className="sidebar-nav">
            {NAV.map((section, sIdx) => (
              <div key={section.section}>
                {sIdx > 0 && (
                  <Separator.Root className="sidebar-separator" />
                )}
                <div className="sidebar-section-label">{section.section}</div>

                {section.items.filter((item) => !item.roles || !user || item.roles.includes(user.role)).map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  return (
                    <Tooltip.Root key={item.href}>
                      <Tooltip.Trigger asChild>
                        <Link
                          href={item.href}
                          className={`sidebar-link sidebar-link-animated${isActive ? " active" : ""}`}
                        >
                          <item.icon size={16} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.88 }} />
                          {item.label}
                          {"badge" in item && item.badge && (
                            <span style={{
                              marginLeft: "auto",
                              fontSize: 9,
                              fontWeight: 800,
                              color: "#10b981",
                              background: "rgba(16,185,129,0.15)",
                              padding: "2px 6px",
                              borderRadius: 10,
                              letterSpacing: "0.5px",
                            }}>
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content className="tooltip-content" side="right" sideOffset={10}>
                          {item.label}
                          <Tooltip.Arrow className="tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  );
                })}

                {section.section === "Main" && (
                  <div style={{ marginTop: 8, marginBottom: 4, padding: "0 2px" }}>
                    <AloxChat />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* User footer */}
          <div className="sidebar-footer">
            {user && <AdminProfileMenu user={user} onLogout={handleLogout} />}
          </div>
        </nav>

        <main className="main-content">{children}</main>

        <AloxHelpButton />
      </div>
    </Tooltip.Provider>
  );
}
