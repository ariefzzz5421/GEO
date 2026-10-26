# OpenGEO architecture

## Data flow

User (CLI / future dashboard)
  -> validate URL
  -> validate DNS and pin public IPv4
  -> retrieve robots.txt and apply robots policy
  -> check standard sitemap location
  -> crawl up to N same-site HTML pages sequentially
  -> extract document metadata, headings, text, links, and JSON-LD
  -> apply deterministic audit checks
  -> output JSON or Markdown

## Modules

- src/network.js: bounded HTTP(S) requester with SSRF protections.
- src/robots.js: conservative robots.txt parser for OpenGEOAudit.
- src/html.js: dependency-free, heuristic HTML metadata extractor.
- src/audit.js: crawl orchestration and summary scoring.
- src/report.js: Markdown and JSON serializers.
- bin/geo.js: CLI entrypoint.
- test/audit.test.js: offline deterministic fixtures.

## Scoring

Each check contributes equally: pass=1, warn=0.5, fail=0. The score is rounded to 0-100. The score is a heuristic technical readiness summary; it is not a performance benchmark, and checks should not be mistaken for Google's own ranking rules.

## Technical limitations

Regex-based HTML extraction is intentionally narrow and can miss malformed markup, dynamic pages and complex templates. Future adapters can add Playwright rendering and a standards-compliant HTML parser without requiring users to rewrite the CLI.

robots.txt must be respected. This implementation supports the common Allow/Disallow rules but is not a fully compatible implementation for every crawler.

## Future extension points

- DOM/parser adapters and optional JS rendering
- Schema.org property validation against visible content
- Search Console OAuth for verified website owners
- Consent-based GitHub App with reviewable PRs
- Multi-site dashboards with isolated workers
- Versioned prompt sets for controlled AI visibility experiments
- Evidence-based report diffs and CI rules

No unsupported claim of guaranteed AI citations or ranking should be introduced.
