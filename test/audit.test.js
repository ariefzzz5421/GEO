import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIPv4, validateUrl, createPinnedIPv4Lookup } from "../src/network.js";
import { isRobotAllowed } from "../src/robots.js";
import { analyzeHtml } from "../src/html.js";
import { auditSite } from "../src/audit.js";
import { parseArgs } from "../bin/geo.js";
import { renderReport } from "../src/report.js";
import { inspectCanonical } from "../src/canonical.js";
import { analyzeSchemaBlocks } from "../src/schema.js";
import { chooseNext, classifyPage } from "../src/quality.js";

test("rejects private and reserved target addresses", () => {
  for (const target of ["http://127.0.0.1", "http://192.168.1.1", "http://169.254.169.254", "http://10.10.0.5", "http://localhost", "file:///etc/passwd", "https://example.com:8443"]) {
    assert.throws(() => validateUrl(target));
  }
  assert.equal(isPublicIPv4("1.1.1.1"), true);
  assert.equal(isPublicIPv4("192.0.2.1"), false);
  assert.equal(isPublicIPv4("100.64.0.1"), false);
});
test("URL validator accepts normal web URLs", () => {
  assert.equal(validateUrl("https://example.com/docs#part").toString(), "https://example.com/docs");
});
test("robots evaluator picks agent group and longest matching rule", () => {
  const txt = "User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: OtherBot\nDisallow: /\n";
  assert.equal(isRobotAllowed(txt, new URL("https://example.com/private/a")), false);
  assert.equal(isRobotAllowed(txt, new URL("https://example.com/private/public")), true);
});
test("robots evaluator honors explicit user-agent", () => {
  const txt = "User-agent: *\nDisallow: /\nUser-agent: OpenGEOAudit\nAllow: /\n";
  assert.equal(isRobotAllowed(txt, new URL("https://example.com/")), true);
});
test("HTML analyzer detects metadata and valid JSON-LD", () => {
  const html = '<html lang="en"><head><title>Example Good Product Page</title><meta name="description" content="Verified product specifications"><link rel="canonical" href="https://example.com/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Demo"}</script></head><body><main><h1>Example Product</h1><p>Useful factual information</p><a href="/about">About</a><img src="a.png"></main></body></html>';
  const result = analyzeHtml(html, "https://example.com/", { "content-type": "text/html" });
  assert.equal(result.jsonLdTypes[0], "Product");
  assert.equal(result.checks.find((x) => x.id === "structured-data").status, "pass");
  assert.equal(result.checks.find((x) => x.id === "image-alt").status, "warn");
  assert.ok(result.links.includes("https://example.com/about"));
});
test("HTML analyzer detects noindex and broken JSON-LD", () => {
  const result = analyzeHtml('<html><head><meta name="robots" content="noindex"><script type="application/ld+json">{broken}</script></head><body>Hello</body></html>', "https://example.com/");
  assert.equal(result.checks.find((x) => x.id === "indexability").status, "fail");
  assert.equal(result.checks.find((x) => x.id === "structured-data").status, "fail");
});
test("site audit respects robots before requesting page and generates report", async () => {
  const requested = [];
  const fetcher = async (url) => {
    requested.push(url);
    if (url.endsWith("robots.txt")) return { url, status: 200, headers: {}, body: "User-agent: *\nDisallow: /secret" };
    if (url.endsWith("sitemap.xml")) return { url, status: 200, headers: {}, body: "<urlset></urlset>" };
    return { url, status: 200, headers: { "content-type": "text/html" }, body: '<html><head><title>Example Public Page</title></head><body><h1>Welcome</h1><a href="/secret">Secret</a><a href="/about">About</a></body></html>' };
  };
  const result = await auditSite("https://example.com/", { fetcher, maxPages: 4 });
  assert.equal(result.pages.length, 2);
  assert.ok(!requested.some((s) => s.endsWith("/secret")));
  assert.ok(renderReport(result).includes("Technical readiness"));
  assert.equal(JSON.parse(renderReport(result, "json")).target, "https://example.com/");
});
test("denies entire scan when robots prohibits target", async () => {
  const fetched = [];
  const result = await auditSite("https://example.com/private", { fetcher: async (url) => {
    fetched.push(url);
    return { url, status: 200, headers: {}, body: "User-agent: *\nDisallow: /private" };
  }});
  assert.equal(result.pages.length, 0);
  assert.equal(fetched.length, 1);
});
test("CLI argument validation", () => {
  assert.equal(parseArgs(["https://example.com", "--max-pages", "3", "--format", "json"]).maxPages, 3);
  assert.throws(() => parseArgs(["https://example.com", "--max-pages", "100"]));
});

