import { fetchPublic, isSameSite, validateUrl } from "./network.js";
import { isRobotAllowed } from "./robots.js";
import { analyzeHtml } from "./html.js";
import { chooseNext, classifyPage } from "./quality.js";
import { createBrowserRenderer } from "./renderer.js";

function check(id, status, message, recommendation = "", evidence = "") {
  return { id, status, message, recommendation, evidence };
}
function summarize(siteChecks, pages) {
  const all = [...siteChecks, ...pages.flatMap((p) => p.checks)];
  const passed = all.filter((r) => r.status === "pass").length;
  const warnings = all.filter((r) => r.status === "warn").length;
  const failed = all.filter((r) => r.status === "fail").length;
  const notTested = all.filter((r) => r.status === "not-tested").length;
  const notApplicable = all.filter((r) => r.status === "not-applicable").length;
  const measured = passed + warnings + failed;
  const rawScore = measured ? Math.round((passed + warnings * 0.5) / measured * 100) : null;
  const score = rawScore === null ? null : (warnings || failed || notTested) ? Math.min(99, rawScore) : rawScore;
  const pageTypes = { category: 0, article: 0, product: 0, other: 0 };
  for (const page of pages) pageTypes[page.pageType ?? "other"]++;
  return {
    checks: all.length, passed, warnings, failed, notTested, notApplicable,
    coverage: measured + notTested ? Math.round(measured / (measured + notTested) * 100) : 0,
    score, pageTypes
  };
}

