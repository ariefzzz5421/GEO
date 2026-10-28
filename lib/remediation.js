// Deterministic, evidence-grounded remediation plans for OpenGEO reports.
// This does NOT use an LLM and never assumes a problem is fixed automatically.
import { findings } from "./dashboard.js";

function htmlAttr(raw) {
  return String(raw ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function isCrossDomain(f) {
  return /cross.domain/i.test(f.message ?? "");
}
function solutionFor(finding, page) {
  const id = finding.id;
  const type = page?.pageType ?? "other";
  const title = page?.title || "Descriptive page title";
  const rules = {
    "indexability": {
      priority: "critical", category: "Crawl & index",
      title: "Review noindex on this page",
      why: "A noindex directive prevents search indexing when crawlers can access it. Confirm whether this is meant to be a publicly searchable page.",
      action: "If this page is meant to rank, remove the robots noindex directive from HTML and any X-Robots-Tag header. Do not change intentional private, login, or internal pages.",
      snippet: '<meta name="robots" content="index,follow" />',
      caution: "Removing noindex does not guarantee Google will index the page."
    },
    "title": {
      priority: finding.status === "fail" ? "high" : "medium", category: "On-page SEO",
      title: "Write a distinct, descriptive page title",
      why: "Missing or vague titles make it harder to identify the page's subject in search results.",
      action: "Use the actual product, service or article name, followed by relevant context or brand. Avoid identical titles on multiple pages.",
      snippet: '<title>' + htmlAttr(page?.title && finding.status === "warn" ? page.title : "Specific page topic | Your brand") + '</title>',
      caution: "This is a template, not a verified optimized title; write the final copy using real page content."
    },
    "description": {
      priority: "medium", category: "On-page SEO",
      title: "Add a factual meta description",
      why: "An accurate summary gives search engines more context and can improve the usefulness of search snippets.",
      action: "Summarize what the page offers and its main differentiator in natural language. Avoid false claims, keyword stuffing and copy-pasting one description across pages.",
      snippet: '<meta name="description" content="Accurate summary of ' + htmlAttr(title) + ', with one useful detail and a clear purpose." />',
      caution: "Google may use a different snippet. Replace every placeholder with verified information."
    },
    "h1": {
      priority: "medium", category: "Content structure",
      title: "Clarify the main page heading",
      why: "A descriptive primary heading makes the subject easier to understand for readers and content parsers.",
      action: "Use a single prominent H1 that describes the page. Check that the heading is included in the server-delivered or rendered HTML.",
      snippet: '<h1>' + htmlAttr(title) + '</h1>',
      caution: "The proposed heading is derived from the title. Review for accuracy before applying."
    },
    "lang": {
      priority: "low", category: "Accessibility & metadata",
      title: "Declare the document language",
      why: "The lang attribute helps assistive technologies and content interpretation.",
      action: "Set the correct BCP 47 language tag on the root HTML element.",
      snippet: '<html lang="id">',
      caution: "Use en, id, ja, or another correct language for the actual page; Indonesian is only an example."
    },
    "canonical": {
      priority: isCrossDomain(finding) ? "low" : "high", category: "Canonical",
      title: isCrossDomain(finding) ? "Verify intentional cross-domain canonical" : "Correct the canonical link",
      why: isCrossDomain(finding) ? "Cross-domain canonicals can be legitimate when duplicate pages are consolidated to one primary domain." : "A missing or inconsistent canonical can make preferred-URL selection less clear.",
      action: isCrossDomain(finding) ? "Open the target canonical URL, compare page equivalence, and verify internal links and sitemap point to the primary site. Do not change intentional consolidation." : "Identify the single preferred publicly accessible URL for this page and use it consistently in canonical, sitemap and internal links.",
      snippet: isCrossDomain(finding) ? "" : '<link rel="canonical" href="' + htmlAttr(finding.url) + '" />',
      caution: "Canonical is a hint, not a directive. A successful HTTP response does not prove Google selected this URL."
    },
    "canonical-target": {
      priority: "high", category: "Canonical",
      title: "Check target canonical reachability",
      why: "A canonical pointing to an error page or redirect chain may confuse URL consolidation.",
      action: "Verify the canonical target is accessible, returns suitable HTML, and represents equivalent content. Update it only if the reference is wrong.",
      snippet: "", caution: "A not-tested canonical is a verification gap, not a defect."
    },
    "image-alt": {
      priority: "medium", category: "Accessibility & metadata",
      title: "Add appropriate alt text to informative images",
      why: "Alternative text conveys important information about images to assistive technology and some search systems.",
      action: "Describe the actual image subject succinctly. For purely decorative images use alt=\"\"; do not add keywords unrelated to the image.",
      snippet: '<img src="/path/to-real-image.webp" alt="Describe the actual image accurately" />',
      caution: "Review images manually. The scanner cannot infer what an image depicts."
    },
    "readable-content": {
      priority: "medium", category: "Content quality",
      title: "Improve content clarity and on-page evidence",
      why: "The HTML contains little detectable text. Important information may be missing or rendered by JavaScript.",
      action: type === "product"
        ? "Include accurate specifications, compatible use cases, dimensions/power ratings when verified, warranty details and buyer questions."
        : type === "article"
          ? "Add a clear answer near the top, source-backed explanations, examples and helpful subsections. Avoid filler text."
          : "Explain who the service or product is for, what it offers, and useful facts such as location, fulfillment and contact methods.",
      snippet: "", caution: "The 80-word threshold is a simple heuristic. More words do not automatically improve SEO."
    },
    "product-schema": {
      priority: "high", category: "Structured data",
      title: "Complete Product structured data",
      why: "The detected Product JSON-LD has missing common identifying or merchant fields.",
      action: "Match Product name/image/price/currency and Offer information to facts visible on the page. Verify required and recommended properties against Google's latest Product guidance.",
      snippet: '<script type="application/ld+json">\n' + JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "REPLACE_WITH_REAL_PRODUCT_NAME", image: ["https://example.com/real-image.jpg"], offers: { "@type": "Offer", price: "REPLACE_WITH_REAL_PRICE", priceCurrency: "IDR", availability: "https://schema.org/InStock" } }, null, 2) + '\n</script>',
      caution: "Template placeholders are NOT validated values. Only publish pricing and availability that are accurate."
    },
    "schema-syntax": {
      priority: "high", category: "Structured data",
      title: "Repair malformed JSON-LD",
      why: "Invalid JSON prevents parsers from reliably understanding the structured data block.",
      action: "Validate the JSON-LD syntax: escape quotes, remove trailing commas, check braces, and ensure @context/@type match real content. Test the page in a structured-data validator.",
      snippet: "", caution: "Do not blindly overwrite existing working structured data."
    },
    "structured-data": {
      priority: "high", category: "Structured data",
      title: "Validate structured-data implementation",
      why: "One or more JSON-LD blocks could not be parsed or are missing.",
      action: "Fix invalid JSON blocks and choose schema types that truthfully describe the page. Non-product pages do not automatically need Product schema.",
      snippet: "", caution: "Valid JSON-LD alone does not guarantee rich-result eligibility."
    },
    "sitemap": {
      priority: "medium", category: "Crawl & index",
      title: "Verify XML sitemap discovery",
      why: "The standard /sitemap.xml path was missing, inaccessible or could not be parsed by this basic checker.",
      action: "Find the actual sitemap location, ensure it contains canonical, indexable URLs, and reference it from robots.txt when appropriate.",
      snippet: "Sitemap: https://YOUR_DOMAIN/sitemap.xml",
      caution: "A missing standard sitemap path is not automatically an SEO failure."
    },
    "robots-txt": {
      priority: "low", category: "Crawl & index",
      title: "Review robots.txt availability",
      why: "robots.txt was not found at the origin. This is not intrinsically a ranking problem.",
      action: "Create a robots.txt only if you need crawl directives or a sitemap discovery hint. Keep important public content crawlable.",
      snippet: "User-agent: *\nAllow: /\n\nSitemap: https://YOUR_DOMAIN/sitemap.xml",
      caution: "Robots.txt does not hide sensitive content from the public."
    },
    "http-status": {
      priority: "critical", category: "Technical access",
      title: "Restore access to this page",
      why: "A non-200 page may not be usable as an indexable canonical page.",
      action: "Verify the URL and hosting route; repair the response, or redirect intentionally moved content with a permanent redirect to a relevant page.",
      snippet: "", caution: "Some status codes are intentional (for example a removed or private page)."
    },
    "fetch-error": {
      priority: "high", category: "Technical access",
      title: "Investigate the page fetch error",
      why: "The audit client could not retrieve this page, so its content was not evaluated.",
      action: "Check DNS, TLS certificate, response size, redirects, server availability and robots access. Re-run the scan after fixing transport errors.",
      snippet: "", caution: "This can be an audit network limitation rather than a site defect."
    },
    "rendering-compare": {
      priority: "medium", category: "Rendering",
      title: "Review content that appears only after JavaScript",
      why: "A large difference between initial and rendered HTML can affect crawlers that cannot fully execute scripts.",
      action: "Consider server-side rendering or pre-rendering essential headings, summaries and product facts. Compare against browser and search-engine rendering tools.",
      snippet: "", caution: "The experimental renderer blocks third-party scripts and does not reproduce Googlebot."
    }
  };
  const selected = rules[id];
  if (!selected) return {
    priority: finding.status === "fail" ? "high" : "low",
    category: "Technical review",
    title: "Investigate " + String(id).replaceAll("-", " "),
    why: finding.message ?? "The audit found an issue worth reviewing.",
    action: finding.recommendation || "Inspect the URL and verify this finding against the live page.",
    snippet: "", caution: "A heuristic scanner can produce false positives."
  };
  return selected;
}

