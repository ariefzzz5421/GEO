import { fetchPublic, isSameSite, validateUrl } from "./network.js";
import { isRobotAllowed } from "./robots.js";

const ALLOWED_TYPES = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
const MAX_REQUESTS_PER_PAGE = 35;

// Render only a website the caller owns, in an isolated environment.
// Browser network traffic is intercepted and all allowed HTTP requests pass
// through the same DNS-pinned public-IPv4 requester as the CLI crawler.
// External CDNs and images are blocked: this is an approximation, not a
// pixel-perfect rendering or Google's JavaScript renderer.
export async function createBrowserRenderer({ fetcher = fetchPublic, getRobots } = {}) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error('Optional renderer requires Playwright. Run: npm install --no-save playwright && npx playwright install chromium');
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    throw new Error("Could not launch Chromium. Install with: npx playwright install chromium. Details: " + error.message);
  }

  return {
    async render({ url, html }) {
      const root = validateUrl(url);
      const context = await browser.newContext({
        serviceWorkers: "block",
        acceptDownloads: false,
        javaScriptEnabled: true
      });
      // Prevent the most common connection types not covered by HTTP routing.
      if (typeof context.routeWebSocket === "function") {
        await context.routeWebSocket("**/*", (socket) => socket.close());
      }
      await context.addInitScript(() => {
        try { Object.defineProperty(window, "WebSocket", { value: class BlockedWebSocket { constructor() { throw new Error("WebSocket disabled during audit"); } } }); } catch { /* best effort */ }
        try { Object.defineProperty(window, "EventSource", { value: class BlockedEventSource { constructor() { throw new Error("EventSource disabled during audit"); } } }); } catch { /* best effort */ }
        try { navigator.sendBeacon = () => false; } catch { /* best effort */ }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8_000);
      page.setDefaultNavigationTimeout(12_000);
      let total = 0;
      let blocked = 0;
      try {
        await context.route("**/*", async (route) => {
          const request = route.request();
          const requested = request.url();
          try {
            // Any outbound request must be same site, HTTP(S), and pass
            // URL / DNS restrictions enforced by fetchPublic.
            const target = validateUrl(requested);
            if (!ALLOWED_TYPES.has(request.resourceType()) || !isSameSite(target, root) || total++ >= MAX_REQUESTS_PER_PAGE) {
              blocked++; await route.abort(); return;
            }
            if (getRobots && !isRobotAllowed(await getRobots(target.origin), target)) {
              blocked++; await route.abort(); return;
            }
            // The main HTML was already fetched by auditSite; don't refetch.
            if (request.isNavigationRequest() && target.href === root.href) {
              await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
              return;
            }
            if (!["GET", "HEAD"].includes(request.method())) {
              blocked++; await route.abort(); return;
            }
            const result = await fetcher(target.href, { maxBytes: 750_000 });
            if (result.status !== 200) {
              await route.fulfill({ status: result.status >= 400 && result.status <= 599 ? result.status : 502, body: "" });
              return;
            }
            const type = String(result.headers["content-type"] ?? "text/plain").split(";")[0];
            await route.fulfill({ status: 200, contentType: type, body: result.body });
          } catch {
            blocked++;
            try { await route.abort(); } catch { /* request already settled */ }
          }
        });
        await page.goto(root.href, { waitUntil: "domcontentloaded", timeout: 12_000 });
        // Only a short bounded window for client-side rendering; no networkidle
        // as many sites have permanent polling connections.
        await page.waitForTimeout(900);
        const renderedHtml = await page.content();
        return { html: renderedHtml, blockedRequests: blocked };
      } finally {
        await context.close();
      }
    },
    async close() { await browser.close(); }
  };
}
