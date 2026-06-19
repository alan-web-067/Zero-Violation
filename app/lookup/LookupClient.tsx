"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { AUTH_TOKEN_KEY } from "@/lib/apiClient";

export default function LookupClient() {
  const router = useRouter();
  const [mounted, setMounted] = useState(true);
  const [usdot,   setUsdot]   = useState("");

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
  }, [router]);

  if (!mounted) return null;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>🔍</span>
          <h1>Company Lookup</h1>
        </div>
        <div className="page-header-right">
          <span className="badge" style={{ background: "var(--gray-100)", color: "var(--text-muted)" }}>
            Coming Soon
          </span>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">USDOT / FMCSA Carrier Lookup</h2>
          </div>
          <div className="card-body">
            <div className="lookup-coming-soon">
              <div className="lookup-badge">Coming Soon</div>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🚛</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>
                FMCSA / SearchMule Integration
              </h3>
              <p style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 400, lineHeight: 1.6, margin: "0 0 24px" }}>
                This feature will allow you to look up carrier safety records using a USDOT number.
                Integration with FMCSA SAFER and SearchMule is planned for a future update.
              </p>

              <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 400 }}>
                <div className="login-input-wrap" style={{ flex: 1 }}>
                  <input
                    className="login-input"
                    placeholder="Enter USDOT number…"
                    value={usdot}
                    onChange={(e) => setUsdot(e.target.value)}
                    disabled
                    style={{ cursor: "not-allowed", background: "var(--gray-50)" }}
                  />
                </div>
                <button className="btn btn-primary" disabled style={{ cursor: "not-allowed", opacity: 0.45 }}>
                  Look Up
                </button>
              </div>

              <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-light)" }}>
                This feature is not yet active. Contact the development team for an ETA.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { icon: "📋", title: "Safety Score",      desc: "View carrier safety rating from FMCSA" },
            { icon: "🚦", title: "CSA Scores",         desc: "Check BASICs and safety percentiles" },
            { icon: "📝", title: "Inspection History", desc: "Review past roadside inspection records" },
          ].map((f) => (
            <div key={f.title} className="card" style={{ opacity: 0.55 }}>
              <div className="card-body" style={{ textAlign: "center", padding: "20px 16px" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{f.desc}</div>
                <div className="badge" style={{ background: "var(--gray-100)", color: "var(--text-muted)", marginTop: 10, display: "inline-flex" }}>
                  Coming Soon
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
