import type { PublicNewsObservation } from "@/news-observations/contract";

export type GeographicNewsPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  observations: PublicNewsObservation[];
  publisherCount: number;
  topics: string[];
};

export function buildGeographicNewsPoints(observations: readonly PublicNewsObservation[]): GeographicNewsPoint[] {
  const points = new Map<string, GeographicNewsPoint>();
  for (const observation of observations) {
    for (const geography of observation.geography) {
      if (geography.relationship !== "EVENT_LOCATION" || !geography.coordinates || geography.confidence === "unknown" || geography.confidence === "low") continue;
      const key = `${geography.placeName}:${geography.coordinates.latitude}:${geography.coordinates.longitude}`;
      const existing = points.get(key);
      if (existing) {
        existing.observations.push(observation);
        existing.publisherCount = new Set(existing.observations.map((item) => item.publisher)).size;
        existing.topics = Array.from(new Set(existing.observations.flatMap((item) => item.topicIds))).sort();
        continue;
      }
      points.set(key, {
        id: geography.id,
        label: geography.placeName,
        x: ((geography.coordinates.longitude + 180) / 360) * 100,
        y: ((90 - geography.coordinates.latitude) / 180) * 100,
        observations: [observation],
        publisherCount: 1,
        topics: [...observation.topicIds].sort(),
      });
    }
  }
  return [...points.values()].sort((left, right) => left.label.localeCompare(right.label));
}
