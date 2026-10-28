# OpenGEO v0.4 — Dashboard quick start

OpenGEO now includes a local-first Next.js dashboard over the CLI audit engine. Import CLI JSON reports for any site or run controlled live scans against specifically allowed hostnames.

## Local development

Node.js 20.9+ is required for the Next.js dashboard.

~~~bash
git clone https://github.com/ariefzzz5421/GEO.git
cd GEO
npm install
npm run dev
~~~

Visit http://localhost:3000.

## Import a report from CLI

~~~bash
node bin/geo.js https://www.msbproject.my.id --max-pages 20 --format json --output msb-audit.json
~~~

Click Import JSON in the dashboard. Browse Overview, Findings, Pages and History; export snapshots via the app. Imports do not require API credentials.

## Enable restricted live scanning

By default, the scan API is disabled. Create a .env.local file at repository root:

~~~dotenv
OPEN_GEO_ALLOWED_HOSTS=www.msbproject.my.id,msbproject.my.id
OPEN_GEO_API_KEY=replace-with-a-long-random-unique-secret
~~~

Restart the development server. On the dashboard enter your API key in Server access settings, and click Run audit.

Server-side requests require an exact allowed hostname, respect robots.txt and public IPv4 restrictions, and limit a scan to 1–5 pages. They never execute arbitrary website JavaScript or probe cross-domain canonical targets. CLI scanning still supports up to 20 pages and optional isolated rendering.

## Deploy with Vercel

Import the GitHub repository as a Next.js project. Set the two variables above as **server-side environment variables** (never NEXT_PUBLIC_). Imports will work without them, but live scans will return an error until the server is configured. Configure deployment authentication and Vercel Firewall/WAF rate limiting before inviting public traffic; the internal 15-second rate limiter is process-local and cannot protect a distributed serverless service.

## Report history

Up to 12 reports are stored in browser localStorage under opengeo-history-v04, not in a hosted database. Long internal-link lists are removed from cached snapshots. History does not sync across browsers/devices and can be cleared by the browser; export JSON if persistence matters.

The report comparison compares same-hostname reports. Findings on pages omitted from a newer sample are not counted as resolved.

## Limitations

No authenticated Google Search Console, live AI citations, SaaS accounts, hosted report database, full HTML parser or automated production fixes yet. A technical readiness score is not a probability of being recommended by AI.

For server-side scanning, do not enable public arbitrary-domain access. See SECURITY.md.


## v0.5 — Paste website URL and receive an actionable fix plan

Enter a URL (including a bare domain such as example.com), choose 1, 3 or 5 pages, and select **Analyze website**. When the scan succeeds, OpenGEO takes you directly to **Fix Advisor**:

- Failing and warning rules are ordered by critical, high, medium and low.
- Each fix includes the detected evidence, an explanation, actionable change, and a copyable starter code snippet where appropriate.
- Export the recommendations as an editable Markdown fix plan.
- Potential improvements that have NOT been measured (Google indexing, AI citations, JS rendering) are separated into **Verification & optimization opportunities**.
- OpenGEO does not automatically modify a production website and does not invent live search indexing or AI citations.

The advisor is deterministic and runs in the browser on report data. It works for imported JSON from any website, including older v0.3/v0.4 CLI reports.

### Admin-only scanning of other public websites

The server remains restricted by default. If you administer the deployment and need to scan public domains beyond the allowlist, you can explicitly set:

~~~dotenv
OPEN_GEO_ALLOW_AUTHENTICATED_PUBLIC_HOSTS=true
OPEN_GEO_API_KEY=your-long-random-admin-secret
~~~

This option does **not** allow anonymous users to scan other websites. Every request must provide the matching secret in the advanced settings, and all URLs must pass the public IPv4, default-port and robots policy checks. Keep this behind your owner login, configure Vercel Firewall/WAF and strict egress policy, and only scan websites you are authorized to audit. The server enforces a max of 5 HTML pages per request.

Do NOT use any-host mode as a general public arbitrary-URL crawler without dedicated worker isolation, per-identity quotas and abuse controls. Untrusted users should be limited to importing audited JSON until a proper SaaS scanner exists.

If you only need your own site, keep OPEN_GEO_ALLOW_AUTHENTICATED_PUBLIC_HOSTS unset and configure OPEN_GEO_ALLOWED_HOSTS as previously.

### Troubleshooting

- **503 Server auditing is not configured**: Set the allowed-host list or admin-only opt-in, plus the server secret in production.
- **401 Invalid audit access key**: Enter the exact key set in the server environment variables.
- **403 hostname not enabled**: Add the owned hostname to the allowlist or, for trusted admin use only, enable the optional public-host mode.
- **429 cooldown**: Too many requests to one hostname in a short interval. Wait before scanning again.

A URL pasting workflow is available in the UI, but **live scans are deliberately disabled until your server environment is configured**. JSON import and advice generation work immediately.


## OpenGEO v0.6 — Optional hybrid AI advisor

This is a **manual, opt-in API call**; the standard deterministic Fix Advisor continues working with no API keys. To enable provider inference, set these variables in Vercel Settings → Environment Variables for the production deployment:

~~~dotenv
OPEN_GEO_API_KEY=your-private-owner-key-at-least-16-characters
OPEN_GEO_AI_ENABLED=true
OPEN_GEO_AI_PROVIDER=gemini
GEMINI_API_KEY=your-ai-studio-key
GROQ_API_KEY=your-groq-key
OPEN_GEO_GEMINI_MODEL=gemini-3.5-flash-lite
OPEN_GEO_GROQ_MODEL=openai/gpt-oss-20b
~~~

At least **one provider key** must be set; with only Groq configured, it runs Groq directly. With both configured, it tries Gemini then Groq on failure (or reverses if OPEN_GEO_AI_PROVIDER=groq). Do not add provider keys to your Git repository, browser storage or NEXT_PUBLIC_ variables. If no provider is configured, AI returns an explicit error without fabricating results.

After redeploying, open the dashboard, enter OPEN_GEO_API_KEY in **Server access settings**, and visit **Fix Advisor** for a scanned/imported report. Click **Analyze with AI** manually. The panel labels the actual provider/model and if fallback was used.

### Data sent to inference providers

The AI endpoint receives a compact, user-supplied snapshot: audited URL, approximate score/coverage, up to 8 detected failed or warning checks (rule, URL, evidence, suggested repair), and up to 4 unverified opportunities. It **does not** upload raw page HTML, image content, full report links, or secrets. As this evidence can come from imported JSON, it is **not independently verified by the AI endpoint**.

The model is explicitly instructed to treat report content as data, not commands. Responses are parsed as JSON and checked against existing finding references. This is still generative AI; **no automatic code writes or SEO performance promises**.

### Security, usage and budgets

The AI endpoint is off by default, requires the strong private owner key even in local development, caps request bodies at 18 KB, limits output, and enforces a 30-second process-local cooldown. On serverless hosts the cooldown is **not global**: configure Vercel Firewall/WAF, protected deployment access, rate limits and provider budget alerts before broader use. Use of any free provider tier is subject to quota and availability; if exhausted, the rule-based advisor remains functional.

For production use across multiple users, replace the shared owner key with per-user authentication and persisted quotas. Do not open this as a public anonymous inference proxy.
