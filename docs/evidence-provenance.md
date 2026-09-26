# Evidence provenance and integrity

Every registered evidence record has a stable UUID, version, SHA-256 checksum,
source/provenance summary, visibility, and processing state. Optional metadata
records source URL, acquisition method/time, processor, processing time,
original safe filename, collection and original identifiers, and a provenance
note. Filesystem paths are rejected as filenames and are never public output.

Derivative artifacts retain their own stable IDs and may identify
`parentEvidenceId` plus `derivationType`; they never replace their source.
Basic lineage is durable in Phase Seven. Automated supersession workflows,
binary preservation, collection, OCR, and transcription engines are deferred.

Processing states are `registered`, `processing`, `ready`, `failed`,
`rejected`, and `superseded`. Failed work retains its identity and may be
version-updated on recovery. Visibility can never be escalated from non-public
to public through a processing update. Public publication projections retain
only public/citation-only references and omit checksums, processing metadata,
lineage, private provenance, and errors.
