"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareReports, findings, MAX_FILE_BYTES, rememberReport, reportKey, validateReport } from "../lib/dashboard.js";

const START_URL = "https://www.msbproject.my.id";
const NAV = [
  { id: "overview", icon: "◈", label: "Overview" },
  { id: "findings", icon: "⌕", label: "Findings" },
  { id: "pages", icon: "▦", label: "Pages" },
  { id: "history", icon: "◷", label: "History" }
];
const STATUS_LABELS = {
  pass: "Passed", warn: "Warning", fail: "Failed",
  "not-tested": "Not tested", "not-applicable": "Not applicable"
};
const types = ["all", "category", "article", "product", "other"];
function safeDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unknown date";
}
function shortUrl(url) {
  try { const u = new URL(url); return u.pathname === "/" ? "Homepage" : decodeURIComponent(u.pathname.replace(/^\//, "")); }
  catch { return url; }
}
function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "opengeo-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function StatusPill({ status }) { return <span className={"pill status-" + status}>{STATUS_LABELS[status] || status}</span>; }
function Metric({ label, value, hint, tone }) {
  return <div className="metric"><div className="metric-label">{label}</div><div className={"metric-value " + (tone || "")}>{value}</div><div className="metric-hint">{hint}</div></div>;
}
function Empty({ title, detail }) {
  return <div className="empty-state"><div className="empty-spark">✧</div><strong>{title}</strong><p>{detail}</p></div>;
}
function IssueRow({ finding }) {
  return <div className="issue-row"><div className="issue-main">
    <StatusPill status={finding.status}/>
    <div className="issue-content"><strong>{finding.id?.replaceAll("-", " ")}</strong><p>{finding.message}</p><div className="issue-url" title={finding.url}>{finding.url}</div>
    {finding.recommendation && <div className="recommendation"><span>↳</span> {finding.recommendation}</div>}</div>
  </div></div>;
}
export default function Dashboard() {
  const [view, setView] = useState("overview");
  const [url, setUrl] = useState(START_URL);
  const [maxPages, setMaxPages] = useState("3");
  const [accessKey, setAccessKey] = useState("");
  const [reports, setReports] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState("");
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("problems");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const inputFile = useRef(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("opengeo-history-v04") || "[]");
      if (Array.isArray(stored)) {
        const validated = stored.slice(0, 12).filter((r) => { try { validateReport(r); return true; } catch { return false; } });
        setReports(validated);
        if (validated.length) setSelected(reportKey(validated[0]));
      }
    } catch { /* corrupt local cache: use empty state */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      const slim = reports.map((r) => ({ ...r, pages: r.pages.map((p) => ({ ...p, links: [] })) }));
      localStorage.setItem("opengeo-history-v04", JSON.stringify(slim));
    } catch {
      setMessage("Browser storage is full. Export JSON to preserve your audit history.");
    }
  }, [reports, hydrated]);

  const current = useMemo(() => reports.find((r) => reportKey(r) === selected) || reports[0] || null, [reports, selected]);
  const otherReports = useMemo(() => reports.filter((r) => r !== current && current && new URL(r.target).hostname === new URL(current.target).hostname), [reports, current]);
  const compared = useMemo(() => compareReports(current, reports.find((r) => reportKey(r) === baseline) || otherReports[0]), [current, reports, baseline, otherReports]);
  const allFindings = useMemo(() => findings(current, ["fail", "warn", "pass", "not-tested", "not-applicable"]), [current]);
  const issueList = useMemo(() => {
    const allowed = statusFilter === "problems" ? ["fail", "warn"] : statusFilter === "all" ? ["fail", "warn", "pass", "not-tested", "not-applicable"] : [statusFilter];
    return allFindings.filter((f) => allowed.includes(f.status) && (f.id + f.message + f.url).toLowerCase().includes(search.toLowerCase()));
  }, [allFindings, statusFilter, search]);
  const filteredPages = useMemo(() => (current?.pages || []).filter((p) =>
    (typeFilter === "all" || p.pageType === typeFilter) && (p.url + p.title).toLowerCase().includes(search.toLowerCase())
  ), [current, typeFilter, search]);
  const summary = current?.summary;
  function remember(data) {
    const report = validateReport(data);
    setReports((prev) => rememberReport(prev, report));
    setSelected(reportKey(report));
    setView("overview");
    setSearch("");
    setMessage("Report added. History is stored in this browser only.");
  }
  async function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("File exceeds 2 MB. Use a smaller CLI report.");
      const json = JSON.parse(await file.text());
      remember(json);
    } catch (error) { setMessage("Import failed: " + error.message); }
    event.target.value = "";
  }
  async function scan(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/audit", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", ...(accessKey ? { "x-opengeo-key": accessKey } : {}) },
        body: JSON.stringify({ url: url.trim(), maxPages: Number(maxPages) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server audit failed.");
      remember(data);
    } catch (error) { setMessage(error.message + " You can always import a CLI JSON report."); }
    finally { setBusy(false); }
  }
  function clearHistory() {
    if (!window.confirm("Clear all locally stored OpenGEO audit history? Export reports first if you need them.")) return;
    setReports([]); setSelected(""); setBaseline(""); setMessage("Local history cleared.");
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">◈</div><div><div className="brand-name">OPEN<span>GEO</span></div><div className="brand-meta">INTELLIGENCE CONSOLE</div></div></div>
      <div className="side-section">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV.map((item) => <button type="button" key={item.id} className={"nav-btn " + (view === item.id ? "active" : "")} onClick={() => { setView(item.id); setSearch(""); }}>
          <span className="nav-icon">{item.icon}</span>{item.label}{item.id === "history" && <span className="nav-count">{reports.length}</span>}
        </button>)}
      </nav>
      <div className="side-section section-gap">ENGINE</div>
      <div className="engine-card"><span className="status-dot"/><div><strong>Core engine online</strong><small>OpenGEO CLI v0.4</small></div></div>
      <div className="sidebar-bottom"><div className="sidebar-separator"/><div className="side-mini">LOCAL-FIRST ANALYTICS</div><p>Audit snapshots stay in your browser. No analytics tracking or hosted report database.</p><a href="https://github.com/ariefzzz5421/GEO" rel="noreferrer" target="_blank">GitHub repository ↗</a></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="chevron">/</span><strong>{NAV.find((n) => n.id === view)?.label}</strong></div><div className="top-right"><span className="top-live"><i/> AUDIT ENGINE V0.4</span><span className="avatar">OG</span></div></header>
      <div className="content">
        <div className="heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/> WEBSITE INTELLIGENCE</div><h1>{view === "overview" ? "Search Visibility Overview" : view === "findings" ? "Audit Findings" : view === "pages" ? "Page Explorer" : "Scan History"}</h1><p className="lead">Evidence-based technical search readiness. Not a prediction of search rankings or AI citations.</p></div><button className="button-ghost" onClick={() => inputFile.current?.click()} type="button">↑ Import JSON</button></div>
        <input aria-label="Import OpenGEO JSON report" type="file" accept="application/json,.json" className="sr-only" ref={inputFile} onChange={importJson}/>
        <section className="scan-panel" aria-label="Start a new audit">
          <div className="panel-title"><span className="pulse-icon">⌕</span><div><strong>Run website audit</strong><small>Scan permitted hostnames, or import any OpenGEO JSON report</small></div><span className="scan-kicker">SAFE MODE</span></div>
          <form className="scan-form" onSubmit={scan}><div className="input-main"><span>◎</span><input value={url} onChange={(e) => setUrl(e.target.value)} required type="url" placeholder="https://your-site.com" aria-label="Website URL"/></div><select aria-label="Maximum pages" value={maxPages} onChange={(e) => setMaxPages(e.target.value)}><option value="1">1 page</option><option value="3">3 pages</option><option value="5">5 pages</option></select><button type="submit" className="button-primary" disabled={busy}>{busy ? "Scanning…" : "Run audit ↗"}</button></form>
          <details className="advanced"><summary>Server access settings <span>↗</span></summary><p>Live scans require a configured <code>OPEN_GEO_ALLOWED_HOSTS</code> and, in production, an API key. Imports always work without credentials.</p><input aria-label="Audit API key" type="password" placeholder="Private audit access key (not saved)" autoComplete="off" value={accessKey} onChange={(e) => setAccessKey(e.target.value)}/></details>
        </section>
        {message && <div className="notice" role="status"><span>ⓘ</span>{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">×</button></div>}
        {current ? <>
          <div className="report-bar"><div><span className="report-label">ACTIVE REPORT</span><strong title={current.target}>{new URL(current.target).hostname}</strong><small>{safeDate(current.scannedAt)} · {current.pages.length} pages scanned</small></div><div className="report-actions"><select aria-label="Choose report" value={reportKey(current)} onChange={(e) => setSelected(e.target.value)}>{reports.map((r) => <option key={reportKey(r)} value={reportKey(r)}>{new URL(r.target).hostname} · {safeDate(r.scannedAt)}</option>)}</select><button className="button-outline" type="button" onClick={() => downloadJson(current)}>↓ Export</button></div></div>
          {view === "overview" && <>
            <div className="metric-grid"><Metric label="TECHNICAL READINESS" value={summary?.score == null ? "—" : summary.score + "/100"} hint="Heuristic checks, not AI rankings" tone="accent-text"/><Metric label="EVIDENCE COVERAGE" value={(summary?.coverage ?? 0) + "%"} hint="Excludes not-applicable checks"/><Metric label="PAGES ANALYZED" value={current.pages.length} hint="Across site categories"/><Metric label="NEEDS ATTENTION" value={(summary?.warnings || 0) + (summary?.failed || 0)} hint={(summary?.failed || 0) + " failed · " + (summary?.warnings || 0) + " warnings"} tone={(summary?.failed || 0) ? "danger-text" : ""}/></div>
            <div className="overview-grid">
              <section className="panel score-panel"><div className="panel-heading"><div><div className="overline">AUDIT HEALTH</div><h2>Check distribution</h2></div><span className="subtle-badge">{summary?.checks} checks</span></div>
                <div className="score-body"><div className="donut" style={{ "--donut-score": (summary?.coverage ?? 0) + "%" }}><div><strong>{summary?.coverage ?? 0}%</strong><small>coverage</small></div></div><div className="legend">{[["pass", summary?.passed],["warn",summary?.warnings],["fail",summary?.failed],["not-tested",summary?.notTested],["not-applicable",summary?.notApplicable]].map(([status,count])=><div key={status}><span className={"legend-dot status-bg-"+status}/><span>{STATUS_LABELS[status]}</span><strong>{count || 0}</strong></div>)}</div></div>
              </section>
              <section className="panel distribution-panel"><div className="panel-heading"><div><div className="overline">CRAWL STRUCTURE</div><h2>Page type distribution</h2></div></div>
                <div className="bars">{["category","article","product","other"].map((type) => {const count=summary?.pageTypes?.[type] || 0;return <div key={type} className="bar-row"><div><span>{type}</span><strong>{count}</strong></div><div className="bar-track"><div className={"bar-fill bar-"+type} style={{width: (current.pages.length ? (count / current.pages.length * 100) : 0) + "%"}}/></div></div>;})}</div><p className="panel-foot">Classification uses detected schema and URL/content hints.</p>
              </section>
            </div>
            <div className="overview-grid">
              <section className="panel attention-panel"><div className="panel-heading"><div><div className="overline">PRIORITY QUEUE</div><h2>Findings to review</h2></div><button className="text-action" onClick={()=>setView("findings")}>View all ↗</button></div>
                {findings(current).length ? findings(current).slice(0,4).map((f,i)=><IssueRow finding={f} key={i}/>) : <Empty title="No warnings or failures detected" detail="This does not confirm indexing or AI citation visibility."/>}
              </section>
              <section className="panel history-panel"><div className="panel-heading"><div><div className="overline">COMPARE SNAPSHOTS</div><h2>Change since last scan</h2></div>{otherReports.length > 0 && <select className="compare-select" aria-label="Compare against report" value={baseline || reportKey(otherReports[0])} onChange={(e)=>setBaseline(e.target.value)}>{otherReports.map((r)=><option value={reportKey(r)} key={reportKey(r)}>{safeDate(r.scannedAt)}</option>)}</select>}</div>
                {compared ? <><div className="diff-number">{compared.scoreDelta == null ? "—" : (compared.scoreDelta > 0 ? "+" : "") + compared.scoreDelta}<small> score points</small></div><div className="diff-grid"><div><strong className="bad-number">{compared.introduced.length}</strong><small>New findings</small></div><div><strong className="good-number">{compared.resolved.length}</strong><small>Resolved</small></div></div><p className="panel-foot">Compared across {compared.comparedPages} shared page URLs. Missing pages are not treated as resolved.</p></> : <Empty title="No comparison yet" detail="Run or import another audit of this domain to see differences over time."/>}
              </section>
            </div>
          </>}
          {view === "findings" && <section className="panel full-panel"><div className="toolbar"><div className="filter-tabs">{[["problems","Issues"],["fail","Failed"],["warn","Warnings"],["not-tested","Not tested"],["not-applicable","N/A"],["all","All"]].map(([value,label])=><button key={value} className={statusFilter===value?"chosen":""} onClick={()=>setStatusFilter(value)}>{label}</button>)}</div><input aria-label="Search findings" className="search-input" placeholder="Search findings…" value={search} onChange={(e)=>setSearch(e.target.value)}/></div><div className="list-count">{issueList.length} finding(s)</div>{issueList.length ? issueList.map((f,i)=><IssueRow key={i} finding={f}/>) : <Empty title="Nothing matches this filter" detail="Choose another status or clear the search field."/>}</section>}
          {view === "pages" && <section className="panel full-panel"><div className="toolbar"><div className="filter-tabs">{types.map((value)=><button key={value} className={typeFilter===value?"chosen":""} onClick={()=>setTypeFilter(value)}>{value === "all"?"All pages":value}</button>)}</div><input aria-label="Search pages" className="search-input" placeholder="Find URL or title…" value={search} onChange={(e)=>setSearch(e.target.value)}/></div><div className="table-wrap"><table><thead><tr><th>PAGE</th><th>TYPE</th><th>WORDS</th><th>ISSUES</th><th>CHECKS</th></tr></thead><tbody>{filteredPages.map((p,i)=>{const problems=p.checks.filter((x)=>["fail","warn"].includes(x.status)).length;return <tr key={p.url+i}><td><a href={p.url} target="_blank" rel="noopener noreferrer" title={p.url}>{p.title || shortUrl(p.url)} ↗</a><small>{shortUrl(p.url)}</small></td><td><span className="type-badge">{p.pageType || "other"}</span></td><td>{p.words ?? "—"}</td><td><span className={problems?"bad-number":"good-number"}>{problems}</span></td><td>{p.checks.length}</td></tr>})}</tbody></table></div>{!filteredPages.length&&<Empty title="No pages found" detail="Change your search term or page type filter."/>}</section>}
          {view === "history" && <section className="panel full-panel"><div className="panel-heading"><div><div className="overline">THIS DEVICE ONLY</div><h2>Saved audit snapshots</h2></div><button className="text-action danger-text" onClick={clearHistory}>Clear local history</button></div><div className="history-list">{reports.map((r)=><div className="history-row" key={reportKey(r)}><div className="history-indicator"/><div><strong>{new URL(r.target).hostname}</strong><p>{safeDate(r.scannedAt)} · {r.pages.length} pages · {r.summary?.warnings || 0} warnings</p></div><div className="history-score">{r.summary?.score ?? "—"}/100</div><button className="button-outline" onClick={()=>{setSelected(reportKey(r));setView("overview");}}>Open ↗</button></div>)}</div></section>}
        </> : <section className="panel welcome-panel"><div className="welcome-graphic"><span>◈</span><i/></div><div className="overline">GET STARTED</div><h2>Your search intelligence workspace is ready.</h2><p>Run an authorized website audit or import a JSON report generated with <code>node bin/geo.js</code>. The dashboard will organize checks, page types and trends into a readable workspace.</p><button className="button-primary" onClick={()=>inputFile.current?.click()}>↑ Import your first report</button></section>}
        <footer className="footer"><span>OPEN<span className="accent-text">GEO</span> STUDIO <span className="footer-divider">/</span> v0.4.0</span><span>Evidence over estimates · Open source · MIT</span></footer>
      </div>
    </main>
  </div>;
}
