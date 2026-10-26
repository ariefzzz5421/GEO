import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIPv4, validateUrl } from "../src/network.js";
import { isRobotAllowed } from "../src/robots.js";
import { analyzeHtml } from "../src/html.js";
import { auditSite } from "../src/audit.js";
import { parseArgs } from "../bin/geo.js";
import { renderReport } from "../src/report.js";

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
  assert.ok(renderReport(result).includes("Readiness score"));
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
