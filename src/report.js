const clean = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
export function renderReport(report, format = "markdown") {
  if (format === "json") return JSON.stringify(report, null, 2) + "\n";
  if (format !== "markdown") throw new Error("Format must be json or markdown.");
  const lines = [
    "# OpenGEO audit",
    "",
    "- Target: " + report.target,
    "- Scanned: " + report.scannedAt,
    "- Technical readiness (heuristic, NOT AI ranking): " + (report.summary.score ?? "N/A") + "/100",
    "- Evidence coverage: " + report.summary.coverage + "% (" + report.summary.notTested + " not tested; " + (report.summary.notApplicable ?? 0) + " not applicable)",
    "- Page sample: " + Object.entries(report.summary.pageTypes ?? {}).map(([type, count]) => type + "=" + count).join(", "),
    "- Checks: " + report.summary.checks + " (pass " + report.summary.passed + ", warn " + report.summary.warnings + ", fail " + report.summary.failed + ", not tested " + report.summary.notTested + ", not applicable " + (report.summary.notApplicable ?? 0) + ")",
    "",
    "## Site checks",
    "",
    "| Check | Result | Details | Suggested action |",
    "| --- | --- | --- | --- |"
  ];
  for (const finding of report.siteChecks) {
    lines.push("| " + clean(finding.id) + " | " + clean(finding.status) + " | " + clean(finding.message) + " | " + clean(finding.recommendation) + " |");
  }
  for (const page of report.pages) {
    if (page.rendering) lines.push("", "**Rendering:** initial " + page.rendering.initialWords + " words; browser " + page.rendering.renderedWords + " words; delta " + page.rendering.deltaWords + "; blocked requests " + page.rendering.blockedRequests + ".");
    lines.push("", "## " + page.url + " (" + (page.pageType ?? "other") + ")", "", "| Check | Result | Details | Suggested action |", "| --- | --- | --- | --- |");
    for (const finding of page.checks) {
      lines.push("| " + clean(finding.id) + " | " + clean(finding.status) + " | " + clean(finding.message) + " | " + clean(finding.recommendation) + " |");
    }
  }
  lines.push("", "## Important limitations", "", ...report.limitations.map((s) => "- " + s), "");
  return lines.join("\n");
}
