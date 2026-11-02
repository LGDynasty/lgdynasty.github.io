// Pulls league data from the Fantrax REST API into ./data/*.json
// Requires Node 18+ (built-in fetch). No dependencies.
import { mkdir, writeFile } from "node:fs/promises";

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

await writeFile("data/meta.json", JSON.stringify(meta, null, 1));
// Fail the run only if nothing worked, so one flaky endpoint doesn't block updates
if (!Object.keys(meta.ok).length) process.exit(1);
