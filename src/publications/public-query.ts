import type { PublicPublication } from "@/domain/publication";
import { listPublications } from "@/publications/repository";

export type PublicBrowseFilters = {
  query?: string;
  type?: string;
  tag?: string;
  seriesId?: string;
};

function newestFirst(items: PublicPublication[]): PublicPublication[] {
  return [...items].sort((left, right) =>
    `${right.publishedAt}:${right.id}`.localeCompare(`${left.publishedAt}:${left.id}`),
  );
}

export async function browsePublications(filters: PublicBrowseFilters = {}): Promise<PublicPublication[]> {
  const query = filters.query?.trim().toLowerCase();
  return newestFirst(await listPublications()).filter((publication) => {
    const searchable = [publication.title, publication.subtitle, publication.excerpt, ...publication.tags, ...publication.body]
      .filter((value): value is string => Boolean(value)).join(" ").toLowerCase();
    return (!filters.type || publication.type === filters.type) &&
      (!filters.tag || publication.tags.includes(filters.tag)) &&
      (!filters.seriesId || publication.seriesId === filters.seriesId) &&
      (!query || searchable.includes(query));
  });
}

export async function getPublicSeries(seriesId: string): Promise<PublicPublication[]> {
  return (await browsePublications({ seriesId })).sort((left, right) =>
    `${left.publishedAt}:${left.id}`.localeCompare(`${right.publishedAt}:${right.id}`),
  );
}

export async function getPublicTopics(): Promise<string[]> {
  return Array.from(new Set((await listPublications()).flatMap((publication) => publication.tags))).sort();
}

export async function getRelatedPublications(publication: PublicPublication): Promise<PublicPublication[]> {
  return (await browsePublications()).filter((candidate) =>
    candidate.id !== publication.id &&
    (candidate.seriesId === publication.seriesId || candidate.tags.some((tag) => publication.tags.includes(tag))),
  ).slice(0, 3);
}