test("does not fetch sitemap if robots explicitly disallows it", async () => {
  const requested = [];
  const fetcher = async (url) => {
    requested.push(url);
    if (url.endsWith("robots.txt")) return { url, status: 200, headers: {}, body: "User-agent: *\nDisallow: /sitemap.xml" };
    return { url, status: 200, headers: { "content-type": "text/html" }, body: "<html><head><title>Public Page With Metadata</title></head><body><h1>Hello</h1></body></html>" };
  };
  const result = await auditSite("https://example.com", { fetcher, maxPages: 1 });
  assert.ok(!requested.some((url) => url.endsWith("sitemap.xml")));
  assert.ok(result.siteChecks.some((c) => c.id === "sitemap" && c.message.includes("skipped")));
});

test("pinned IPv4 lookup supports both Node.js DNS callback signatures", () => {
  const pinned = createPinnedIPv4Lookup("93.184.216.34");
  // Node.js 20+ may use all:true when family auto-selection is enabled.
  pinned("example.com", { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: "93.184.216.34", family: 4 }]);
  });
  // Legacy / single-address signature must continue to work.
  pinned("example.com", { all: false }, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "93.184.216.34");
    assert.equal(family, 4);
  });
});


test("cross-domain canonical is flagged for verification, not blindly passed", () => {
  const info = inspectCanonical("https://www.primary.example.net/product/1", "https://example.com/product/1");
  assert.equal(info.status, "warn");
  assert.equal(info.external, true);
  const html = '<html><head><title>Cross Domain Product Detail</title><link rel="canonical" href="https://www.primary.example.net/product/1"></head><body><h1>Product</h1></body></html>';
  const result = analyzeHtml(html, "https://example.com/product/1");
  assert.equal(result.checks.find((x) => x.id === "canonical").status, "warn");
  assert.equal(result.canonicalInfo.target, "https://www.primary.example.net/product/1");
});

test("schema checks reveal missing merchant fields without claiming Google validation", () => {
  const incomplete = analyzeSchemaBlocks(['{"@context":"https://schema.org","@type":"Product","name":"Demo"}']);
  assert.equal(incomplete.checks.find((x) => x.id === "product-schema").status, "warn");
  assert.match(incomplete.checks.find((x) => x.id === "product-schema").message, /Product.image/);
  const complete = analyzeSchemaBlocks(['{"@type":"Product","name":"Demo","image":"https://example.com/image.jpg","offers":{"@type":"Offer","price":"42","priceCurrency":"IDR"}}']);
  assert.equal(complete.checks.find((x) => x.id === "product-schema").status, "pass");
  assert.equal(analyzeSchemaBlocks([]).checks.find((x) => x.id === "schema-syntax").status, "not-tested");
});

test("pages without images and without verification have honest not-tested status", async () => {
  const html = '<html><head><title>Test Home Page</title><link rel="canonical" href="https://example.com/"></head><body><h1>Home</h1></body></html>';
  const r = analyzeHtml(html, "https://example.com/");
  assert.equal(r.checks.find((x) => x.id === "image-alt").status, "not-applicable");
  const fetcher = async (url) => ({
    url, status: url.endsWith("/robots.txt") ? 404 : 200,
    headers: { "content-type": "text/html" },
    body: url.endsWith("/sitemap.xml") ? "<urlset></urlset>" : html
  });
  const audit = await auditSite("https://example.com/", { fetcher, maxPages: 1 });
  assert.equal(audit.summary.notTested > 0, true);
  assert.ok(audit.summary.coverage < 100);
  assert.ok(audit.summary.score < 100);
  assert.equal(audit.pages[0].checks.find((x) => x.id === "canonical-target").status, "not-tested");
});

