// Football (Sleeper) pages for the hub. Loaded by index.html; reads data/football/*.json
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const empty = t => `<div class="card p-4 text-sm" style="color:var(--muted)">${t}</div>`;
  const get = async f => { try { const r = await fetch(`data/football/${f}`, { cache: "no-cache" }); if (!r.ok) throw 0; return await r.json(); } catch (e) { return null; } };
  const FB = window.FB = { ready: false, tabs: [["home","Home"],["standings","Standings"],["power","Power"],["matchups","Matchups"],["teams","Teams"],["trades","Trades"]] };
  const POS = ["QB","RB","WR","TE","K","DEF"];
  let D = {}, selWeek = null, selSeason = null, selTeam = "";

  const stat = (l, v, s) => `<div class="card p-4"><div class="lbl">${l}</div><div class="slab text-xl mt-1">${v}</div><div class="text-xs mt-1" style="color:var(--muted)">${s || ""}</div></div>`;
  const tn = rid => D.tm[rid] ? D.tm[rid].name : "Team " + rid;
  const lnk = rid => `<a class="lnk" href="#fb-team-${rid}">${esc(tn(rid))}</a>`;
  const rec = t => `${t.w}-${t.l}${t.t ? "-" + t.t : ""}`;
  const fmt = n => Math.round(n).toLocaleString();
  const standings = () => [...D.teams].sort((a, b) => b.w - a.w || b.pf - a.pf);
  const cur = () => D.mu.currentWeek || 0;
  const games = w => { const g = {}; (D.mu.weeks[w] || []).forEach(x => { if (x.m != null) (g[x.m] = g[x.m] || []).push(x); }); return Object.values(g).filter(a => a.length === 2); };
  const board = w => games(w).map(([a, b]) => { const aw = a.p > b.p;
    return `<div class="card p-4 mb-3"><div class="flex justify-between ${aw ? "font-bold" : ""}"><span>${lnk(a.r)}</span><span class="mono">${a.p}</span></div><div class="flex justify-between mt-1 ${!aw ? "font-bold" : ""}"><span>${lnk(b.r)}</span><span class="mono">${b.p}</span></div></div>`; }).join("");
  const seasonTeam = (s, rid) => { const r = s.rosters.find(x => x.roster_id === rid); const u = r && s.users.find(x => x.user_id === r.owner_id); return ((u && (u.team_name || u.display_name)) || "Team " + rid).trim(); };
  const pRow = id => { const p = D.pl[id];
    return `<div class="px-4 py-2 flex justify-between items-center row text-sm"><span>${esc(p ? p[0] : id)}${p && p[2] ? ` <span class="mono text-xs" style="color:var(--muted)">${esc(p[2])}</span>` : ""}${p && p[3] ? ` <span class="mono text-xs" style="color:var(--muted)">age ${p[3]}</span>` : ""}</span><span class="pill">${esc(p ? p[1] : "?")}</span></div>`; };
  const byPos = (a, b) => { const pa = D.pl[a], pb = D.pl[b]; const ia = pa ? POS.indexOf(pa[1]) : 99, ib = pb ? POS.indexOf(pb[1]) : 99; return (ia < 0 ? 98 : ia) - (ib < 0 ? 98 : ib) || (pa ? pa[0] : a).localeCompare(pb ? pb[0] : b); };

  FB.ensure = async () => {
    if (FB.ready) return;
    const [teams, mu, pl, tp, lg, meta] = await Promise.all(["teams.json","matchups.json","players.json","traded_picks.json","league.json","meta.json"].map(get));
    D = { teams: (teams || []).map(t => ({ ...t, name: (t.name || "").trim() })), mu: mu || { weeks: {}, currentWeek: 0 }, pl: pl || {}, tp: tp || [], lg: lg || {}, meta: meta || {}, seasons: {} };
    D.tm = Object.fromEntries(D.teams.map(t => [t.roster_id, t]));
    const y = Number(D.lg.season) || new Date().getFullYear();
    (await Promise.all(Array.from({ length: 7 }, (_, i) => get(`season-${y - i}.json`)))).forEach(s => { if (s) D.seasons[s.season] = s; });
    const yrs = Object.keys(D.seasons).sort();
    selSeason = yrs[yrs.length - 1] || null;
    selWeek = cur() || null;
    FB.ready = true;
  };
  FB.updated = () => D.meta && D.meta.updatedAt ? "Updated " + new Date(D.meta.updatedAt).toLocaleString() : "Waiting for first football update";
  FB.bind = rerender => {
    document.querySelectorAll("[data-fbs]").forEach(b => b.onclick = () => { selSeason = b.dataset.fbs; selTeam = ""; rerender(); });
    const w = document.getElementById("fbW"); if (w) w.onchange = e => { selWeek = +e.target.value; rerender(); };
    const t = document.getElementById("fbT"); if (t) t.onchange = e => { selTeam = e.target.value; rerender(); };
  };

  FB.views = {
    home() {
      if (!D.teams.length) return empty("No football data yet. Run the “Update league data” action.");
      const lead = standings()[0], pf = [...D.teams].sort((a, b) => b.pf - a.pf)[0], w = cur();
      return `<div class="grid grid-cols-2 gap-3">${stat("League leader", esc(lead.name), rec(lead))}${stat("Points leader", esc(pf.name), fmt(pf.pf) + " pts")}</div>` +
        (games(w).length ? `<div class="flex justify-between items-center mt-4 mb-2"><div class="lbl">This week’s scoreboard</div><span class="stamp">Week ${w}</span></div>${board(w)}` : "");
    },
    standings() {
      if (!D.teams.length) return empty("No standings yet.");
      const rows = standings().map((t, i) => `<tr class="row"><td class="mono">${i === 0 ? "★" : i + 1}</td><td>${lnk(t.roster_id)}</td><td class="mono">${rec(t)}</td><td class="mono">${fmt(t.pf)}</td><td class="mono">${fmt(t.pa)}</td></tr>`).join("");
      return `<div class="card overflow-x-auto"><table class="w-full"><tr class="lbl"><th>#</th><th>Club</th><th>W-L</th><th>PF</th><th>PA</th></tr>${rows}</table></div>`;
    },
    power() {
      if (!D.teams.length) return empty("No football data yet.");
      const done = Math.max(cur() - 1, 0);
      const agg = upto => { const m = {};
        for (let w = 1; w <= upto; w++) games(w).forEach(([a, b]) => { if (!a.p && !b.p) return;
          [[a, b], [b, a]].forEach(([x, y]) => { const t = m[x.r] || (m[x.r] = { pf: 0, pa: 0 }); t.pf += x.p || 0; t.pa += y.p || 0; }); });
        return Object.entries(m).map(([r, t]) => ({ r: +r, ...t, s: (t.pf * t.pf + t.pa * t.pa) ? t.pf * t.pf / (t.pf * t.pf + t.pa * t.pa) : .5 })).sort((a, b) => b.s - a.s); };
      const now = done ? agg(done) : [];
      if (!now.length) return empty("Power rankings appear after the first finished week.");
      const prevOrder = done > 1 ? agg(done - 1).map(x => x.r) : standings().map(t => t.roster_id), prev = {};
      prevOrder.forEach((r, i) => prev[r] = i + 1);
      const arrow = d => d > 0 ? `<span style="color:#2e7d32">▲${d}</span>` : d < 0 ? `<span style="color:var(--red)">▼${-d}</span>` : `<span style="color:var(--muted)">—</span>`;
      return `<p class="lbl mb-2">Through week ${done}</p><div class="card overflow-x-auto"><table class="w-full"><tr class="lbl"><th>#</th><th></th><th>Club</th><th>Score</th></tr>` +
        now.map((t, i) => `<tr class="row"><td class="mono">${i + 1}</td><td class="mono text-xs">${prev[t.r] ? arrow(prev[t.r] - (i + 1)) : ""}</td><td>${lnk(t.r)}<div class="mono text-xs" style="color:var(--muted)">PF ${fmt(t.pf)} · PA ${fmt(t.pa)}</div></td><td class="mono">${t.s.toFixed(3).replace(/^0/, "")}</td></tr>`).join("") +
        `</table></div><p class="text-xs mt-3 italic" style="color:var(--muted)">Score = PF² ÷ (PF² + PA²) over finished weeks. Arrows show movement since the previous week.</p>`;
    },
    matchups() {
      const c = cur(); if (!c) return empty("No matchups yet.");
      const w = selWeek || c;
      const opts = Array.from({ length: c }, (_, i) => c - i).map(n => `<option value="${n}" ${n === w ? "selected" : ""}>Week ${n}</option>`).join("");
      return `<select id="fbW" class="card w-full p-2 text-sm mb-3" style="color:var(--ink)">${opts}</select>` + (board(w) || empty("No games this week."));
    },
    teams() {
      if (!D.teams.length) return empty("No data yet.");
      return `<div class="grid grid-cols-2 gap-3">` + [...D.teams].sort((a, b) => a.name.localeCompare(b.name)).map(t =>
        `<a href="#fb-team-${t.roster_id}" class="card p-3 block"><div class="font-bold text-sm">${esc(t.name)}</div><div class="lbl mt-1">${esc(t.manager || "")}</div><div class="mono text-xs mt-1">${rec(t)}</div></a>`).join("") + `</div>`;
    },
    team(id) {
      const R = D.tm[Number(id)]; if (!R) return empty("Team not found.");
      const used = [...R.starters, ...R.reserve, ...R.taxi];
      const groups = [["Starters", R.starters.filter(x => x && x !== "0")], ["Bench", R.players.filter(x => !used.includes(x)).sort(byPos)], ["Injured reserve", [...R.reserve].sort(byPos)], ["Taxi squad", [...R.taxi].sort(byPos)]];
      const roster = groups.map(([l, list]) => list.length ? `<div class="lbl px-4 py-2 row">${l} · ${list.length}</div>` + list.map(pRow).join("") : "").join("");
      const pk = p => `<div class="px-4 py-2 flex justify-between row text-sm"><span>${esc(p.season)} round ${p.round}</span><span class="pill">${p.owner_id === R.roster_id ? "via " + esc(tn(p.roster_id)) : "to " + esc(tn(p.owner_id))}</span></div>`;
      const got = D.tp.filter(p => p.owner_id === R.roster_id && p.roster_id !== R.roster_id), away = D.tp.filter(p => p.roster_id === R.roster_id && p.owner_id !== R.roster_id);
      const picks = (got.length ? `<div class="lbl px-4 py-2 row">Acquired</div>` + got.map(pk).join("") : "") + (away.length ? `<div class="lbl px-4 py-2 row">Traded away</div>` + away.map(pk).join("") : "");
      return `<a href="#fb-teams" class="lbl">← All clubs</a><h2 class="slab text-2xl mt-2">${esc(R.name)}</h2>
        <p class="mono text-sm mt-1">${esc(R.manager || "")} · ${rec(R)} · ${fmt(R.pf)} PF</p>
        <div class="card mt-4 overflow-hidden"><div class="slab px-4 py-3">Roster</div>${roster}</div>
        <div class="card mt-4 overflow-hidden"><div class="slab px-4 py-3">Draft picks</div>${picks || `<div class="p-4 text-sm">No traded picks.</div>`}</div>`;
    },
    trades() {
      const yrs = Object.keys(D.seasons).sort();
      if (!yrs.length) return empty("No trade history yet.");
      if (!D.seasons[selSeason]) selSeason = yrs[yrs.length - 1];
      const s = D.seasons[selSeason];
      const head = `<div class="flex justify-center gap-2 mb-3">` + [...yrs].reverse().map(y => `<button data-fbs="${y}" class="tab ${y === selSeason ? "on" : ""}">${y}</button>`).join("") + `</div>`;
      const tms = [...new Set(s.rosters.map(r => seasonTeam(s, r.roster_id)))].sort();
      if (selTeam && !tms.includes(selTeam)) selTeam = "";
      const list = (s.trades || []).slice().sort((a, b) => b.ts - a.ts).filter(t => !selTeam || t.rosters.some(r => seasonTeam(s, r) === selTeam));
      if (!(s.trades || []).length) return head + empty(`No trades in ${esc(selSeason)}.`);
      const opts = `<option value="">All teams</option>` + tms.map(v => `<option ${v === selTeam ? "selected" : ""}>${esc(v)}</option>`).join("");
      return head + `<select id="fbT" class="card w-full p-2 text-sm mb-3" style="color:var(--ink)">${opts}</select><p class="lbl mb-2">${list.length} trade${list.length === 1 ? "" : "s"}</p>` + list.map(t => {
        const date = t.ts ? new Date(t.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
        const cols = t.rosters.map(rid => {
          const it = [];
          Object.entries(t.adds || {}).forEach(([pid, r]) => { if (r === rid) { const p = D.pl[pid]; it.push(`<li>${esc(p ? p[0] : pid)}${p ? ` <span class="pill">${esc(p[1])}</span>` : ""}</li>`); } });
          (t.picks || []).forEach(p => { if (p.owner_id === rid) it.push(`<li><span class="pill">PICK</span> ${esc(p.season)} round ${p.round}${p.roster_id !== rid ? ` <span class="text-xs" style="color:var(--muted)">(${esc(seasonTeam(s, p.roster_id))})</span>` : ""}</li>`); });
          (t.faab || []).forEach(f => { if (f.receiver === rid) it.push(`<li><span class="pill">FAAB</span> $${esc(f.amount)}</li>`); });
          return `<div><div class="font-bold">${esc(seasonTeam(s, rid))}</div><div class="lbl mt-1">Receives</div><ul class="mt-1 space-y-1">${it.join("") || "<li>—</li>"}</ul></div>`;
        }).join("");
        return `<div class="card p-4 mb-3"><div class="mono text-xs" style="color:var(--muted)">${esc(date)}</div><div class="grid ${t.rosters.length === 2 ? "grid-cols-2" : "grid-cols-1"} gap-4 mt-3 text-sm">${cols}</div></div>`;
      }).join("");
    }
  };
})();
