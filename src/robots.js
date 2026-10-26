// Small, conservative robots.txt evaluator for the OpenGEOAudit user agent.
// Does not implement crawl-delay; the CLI intentionally crawls sequentially.
const AGENT = "opengeoaudit";

export function parseRobots(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  let hasRules = false;
  function flush() {
    if (agents.length) groups.push({ agents, rules });
    agents = [];
    rules = [];
    hasRules = false;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "user-agent") {
      if (hasRules) flush();
      agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && agents.length) {
      hasRules = true;
      if (value) rules.push({ type: key, pattern: value });
    }
  }
  flush();
  return groups;
}

function patternMatches(pattern, path) {
  const anchored = pattern.endsWith("$");
  const raw = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = raw.split("*").map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*");
  return new RegExp("^" + escaped + (anchored ? "$" : "")).test(path);
}

export function isRobotAllowed(text, targetUrl) {
  const groups = parseRobots(text);
  const exact = groups.filter((g) => g.agents.some((a) => AGENT.startsWith(a) && a !== "*"));
  const selected = exact.length ? exact : groups.filter((g) => g.agents.includes("*"));
  const path = targetUrl.pathname + targetUrl.search;
  let winning = null;
  for (const group of selected) {
    for (const rule of group.rules) {
      if (!patternMatches(rule.pattern, path)) continue;
      const specificity = rule.pattern.replace(/\*/g, "").replace(/\$$/, "").length;
      if (!winning || specificity > winning.specificity || (specificity === winning.specificity && rule.type === "allow")) {
        winning = { type: rule.type, specificity };
      }
    }
  }
  return winning?.type !== "disallow";
}