test("sampling prioritizes less represented page types", () => {
  assert.equal(classifyPage("https://example.com/artikel/audio"), "article");
  assert.equal(classifyPage("https://example.com/produk/amplifier"), "product");
  const queue = [
    "https://example.com/produk/one",
    "https://example.com/produk/two",
    "https://example.com/artikel/how-to",
    "https://example.com/katalog"
  ];
  const counts = { category: 1, article: 0, product: 2, other: 1 };
  assert.equal(chooseNext(queue, counts), "https://example.com/artikel/how-to");
  assert.equal(queue.length, 3);
});

test("canonical verification respects robots.txt on a different canonical host", async () => {
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    if (url === "https://example.com/robots.txt") return { url, status: 200, headers: {}, body: "" };
    if (url === "https://primary.example.net/robots.txt") return { url, status: 200, headers: {}, body: "User-agent: *\nDisallow: /restricted" };
    if (url.endsWith("/sitemap.xml")) return { url, status: 200, headers: {}, body: "<urlset></urlset>" };
    return { url, status: 200, headers: { "content-type": "text/html" }, body: '<html><head><title>Cross-domain Canonical</title><link rel="canonical" href="https://primary.example.net/restricted"></head><body><h1>Page</h1></body></html>' };
  };
  const r = await auditSite("https://example.com/", { fetcher, maxPages: 1, verifyCanonical: true });
  assert.equal(r.pages[0].checks.find((c) => c.id === "canonical-target").status, "not-tested");
  assert.ok(!requests.includes("https://primary.example.net/restricted"));
  assert.equal(parseArgs(["https://example.com", "--verify-canonical"]).verifyCanonical, true);
});

test("sitemap and internal links produce diverse coverage", async () => {
  const html = (title, inner) => '<html><head><title>' + title + '</title></head><body><h1>' + title + '</h1>' + inner + '</body></html>';
  const pages = new Map([
    ["https://example.com/", html("Home", '<a href="/katalog">Catalog</a>')],
    ["https://example.com/katalog", html("Catalog", '<a href="/produk/one">One</a><a href="/produk/two">Two</a><a href="/artikel/guide">Guide</a>')],
    ["https://example.com/produk/one", html("Product One", "")],
    ["https://example.com/produk/two", html("Product Two", "")],
    ["https://example.com/artikel/guide", html("Guide", "")]
  ]);
  const fetcher = async (url) => {
    if (url.endsWith("robots.txt")) return { url, status: 404, headers: {}, body: "" };
    if (url.endsWith("sitemap.xml")) return { url, status: 200, headers: {}, body: "<urlset><url><loc>https://example.com/katalog</loc></url></urlset>" };
    return { url, status: pages.has(url) ? 200 : 404, headers: { "content-type": "text/html" }, body: pages.get(url) ?? "" };
  };
  const result = await auditSite("https://example.com/", { fetcher, maxPages: 4 });
  assert.ok(result.pages.some((p) => p.pageType === "article"));
  assert.ok(result.pages.some((p) => p.pageType === "product"));
  assert.ok(result.pages.some((p) => p.pageType === "category"));
});


test("optional canonical target HTTP verification records reachability without claiming Google selection", async () => {
  const fetcher = async (url) => {
    if (url.endsWith("/robots.txt")) return { url, status: 404, headers: {}, body: "" };
    if (url.endsWith("/sitemap.xml")) return { url, status: 404, headers: {}, body: "" };
    if (url === "https://primary.example.net/") return { url, status: 200, headers: { "content-type": "text/html" }, body: "<html><body>OK</body></html>" };
    return { url, status: 200, headers: { "content-type": "text/html" }, body: '<html><head><title>MSB Example Product</title><link rel="canonical" href="https://primary.example.net/"></head><body><h1>Product</h1></body></html>' };
  };
  const report = await auditSite("https://example.com/", { fetcher, maxPages: 1, verifyCanonical: true });
  assert.equal(report.pages[0].checks.find((x) => x.id === "canonical").status, "warn");
  assert.equal(report.pages[0].checks.find((x) => x.id === "canonical-target").status, "pass");
  assert.match(report.pages[0].checks.find((x) => x.id === "canonical-target").recommendation, /does not prove/);
});

test("Product image empty list is not counted as a complete property", () => {
  const result = analyzeSchemaBlocks(['{"@type":"Product","name":"Demo","image":[],"offers":{"@type":"Offer","price":"1","priceCurrency":"IDR"}}']);
  assert.equal(result.checks.find((x) => x.id === "product-schema").status, "warn");
});


