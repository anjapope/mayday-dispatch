import { toPublicPublication, type PublicPublication } from "@/domain/publication";
import { publications as developmentFixtures } from "@/publications/fixtures";
import { publicSectionFor, type PublicSection } from "@/publications/public-section";
import { listPublications } from "@/publications/repository";

export { publicSectionFor, type PublicSection } from "@/publications/public-section";

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

async function publicRecords(): Promise<PublicPublication[]> {
  const persisted = await listPublications();
  if (persisted.length || process.env.NODE_ENV !== "development") {
    return persisted;
  }
  return developmentFixtures.map(toPublicPublication);
}

export async function browsePublications(filters: PublicBrowseFilters = {}): Promise<PublicPublication[]> {
  const query = filters.query?.trim().toLowerCase();
  return newestFirst(await publicRecords()).filter((publication) => {
    const searchable = [publication.title, publication.subtitle, publication.excerpt, ...publication.tags, ...publication.body]
      .filter((value): value is string => Boolean(value)).join(" ").toLowerCase();
    return (!filters.type || publication.type === filters.type) &&
      (!filters.tag || publication.tags.includes(filters.tag)) &&
      (!filters.seriesId || publication.seriesId === filters.seriesId) &&
      (!query || searchable.includes(query));
  });
}

export async function getPublicPublicationBySlug(slug: string): Promise<PublicPublication | undefined> {
  return (await publicRecords()).find((publication) => publication.slug === slug);
}

export async function getPublicSeries(seriesId: string): Promise<PublicPublication[]> {
  return (await browsePublications({ seriesId })).sort((left, right) =>
    `${left.publishedAt}:${left.id}`.localeCompare(`${right.publishedAt}:${right.id}`),
  );
}

export async function getPublicTopics(): Promise<string[]> {
  return Array.from(new Set((await publicRecords()).flatMap((publication) => publication.tags))).sort();
}

export async function getRelatedPublications(publication: PublicPublication): Promise<PublicPublication[]> {
  return (await browsePublications()).filter((candidate) =>
    candidate.id !== publication.id &&
    (candidate.seriesId === publication.seriesId || candidate.tags.some((tag) => publication.tags.includes(tag))),
  ).slice(0, 3);
}

export async function browsePublicSection(section: PublicSection): Promise<PublicPublication[]> {
  return (await browsePublications()).filter((publication) => publicSectionFor(publication) === section);
}
