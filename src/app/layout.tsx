import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/globals.css";
import { ToastHost } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Kafin Research",
  description: "Lokale fundamentale Aktien-Research-Plattform mit Ollama",
};

const NAV = [
  { href: "/", label: "Start" },
  { href: "/reports", label: "Reports" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/logs", label: "Logs" },
  { href: "/settings", label: "Einstellungen" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-secondary-950 text-secondary-200">
        <aside className="app-sidebar">
          <Link href="/" className="brand">
            <span className="brand-text">
              Kafin <span className="text-accent-400">·</span> Research
            </span>
          </Link>
          <nav>
            <ul>
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="nav-link">
                    <span className="nav-label">{n.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-footer">
            <span className="text-[10px] uppercase tracking-wide text-secondary-600">v0.1 · local</span>
          </div>
        </aside>
        <div className="app-main">
          <div id="toast-root" className="toast-container" />
          <ToastHost />
          {children}
        </div>
      </body>
    </html>
  );
}
