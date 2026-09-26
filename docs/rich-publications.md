# Rich publications

Phase Ten adds optional ordered content blocks to a publication while retaining the existing `body` paragraphs for backward compatibility. Existing publications render `body`; publications with `blocks` render the shared structured block renderer in both public articles and editorial preview.

Supported blocks are prose, headings, quotes, figures, images, tables, evidence references, static analytical maps, timelines, dataset references, and media references. Every block has a stable UUID and a typed, runtime-validated payload.

Visual URLs must be public HTTP(S) URLs. Meaningful visuals require alt text; decorative visuals explicitly omit it. Tables validate their column/row shape. Maps validate coordinates and render an SVG plus a textual fallback. Timeline dates retain supplied year/month/day/timestamp precision.

`blocks_json` is stored with the publication document in migration `006_phase_ten.sql`. This preserves ordering and revision snapshots without creating a premature block-query schema.

Public projection filters evidence-reference blocks to public or citation-only evidence. Restricted references are removed, and other block evidence links are omitted when restricted. Raw HTML, scripts, file paths, arbitrary embeds, and map configuration are not accepted.

Research Studio and Overwatch submit blocks through the existing create/update gateway contracts. Mayday3 remains evidence-only; blocks may link its registered evidence but Mayday3 cannot author publications.
