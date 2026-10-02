import {
  normalizeNewsObservation,
  normalizeNewsObservations,
  toPublicNewsObservation,
  type NewsObservation,
  type PublicNewsObservation,
} from "@/news-observations/contract";

export type ObservationProviderMode = "fixture" | "live" | "synchronized-current" | "synchronized-stale" | "degraded" | "unavailable";

export type ObservationProviderCapabilities = {
  cursorPagination: boolean;
  temporalFiltering: boolean;
  topicFiltering: boolean;
  incrementalUpdates: boolean;
  liveIntelligence: boolean;
};

export type ObservationProviderStatus = {
  mode: ObservationProviderMode;
  provider: "fixture" | "live";
  synthetic: boolean;
  detail?: "authentication-failed" | "capability-incompatible" | "rate-limited" | "service-unavailable" | "timeout" | "invalid-response";
};

export type ObservationQuery = {
  cursor?: string;
  limit?: number;
  topic?: string;
  from?: string;
  to?: string;
};

export type ObservationPage = {
  observations: PublicNewsObservation[];
  nextCursor?: string;
  provider: "fixture" | "live";
  synthetic: boolean;
  mode: ObservationProviderMode;
};

export interface NewsObservationProvider {
  readonly capabilities: ObservationProviderCapabilities;
  readonly status: ObservationProviderStatus;
  list(query?: ObservationQuery): Promise<ObservationPage>;
  get(observationId: string): Promise<PublicNewsObservation | undefined>;
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function compareNewest(left: NewsObservation, right: NewsObservation): number {
  return right.temporal.updatedAt.localeCompare(left.temporal.updatedAt) ||
    left.identity.observationId.localeCompare(right.identity.observationId);
}

export function validateObservationQuery(query: ObservationQuery, maximumLimit = MAX_LIMIT): Required<Pick<ObservationQuery, "limit">> & ObservationQuery {
  const limit = query.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new Error(`The observation limit must be an integer from 1 to ${maximumLimit}.`);
  }
  const from = query.from ? Date.parse(query.from) : undefined;
  const to = query.to ? Date.parse(query.to) : undefined;
  if ((query.from && Number.isNaN(from)) || (query.to && Number.isNaN(to)) || (from !== undefined && to !== undefined && from > to)) {
    throw new Error("Observation temporal filters must use an ordered pair of ISO timestamps.");
  }
  return { ...query, limit };
}

export function parseNumericCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  if (!/^\d+$/.test(cursor)) throw new Error("The observation cursor is invalid.");
  return Number(cursor);
}

export class FixtureNewsObservationProvider implements NewsObservationProvider {
  readonly capabilities: ObservationProviderCapabilities = {
    cursorPagination: true,
    temporalFiltering: true,
    topicFiltering: true,
    incrementalUpdates: false,
    liveIntelligence: false,
  };

  readonly status: ObservationProviderStatus = {
    mode: "fixture",
    provider: "fixture",
    synthetic: true,
  };

  private readonly observations: NewsObservation[];

  constructor(items: readonly unknown[]) {
    this.observations = normalizeNewsObservations(items).sort(compareNewest);
  }

  async list(query: ObservationQuery = {}): Promise<ObservationPage> {
    const validated = validateObservationQuery(query);
    const from = validated.from ? Date.parse(validated.from) : undefined;
    const to = validated.to ? Date.parse(validated.to) : undefined;
    const filtered = this.observations.filter((observation) =>
      observation.publicFeed.eligibility === "eligible" &&
      (!validated.topic || observation.topics.identifiers.includes(validated.topic)) &&
      (from === undefined || Date.parse(observation.temporal.updatedAt) >= from) &&
      (to === undefined || Date.parse(observation.temporal.updatedAt) <= to),
    );
    const offset = parseNumericCursor(validated.cursor);
    const observations = filtered.slice(offset, offset + validated.limit).map(toPublicNewsObservation);
    const nextOffset = offset + observations.length;
    return {
      observations,
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : undefined,
      provider: "fixture",
      synthetic: true,
      mode: "fixture",
    };
  }

  async get(observationId: string): Promise<PublicNewsObservation | undefined> {
    const observation = this.observations.find((item) => item.identity.observationId === observationId);
    return observation?.publicFeed.eligibility === "eligible"
      ? toPublicNewsObservation(observation)
      : undefined;
  }
}

export function normalizeFixtureObservation(input: unknown): NewsObservation {
  return normalizeNewsObservation(input);
}
