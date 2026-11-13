// Pulls football (Sleeper) league data into ./data/football/*.json
// Requires Node 18+ (built-in fetch). No dependencies, no login needed.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || "1344914797510004736";
const API = "https://api.sleeper.app/v1";
const OUT = "data/football";
const MAX_SEASONS_BACK = 6; // how many previous seasons of trade history to collect
const DAY = 24 * 3600 * 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = async f => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } };
const save = (name, data, pretty = true) => writeFile(`${OUT}/${name}`, JSON.stringify(data, null, pretty ? 1 : 0));

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { "User-Agent": "DynastyHub/1.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  await sleep(120); // be polite to Sleeper
  return res.json();
}

await mkdir(OUT, { recursive: true });
const prevMeta = (await readJSON(`${OUT}/meta.json`)) || {};
const meta = { updatedAt: new Date().toISOString(), leagueId: LEAGUE_ID, playersFetchedAt: prevMeta.playersFetchedAt || null, ok: {}, errors: {} };

async function step(name, fn) {
  try { await fn(); meta.ok[name] = true; console.log("ok  ", name); }
  catch (e) { meta.errors[name] = String(e.message || e); console.error("FAIL", name, "-", e.message || e); }
}

// --- helpers -------------------------------------------------------------
const slim = (rosters, users) => ({
  rosters: (rosters || []).map(r => ({ roster_id: r.roster_id, owner_id: r.owner_id })),
  users: (users || []).map(u => ({ user_id: u.user_id, display_name: u.display_name, team_name: (u.metadata && u.metadata.team_name) || null })),
});

// Completed trades for one season's league. Sleeper files transactions under a week number.
async function tradesFor(leagueId) {
  const out = [];
  for (let w = 0; w <= 18; w++) {
    let tx;
    try { tx = await get(`/league/${leagueId}/transactions/${w}`); }
    catch (e) { if (w === 0) continue; throw e; } // week 0 may not exist; ignore that one
    for (const t of tx || []) {
      if (t.type !== "trade" || t.status !== "complete") continue;
      out.push({
        id: t.transaction_id, week: w, ts: t.status_updated || t.created,
        rosters: t.roster_ids, adds: t.adds || {}, drops: t.drops || {},
        picks: t.draft_picks || [], faab: t.waiver_budget || [],
      });
    }
  }
  return out;
}

// --- current season ------------------------------------------------------
let state = null, league = null, rosters = null, users = null;

await step("state", async () => { state = await get("/state/nfl"); await save("state.json", state); });
await step("league", async () => { league = await get(`/league/${LEAGUE_ID}`); await save("league.json", league); });

if (league) {
  await step("rosters", async () => { rosters = await get(`/league/${LEAGUE_ID}/rosters`); await save("rosters.json", rosters); });
  await step("users", async () => { users = await get(`/league/${LEAGUE_ID}/users`); await save("users.json", users); });
  await step("traded_picks", async () => { await save("traded_picks.json", await get(`/league/${LEAGUE_ID}/traded_picks`)); });

  // Convenience file: one row per team with record and points for/against
  if (rosters && users) {
    await step("teams", async () => {
      const byUser = Object.fromEntries(users.map(u => [u.user_id, u]));
      const teams = rosters.map(r => {
        const u = byUser[r.owner_id] || {}, s = r.settings || {};
        return {
          roster_id: r.roster_id, owner_id: r.owner_id,
          name: (u.metadata && u.metadata.team_name) || u.display_name || `Team ${r.roster_id}`,
          manager: u.display_name || null, avatar: u.avatar || null,
          w: s.wins ?? 0, l: s.losses ?? 0, t: s.ties ?? 0,
          pf: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
          pa: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
          players: r.players || [], starters: r.starters || [], reserve: r.reserve || [], taxi: r.taxi || [],
        };
      });
      await save("teams.json", teams);
    });
  }

  // Weekly scores, cached once a week is finished (the current week is always refreshed)
  await step("matchups", async () => {
    let cache = await readJSON(`${OUT}/matchups.json`);
    if (!cache || cache.season !== league.season) cache = { season: league.season, weeks: {} };
    const cur = Math.min(Number(state && state.week) || 0, 18);
    for (let w = 1; w <= cur; w++) {
      if (w < cur && cache.weeks[w]) continue;
      const m = await get(`/league/${LEAGUE_ID}/matchups/${w}`);
      cache.weeks[w] = (m || []).map(x => ({ r: x.roster_id, m: x.matchup_id, p: x.points }));
    }
    cache.currentWeek = cur;
    await save("matchups.json", cache, false);
  });

  // This season's trades
  await step("trades", async () => {
    await save(`season-${league.season}.json`, { season: league.season, leagueId: LEAGUE_ID, name: league.name, ...slim(rosters, users), trades: await tradesFor(LEAGUE_ID) }, false);
  });

  // Earlier seasons: Sleeper links each season's league to the previous one. Downloaded once, then left alone.
  await step("history", async () => {
    let id = league.previous_league_id, n = 0;
    while (id && id !== "0" && n++ < MAX_SEASONS_BACK) {
      const l = await get(`/league/${id}`);
      const file = `season-${l.season}.json`;
      if (!existsSync(`${OUT}/${file}`)) {
        const [r, u] = await Promise.all([get(`/league/${id}/rosters`), get(`/league/${id}/users`)]);
        await save(file, { season: l.season, leagueId: id, name: l.name, ...slim(r, u), trades: await tradesFor(id) }, false);
        console.log("ok   history", l.season);
      }
      id = l.previous_league_id;
    }
  });
}

// --- player names (large file, so at most once a day, and trimmed down) --
await step("players", async () => {
  const fresh = meta.playersFetchedAt && Date.now() - Date.parse(meta.playersFetchedAt) < DAY;
  if (fresh && existsSync(`${OUT}/players.json`)) return;
  const all = await get("/players/nfl");
  const players = {};
  for (const [id, p] of Object.entries(all)) {
    if (!p.position) continue;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || id;
    players[id] = [name, p.position, p.team || "", p.age ?? null]; // [name, position, NFL team, age]
  }
  await save("players.json", players, false);
  meta.playersFetchedAt = new Date().toISOString();
});

await save("meta.json", meta);
// Only fail the run if nothing worked at all
if (!state && !league) process.exit(1);
