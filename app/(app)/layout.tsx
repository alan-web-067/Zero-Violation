"use client";

// Shared frame for every signed-in page. The sidebar lives here so it stays on
// screen while you move between pages — only the content area changes.
import AppShell from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
