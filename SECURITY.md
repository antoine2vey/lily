# Security Policy

We take the security of Lily seriously. Thank you for helping keep the project and its users safe.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately through either channel:

1. **GitHub Security Advisories** (preferred) — go to the
   [**Security** tab](https://github.com/antoine2vey/lily/security/advisories/new)
   and choose **Report a vulnerability**. This keeps the report private until a
   fix is released.
2. **Email** — `[email protected]` (the maintainer's public contact).

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof of concept.
- Affected package(s) and version/commit.
- Any suggested remediation, if you have one.

## What to expect

- **Acknowledgement** within 5 business days.
- An assessment and, where applicable, a planned fix and disclosure timeline.
- Credit for the report once a fix is released, unless you prefer to remain anonymous.

We ask that you give us a reasonable amount of time to address the issue before
any public disclosure, and that you avoid accessing or modifying other users'
data while researching.

## Scope

This repository is the source for a live product. The following are **in scope**:

- The backend API (`packages/api`), MCP server (`packages/mcp`), and admin
  dashboard (`packages/admin`).
- Authentication/authorization logic, the magic-link flow, and the
  internal/service token surface.
- The knowledge-ingestion pipeline (including SSRF/egress considerations).

The following are **out of scope** (report upstream instead):

- Vulnerabilities in third-party dependencies (report to the dependency).
- Findings that require a compromised device, a privileged/admin account you
  already control, or social engineering of a maintainer.
- Missing best-practice headers without a demonstrated impact.

## Good to know

- Secrets are provided via environment variables (`Config` / `process.env`) — see
  [`.env.example`](.env.example). No production secret is committed to this repo,
  and its history has been kept clean of credentials.
- Client-embedded values (RevenueCat public SDK keys, Sentry DSN, OAuth client
  IDs, EAS project IDs) are public by design and are not considered secrets.
