# Security Policy

Dandelion is a pre-alpha, local-first prototype. We take security
reports seriously and will respond to credible disclosures promptly.

## Supported Versions

Only the `main` branch and the latest tagged release receive security
attention. The persisted snapshot schema is versioned separately (see
`SCHEMA_VERSION` in `prototype/persistence.mjs`); we will not break a
prior schema without a clear migration path in the release notes.

| Version | Supported |
|---|---|
| latest tag / `main` | ✅ |
| anything older | ❌ |

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security problems.

Instead, open a private GitHub security advisory:

1. Go to the repository's **Security** tab.
2. Click **"Report a vulnerability"**.
3. Fill in the form. Include a minimal reproduction if you can.

You can expect:

- An acknowledgement within ~7 days.
- A fix or mitigation plan within ~30 days for high-severity issues,
  longer for low-severity. This is best-effort; Dandelion is a
  side-project, not a funded service.
- Credit in the release notes when the fix ships (opt-out available).

## Threat Model and What's Out of Scope

Dandelion is designed for **single-user, local-first** use. Threats
that fall outside that model are noted, not solved:

- **Multi-user authentication.** There is no auth. Setting `HOST` to a
  non-loopback address exposes the server, including the proxied
  Anthropic API key on `/api/files` and `/api/chat`, to anyone who
  can reach the port. Do this only on a trusted network. We log a
  loud warning on startup when this happens.
- **Untrusted assistant output.** The renderer treats model output as
  potentially hostile and sanitizes it via DOMPurify before insertion
  into the DOM (see `prototype/markdown.mjs`).
- **Untrusted user file uploads.** Files are forwarded to Anthropic
  unchanged. We do not virus-scan or content-inspect them.
- **Path traversal in session storage.** Guarded — see
  `scripts/server/sessions.mjs`; session ids are restricted to a
  conservative character set.
- **localStorage and on-disk plaintext.** Sessions are stored as
  plain JSON. They contain whatever the user pasted. The repo's
  `.gitignore` covers `sessions/` so they don't end up in commits,
  but you should treat the directory as you would any local notes.
- **Provider API keys.** Read from environment variables or `.env`,
  used to make outbound requests, never persisted to disk by
  Dandelion itself, never sent anywhere except the configured
  provider.

If you find something we missed, please tell us via the path above.
