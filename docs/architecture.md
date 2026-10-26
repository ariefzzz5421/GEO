# OpenGEO architecture

## Data flow

User (CLI / future dashboard)
  -> validate URL
  -> validate DNS and pin public IPv4
  -> retrieve robots.txt and apply robots policy
  -> check standard sitemap location and optionally collect up to 100 simple urlset entries
  -> choose a diverse sample of up to N same-site HTML pages sequentially
  -> extract document metadata, headings, text, links, and JSON-LD
  -> inspect canonical domain/path consistency and basic Product/Offer JSON-LD properties
  -> optionally validate canonical target HTTP status after robots.txt review
  -> apply deterministic audit checks
  -> output JSON or Markdown

## Modules

- src/network.js: bounded HTTP(S) requester with SSRF protections.
- src/robots.js: conservative robots.txt parser for OpenGEOAudit.
- src/html.js: dependency-free, heuristic HTML metadata extractor.
- src/audit.js: crawl orchestration, opt-in canonical HTTP verification and summary scoring.
- src/canonical.js: canonical syntax and same/cross-domain consistency checks.
- src/schema.js: small Product/Offer JSON-LD property audit.
- src/quality.js: heuristic URL category classification and balanced page sampling.
- src/report.js: Markdown and JSON serializers.
- bin/geo.js: CLI entrypoint.
- test/audit.test.js: offline deterministic fixtures.

## Scoring

Checks with pass=1, warn=0.5, fail=0 contribute equally to a measured score. Not-tested checks are excluded from the score but lower evidence coverage. If warnings, failures or untested checks exist, the rounded score is capped at 99. The score is a heuristic technical readiness summary; it is not a performance benchmark, and checks should not be mistaken for Google's own ranking rules.

## Technical limitations

Regex-based HTML extraction is intentionally narrow and can miss malformed markup, dynamic pages and complex templates. Playwright rendering has not been implemented. Future adapters can add Playwright rendering and a standards-compliant HTML parser without requiring users to rewrite the CLI.

Cross-domain canonical is a review signal, not automatically an error. HTTP 200 of the canonical target is only a reachability check: it cannot establish content equivalence or Google-selected canonical.

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
