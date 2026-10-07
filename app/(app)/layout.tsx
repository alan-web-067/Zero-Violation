"use client";

// Shared frame for every signed-in page. The sidebar lives here so it stays on
// screen while you move between pages — only the content area changes.
//
// AppShell reads the signed-in user and UI preferences from localStorage, which
// the server can't see, so it renders in the browser only (no hydration
// mismatch). On a full page load the skeleton below shows for a moment instead.
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

function ShellSkeleton() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-hidden />
      <main className="main-content">
        <PageSkeleton />
      </main>
    </div>
  );
}

const AppShell = dynamic(() => import("@/components/AppShell"), {
  ssr: false,
  loading: () => <ShellSkeleton />,
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