test("classifies listing vs article and category landing pages using schema", () => {
  assert.equal(classifyPage("https://example.com/artikel"), "category");
  assert.equal(classifyPage("https://example.com/power-miniatur"), "category");
  assert.equal(classifyPage("https://example.com/artikel/guide"), "article");
  assert.equal(classifyPage("https://example.com/anything", { jsonLdTypes: ["CollectionPage", "ItemList"] }), "category");
  assert.equal(classifyPage("https://example.com/anything", { jsonLdTypes: ["Article"] }), "article");
  assert.equal(classifyPage("https://example.com/anything", { jsonLdTypes: ["Product"] }), "product");
  const page = analyzeHtml('<html><head><title>Article</title><script type="application/ld+json">{"@type":"Article"}</script></head><body><h1>Article</h1></body></html>', "https://example.com/misc");
  assert.equal(page.pageType, "article");
  assert.equal(page.checks.find((x) => x.id === "product-schema").status, "not-applicable");
});

test("not-applicable items do not lower evidence coverage, unlike not-tested", async () => {
  const fetcher = async (url) => ({
    url, status: url.endsWith("/robots.txt") ? 404 : url.endsWith("/sitemap.xml") ? 404 : 200,
    headers: { "content-type": "text/html" },
    body: '<html><head><title>A small public website</title></head><body><h1>Welcome</h1></body></html>'
  });
  const report = await auditSite("https://example.com", { fetcher, maxPages: 1 });
  assert.ok(report.summary.notApplicable >= 3);
  assert.ok(report.summary.notTested >= 4);
  const measured = report.summary.passed + report.summary.warnings + report.summary.failed;
  assert.equal(report.summary.coverage, Math.round(measured / (measured + report.summary.notTested) * 100));
  assert.match(renderReport(report), /not applicable/);
});

test("render-js requires explicit owner acknowledgement", async () => {
  assert.throws(() => parseArgs(["https://example.com", "--render-js"]), /--i-own-this-site/);
  await assert.rejects(auditSite("https://example.com", { renderJs: true }), /--i-own-this-site/);
  assert.equal(parseArgs(["https://example.com", "--render-js", "--i-own-this-site"]).renderJs, true);
});

test("injected browser renderer compares initial and rendered HTML", async () => {
  const raw = '<html><head><title>Client UI</title></head><body><main><h1>Loading</h1></main></body></html>';
  const rendered = '<html><head><title>Client UI</title></head><body><main><h1>Content</h1><p>' + "useful ".repeat(130) + '</p></main></body></html>';
  const fetcher = async (url) => ({
    url, status: url.endsWith("/robots.txt") ? 404 : url.endsWith("/sitemap.xml") ? 404 : 200,
    headers: { "content-type": "text/html" }, body: raw
  });
  const result = await auditSite("https://example.com", {
    fetcher, maxPages: 1, renderJs: true, ownerAcknowledged: true,
    renderPage: async ({ html }) => {
      assert.equal(html, raw);
      return { html: rendered, blockedRequests: 4 };
    }
  });
  assert.ok(result.pages[0].rendering.deltaWords >= 100);
  assert.equal(result.pages[0].rendering.blockedRequests, 4);
  assert.equal(result.pages[0].checks.find((x) => x.id === "rendering-compare").status, "warn");
});


test("browser rendering failure is not falsely reported as completed", async () => {
  const fetcher = async (url) => ({
    url,
    status: url.endsWith("/robots.txt") ? 404 : url.endsWith("/sitemap.xml") ? 404 : 200,
    headers: { "content-type": "text/html" },
    body: '<html><head><title>Example Page</title></head><body><h1>Hello</h1></body></html>'
  });
  const r = await auditSite("https://example.com/", {
    fetcher, maxPages: 1, renderJs: true, ownerAcknowledged: true,
    renderPage: async () => { throw new Error("Chromium unexpectedly exited"); }
  });
  assert.equal(r.siteChecks.find((x) => x.id === "javascript-rendering").status, "not-tested");
  assert.equal(r.pages[0].checks.find((x) => x.id === "rendering-compare").status, "not-tested");
});
