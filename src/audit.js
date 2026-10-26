import { fetchPublic, isSameSite, validateUrl } from "./network.js";
import { isRobotAllowed } from "./robots.js";
import { analyzeHtml } from "./html.js";

function check(id, status, message, recommendation = "", evidence = "") {
  return { id, status, message, recommendation, evidence };
}
function summarize(siteChecks, pages) {
  const all = [...siteChecks, ...pages.flatMap((p) => p.checks)];
  const passed = all.filter((r) => r.status === "pass").length;
  const warnings = all.filter((r) => r.status === "warn").length;
  const failed = all.filter((r) => r.status === "fail").length;
  return { checks: all.length, passed, warnings, failed, score: all.length ? Math.round((passed + warnings * 0.5) / all.length * 100) : null };
}
export async function auditSite(inputUrl, { maxPages = 5, fetcher = fetchPublic } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new Error("maxPages must be between 1 and 20.");
  const target = validateUrl(inputUrl);
  const siteChecks = [];
  const pages = [];
  const roots = new Map();
  async function getRobots(origin) {
    if (roots.has(origin)) return roots.get(origin);
    const response = await fetcher(new URL("/robots.txt", origin).toString(), { maxBytes: 500_000 });
    let text = "";
    if (response.status === 200) {
      text = response.body;
      siteChecks.push(check("robots-txt", "pass", "robots.txt retrieved at " + origin));
    } else if (response.status === 404 || response.status === 410) {
      siteChecks.push(check("robots-txt", "warn", "No robots.txt at " + origin, "Add robots.txt if crawl directives are needed."));
    } else if (response.status === 401 || response.status === 403) {
      throw new Error("robots.txt is inaccessible (HTTP " + response.status + "); crawling stopped.");
    } else {
      throw new Error("Could not establish robots permissions (HTTP " + response.status + "); crawling stopped.");
    }
    roots.set(origin, text);
    return text;
  }
  const robotsText = await getRobots(target.origin);
  if (!isRobotAllowed(robotsText, target)) {
    siteChecks.push(check("robots-access", "fail", "Target URL disallowed for OpenGEOAudit", "Obtain site-owner permission or adjust robots.txt for this bot."));
    return { target: target.toString(), scannedAt: new Date().toISOString(), siteChecks, pages, summary: summarize(siteChecks, pages), limitations: LIMITATIONS };
  }
  const robotsResponse = await fetcher(new URL("/sitemap.xml", target.origin).toString(), { maxBytes: 500_000 });
  const sitemapOK = robotsResponse.status === 200 && /<(urlset|sitemapindex)\b/i.test(robotsResponse.body);
  siteChecks.push(check("sitemap", sitemapOK ? "pass" : "warn", sitemapOK ? "XML sitemap found" : "Standard /sitemap.xml not detected", "Check the sitemap URL advertised in robots.txt; submit a valid sitemap if useful."));
  const queue = [target.toString()];
  const visited = new Set();
  while (queue.length && pages.length < maxPages) {
    const candidate = queue.shift();
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    const current = validateUrl(candidate);
    if (!isSameSite(current, target)) continue;
    const rules = await getRobots(current.origin);
    if (!isRobotAllowed(rules, current)) continue;
    try {
      const response = await fetcher(current.toString());
      if (response.status !== 200) {
        pages.push({ url: current.toString(), checks: [check("http-status", "fail", "HTTP " + response.status, "Fix inaccessible public pages.")], links: [] });
        continue;
      }
      if (!String(response.headers["content-type"] ?? "").toLowerCase().includes("text/html")) {
        pages.push({ url: current.toString(), checks: [check("content-type", "warn", "Not an HTML page", "Use an HTML response for indexable webpages.")], links: [] });
        continue;
      }
      const analyzed = analyzeHtml(response.body, response.url ?? current.toString(), response.headers);
      pages.push(analyzed);
      for (const link of analyzed.links) if (!visited.has(link) && !queue.includes(link) && queue.length < maxPages * 4) queue.push(link);
    } catch (error) {
      pages.push({ url: current.toString(), checks: [check("fetch-error", "fail", String(error.message), "Check website availability and access.")], links: [] });
    }
  }
  return { target: target.toString(), scannedAt: new Date().toISOString(), siteChecks, pages, summary: summarize(siteChecks, pages), limitations: LIMITATIONS };
}

export const LIMITATIONS = [
  "This is a deterministic technical audit, not a prediction of Google rankings or AI citation probability.",
  "No headless JavaScript rendering: client-side-only text may be missed.",
  "This MVP supports public IPv4 targets only, default HTTP(S) ports, and same-site redirects.",
  "The robots evaluator covers common Allow/Disallow rules but not every crawler-specific directive.",
  "The default sitemap check looks at /sitemap.xml; custom sitemap locations need manual verification.",
  "Search-console indexing, search performance, and live AI mentions require separate authenticated integrations."
];
