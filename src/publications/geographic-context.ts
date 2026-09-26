export type GeographicHotPoint = {
  id: string;
  label: string;
  region: string;
  x: number;
  y: number;
  publicationIds: string[];
  category: "monitor" | "analysis";
};

/**
 * Temporary public associations remain separate from map presentation so
 * future structured Dispatch/Overwatch locations can replace this source.
 */
export const geographicHotPoints: GeographicHotPoint[] = [
  {
    id: "eastern-strait",
    label: "Eastern Strait",
    region: "Regional Monitor",
    x: 62,
    y: 43,
    publicationIds: ["340f0c39-af95-45bb-91c9-4e3387413d6a"],
    category: "monitor",
  },
];
