import test from "node:test";
import assert from "node:assert/strict";
import { remediationPlan } from "../lib/remediation.js";

function audit(checks, pages = []) {
  return {
    target: "https://example.com/",
    scannedAt: "2026-10-28T00:00:00Z",
    siteChecks: checks,
    pages,
    summary: { score: 80, passed: 0, warnings: checks.length, failed: 0, notTested: 0, pageTypes: {} }
  };
}
test("advisor prioritizes critical indexability, then schema and content", () => {
  const report = audit([], [{
    url: "https://example.com/produk/demo",
    pageType: "product",
    title: "Demo",
    checks: [
      { id: "readable-content", status: "warn", message: "Approx. 31 visible words" },
      { id: "product-schema", status: "warn", message: "Product.image missing" },
      { id: "indexability", status: "fail", message: "Page declares noindex" },
      { id: "title", status: "pass", message: "Title found" }
    ]
  }]);
  const plan = remediationPlan(report);
  assert.deepEqual(plan.issues.map((x) => x.rule), ["indexability", "product-schema", "readable-content"]);
  assert.equal(plan.counts.critical, 1);
  assert.equal(plan.counts.high, 1);
  assert.equal(plan.issues[1].category, "Structured data");
  assert.match(plan.issues[1].snippet, /REPLACE_WITH_REAL_PRICE/);
  assert.equal(plan.issues.some((x) => x.rule === "title"), false);
});
test("non-indexing and AI-citation checks are opportunities, not confirmed failures", () => {
  const plan = remediationPlan(audit([
    { id: "google-indexing", status: "not-tested", message: "Unavailable" },
    { id: "ai-visibility", status: "not-tested", message: "Unavailable" },
    { id: "javascript-rendering", status: "not-tested", message: "Unavailable" }
  ]));
  assert.equal(plan.issues.length, 0);
  assert.ok(plan.opportunities.some((x) => x.id === "gsc"));
  assert.ok(plan.opportunities.some((x) => x.id === "ai"));
  assert.ok(plan.opportunities.some((x) => x.id === "render"));
});
test("cross-domain canonical is a review suggestion, not an automatic wrong-domain fix", () => {
  const plan = remediationPlan(audit([], [{
    url: "https://example.com/item",
    pageType: "product",
    checks: [{ id: "canonical", status: "warn", message: "Cross-domain canonical; confirm primary domain", evidence: "https://primary.example.org/item" }]
  }]));
  assert.equal(plan.issues[0].priority, "low");
  assert.equal(plan.issues[0].snippet, "");
  assert.match(plan.issues[0].action, /Do not change intentional consolidation/);
});
test("copyable HTML templates escape source title and cannot inject arbitrary tags", () => {
  const report = audit([], [{
    url: "https://example.com/page",
    pageType: "other",
    title: 'Testing"><script>alert(1)</script>',
    checks: [{ id: "h1", status: "warn", message: "0 H1 heading(s)" }]
  }]);
  const snippet = remediationPlan(report).issues[0].snippet;
  assert.match(snippet, /&lt;script&gt;/);
  assert.ok(!snippet.includes("<script>"));
});
test("advisor generates cautious opportunities for sample limits", () => {
  const plan = remediationPlan(audit([]));
  assert.ok(plan.opportunities.some((item) => item.id === "sampling"));
});
