import { z } from "zod";

const BlockIdSchema = z.string().uuid();
const TextSchema = z.string().trim().min(1).max(20_000);
const ShortTextSchema = z.string().trim().min(1).max(1_000);
const PublicUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) &&
    url.hostname !== "localhost" &&
    !url.hostname.endsWith(".local");
}, "Use a public HTTP(S) URL.");
const EvidenceIdSchema = z.string().uuid();
const CitationIdSchema = z.string().uuid();

const BlockBaseSchema = z.object({
  id: BlockIdSchema,
}).strict();

export const ProseBlockSchema = BlockBaseSchema.extend({
  type: z.literal("prose"),
  text: TextSchema,
}).strict();

export const HeadingBlockSchema = BlockBaseSchema.extend({
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  text: ShortTextSchema,
}).strict();

export const QuoteBlockSchema = BlockBaseSchema.extend({
  type: z.literal("quote"),
  text: TextSchema,
  attribution: ShortTextSchema,
  citationId: CitationIdSchema.optional(),
}).strict();

const VisualBlockSchema = BlockBaseSchema.extend({
  url: PublicUrlSchema,
  alt: z.string().trim().max(1_000).optional(),
  decorative: z.boolean().default(false),
  caption: ShortTextSchema,
  credit: ShortTextSchema.optional(),
  source: ShortTextSchema.optional(),
  citationId: CitationIdSchema.optional(),
  evidenceId: EvidenceIdSchema.optional(),
  figureNumber: z.number().int().positive().optional(),
  width: z.number().int().positive().max(10_000).optional(),
  height: z.number().int().positive().max(10_000).optional(),
});

export const FigureBlockSchema = VisualBlockSchema.extend({ type: z.literal("figure") });
export const ImageBlockSchema = VisualBlockSchema.extend({ type: z.literal("image") });

export const TableBlockSchema = BlockBaseSchema.extend({
  type: z.literal("table"),
  caption: ShortTextSchema,
  columns: z.array(z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_-]*$/), label: ShortTextSchema }).strict()).min(1).max(20),
  rows: z.array(z.array(z.string().trim().max(4_000))).max(200),
  source: ShortTextSchema.optional(),
  citationId: CitationIdSchema.optional(),
  evidenceId: EvidenceIdSchema.optional(),
  tableNumber: z.number().int().positive().optional(),
});

export const EvidenceReferenceBlockSchema = BlockBaseSchema.extend({
  type: z.literal("evidence-reference"),
  evidenceId: EvidenceIdSchema,
  label: ShortTextSchema.optional(),
}).strict();

const PointSchema = z.object({
  kind: z.literal("point"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: ShortTextSchema,
}).strict();
const LineSchema = z.object({
  kind: z.literal("line"),
  coordinates: z.array(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict()).min(2).max(100),
  label: ShortTextSchema.optional(),
}).strict();
const PolygonSchema = z.object({
  kind: z.literal("polygon"),
  coordinates: z.array(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict()).min(3).max(100),
  label: ShortTextSchema.optional(),
}).strict();

export const MapBlockSchema = BlockBaseSchema.extend({
  type: z.literal("map"),
  title: ShortTextSchema,
  caption: ShortTextSchema,
  description: TextSchema,
  features: z.array(z.union([PointSchema, LineSchema, PolygonSchema])).min(1).max(50),
  evidenceId: EvidenceIdSchema.optional(),
  citationId: CitationIdSchema.optional(),
}).strict();

const TemporalValueSchema = z.string().trim().regex(/^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?)?)?)?$/, "Use year, month, day, or an ISO timestamp.");
export const TimelineBlockSchema = BlockBaseSchema.extend({
  type: z.literal("timeline"),
  title: ShortTextSchema,
  entries: z.array(z.object({
    date: TemporalValueSchema,
    title: ShortTextSchema,
    description: TextSchema,
    citationId: CitationIdSchema.optional(),
    evidenceId: EvidenceIdSchema.optional(),
  }).strict()).min(1).max(100),
}).strict();

