# Evidence discovery and reuse

Authenticated consumers search the Evidence Registry with structured filters:
text, media type, processing state, visibility, processor, source, collection,
parent evidence, derivation, dates, and (for Mayday3 only) checksum. Results
are deterministically ordered by stable evidence ID and use a bounded
cursor-based continuation token.

Editors can inspect all registry metadata in `/editorial/evidence`. Research
Studio and Overwatch receive only `public` and `citation-only` search results,
which are the categories they may associate. Mayday3 is restricted to checksum
lookup; public users have no evidence discovery route.

Discovery returns existing stable IDs for reuse; association remains a separate
publication gateway operation and never clones evidence. Duplicate awareness is
provided by checksum lookup. Dispatch does not automatically merge matching
records because identical bytes may have independent provenance.

Authenticated evidence detail provides factual lineage (parent, derivative,
supersession, checksum, collection, and original-source-identifier links),
bounded revision/audit summaries, and authorized publication usage. Editorial
callers receive internal metadata and all associated publications. External
publication systems receive only evidence that they may associate and usage of
public, published publications. Mayday3 may retrieve a known record and use
checksum lookup, but cannot perform broad discovery or publication operations.
