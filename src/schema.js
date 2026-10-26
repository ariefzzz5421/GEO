// This intentionally checks a small set of useful Product/Offer properties.
// It is NOT Google's Rich Results Test nor a complete Schema.org validator.
const hasText = (x) => typeof x === "string" ? x.trim().length > 0 : typeof x === "number" ? Number.isFinite(x) : Array.isArray(x) ? x.some(hasText) : Boolean(x && typeof x === "object" && (hasText(x.url) || hasText(x.contentUrl)));
const types = (node) => (Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]]).filter(Boolean);
function walk(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return [];
  if (Array.isArray(node)) return node.flatMap((x) => walk(x, depth + 1));
  const result = [node];
  if (Array.isArray(node["@graph"])) result.push(...walk(node["@graph"], depth + 1));
  return result;
}
export function analyzeSchemaBlocks(blocks) {
  const nodes = [];
  let invalid = 0;
  for (const block of blocks) {
    try { nodes.push(...walk(JSON.parse(block))); }
    catch { invalid++; }
  }
  const jsonLdTypes = [...new Set(nodes.flatMap(types))];
  const checks = [];
  if (invalid) checks.push({ id: "schema-syntax", status: "fail", message: invalid + " invalid JSON-LD block(s)", recommendation: "Fix JSON parsing errors in JSON-LD.", evidence: String(invalid) });
  else checks.push({ id: "schema-syntax", status: blocks.length ? "pass" : "not-tested", message: blocks.length ? blocks.length + " valid JSON-LD block(s)" : "No JSON-LD found; optional for many page types", recommendation: "Only add relevant schema reflecting visible content.", evidence: jsonLdTypes.join(", ") });
  const products = nodes.filter((n) => types(n).includes("Product"));
  if (products.length) {
    const issues = [];
    for (const p of products) {
      if (!hasText(p.name)) issues.push("Product.name");
      if (!hasText(p.image) && !(Array.isArray(p.image) && p.image.length)) issues.push("Product.image");
      if (!p.offers && !p.aggregateRating && !p.review) issues.push("Product.offers / aggregateRating / review");
      if (p.offers) {
        const offers = Array.isArray(p.offers) ? p.offers : [p.offers];
        for (const offer of offers) {
          if (!offer || typeof offer !== "object") continue;
          if (types(offer).includes("Offer")) {
            if (!hasText(offer.price) && !hasText(offer.priceSpecification?.price)) issues.push("Offer.price");
            if (!hasText(offer.priceCurrency) && !hasText(offer.priceSpecification?.priceCurrency)) issues.push("Offer.priceCurrency");
          }
        }
      }
    }
    checks.push({
      id: "product-schema",
      status: issues.length ? "warn" : "pass",
      message: issues.length ? "Product schema missing common merchant fields: " + [...new Set(issues)].join(", ") : "Product nodes include basic identifying and offer/review properties",
      recommendation: "Match schema to visible product facts; validate eligible rich-result requirements separately with Google tooling.",
      evidence: products.length + " Product node(s)"
    });
  } else {
    checks.push({ id: "product-schema", status: "not-tested", message: "No Product JSON-LD found on this page", recommendation: "Only product detail pages normally need Product schema.", evidence: "" });
  }
  return { jsonLdTypes, checks, invalid };
}
