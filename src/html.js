import { inspectCanonical } from "./canonical.js";
import { analyzeSchemaBlocks } from "./schema.js";
import { isSameSite } from "./network.js";

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, code) => {
    const v = code.toLowerCase();
    const known = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (known[v]) return known[v];
    if (v.startsWith("#")) {
      const num = v.startsWith("#x") ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10);
      return num > 0 && num <= 0x10ffff && !(num >= 0xd800 && num <= 0xdfff) ? String.fromCodePoint(num) : whole;
    }
    return whole;
  });
}

function stripTags(s) { return decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim(); }

function attrs(tag) {
  const values = {};
  const head = tag.replace(/^<\s*\/?\s*[^\s>]+/, "").replace(/\/?>\s*$/, "");
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;
  for (const match of head.matchAll(re)) values[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  return values;
}

function findTags(html, name) {
  const expression = new RegExp("<" + name + "(?=[\\s/>])[^>]*>", "gi");
  return [...html.matchAll(expression)].map((m) => attrs(m[0]));
}
function firstMatch(html, pattern) { return stripTags(pattern.exec(html)?.[1] ?? ""); }

export function analyzeHtml(html, pageUrl, headers = {}) {
  const url = new URL(pageUrl);
  const checks = [];
  const add = (id, status, message, fix = "", evidence = "") => checks.push({ id, status, message, recommendation: fix, evidence });
  const title = firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const description = findTags(html, "meta").find((a) => a.name?.toLowerCase() === "description")?.content?.trim() ?? "";
  const canonical = findTags(html, "link").find((a) => a.rel?.toLowerCase().split(/\s+/).includes("canonical"))?.href ?? "";
  const lang = findTags(html, "html")[0]?.lang ?? "";
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map((m) => stripTags(m[1]));
  const robots = findTags(html, "meta").filter((a) => ["robots", "googlebot"].includes(a.name?.toLowerCase())).map((a) => a.content).join(",");
  const xrobots = String(headers["x-robots-tag"] ?? "");
  const noindex = /\bnoindex\b/i.test(robots + "," + xrobots);
  add("indexability", noindex ? "fail" : "pass", noindex ? "Page declares noindex" : "No explicit noindex found", noindex ? "Remove noindex only when this page should be public." : "", (robots + "," + xrobots).replace(/^,+|,+$/g, ""));
  add("title", !title ? "fail" : title.length < 10 || title.length > 70 ? "warn" : "pass", title ? "Title found (" + title.length + " characters)" : "Missing title", "Use a unique, descriptive page title.", title);
  add("description", !description ? "warn" : "pass", description ? "Meta description found" : "Missing meta description", "Provide a concise, accurate page summary.", description.slice(0, 180));
  add("h1", h1.length === 1 ? "pass" : "warn", h1.length + " H1 heading(s)", "Use one clear primary heading for important public pages.", h1.join(" | ").slice(0, 200));
  add("lang", lang ? "pass" : "warn", lang ? "HTML language: " + lang : "Missing HTML lang attribute", "Declare the content language on the html element.");
  const canonicalInfo = inspectCanonical(canonical, pageUrl);
  add("canonical", canonicalInfo.status, canonicalInfo.message, canonicalInfo.recommendation, canonicalInfo.target ?? canonical);
  const images = findTags(html, "img");
  const missingAlt = images.filter((img) => !Object.hasOwn(img, "alt")).length;
  add("image-alt", !images.length ? "not-tested" : missingAlt ? "warn" : "pass", images.length ? images.length + " image(s); " + missingAlt + " missing alt attribute" : "No HTML img tags found (cannot assess image alt text)", "Provide meaningful alt text for informative images, or alt=\"\" for decorative images.");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const ld = scripts.filter((m) => attrs("<script " + m[1] + ">").type?.toLowerCase() === "application/ld+json");
  const schema = analyzeSchemaBlocks(ld.map((m) => m[2]));
  for (const result of schema.checks) checks.push(result);
  add("structured-data", schema.invalid ? "fail" : ld.length ? "pass" : "not-tested",
    schema.invalid ? schema.invalid + " invalid JSON-LD block(s)" : ld.length ? ld.length + " JSON-LD block(s) found" : "No JSON-LD structured data detected",
    "Only add schema where it accurately describes visible content.", schema.jsonLdTypes.join(", "));
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(html)?.[1] ?? /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)?.[1] ?? html;
  const clean = main.replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const words = stripTags(clean).split(/\s+/).filter(Boolean).length;
  add("readable-content", words < 80 ? "warn" : "pass", "Approx. " + words + " visible text word(s)", "Make important information accessible in HTML; explain products/services with original, verifiable facts.");
  const links = [];
  for (const anchor of findTags(html, "a")) {
    if (!anchor.href || /^(mailto:|tel:|javascript:|#)/i.test(anchor.href)) continue;
    try {
      const link = new URL(anchor.href, url);
      if (!isSameSite(link, url)) continue;
      link.hash = "";
      link.search = "";
      if (/\.(pdf|zip|png|jpe?g|webp|gif|svg|css|js|xml|json|ico)$/i.test(link.pathname)) continue;
      links.push(link.toString());
    } catch { /* ignore malformed links */ }
  }
  return { url: pageUrl, title, description, lang, canonical, canonicalInfo, words, jsonLdTypes: schema.jsonLdTypes, checks, links: [...new Set(links)] };
}