export const DatasetReferenceBlockSchema = BlockBaseSchema.extend({
  type: z.literal("dataset-reference"),
  title: ShortTextSchema,
  description: TextSchema,
  source: ShortTextSchema,
  url: PublicUrlSchema.optional(),
  format: ShortTextSchema.optional(),
  coverage: ShortTextSchema.optional(),
  citationId: CitationIdSchema.optional(),
  evidenceId: EvidenceIdSchema.optional(),
}).strict();

export const MediaReferenceBlockSchema = BlockBaseSchema.extend({
  type: z.literal("media-reference"),
  title: ShortTextSchema,
  description: TextSchema,
  url: PublicUrlSchema,
  mediaType: z.enum(["audio", "video", "external-media"]),
  transcriptUrl: PublicUrlSchema.optional(),
  source: ShortTextSchema.optional(),
  citationId: CitationIdSchema.optional(),
  evidenceId: EvidenceIdSchema.optional(),
}).strict();

export const PublicationContentBlockSchema = z.discriminatedUnion("type", [
  ProseBlockSchema,
  HeadingBlockSchema,
  QuoteBlockSchema,
  FigureBlockSchema,
  ImageBlockSchema,
  TableBlockSchema,
  EvidenceReferenceBlockSchema,
  MapBlockSchema,
  TimelineBlockSchema,
  DatasetReferenceBlockSchema,
  MediaReferenceBlockSchema,
]);

export const PublicationContentBlocksSchema = z.array(PublicationContentBlockSchema).max(200).superRefine((blocks, context) => {
  const ids = new Set<string>();
  blocks.forEach((block, index) => {
    if (ids.has(block.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "Block IDs must be unique." });
    }
    ids.add(block.id);
    if ((block.type === "figure" || block.type === "image") && !block.decorative && !block.alt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "alt"], message: "Meaningful visual blocks require alt text." });
    }
    if ((block.type === "figure" || block.type === "image") && block.decorative && block.alt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "alt"], message: "Decorative visual blocks must omit alt text." });
    }
    if (block.type === "table") {
      block.rows.forEach((row, rowIndex) => {
        if (row.length !== block.columns.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "rows", rowIndex], message: "Each row must contain one value per column." });
        }
      });
    }
  });
});

export type PublicationContentBlock = z.infer<typeof PublicationContentBlockSchema>;

export function sanitizePublicBlocks(
  blocks: readonly PublicationContentBlock[],
  publicEvidenceIds: ReadonlySet<string>,
): PublicationContentBlock[] {
  return blocks.flatMap((block) => {
    if (block.type === "evidence-reference") {
      return publicEvidenceIds.has(block.evidenceId) ? [block] : [];
    }

    if ("evidenceId" in block && block.evidenceId && !publicEvidenceIds.has(block.evidenceId)) {
      return [{ ...block, evidenceId: undefined } as PublicationContentBlock];
    }
    return [block];
  });
}

export function searchableBlockText(blocks: readonly PublicationContentBlock[]): string[] {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case "prose":
      case "heading":
        return [block.text];
      case "quote":
        return [block.text, block.attribution];
      case "figure":
      case "image":
        return [block.caption, block.credit, block.source, block.alt].filter((value): value is string => Boolean(value));
      case "table":
        return [block.caption, block.source, ...block.columns.map((column) => column.label), ...block.rows.flat()].filter((value): value is string => Boolean(value));
      case "map":
        return [block.title, block.caption, block.description, ...block.features.flatMap((feature) => feature.label ? [feature.label] : [])];
      case "timeline":
        return [block.title, ...block.entries.flatMap((entry) => [entry.title, entry.description])];
      case "dataset-reference":
        return [block.title, block.description, block.source, block.format, block.coverage].filter((value): value is string => Boolean(value));
      case "media-reference":
        return [block.title, block.description, block.source].filter((value): value is string => Boolean(value));
      case "evidence-reference":
        return [block.label].filter((value): value is string => Boolean(value));
    }
  });
}
