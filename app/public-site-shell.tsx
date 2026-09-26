import Link from "next/link";
import type { ReactNode } from "react";

export function PublicSiteShell({ children }: { children: ReactNode }) {
  return <><header className="public-header"><div className="public-header__inner">
    <Link className="wordmark" href="/" aria-label="The Golden Horn"><span className="wordmark__article">The</span><span>Golden Horn</span></Link>
    <nav aria-label="Primary navigation"><Link href="/global-monitor">Global Monitor</Link><Link href="/analysis">Analysis</Link><Link href="/forecast">Forecast</Link><Link href="/services">Services</Link><Link href="/contact">Contact</Link></nav>
  </div></header>{children}<footer className="public-footer"><p>© 2026 Mayday Information Systems</p><nav aria-label="Secondary navigation"><Link href="/about">About</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link></nav></footer></>;
}
