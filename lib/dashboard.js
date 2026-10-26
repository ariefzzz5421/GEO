export const MAX_HISTORY = 12;
export const MAX_FILE_BYTES = 2_000_000;
export const STATUSES = ["fail", "warn", "pass", "not-tested", "not-applicable"];

export function validateReport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid report object.");
  if (typeof data.target !== "string" || !/^https?:\/\//i.test(data.target)) throw new Error("Report must contain a valid target URL.");
  if (!Array.isArray(data.pages) || data.pages.length > 200) throw new Error("Invalid pages array or too many pages.");
  if (!data.summary || typeof data.summary !== "object" || !Array.isArray(data.siteChecks)) throw new Error("Missing audit summary or site checks.");
  if (data.siteChecks.length > 200) throw new Error("Too many site checks.");
  for (const page of data.pages) {
    if (!page || typeof page.url !== "string" || !Array.isArray(page.checks) || page.checks.length > 120) throw new Error("Invalid page entry.");
  }
  return data;
}

export function findings(report, statuses = ["fail", "warn"]) {
  if (!report) return [];
  return [
    ...(report.siteChecks ?? []).map((check) => ({ ...check, url: report.target, level: "site" })),
    ...(report.pages ?? []).flatMap((page) => (page.checks ?? []).map((check) => ({ ...check, url: page.url, level: "page" })))
  ].filter((check) => statuses.includes(check.status));
}

export function reportKey(report) {
  return [report.target, report.scannedAt || "", (report.pages || []).length].join("|");
}

export function rememberReport(history, report) {
  validateReport(report);
  const key = reportKey(report);
  return [report, ...history.filter((r) => reportKey(r) !== key)].slice(0, MAX_HISTORY);
}

function findingKey(item) { return [item.level, item.url, item.id].join("|"); }
export function compareReports(current, baseline) {
  if (!current || !baseline || new URL(current.target).hostname !== new URL(baseline.target).hostname) return null;
  const a = new Map(findings(current, STATUSES).map((x) => [findingKey(x), x]));
  const b = new Map(findings(baseline, STATUSES).map((x) => [findingKey(x), x]));
  const introduced = [];
  const resolved = [];
  for (const [key, curr] of a) {
    const prev = b.get(key);
    if (["fail", "warn"].includes(curr.status) && (!prev || !["fail", "warn"].includes(prev.status))) introduced.push(curr);
  }
  for (const [key, prev] of b) {
    const curr = a.get(key);
    if (["fail", "warn"].includes(prev.status) && curr && !["fail", "warn"].includes(curr.status)) resolved.push(prev);
  }
  return {
    scoreDelta: typeof current.summary.score === "number" && typeof baseline.summary.score === "number" ? current.summary.score - baseline.summary.score : null,
    introduced, resolved, comparedPages: new Set(current.pages.map((p) => p.url).filter((url) => baseline.pages.some((p) => p.url === url))).size
  };
}