const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 };
export function remediationPlan(report) {
  if (!report) return { issues: [], opportunities: [], counts: { critical: 0, high: 0, medium: 0, low: 0 }, estimated: 0 };
  const pages = new Map(report.pages.map((p) => [p.url, p]));
  const issues = findings(report).map((f, index) => ({
    key: [f.level, f.url, f.id, index].join("|"),
    status: f.status,
    rule: f.id, url: f.url, evidence: f.evidence || f.message || "",
    detected: f.message || "",
    ...solutionFor(f, pages.get(f.url))
  })).sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]);
  const opportunities = [];
  const untested = (report.siteChecks ?? []).filter((f) => f.status === "not-tested");
  if (untested.some((f) => f.id === "google-indexing")) opportunities.push({
    id: "gsc", priority: "high", title: "Verify Google indexing in Search Console",
    action: "Use a verified Google Search Console property to check indexed URLs, coverage and Google-selected canonicals. OpenGEO cannot infer these from HTML."
  });
  if (untested.some((f) => f.id === "ai-visibility")) opportunities.push({
    id: "ai", priority: "medium", title: "Measure real AI search citations",
    action: "Test reproducible queries across target answer engines, log dates and URLs quoted, and distinguish mentions from actual citations. No citation data was collected here."
  });
  if (untested.some((f) => f.id === "javascript-rendering")) opportunities.push({
    id: "render", priority: "medium", title: "Compare initial HTML with rendered content",
    action: "For a site you own, run the isolated CLI Playwright comparison. This checks whether JS delays important content."
  });
  const productPages = report.pages.filter((p) => p.pageType === "product");
  if (productPages.length) opportunities.push({
    id: "products", priority: "low", title: "Strengthen product decision-making content",
    action: "Review whether product pages provide accurate specifications, availability, pricing, usage guidance and differentiators. The scanner has not verified factual accuracy."
  });
  if (report.pages.length < 5) opportunities.push({
    id: "sampling", priority: "medium", title: "Increase page sample before broader conclusions",
    action: "This audit covers only " + report.pages.length + " page(s). The local CLI supports up to 20. Do not treat a small sample as a full-site audit."
  });
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of issues) counts[item.priority]++;
  return { issues, opportunities, counts, estimated: issues.length };
}
