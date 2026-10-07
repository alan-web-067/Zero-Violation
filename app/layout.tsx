import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./premium.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zero Violations — ALGO GROUP",
  description: "Block KPI Leaderboard Dashboard for ALGO GROUP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          // Runs before paint so the saved theme applies immediately —
          // avoids a flash of the wrong theme on load/refresh.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('zv_theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
