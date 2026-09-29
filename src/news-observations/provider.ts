import {
  normalizeNewsObservation,
  normalizeNewsObservations,
  toPublicNewsObservation,
  type NewsObservation,
  type PublicNewsObservation,
} from "@/news-observations/contract";

export type ObservationProviderCapabilities = {
  cursorPagination: boolean;
  temporalFiltering: boolean;
  topicFiltering: boolean;
  incrementalUpdates: boolean;
  liveIntelligence: false;
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
  provider: "fixture";
  synthetic: true;
};

export interface NewsObservationProvider {
  readonly capabilities: ObservationProviderCapabilities;
  list(query?: ObservationQuery): Promise<ObservationPage>;
  get(observationId: string): Promise<PublicNewsObservation | undefined>;
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function compareNewest(left: NewsObservation, right: NewsObservation): number {
  return right.temporal.updatedAt.localeCompare(left.temporal.updatedAt) ||
    left.identity.observationId.localeCompare(right.identity.observationId);
}

function parseCursor(cursor: string | undefined): number {
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

  private readonly observations: NewsObservation[];

  constructor(items: readonly unknown[]) {
    this.observations = normalizeNewsObservations(items).sort(compareNewest);
  }

  async list(query: ObservationQuery = {}): Promise<ObservationPage> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new Error(`The observation limit must be an integer from 1 to ${MAX_LIMIT}.`);
    }
    const from = query.from ? Date.parse(query.from) : undefined;
    const to = query.to ? Date.parse(query.to) : undefined;
    if ((query.from && Number.isNaN(from)) || (query.to && Number.isNaN(to))) {
      throw new Error("Observation temporal filters must use ISO timestamps.");
    }
    const filtered = this.observations.filter((observation) =>
      observation.publicFeed.eligibility === "eligible" &&
      (!query.topic || observation.topics.identifiers.includes(query.topic)) &&
      (from === undefined || Date.parse(observation.temporal.updatedAt) >= from) &&
      (to === undefined || Date.parse(observation.temporal.updatedAt) <= to),
    );
    const offset = parseCursor(query.cursor);
    const observations = filtered.slice(offset, offset + limit).map(toPublicNewsObservation);
    const nextOffset = offset + observations.length;
    return {
      observations,
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : undefined,
      provider: "fixture",
      synthetic: true,
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
