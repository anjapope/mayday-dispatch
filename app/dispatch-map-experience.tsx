"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicPublication } from "@/domain/publication";
import type { PublicNewsObservation } from "@/news-observations/contract";
import { buildGeographicNewsPoints } from "@/news-observations/query";
import { geographicHotPoints } from "@/publications/geographic-context";
import { publicSectionFor, type PublicSection } from "@/publications/public-section";
import { NewsFeed } from "./news-feed";

type Frame = { heading: string; body: string; href?: string };
type PublicationLane = {
  id: PublicSection;
  label: string;
  href: string;
};

const frames: Frame[] = [
  { heading: "Mayday Information Systems", body: "Independent research, analysis, and information services for complex environments.", href: "/services" },
  { heading: "Intelligence & Analysis", body: "Open-source research, monitoring, synthesis, and analytical reporting built around documented evidence." },
  { heading: "Research Services", body: "Structured investigation and evidence synthesis for difficult information problems.", href: "/services" },
  { heading: "Information Systems", body: "Tools and workflows for turning fragmented information into structured, searchable knowledge.", href: "/services" },
];

const publicationLanes: PublicationLane[] = [
  { id: "global-monitor", label: "Global Monitor", href: "/global-monitor" },
  { id: "analysis", label: "Analysis", href: "/analysis" },
  { id: "forecast", label: "Forecast", href: "/forecast" },
];

export function DispatchMapExperience({ publications, newsObservations }: { publications: PublicPublication[]; newsObservations: PublicNewsObservation[] }) {
  const [frame, setFrame] = useState(0);
  const [activePoint, setActivePoint] = useState(0);
  const [paused, setPaused] = useState(false);
  const newsPoints = buildGeographicNewsPoints(newsObservations);
  const totalPoints = geographicHotPoints.length + newsPoints.length;

  useEffect(() => {
    if (paused) return;
    const frameTimer = window.setInterval(() => setFrame((value) => (value + 1) % frames.length), 10000);
    const pointTimer = totalPoints > 0 ? window.setInterval(() => setActivePoint((value) => (value + 1) % totalPoints), 8000) : undefined;
    return () => { window.clearInterval(frameTimer); if (pointTimer) window.clearInterval(pointTimer); };
  }, [paused, totalPoints]);

  const point = geographicHotPoints[activePoint];
  const pointPublications = point ? publications.filter((item) => point.publicationIds.includes(item.id)) : [];
  const currentFrame = frames[frame];

  return (
    <section className="dispatch-map-experience" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="dispatch-map-experience__shade" aria-hidden="true" />
      <header className="dispatch-map-experience__header">
        <span className="dispatch-map-experience__publisher">A Mayday Information Systems Publication</span>
        <div className="institutional-frame" aria-live="polite">
          <p>{currentFrame.heading}</p>
          <span>{currentFrame.body}</span>
          {currentFrame.href && <Link href={currentFrame.href}>Services</Link>}
        </div>
      </header>
      <div className="hot-points" aria-label="Geographic subjects">
        {geographicHotPoints.map((item, index) => (
          <button className={`hot-point ${index === activePoint ? "hot-point--active" : ""}`} key={item.id} style={{ left: `${item.x}%`, top: `${item.y}%` }} onFocus={() => { setPaused(true); setActivePoint(index); }} onClick={() => { setPaused(true); setActivePoint(index); }} aria-label={`${item.label}, ${item.region}`}>
            <span />
            <strong>{index === activePoint && item.label}</strong>
            <em>{index === activePoint && item.region}</em>
          </button>
        ))}
        {newsPoints.map((item, index) => {
          const activeIndex = geographicHotPoints.length + index;
          const active = activeIndex === activePoint;
          return (
            <button className={`hot-point hot-point--observation ${active ? "hot-point--active" : ""}`} key={item.id} style={{ left: `${item.x}%`, top: `${item.y}%` }} onPointerEnter={() => { setPaused(true); setActivePoint(activeIndex); }} onFocus={() => { setPaused(true); setActivePoint(activeIndex); }} onClick={() => { setPaused(true); setActivePoint(activeIndex); }} aria-label={`${item.label}, ${item.observations.length} synthetic observations`}>
              <span />
              <strong>{active && item.label}</strong>
              <em>{active && `${item.observations.length} synthetic headlines · ${item.publisherCount} publishers`}</em>
            </button>
          );
        })}
      </div>
      {activePoint >= geographicHotPoints.length && newsPoints[activePoint - geographicHotPoints.length] && (
        <aside className="observation-context" aria-live="polite">
          <p className="eyebrow">Synthetic location context</p>
          <h2>{newsPoints[activePoint - geographicHotPoints.length].label}</h2>
          <p>{newsPoints[activePoint - geographicHotPoints.length].observations.length} eligible observations · {newsPoints[activePoint - geographicHotPoints.length].topics.join(", ")}</p>
          <ul>{newsPoints[activePoint - geographicHotPoints.length].observations.map((observation) => <li key={observation.observationId}>{observation.headline}</li>)}</ul>
        </aside>
      )}
      <section className="contextual-rail" aria-label="Current publication desks">
        {publicationLanes.map((lane) => {
          const lanePublications = publications.filter((item) => publicSectionFor(item) === lane.id);
          const prioritized = lane.id === "global-monitor"
            ? [...pointPublications.filter((item) => publicSectionFor(item) === lane.id), ...lanePublications.filter((item) => !pointPublications.some((related) => related.id === item.id))]
            : lanePublications;

          return (
            <section className="publication-lane" key={lane.id} aria-labelledby={`${lane.id}-heading`}>
              <header>
                <h2 id={`${lane.id}-heading`}>{lane.label}</h2>
                <Link href={lane.href}>View all <span aria-hidden="true">-&gt;</span></Link>
              </header>
              {prioritized.length ? (
                <div className="publication-lane__items">
                  {prioritized.map((item) => (
                    <article key={item.id}>
                      <h3><Link href={`/publications/${item.slug}`}>{item.title}</Link></h3>
                      <p>{item.publishedAt} · {item.type.replaceAll("-", " ")}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="publication-lane__empty">
                  No current public forecasts.
                  <span>Published forecasts will appear here.</span>
                </p>
              )}
            </section>
          );
        })}
      </section>
      <NewsFeed observations={newsObservations} />
    </section>
  );
}