export async function auditSite(inputUrl, { maxPages = 5, fetcher = fetchPublic, verifyCanonical = false, renderJs = false, ownerAcknowledged = false, renderPage = null } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new Error("maxPages must be between 1 and 20.");
  if (renderJs && !ownerAcknowledged) throw new Error("Rendering executes untrusted website JavaScript; --render-js requires --i-own-this-site and an isolated machine.");
  const target = validateUrl(inputUrl);
  const siteChecks = [
    check("javascript-rendering", renderJs ? "pass" : "not-tested", renderJs ? "JavaScript rendering comparison enabled (see per-page status)" : "JavaScript-rendered content not compared", "For a trusted site, enable --render-js --i-own-this-site in an isolated environment."),
    check("google-indexing", "not-tested", "Google-selected canonical and indexing status unavailable", "Use verified Google Search Console URL Inspection."),
    check("ai-visibility", "not-tested", "No live AI search mention or citation measurement", "Use controlled, repeatable prompts with explicit provider methodology.")
  ];
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
    } else {
      throw new Error("Could not establish robots permissions at " + origin + " (HTTP " + response.status + "); crawling stopped.");
    }
    roots.set(origin, text);
    return text;
  }

  function finalize() {
    if (renderJs) {
      const summaryCheck = siteChecks.find((finding) => finding.id === "javascript-rendering");
      const pageChecks = pages.flatMap((page) => page.checks).filter((finding) => finding.id === "rendering-compare");
      const completed = pageChecks.filter((finding) => finding.status === "pass" || finding.status === "warn");
      if (!completed.length) {
        summaryCheck.status = "not-tested";
        summaryCheck.message = "Rendering requested but no page was successfully compared";
      } else if (completed.length < pages.length) {
        summaryCheck.status = "warn";
        summaryCheck.message = "Browser comparison completed for " + completed.length + " of " + pages.length + " scanned pages";
      } else {
        summaryCheck.status = "pass";
        summaryCheck.message = "Browser comparison completed for " + completed.length + " page(s)";
      }
    }
    return {
      target: target.toString(),
      scannedAt: new Date().toISOString(),
      options: { maxPages, verifyCanonical, renderJs },
      siteChecks, pages,
      summary: summarize(siteChecks, pages),
      limitations: LIMITATIONS
    };
  }

  const robotsText = await getRobots(target.origin);
  if (!isRobotAllowed(robotsText, target)) {
    siteChecks.push(check("robots-access", "fail", "Target URL disallowed for OpenGEOAudit", "Obtain permission or review robots.txt."));
    return finalize();
  }

  const sitemapUrl = new URL("/sitemap.xml", target.origin);
  const sitemapCandidates = [];
  if (!isRobotAllowed(robotsText, sitemapUrl)) {
    siteChecks.push(check("sitemap", "warn", "Sitemap probe skipped: disallowed by robots.txt", "Check sitemap manually."));
  } else {
    try {
      const res = await fetcher(sitemapUrl.toString(), { maxBytes: 500_000 });
      const found = res.status === 200 && /<(urlset|sitemapindex)\b/i.test(res.body);
      siteChecks.push(check("sitemap", found ? "pass" : "warn", found ? "XML sitemap found" : "Standard /sitemap.xml not detected", "Check sitemap paths declared in robots.txt."));
      if (found && /<urlset\b/i.test(res.body)) {
        for (const match of res.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
          if (sitemapCandidates.length >= 100) break;
          try {
            const u = validateUrl(match[1].trim().replace(/&amp;/g, "&"));
            if (isSameSite(u, target) && !sitemapCandidates.includes(u.toString())) sitemapCandidates.push(u.toString());
          } catch { /* skip invalid loc */ }
        }
      }
    } catch (error) {
      siteChecks.push(check("sitemap", "warn", "Sitemap probe failed: " + error.message, "Check sitemap availability."));
    }
  }

  const queue = [target.toString()];
  const queued = new Set(queue);
  const visited = new Set();
  const counts = { category: 0, article: 0, product: 0, other: 0 };
  const renderer = renderJs && !renderPage ? await createBrowserRenderer({ fetcher, getRobots }) : null;
  const canonicalCache = new Map();
  function enqueue(input) {
    if (queued.size >= 400) return;
    try {
      const u = validateUrl(input);
      if (!isSameSite(u, target)) return;
      u.search = "";
      u.hash = "";
      if (/\.(pdf|zip|png|jpe?g|webp|gif|svg|css|js|xml|json|ico)$/i.test(u.pathname)) return;
      const link = u.toString();
      if (!visited.has(link) && !queued.has(link)) { queue.push(link); queued.add(link); }
    } catch { /* ignore malformed URLs */ }
  }
  for (const link of sitemapCandidates) enqueue(link);

  try {
  while (queue.length && pages.length < maxPages) {
    const candidate = pages.length === 0 ? queue.shift() : chooseNext(queue, counts);
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    const current = validateUrl(candidate);
    if (!isSameSite(current, target)) continue;
    const rules = await getRobots(current.origin);
    if (!isRobotAllowed(rules, current)) continue;
    const hintedType = classifyPage(current);
    try {
      const response = await fetcher(current.toString());
      if (response.status !== 200) {
        pages.push({ url: current.toString(), pageType: hintedType, checks: [check("http-status", "fail", "HTTP " + response.status, "Fix inaccessible pages.")], links: [] });
        continue;
      }
      if (!String(response.headers["content-type"] ?? "").toLowerCase().includes("text/html")) {
        pages.push({ url: current.toString(), pageType: hintedType, checks: [check("content-type", "warn", "Not an HTML page", "Use HTML for indexable webpages.")], links: [] });
        continue;
      }
      const analyzed = analyzeHtml(response.body, response.url ?? current.toString(), response.headers);
      counts[analyzed.pageType] = (counts[analyzed.pageType] ?? 0) + 1;
      if (renderJs) {
        try {
          const rendered = renderPage
            ? await renderPage({ url: current.toString(), html: response.body })
            : await renderer.render({ url: current.toString(), html: response.body });
          const renderedAnalysis = analyzeHtml(rendered.html, current.toString(), response.headers);
          const delta = renderedAnalysis.words - analyzed.words;
          analyzed.rendering = {
            initialWords: analyzed.words, renderedWords: renderedAnalysis.words,
            deltaWords: delta, blockedRequests: rendered.blockedRequests ?? 0
          };
          analyzed.checks.push(check(
            "rendering-compare",
            Math.abs(delta) >= 50 ? "warn" : "pass",
            "Initial vs rendered text: " + analyzed.words + " vs " + renderedAnalysis.words + " words",
            "Review important content present only after JS; allowlisted first-party bundles may not cover third-party scripts.",
            "Blocked network requests: " + (rendered.blockedRequests ?? 0)
          ));
        } catch (error) {
          analyzed.checks.push(check("rendering-compare", "not-tested", "Browser rendering could not complete: " + error.message,
            "Check Playwright setup or test in an isolated environment."));
        }
      }

      if (!analyzed.canonicalInfo?.target) {
        analyzed.checks.push(check("canonical-target", "not-tested", "No valid canonical URL to verify"));
      } else if (!verifyCanonical) {
        analyzed.checks.push(check("canonical-target", "not-tested", "Canonical target HTTP status not checked", "Run with --verify-canonical for an optional bounded HTTP check."));
      } else {
        const canonicalTarget = validateUrl(analyzed.canonicalInfo.target);
        try {
          const canonicalRobots = await getRobots(canonicalTarget.origin);
          if (!isRobotAllowed(canonicalRobots, canonicalTarget)) {
            analyzed.checks.push(check("canonical-target", "not-tested", "Canonical URL disallowed for OpenGEOAudit; no request made"));
          } else {
            let canonicalRes = canonicalCache.get(canonicalTarget.href);
            if (!canonicalRes) {
              canonicalRes = await fetcher(canonicalTarget.toString(), { maxBytes: 300_000 });
              canonicalCache.set(canonicalTarget.href, canonicalRes);
            }
            const status = canonicalRes.status === 200 ? "pass" : canonicalRes.status === 404 || canonicalRes.status === 410 ? "fail" : "warn";
            analyzed.checks.push(check("canonical-target", status, "Canonical URL returned HTTP " + canonicalRes.status,
              "HTTP success does not prove equivalent content or Google canonical selection.", canonicalTarget.toString()));
          }
        } catch (error) {
          analyzed.checks.push(check("canonical-target", "warn", "Canonical target could not be checked: " + error.message,
            "Review URL, DNS and redirects manually.", canonicalTarget.toString()));
        }
      }

      pages.push(analyzed);
      for (const link of analyzed.links) enqueue(link);
    } catch (error) {
      pages.push({ url: current.toString(), pageType: hintedType, checks: [check("fetch-error", "fail", String(error.message), "Check website availability and access.")], links: [] });
    }
  }
  } finally {
    if (renderer) await renderer.close();
  }
  return finalize();
}

export const LIMITATIONS = [
  "Readiness is a heuristic technical audit, not a prediction of search rank or AI citations.",
  "Regex HTML extraction is not a full HTML parser; optional browser rendering is experimental, first-party only, and does not reproduce Googlebot.",
  "Browser rendering executes untrusted JavaScript; use only on sites you own and inside an isolated environment.",
  "Product JSON-LD checks inspect common properties, NOT complete Schema.org or Google merchant eligibility.",
  "Optional canonical HTTP validation does not verify content equivalence or the Google-selected canonical.",
  "Only public IPv4 HTTP(S) hosts and default ports are supported; redirects remain limited to the initial request host.",
  "Robots evaluation covers common Allow/Disallow rules, not every crawler-specific directive.",
  "Sitemap loc discovery supports simple urlset files only, capped at 100 locations; sitemap indexes are not followed.",
  "No authenticated Search Console indexing or live AI citation measurement."
];
