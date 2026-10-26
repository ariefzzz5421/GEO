#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { auditSite } from "../src/audit.js";
import { renderReport } from "../src/report.js";

const HELP = [
  "OpenGEO — evidence-based SEO and AI search readiness audit",
  "",
  "Usage:",
  "  opengeo <https://example.com> [--max-pages 5] [--verify-canonical] [--render-js --i-own-this-site] [--format markdown|json] [--output report.md]",
  "",
  "Limits: public IPv4 HTTP(S) only, max 20 pages, sequential requests.",
  "Scores measure deterministic on-page checks, NOT Google rankings or AI citations."
].join("\n");

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  let url;
  let maxPages = 5;
  let format = "markdown";
  let output;
  let verifyCanonical = false;
  let renderJs = false;
  let ownerAcknowledged = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === "--max-pages") {
      maxPages = Number(args[++i]);
    } else if (token === "--format") {
      format = args[++i];
    } else if (token === "--verify-canonical") {
      verifyCanonical = true;
    } else if (token === "--render-js") {
      renderJs = true;
    } else if (token === "--i-own-this-site") {
      ownerAcknowledged = true;
    } else if (token === "--output") {
      output = args[++i];
    } else if (!token.startsWith("-") && !url) {
      url = token;
    } else {
      throw new Error("Unknown or duplicate argument: " + token);
    }
  }
  if (!url) throw new Error("A public website URL is required. Run --help for usage.");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new Error("--max-pages must be 1..20.");
  if (!["markdown", "json"].includes(format)) throw new Error("--format must be markdown or json.");
  if (output !== undefined && (!output || output.startsWith("--"))) throw new Error("--output requires a file path.");
  if (renderJs && !ownerAcknowledged) throw new Error("--render-js requires --i-own-this-site and an isolated execution environment.");
  return { url, maxPages, format, output, verifyCanonical, renderJs, ownerAcknowledged };
}

export { parseArgs };

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(HELP); return; }
    const result = await auditSite(options.url, { maxPages: options.maxPages, verifyCanonical: options.verifyCanonical, renderJs: options.renderJs, ownerAcknowledged: options.ownerAcknowledged });
    const data = renderReport(result, options.format);
    if (options.output) {
      await writeFile(options.output, data, { encoding: "utf8" });
      console.error("Report saved: " + options.output);
    } else {
      process.stdout.write(data);
    }
  } catch (error) {
    console.error("Audit error: " + error.message);
    process.exitCode = 1;
  }
}
if (process.argv[1] && new URL("file://" + process.argv[1]).pathname === new URL(import.meta.url).pathname) {
  main();
}
