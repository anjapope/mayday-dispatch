# Overwatch integration

Overwatch publishes analytical products through the existing Dispatch HTTP gateway. It does not access the Dispatch database, filesystem, Git repository, or rendering code.

## Authentication and origin identity

Configure a dedicated `overwatch` application credential in `MAYDAY_APPLICATION_CREDENTIALS`; do not reuse Research Studio credentials. The gateway resolves the credential to the `overwatch` application identity and ignores caller-supplied role or application headers in the credentialed path.

Every submission uses the stable tuple:

```text
originatingApplication = overwatch
originatingProject = <workspace/project/monitor>
stableObjectId = <Overwatch analytical object ID>
```

Titles, slugs, timestamps, URLs, and filenames are not identity keys.

## Synchronization and recurring reports

`OverwatchDispatchClient.submit` creates a draft on first submission. A later submission with the same origin identity must include the current `expectedVersion`; the gateway persists a revision and rejects stale versions. Once a publication leaves `draft`, external synchronization receives `EDITORIAL_LOCK`.

The client carries optional `seriesId`, `previousPublicationId`, and `reportingPeriod` values in the persisted `overwatch` extension. A revised analytical object keeps the same stable object ID; a new recurring instance uses a new stable object ID and may retain the series linkage.

## Assessment metadata

Overwatch assessment fields are stored under the non-public `extensions.overwatch.assessment` object. Supported fields include confidence level, assessment date, source count, corroboration status, collection window, geographic and temporal scope, analytic caveats, methodology notes, and confidence rationale. These fields are not included in the public publication projection.

## Evidence and public safety

Evidence must be registered through the Evidence Registry before association. External applications can associate only `public` or `citation-only` evidence. Mayday3-style processor, checksum, and provenance fields remain in the registry and are retained internally; restricted evidence and internal analytical metadata are stripped by the public projection.

Dispatch editorial revisions distinguish corrections from substantive updates.
Overwatch may synchronize only drafts; it cannot publish, correct, archive, or
otherwise bypass the editorial lifecycle. Public preview uses the same safe
projection as the public publication route.
