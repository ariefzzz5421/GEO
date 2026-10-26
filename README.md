# OpenGEO — open-source GEO & technical SEO audit engine

OpenGEO is a small, dependency-free Node.js CLI for auditing **technical SEO and AI search readiness** on publicly accessible websites. It checks crawler access, common HTML metadata, structured data syntax, discoverability hints, and on-page content. Reports can be generated in Markdown or JSON.

**Important:** This tool does not predict Google ranking, ChatGPT recommendations, or AI citation probability. It does not have access to private search indexes. GEO "readiness" is a local heuristic, not a universal industry standard.

## Quick start

Requirements: Node.js 20+.

~~~bash
git clone https://github.com/ariefzzz5421/GEO.git
cd GEO
npm test
node bin/geo.js https://example.com --max-pages 3
~~~

Create a JSON report:

~~~bash
node bin/geo.js https://example.com --max-pages 5 --format json --output report.json
~~~

Generate a Markdown report:

~~~bash
node bin/geo.js https://example.com --format markdown --output report.md
~~~

Or install the local command:

~~~bash
npm link
opengeo https://example.com --max-pages 3
~~~

## Audits included (v0.1)

| Scope | Checks |
| --- | --- |
| Discovery | robots.txt access, common /sitemap.xml |
| Indexability | robots meta noindex and X-Robots-Tag noindex |
| Metadata | title, meta description, canonical, HTML language |
| Content structure | H1, approximate visible word count, image alt |
| Structured data | JSON-LD presence, JSON parse errors, discovered @type |
| Crawling | bounded internal-link traversal with robots policy |
| Reports | Markdown and JSON with findings and suggested fixes |

- The score is the percentage of checks with pass=1, warn=0.5, fail=0. It is not a GEO visibility metric.
- This CLI is **not a substitute for Google Search Console, an HTML rendering crawler, or live AI citation tracking**.
- Metadata heuristics may not apply identically to every page type.

## Run from GitHub Actions

This repo includes CI tests and a **Manual GEO audit** workflow. On the GitHub Actions tab, select "Manual GEO audit", enter a public website URL and maximum pages, then download the generated Markdown report artifact. This does not change the target website.

## Architecture

~~~text
User URL
  -> URL/DNS safety checks
  -> robots.txt policy
  -> sitemap probe
  -> bounded HTML crawling
  -> technical checks + source evidence
  -> Markdown/JSON report
~~~

Implementation details: [docs/architecture.md](docs/architecture.md).

## Security & respectful usage

- Scans are sequential and limited to 1–20 HTML pages by default.
- Only public IPv4 HTTP(S) targets, with default ports, are supported in the MVP.
- The HTTP client validates DNS and pins a vetted address on each connection.
- Redirects are restricted to the original host or its www variant.
- The tool does not execute downloaded JavaScript.
- It honors common robots.txt rules for its OpenGEOAudit user agent.
- Do not run it against sites you are not authorized to audit.

For public SaaS use, additional authentication, rate limits, egress isolation and abuse protection are required. See [SECURITY.md](SECURITY.md).

## Roadmap

1. **v0.1** — Open-source CLI, bounded crawler, technical checks, reports and CI.
2. **v0.2** — Better HTML/structured-data parser, sitemap discovery and optional browser rendering.
3. **v0.3** — Dashboard + historical diff + integration with verified Google Search Console properties.
4. **v0.4** — GitHub App for reviewable and tested fix suggestions, never silent production changes.
5. **Later** — Controlled AI citation experiments with explicit sampling methodology and provider constraints.

Contributions and new rules are welcome: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).
