const clean = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
export function renderReport(report, format = "markdown") {
  if (format === "json") return JSON.stringify(report, null, 2) + "\n";
  if (format !== "markdown") throw new Error("Format must be json or markdown.");
  const lines = [
    "# OpenGEO audit",
    "",
    "- Target: " + report.target,
    "- Scanned: " + report.scannedAt,
    "- Readiness score (heuristic, NOT AI ranking): " + (report.summary.score ?? "N/A") + "/100",
    "- Checks: " + report.summary.checks + " (pass " + report.summary.passed + ", warn " + report.summary.warnings + ", fail " + report.summary.failed + ")",
    "",
    "## Site checks",
    "",
    "| Check | Result | Details |",
    "| --- | --- | --- |"
  ];
  for (const finding of report.siteChecks) {
    lines.push("| " + clean(finding.id) + " | " + clean(finding.status) + " | " + clean(finding.message) + " |");
  }
  for (const page of report.pages) {
    lines.push("", "## " + page.url, "", "| Check | Result | Details | Suggested action |", "| --- | --- | --- | --- |");
    for (const finding of page.checks) {
      lines.push("| " + clean(finding.id) + " | " + clean(finding.status) + " | " + clean(finding.message) + " | " + clean(finding.recommendation) + " |");
    }
  }
  lines.push("", "## Important limitations", "", ...report.limitations.map((s) => "- " + s), "");
  return lines.join("\n");
}
