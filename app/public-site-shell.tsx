import Link from "next/link";
import type { ReactNode } from "react";

export function PublicSiteShell({ children }: { children: ReactNode }) {
  return <><header className="public-header"><div className="public-header__inner">
    <Link className="wordmark" href="/">Mayday Dispatch</Link>
    <nav aria-label="Primary navigation"><Link href="/publications">Dispatch</Link><Link href="/publications?type=academic-research-article">Research</Link><Link href="/publications?type=overwatch-osint-report">Intelligence</Link><Link href="/series">Series</Link><Link href="/about">About</Link></nav>
  </div></header>{children}<footer className="public-footer"><p>Mayday Dispatch — research, evidence, and intelligence from the Mayday system.</p><Link href="/methodology">Methodology and standards</Link></footer></>;
}
