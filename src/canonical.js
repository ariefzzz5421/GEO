import { validateUrl, isSameSite } from "./network.js";

export function inspectCanonical(value, pageUrl) {
  if (!value) return { status: "warn", message: "Canonical is missing", target: null, external: false, recommendation: "Declare the preferred URL where appropriate." };
  let target;
  try { target = validateUrl(new URL(value, pageUrl).toString()); }
  catch {
    return { status: "fail", message: "Canonical URL is invalid or unsafe to fetch", target: null, external: false, recommendation: "Use a valid absolute public HTTP(S) canonical URL." };
  }
  const page = new URL(pageUrl);
  const external = !isSameSite(target, page);
  if (external) {
    return { status: "warn", message: "Cross-domain canonical; confirm primary domain and page equivalence", target: target.toString(), external, recommendation: "Confirm this URL is the intended canonical, exists and serves equivalent content. Cross-domain is not inherently an error." };
  }
  if (target.pathname !== page.pathname) {
    return { status: "warn", message: "Canonical path differs from audited page", target: target.toString(), external, recommendation: "Verify consolidation is intentional and content equivalent." };
  }
  if (target.protocol !== page.protocol) {
    return { status: "warn", message: "Canonical protocol differs from audited page", target: target.toString(), external, recommendation: "Use the preferred secure canonical URL and verify redirects." };
  }
  return { status: "pass", message: "Canonical points to same-site equivalent path (not live-verified)", target: target.toString(), external, recommendation: "Confirm Google-selected canonical using Search Console." };
}
