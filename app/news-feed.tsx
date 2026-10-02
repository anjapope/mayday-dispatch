"use client";

import { useEffect, useState } from "react";
import type { PublicNewsObservation } from "@/news-observations/contract";
import type { ObservationProviderStatus } from "@/news-observations/provider";

function displayTime(observation: PublicNewsObservation): string {
  const value = observation.publishedAt ?? observation.observedAt;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

export function NewsFeed({ observations, providerStatus }: { observations: readonly PublicNewsObservation[]; providerStatus: ObservationProviderStatus }) {
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [topic, setTopic] = useState("");
  const topics = Array.from(new Set(observations.flatMap((observation) => observation.topicIds))).sort();
  const visibleObservations = topic
    ? observations.filter((observation) => observation.topicIds.includes(topic))
    : observations;

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshedAt(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="news-feed" aria-labelledby="news-feed-heading">
      <header>
        <div>
          <p className="eyebrow">Automated news</p>
          <h2 id="news-feed-heading">{providerStatus.mode === "fixture" ? "Synthetic observation feed" : "Observation feed"}</h2>
        </div>
        <label className="news-feed__filter">Topic
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option value="">All topics</option>
            {topics.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <span className="news-feed__status" aria-live="polite">{providerStatus.mode === "fixture" ? "Fixture" : providerStatus.mode} refresh checked {refreshedAt.toLocaleTimeString()}</span>
      </header>
      <p className="news-feed__notice">
        {providerStatus.synthetic
          ? "Demonstration data only. This feed has no live Intelligence connection."
          : providerStatus.mode === "synchronized-current"
            ? "Eligible observations are shown from the current Dispatch-synchronized Intelligence cache."
            : providerStatus.mode === "synchronized-stale"
              ? "Eligible observations are retained from a stale Dispatch-synchronized Intelligence cache."
            : "Live Intelligence observations are currently unavailable; no synthetic fallback is being presented as live data."}
      </p>
      {visibleObservations.length === 0 ? (
        <p className="news-feed__empty">No eligible news observations are available from the configured provider.</p>
      ) : (
        <ol>
          {visibleObservations.map((observation) => (
            <li key={observation.observationId}>
              <a href={observation.canonicalUrl} rel="noreferrer" target="_blank">
                <span>{observation.headline}</span>
              </a>
              <p>{observation.publisher} · {displayTime(observation)}{observation.freshness === "stale" ? " · Stale observation" : ""}</p>
              {observation.topicIds.length > 0 && <small>{observation.topicIds.join(" · ")}</small>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
