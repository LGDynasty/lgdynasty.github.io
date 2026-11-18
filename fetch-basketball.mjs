// Pulls the basketball (Fantrax, NBA) league into ./data/basketball/*.json
// Requires Node 18+ (built-in fetch). No dependencies.
import { mkdir, writeFile, readFile } from "node:fs/promises";

const LEAGUE_ID = process.env.BASKETBALL_LEAGUE_ID || "c1o9nwzimpddhf9z";
const BASE = "https://www.fantrax.com/fxea/general";
const HEADERS = { "User-Agent": "DynastyHub/1.0", Accept: "application/json" }; // Fantrax rejects requests without one
const OUT = "data/basketball";
const SEASON = process.env.BASKETBALL_SEASON || "2026-27";
const SEASON_START = new Date(process.env.BASKETBALL_SEASON_START || "2026-10-01");

const readJSON = async f => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } };
const get = async q => { const r = await fetch(`${BASE}/${q}`, { headers: HEADERS }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

await mkdir(OUT, { recursive: true });
const meta = { updatedAt: new Date().toISOString(), leagueId: LEAGUE_ID, ok: {}, errors: {} };
const got = {};
const finish = async () => { await writeFile(`${OUT}/meta.json`, JSON.stringify(meta, null, 1)); };

// 1) Standings first, as a safety check that this really is a different league from baseball
try {
  got.standings = await get(`getStandings?leagueId=${LEAGUE_ID}`);
  const base = await readJSON("data/standings.json");
  const baseIds = new Set((Array.isArray(base) ? base : (base && base.standings) || []).map(t => t.teamId));
  const mine = (Array.isArray(got.standings) ? got.standings : (got.standings && got.standings.standings) || []).map(t => t.teamId);
  if (mine.some(id => baseIds.has(id))) {
    meta.errors.wrongLeague = "These teams match the baseball league. Double-check the basketball league ID.";
    console.error("FAIL wrongLeague: this ID is your baseball league");
    await finish(); process.exit(0);
  }
  await writeFile(`${OUT}/standings.json`, JSON.stringify(got.standings, null, 1));
  meta.ok.standings = true; console.log("ok   standings");
} catch (e) { meta.errors.standings = String(e.message || e); console.error("FAIL standings:", e.message || e); }

// 2) Everything else
const ENDPOINTS = {
  leagueInfo: `getLeagueInfo?leagueId=${LEAGUE_ID}&excludePlayerInfo=true`,
  matchups: `getMatchupScores?leagueId=${LEAGUE_ID}`,   // current scoring period
  rosters: `getTeamRosters?leagueId=${LEAGUE_ID}`,      // current period
  draftPicks: `getDraftPicks?leagueId=${LEAGUE_ID}`,
  playerIds: `getPlayerIds?sport=NBA`,                  // maps Fantrax player IDs to names
};
for (const [name, q] of Object.entries(ENDPOINTS)) {
  try {
    let json = await get(q);
    got[name] = json;
    if (name === "playerIds") { // keep only what the site shows
      const slim = {};
      for (const [id, p] of Object.entries(json)) slim[id] = { name: p.name, team: p.team, position: p.position, fantraxId: p.fantraxId || id };
      json = slim;
    }
    await writeFile(`${OUT}/${name}.json`, JSON.stringify(json, null, name === "playerIds" ? 0 : 1));
    meta.ok[name] = true; console.log("ok  ", name);
  } catch (e) { meta.errors[name] = String(e.message || e); console.error(`FAIL ${name}: ${e.message || e}`); }
}

// 3) Power rankings need points AGAINST, which standings lack: keep each finished scoring period's matchups.
const curPeriod = got.matchups && got.matchups.period;
if (Date.now() >= SEASON_START && curPeriod > 1) {
  let cache = (await readJSON(`${OUT}/period-scores.json`)) || {};
  if (cache.season !== SEASON) cache = { season: SEASON, periods: {} };
  for (let p = 1; p < curPeriod; p++) {
    if (cache.periods[p]) continue; // finished periods are cached
    try {
      const j = await get(`getMatchupScores?leagueId=${LEAGUE_ID}&period=${p}`);
      // category leagues may report category wins instead of a points score
      const val = t => t.score ?? t.categoryWins ?? 0;
      cache.periods[p] = (j.matchups || []).map(m => ({ a: m.away.teamId, h: m.home.teamId, as: val(m.away), hs: val(m.home) }));
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { meta.errors["period-" + p] = String(e.message || e); }
  }
  cache.updatedAt = new Date().toISOString();
  await writeFile(`${OUT}/period-scores.json`, JSON.stringify(cache));
  meta.ok.periodScores = true;
}

await finish();
if (!Object.keys(meta.ok).length) process.exit(1);
