import type { PublicEvidence } from "@/domain/publication";
import type { PublicationContentBlock } from "@/domain/content-blocks";

type Props = {
  blocks: readonly PublicationContentBlock[];
  evidence: readonly PublicEvidence[];
};

function BlockEvidence({ evidenceId, evidence }: { evidenceId?: string; evidence: readonly PublicEvidence[] }) {
  if (!evidenceId) return null;
  const item = evidence.find((candidate) => candidate.id === evidenceId);
  if (!item) return null;
  return <p className="rich-block__source"><strong>Evidence:</strong> {item.url ? <a href={item.url} rel="noreferrer">{item.title}</a> : item.title}{!item.url && item.citation && <> — {item.citation.authors.join(", ")}. <em>{item.citation.title}</em>.</>}</p>;
}

function VisualBlock({ block, evidence }: { block: Extract<PublicationContentBlock, { type: "figure" | "image" }>; evidence: readonly PublicEvidence[] }) {
  const label = block.type === "figure" ? `Figure ${block.figureNumber ?? ""}`.trim() : "Image";
  return <figure className={`rich-block rich-block--${block.type}`}>
    <img src={block.url} alt={block.decorative ? "" : block.alt} width={block.width} height={block.height} />
    <figcaption>
      <strong>{label}.</strong> {block.caption}
      {block.credit && <span> Credit: {block.credit}.</span>}
      {block.source && <span> Source: {block.source}.</span>}
      <BlockEvidence evidenceId={block.evidenceId} evidence={evidence} />
    </figcaption>
  </figure>;
}

function MapBlock({ block, evidence }: { block: Extract<PublicationContentBlock, { type: "map" }>; evidence: readonly PublicEvidence[] }) {
  const project = (latitude: number, longitude: number) => `${((longitude + 180) / 360) * 100},${((90 - latitude) / 180) * 100}`;
  return <figure className="rich-block rich-block--map">
    <svg viewBox="0 0 100 100" role="img" aria-labelledby={`${block.id}-title ${block.id}-description`}>
      <title id={`${block.id}-title`}>{block.title}</title>
      <desc id={`${block.id}-description`}>{block.description}</desc>
      <path className="rich-map__grid" d="M0 25H100M0 50H100M0 75H100M25 0V100M50 0V100M75 0V100" />
      {block.features.map((feature, index) => {
        if (feature.kind === "point") {
          const [cx, cy] = project(feature.latitude, feature.longitude).split(",");
          return <g key={`${feature.label}-${index}`}><circle className="rich-map__point" cx={cx} cy={cy} r="1.6" /><text x={Number(cx) + 2} y={Number(cy) - 2}>{feature.label}</text></g>;
        }
        const points = feature.coordinates.map((coordinate) => project(coordinate.latitude, coordinate.longitude)).join(" ");
        return feature.kind === "line"
          ? <polyline className="rich-map__line" key={`${feature.label ?? "line"}-${index}`} points={points} />
          : <polygon className="rich-map__area" key={`${feature.label ?? "area"}-${index}`} points={points} />;
      })}
    </svg>
    <figcaption><strong>{block.title}.</strong> {block.caption}<BlockEvidence evidenceId={block.evidenceId} evidence={evidence} /></figcaption>
    <details className="rich-map__fallback"><summary>Map description</summary><p>{block.description}</p><ul>{block.features.map((feature, index) => <li key={index}>{feature.kind === "point" ? `${feature.label}: ${feature.latitude}, ${feature.longitude}` : feature.label ?? `${feature.kind} feature`}</li>)}</ul></details>
  </figure>;
}

function TimelineBlock({ block, evidence }: { block: Extract<PublicationContentBlock, { type: "timeline" }>; evidence: readonly PublicEvidence[] }) {
  return <section className="rich-block rich-block--timeline" aria-labelledby={`${block.id}-heading`}>
    <h2 id={`${block.id}-heading`}>{block.title}</h2>
    <ol>{[...block.entries].sort((left, right) => left.date.localeCompare(right.date)).map((entry) => <li key={`${entry.date}-${entry.title}`}><time>{entry.date}</time><div><h3>{entry.title}</h3><p>{entry.description}</p><BlockEvidence evidenceId={entry.evidenceId} evidence={evidence} /></div></li>)}</ol>
  </section>;
}

export function PublicationBlocks({ blocks, evidence }: Props) {
  return <section className="rich-content" aria-label="Structured publication content">
    {blocks.map((block) => {
      switch (block.type) {
        case "prose": return <p key={block.id}>{block.text}</p>;
        case "heading": {
          const Heading = `h${block.level}` as "h2" | "h3" | "h4";
          return <Heading key={block.id}>{block.text}</Heading>;
        }
        case "quote": return <blockquote className="rich-block" key={block.id}><p>{block.text}</p><footer>{block.attribution}</footer></blockquote>;
        case "figure":
        case "image": return <VisualBlock key={block.id} block={block} evidence={evidence} />;
        case "table": return <figure className="rich-block rich-block--table" key={block.id}><figcaption><strong>{block.tableNumber ? `Table ${block.tableNumber}. ` : ""}</strong>{block.caption}</figcaption><div className="rich-table__scroll"><table><thead><tr>{block.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={block.columns[cellIndex]?.key}>{cell}</td>)}</tr>)}</tbody></table></div>{block.source && <p className="rich-block__source">Source: {block.source}</p>}<BlockEvidence evidenceId={block.evidenceId} evidence={evidence} /></figure>;
        case "evidence-reference": return <BlockEvidence key={block.id} evidenceId={block.evidenceId} evidence={evidence} />;
        case "map": return <MapBlock key={block.id} block={block} evidence={evidence} />;
        case "timeline": return <TimelineBlock key={block.id} block={block} evidence={evidence} />;
        case "dataset-reference": return <section className="rich-block rich-block--reference" key={block.id}><h2>{block.title}</h2><p>{block.description}</p><p>{block.url ? <a href={block.url} rel="noreferrer">Open dataset</a> : block.source}{block.format && ` · ${block.format}`}{block.coverage && ` · ${block.coverage}`}</p><BlockEvidence evidenceId={block.evidenceId} evidence={evidence} /></section>;
        case "media-reference": return <section className="rich-block rich-block--reference" key={block.id}><h2>{block.title}</h2><p>{block.description}</p><p><a href={block.url} rel="noreferrer">Open {block.mediaType.replace("-", " ")}</a>{block.transcriptUrl && <> · <a href={block.transcriptUrl} rel="noreferrer">Transcript</a></>}</p><BlockEvidence evidenceId={block.evidenceId} evidence={evidence} /></section>;
      }
    })}
  </section>;
}
