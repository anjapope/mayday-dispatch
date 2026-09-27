# Phase Twelve production security review

## Scope and method

Reviewed the Next.js public and editorial routes, gateway authorization,
application credentials and sessions, public projection and search, evidence
and content schemas, middleware/CSP, runtime operations, migrations, Docker
configuration, package manifest/lockfile, and repository workflows. Evidence
is from source inspection, focused tests, integration tests, `npm audit`,
dependency-tree inspection, and a disposable local production rehearsal.
No external infrastructure was available for perimeter verification.

## Findings and disposition

| ID | Severity | Finding and reproduction condition | Disposition / evidence |
| --- | --- | --- | --- |
| SEC-01 | High (pre-launch blocker) | The application does not implement MFA, rate limiting, VPN/IP restrictions, or HTTPS termination. Direct public exposure without a separately configured perimeter would permit online sign-in attempts and would not meet launch policy. | Not represented as active. Requires an organization-managed MFA identity perimeter, TLS reverse proxy, access restrictions, and rate limits before launch. Local tests cannot validate those external controls. |
| SEC-02 | High (resolved in Phase Twelve) | The initial dependency audit identified vulnerable PostCSS versions through Next.js and a vulnerable Vitest mocker. PostCSS advisories included XSS and source-map file disclosure; the Vitest mocker advisory included path traversal/arbitrary file reads. | Updated Vitest to 4.1.11 and pinned the compatible PostCSS 8 line to `^8.5.23` (resolved 8.5.28). `npm audit` reports zero vulnerabilities. Re-run the audit in CI and on each dependency update. |
| SEC-03 | Medium (resolved in Phase Twelve) | A changed editorial row or a missing Phase Twelve manifest could otherwise result in public content not bound to a publisher-approved snapshot. | Public routes now require the latest valid release manifest, recompute the snapshot digest, and verify the publisher/audit correlation/version/action. Tampering with the publisher binding is rejected by the HTTP integration test. Legacy Phase Eleven rows without manifests fail closed and require explicit re-release. |
| SEC-04 | Medium (resolved in Phase Twelve) | A previously published revision could be amended without a public correction/update note, or have its staged visibility changed while the old snapshot remained served. | Correction and substantive-update notes are mandatory and public after release. Private reclassification of an active release is rejected; archival is the explicit withdrawal action. Unit tests cover missing/hidden notices and private reclassification. |
| SEC-05 | Medium (resolved in Phase Twelve) | Editorial cookie sessions previously remained usable after a token rotation that retained the same subject, and could inherit changed roles. | Session signatures bind an opaque fingerprint of configured token/HMAC credentials and sorted roles. Rotation or role changes invalidate the session; expiration, malformed tokens, logout, secure cookie attributes, and same-origin mutation checks have integration coverage. |
| SEC-06 | Medium (resolved in Phase Twelve) | Unbounded request-body reads could allow oversized unauthenticated requests to consume memory before authorization. | Gateway request bodies are read once and capped at 1 MiB; oversized requests return 413. This limit is not an ingress bandwidth/rate limit and should also be enforced at the proxy. |
| SEC-07 | Low (mitigated in Phase Twelve) | Arbitrary schemes, private-network/IP references, local filesystem paths, HTML-like tags, or undeclared rich-content block types could be submitted as public content. | Public URL/text schemas reject executable schemes, raw IP/private hostnames, local paths, markup, malformed structures, inaccessible images, unsafe maps/tables, and undeclared iframe blocks. React continues to render text as text; no `dangerouslySetInnerHTML` is used. External HTTPS images remain permitted and can contact the selected host when rendered; the renderer sends no referrer. |
| SEC-08 | Low (repository observation) | No `.github` workflow directory exists in the reviewed repository, so there is no checked-in CI workflow to assess for token permissions or secret exposure. | No production deployment token is supplied to this repository. If CI is introduced, ordinary pull-request jobs must receive no production secrets, permissions must be least-privileged, and deployment must require a protected environment and explicit approval. |

## Control review

- **Authentication:** Roles are resolved from server-side credential records.
  Upstream service accounts have only their configured integration role and
  cannot sign into the editorial workspace as publishers. Development headers
  are disabled by production validation.
- **Sessions:** Eight-hour HMAC-signed cookies are `HttpOnly`,
  `SameSite=Strict`, and `Secure` in production. Current credential/role
  fingerprints are rechecked per request. Mutating cookie requests require an
  exact same-origin `Origin`. Logout clears even malformed/expired cookies.
  Rotating the session signing key invalidates all sessions.
- **Authorization and lockdown:** Release actions require publisher/admin
  role, editorial-session authentication, expected version, public
  classification, passing readiness, and an inactive persisted lockdown.
  Operator identity is separate from publisher authority. Lockdown preserves
  previously released snapshots and is not itself a withdrawal mechanism.
- **Routes and errors:** Public endpoints receive public projection schemas;
  editorial and operations routes require authorization. Error responses
  expose stable codes/correlation IDs rather than request data or internal
  stack traces. Request bodies and credentials are not written to operational
  logs.
- **Evidence and assets:** No managed upload route exists. `public/` contains
  source-controlled static assets only. Evidence metadata and assets are not
  made public by ingestion; public evidence associations are filtered by
  visibility. Database, backup, environment, and credential files are excluded
  from the static asset directory and container build context.
- **CSP:** Middleware generates a per-response nonce, passes it to Next.js
  through `x-nonce`, and applies it to scripts and styles. The root layout is
  dynamic so full loads and client-side navigation receive the same protection.
  `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'`,
  same-origin forms/connections, and HTTPS image allowance remain enabled.
  `style-src-attr 'unsafe-inline'` remains only for inline map positioning.
  External images are intentionally allowed; release review must evaluate
  their host and rights.
- **Repository/secrets:** `.env*` and `secrets/` are ignored; the Docker build
  context excludes secrets and local databases. Production secret files are
  mounted read-only by Compose. Compose file-backed secrets are a host-local
  mechanism, not a cloud secret vault. Do not build PRs with production
  credential files available.
- **Logging/privacy:** Application operational events omit request bodies,
  credentials, IP addresses, source text, and restricted notes. A future
  reverse proxy, hosting provider, or alert sink may collect connection data;
  its fields, retention, access, and privacy notice remain unverified and must
  be reviewed before deployment.

## Residual limitations

The review does not establish that a future host, DNS provider, CDN, identity
provider, reverse proxy, log sink, backup target, or alerting service is
securely configured. Robots and `X-Robots-Tag` are indexing signals, not
access controls. A privileged host administrator can read or alter the SQLite
database and application configuration. SQLite remains a single-host,
single-writer design. No public launch is authorized by this review.
