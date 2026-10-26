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
