// Pulls league data from the Fantrax REST API into ./data/*.json
// Requires Node 18+ (built-in fetch). No dependencies.
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const LEAGUE_ID = process.env.FANTRAX_LEAGUE_ID || "j3rxu8e0mhspuuim";
const BASE = "https://www.fantrax.com/fxea/general";
// Fantrax rejects requests with no User-Agent (HTTP 403, error 1010)
const HEADERS = { "User-Agent": "DynastyHub/1.0", Accept: "application/json" };

const ENDPOINTS = {
  leagueInfo: "getLeagueInfo",
  standings: "getStandings",
  matchups: "getMatchupScores", // current scoring period by default
  rosters: "getTeamRosters",    // current period by default
  draftPicks: "getDraftPicks",
  draftResults: "getDraftResults",
  playerIds: "getPlayerIds?sport=MLB", // maps Fantrax player IDs to names
};

await mkdir("data", { recursive: true });
const meta = { updatedAt: new Date().toISOString(), leagueId: LEAGUE_ID, ok: {}, errors: {} };

for (const [name, path] of Object.entries(ENDPOINTS)) {
  const url = path.includes("?") ? `${BASE}/${path}` : `${BASE}/${path}?leagueId=${LEAGUE_ID}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    await writeFile(`data/${name}.json`, JSON.stringify(json, null, 1));
    meta.ok[name] = true;
    console.log(`ok   ${name}`);
  } catch (e) {
    meta.errors[name] = String(e.message || e);
    console.error(`FAIL ${name}: ${e.message || e}`);
  }
}

// Trade log from the Google Sheet (must be shared as "anyone with the link can view").
const SHEET_ID = process.env.TRADES_SHEET_ID || "1XrUUB7PB9NLVnijQUDHjaG9wZjyPy3ou1yS309MSAEk";
const TABS = [
  { tab: "Trades", file: "trades.csv" },                        // live season (2027): refreshed every run
  { tab: "2026Trades", file: "trades-2026.csv", once: true },   // finished seasons: downloaded once, then left alone
  { tab: "2025Trades", file: "trades-2025.csv", once: true },
];
for (const { tab, file, once } of TABS) {
  if (once && existsSync(`data/${file}`)) continue;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
    const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    if (/^\s*</.test(txt)) throw new Error("Got a web page, not CSV (is the sheet shared with anyone who has the link?)");
    await writeFile(`data/${file}`, txt);
    meta.ok["sheet:" + tab] = true;
    console.log(`ok   sheet ${tab}`);
  } catch (e) {
    meta.errors["sheet:" + tab] = String(e.message || e);
    console.error(`FAIL sheet ${tab}: ${e.message || e}`);
  }
}
await writeFile("data/meta.json", JSON.stringify(meta, null, 1));
// Fail the run only if nothing worked, so one flaky endpoint doesn't block updates
if (!Object.keys(meta.ok).length) process.exit(1);
