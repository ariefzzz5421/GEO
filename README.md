# OpenGEO v0.6 — open-source GEO & technical SEO audit engine

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

Optionally verify that the declared canonical URLs are reachable via bounded HTTP requests (including cross-domain canonical URLs, after robots checks):

~~~bash
node bin/geo.js https://example.com --max-pages 5 --verify-canonical --format markdown --output report.md
~~~

This **does not** prove that the pages are equivalent or that Google has selected that canonical. The flag is opt-in to avoid additional requests to third-party domains.

Generate a Markdown report:

~~~bash
node bin/geo.js https://example.com --format markdown --output report.md
~~~

Or install the local command:

~~~bash
npm link
opengeo https://example.com --max-pages 3
~~~

## Audits included (v0.4)

| Scope | Checks |
| --- | --- |
| Discovery | robots.txt, basic sitemap URL discovery (up to 100 locs) |
| Indexability | robots meta noindex and X-Robots-Tag noindex |
| Metadata | title, description, canonical domain/path consistency, HTML language |
| Content structure | H1, approximate visible word count, image alt |
| Structured data | JSON-LD syntax, Product name/image/Offer property sanity checks (not Google rich-results certification) |
| Crawling | bounded same-site sampling balanced across category, article, product and other pages |
| Reports | Markdown and JSON with findings, status pass/warn/fail/not-tested/not-applicable, coverage and suggested fixes |

- The score is a technical heuristic over executed checks (pass=1, warn=0.5, fail=0). Not-tested items are excluded and explicitly counted via evidence coverage. A warning, failure or not-tested item caps the rounded score at 99 so 99.73 never renders as 100. It is not a GEO visibility metric.
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
2. **v0.2** — Canonical consistency checks, opt-in HTTP verification, basic Product schema checks, balanced sampling, evidence coverage, tests. **No browser rendering yet**.
3. **v0.3** — Schema/content-based classification, applicability-aware coverage, and experimental opt-in Playwright rendering (no dashboard yet).
4. **v0.4** — Next.js dashboard, local browser history, report import/export, snapshot comparison and allowlisted scans (no Search Console yet).
5. **Later** — Reviewable GitHub fixes and controlled AI citation experiments with explicit sampling methodology.

Contributions and new rules are welcome: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).

## v0.2 scoring and sampling

The sample now favors a mix of category, article and product URLs based on path patterns and known sitemap locations. These are heuristics, not a full sitemap index crawler. `not-tested` is recorded for missing image evidence, canonical HTTP checks not requested, JavaScript rendering, indexing status and AI citations. Scores have no correlation guarantee with search performance.


## v0.3 — optional browser rendering and applicability

By default, OpenGEO audits safely fetched HTML **without executing website JavaScript**. The new optional rendering comparison requires **explicit owner acknowledgement**, a dedicated Playwright installation, and an **isolated execution environment**:

~~~bash
npm install --no-save playwright
npx playwright install chromium
node bin/geo.js https://your-owned-site.example --max-pages 3 --render-js --i-own-this-site --format json --output render-report.json
~~~

The rendering adapter blocks third-party HTTP resources and routes bounded same-site document, script, style, and fetch requests through OpenGEO's DNS-pinned HTTP fetcher. It compares content word counts before/after scripts. This is **not** an exact simulation of Googlebot, and blocked external assets may create false negatives.

Do not enable the renderer in an internet-facing public scanner; browser-executed JavaScript is untrusted and requires OS/network isolation. Playwright is deliberately not installed by default.

Checks can now be marked **not-applicable** for pages where Product schema or image-alt auditing is irrelevant. Those checks are excluded from the evidence-coverage denominator. **not-tested** means an applicable evaluation was not performed, such as canonical HTTP verification, JavaScript rendering, Google indexing or AI citations.

Page types are determined using JSON-LD (Product, Article, CollectionPage) and URL/content hints. Classification remains heuristic.

**Still not included:** live AI citations, Google Search Console integration, public multi-tenant scanning or complete Google Rich Results validation.


## v0.4 dashboard

A responsive local-first dashboard now offers overview metrics, findings filters, page explorer, local history, report import/export and same-host comparisons. It uses Next.js 16.4.3 and React 19.3.1. The existing CLI still runs without installing app dependencies.

~~~bash
npm install
npm run dev
~~~

Open http://localhost:3000 and import a JSON report. Live scans require an allowed-host environment setting and a private API key in production. For configuration and Vercel deployment, see [Dashboard setup](docs/dashboard.md).


## v0.5 Fix Advisor

Paste a website address (bare domain or full URL) into OpenGEO Studio and run an authorized audit. After scanning, the Fix Advisor prioritizes detected failures/warnings, explains their evidence, proposes actionable changes and provides copy-ready **starter templates** when possible. It also separates unverified optimization opportunities from confirmed technical findings. Export recommendations as an editable Markdown plan. This is rule-based: no unverified AI citations or automatically applied fixes.

**Live server scanning needs configuration.** By default, only imported CLI JSON reports work. Server owners can either allowlist approved domains or enable opt-in authenticated admin scanning of other public domains using `OPEN_GEO_ALLOW_AUTHENTICATED_PUBLIC_HOSTS=true` together with `OPEN_GEO_API_KEY`, protected by platform-level authentication/rate limits. See [Dashboard setup](docs/dashboard.md). Never expose the admin secret to anonymous visitors.


## v0.6 — Hybrid AI diagnosis (optional)

The deterministic Fix Advisor is always available without any AI provider. A separate **Analyze with AI** button calls a protected Next.js server API that sends only a bounded summary of audit findings to a language model. Primary: **Google Gemini 3.5 Flash-Lite**; fallback: **Groq GPT-OSS 20B**. No SDK dependency is required: both use REST APIs. Gemini/Groq keys remain server-side and are never shipped to visitors.

Set server environment variables OPEN_GEO_AI_ENABLED=true, OPEN_GEO_API_KEY (owner secret), and at least one of GEMINI_API_KEY or GROQ_API_KEY. Optional: OPEN_GEO_AI_PROVIDER=groq, OPEN_GEO_GEMINI_MODEL and OPEN_GEO_GROQ_MODEL. Restart or redeploy, enter the owner access key under Server access settings, import/run an audit, visit Fix Advisor and click Analyze with AI.

AI output is mapped back to confirmed report rule IDs; it cannot introduce new audit findings through the structured response. Models may still hallucinate suggested explanations or code. Review all changes manually and rerun the deterministic scanner after applying fixes. AI does not edit a website, fetch source code, verify Google indexing or measure ChatGPT citations.

See [AI setup and security](docs/dashboard.md).
