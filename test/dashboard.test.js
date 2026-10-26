import test from "node:test";
import assert from "node:assert/strict";
import { compareReports, findings, MAX_HISTORY, rememberReport, reportKey, validateReport } from "../lib/dashboard.js";

function makeReport(time, status = "warn", extra = {}) {
  return {
    target: "https://example.com/", scannedAt: time,
    siteChecks: [],
    pages: [{ url: "https://example.com/", pageType: "other", checks: [
      { id: "readable-content", status, message: "Summary", recommendation: "Review content" }
    ], links: [] }],
    summary: { score: status === "pass" ? 98 : 92, passed: status === "pass" ? 1 : 0,
      warnings: status === "warn" ? 1 : 0, failed: 0, notTested: 0, notApplicable: 0, coverage: 100 },
    ...extra
  };
}
test("report import rejects missing structure and executable URL schemes", () => {
  assert.throws(() => validateReport({ target: "javascript:alert(1)", pages: [], siteChecks: [], summary: {} }), /valid target/);
  assert.throws(() => validateReport({ target: "https://example.com", pages: [null], siteChecks: [], summary: {} }), /Invalid page/);
  assert.throws(() => validateReport({ target: "https://example.com", pages: [], siteChecks: null, summary: {} }), /Missing/);
});
test("history deduplicates and caps at MAX_HISTORY", () => {
  let list = [];
  for (let i = 0; i < 20; i++) list = rememberReport(list, makeReport("2026-10-" + String(i + 1).padStart(2, "0")));
  assert.equal(list.length, MAX_HISTORY);
  const inserted = makeReport("2026-10-20");
  assert.equal(rememberReport(list, inserted).length, MAX_HISTORY);
  assert.equal(rememberReport(list, inserted)[0], inserted);
  assert.ok(reportKey(inserted).includes("2026-10-20"));
});
test("findings includes site and per-page checks by severity", () => {
  const r = makeReport("2026-10-01");
  r.siteChecks.push({ id: "sitemap", status: "fail", message: "Missing" });
  assert.equal(findings(r).length, 2);
  assert.equal(findings(r, ["warn"]).length, 1);
});
test("diff reports newly introduced and resolved problems on shared pages", () => {
  const before = makeReport("2026-10-01", "warn");
  const after = makeReport("2026-10-02", "pass");
  const comparison = compareReports(after, before);
  assert.equal(comparison.scoreDelta, 6);
  assert.equal(comparison.introduced.length, 0);
  assert.equal(comparison.resolved.length, 1);
  assert.equal(comparison.comparedPages, 1);
});
test("diff does not falsely resolve issues from pages omitted in the new crawl", () => {
  const before = makeReport("2026-10-01", "warn");
  const after = makeReport("2026-10-02", "pass", { pages: [] });
  assert.equal(compareReports(after, before).resolved.length, 0);
  assert.equal(compareReports(makeReport("2026-10-02", "pass", {target: "https://another.example.net/"}),before),null);
});
