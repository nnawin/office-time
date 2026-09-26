(() => {
  const HOME_STOP = "003443";
  const HOME_ROUTE = "E11S";
  const WHC_CTB = "001629";
  const WHC_KMB = "E18D73287340B634";
  const SCHOOL_CTB = "001267";
  const SCHOOL_KMB = "85CACCFD0C731C5B";
  const POLL_MS = 15000;
  const STALE_MS = 120000;
  const E11S_WINDOW = { start: 6 * 60 + 20, end: 8 * 60 + 20 };

  const NEARBY = [
    { id: "003443", name: "Century Link, Ying Hei Road", walk: "Home stop", highlight: ["E11S"] },
    { id: "003454", name: "The Visionary, Ying Tung Road", walk: "~3 min", highlight: ["S56", "E32A"] },
    { id: "001882", name: "Caribbean Coast Phase 1", walk: "~4 min", highlight: ["E11A", "E21D"] },
    { id: "001880", name: "Caribbean Coast Phase 2", walk: "~6 min", highlight: ["E11A", "S56"] },
    { id: "001878", name: "Coastal Skyline, Man Tung Road", walk: "~8 min", highlight: ["E11A", "E21D"] },
  ];

  const VISIONARY_KMB_INBOUND = "CC57C2DF592993CB";
  const VISIONARY_KMB_OUTBOUND = "2AA862C9E7E497EE";

  const CONNECTIONS = [
    {
      route: "960X",
      co: "kmb",
      serviceType: "1",
      whcStop: WHC_KMB,
      schoolStop: SCHOOL_KMB,
      dest: "Quarry Bay via North Point school",
      window: "Mon–Fri morning toward Quarry Bay",
      start: 6 * 60 + 40,
      end: 9 * 60 + 20,
    },
    {
      route: "968X",
      co: "kmb",
      serviceType: "1",
      whcStop: WHC_KMB,
      schoolStop: SCHOOL_KMB,
      dest: "Quarry Bay via North Point school",
      window: "Mon–Fri morning from Yuen Long",
      start: 7 * 60 + 10,
      end: 9 * 60 + 10,
    },
    {
      route: "960B",
      co: "kmb",
      serviceType: "1",
      whcStop: WHC_KMB,
      schoolStop: SCHOOL_KMB,
      dest: "Quarry Bay via North Point school",
      window: "Mon–Fri morning from Kin Sang",
      start: 7 * 60,
      end: 9 * 60 + 20,
    },
    {
      route: "955",
      co: "ctb",
      whcStop: WHC_CTB,
      schoolStop: SCHOOL_CTB,
      dest: "Sai Wan Ho via King’s Road",
      window: "Mon–Fri peak toward Sai Wan Ho",
      start: 7 * 60,
      end: 9 * 60 + 30,
    },
    {
      route: "982C",
      co: "ctb",
      whcStop: WHC_CTB,
      schoolStop: SCHOOL_CTB,
      dest: "Sai Wan Ho via King’s Road",
      window: "Mon–Fri morning from Shek Mun",
      start: 7 * 60,
      end: 9 * 60,
    },
  ];

  const els = {
    clock: document.getElementById("clock"),
    statusChip: document.getElementById("statusChip"),
    mega: document.getElementById("mega"),
    megaNum: document.getElementById("megaNum"),
    heroSub: document.getElementById("heroSub"),
    leaveBy: document.getElementById("leaveBy"),
    freshness: document.getElementById("freshness"),
    e11sRows: document.getElementById("e11sRows"),
    nearbyTabs: document.getElementById("nearbyTabs"),
    nearbyRows: document.getElementById("nearbyRows"),
    connMeta: document.getElementById("connMeta"),
    connTable: document.getElementById("connTable"),
    walkMins: document.getElementById("walkMins"),
    xferMins: document.getElementById("xferMins"),
    notifyBtn: document.getElementById("notifyBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
  };

  const state = {
    walk: Number(localStorage.getItem("e11s-walk") || 4),
    xfer: Number(localStorage.getItem("e11s-xfer") || 5),
    notify: localStorage.getItem("e11s-notify") === "1",
    notifiedFor: null,
    nearbyId: localStorage.getItem("e11s-nearby") || "003454",
    nearbyCache: {},
    e32aRows: [],
    e11sHome: null,
    e11sWhc: null,
    connections: {},
    timer: null,
  };

  function hkNow() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
  }

  function minutesOfDay(d) {
    return d.getHours() * 60 + d.getMinutes();
  }

  function isWeekday(d = hkNow()) {
    const day = d.getDay();
    return day >= 1 && day <= 5;
  }

  function inE11sWindow(d = hkNow()) {
    const mins = minutesOfDay(d);
    return isWeekday(d) && mins >= E11S_WINDOW.start && mins <= E11S_WINDOW.end;
  }

  function inWindow(conn, d = hkNow()) {
    const mins = minutesOfDay(d);
    return isWeekday(d) && mins >= conn.start && mins <= conn.end;
  }

  function clockOf(ms) {
    return new Date(ms).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Hong_Kong",
    });
  }

  function classify(row, nowMs) {
    const remark = `${row.rmk_en || ""} ${row.rmk_tc || ""} ${row.rmk || ""}`;
    const scheduled = /cycle|scheduled|時段|班次|timetable/i.test(remark);
    const etaMs = row.eta ? Date.parse(row.eta) : NaN;
    const dataAge = row.data_timestamp ? nowMs - Date.parse(row.data_timestamp) : Infinity;
    const mins = Number.isFinite(etaMs) ? Math.max(0, Math.round((etaMs - nowMs) / 60000)) : null;
    let kind = "uncertain";
    if (!row.eta) kind = scheduled ? "scheduled" : "uncertain";
    else if (scheduled) kind = "scheduled";
    else if (dataAge > STALE_MS) kind = "stale";
    else kind = "live";
    return {
      route: row.route,
      dest: row.dest_en || row.dest || "",
      remark: remark.trim(),
      etaMs,
      mins,
      kind,
      dataAge,
    };
  }

  async function fetchJson(url, retries = 3) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 429 && retries > 0) {
      const wait = Math.pow(2, 3 - retries) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return fetchJson(url, retries - 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function ctbEta(stop, route) {
    return fetchJson(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stop}/${route}`);
  }

  function ctbStopEta(stop) {
    return fetchJson(`https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/${stop}`);
  }

  function kmbEta(stop, route, serviceType = "1") {
    return fetchJson(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${stop}/${route}/${serviceType}`);
  }

  function renderRows(target, rows, emptyText) {
    if (!rows.length) {
      target.innerHTML = `<li class="row"><div class="mins">—</div><div>${emptyText}</div><div class="badge">None</div></li>`;
      return;
    }
    target.innerHTML = rows
      .map((row) => {
        const when = Number.isFinite(row.etaMs) ? clockOf(row.etaMs) : "—";
        const mins = row.mins <= 1 ? "Now" : row.mins;
        return `<li class="row">
          <div class="mins">${mins}</div>
          <div>
            <div><strong>${row.route || HOME_ROUTE}</strong> · ${row.dest || "—"}</div>
            <div class="meta">${when}${row.remark ? " · " + row.remark : ""}</div>
          </div>
          <div class="badge ${row.kind}">${row.kind}</div>
        </li>`;
      })
      .join("");
  }

  function renderHero(rows) {
    const first = rows[0];
    els.mega.className = "mega";
    if (!first) {
      els.statusChip.className = "status-chip none";
      els.statusChip.textContent = "No service";
      els.megaNum.textContent = "—";
      els.heroSub.textContent = inE11sWindow()
        ? "Inside the weekday window, but no E11S is reporting yet."
        : "E11S does not run today. It only leaves Mun Tung Estate on weekday mornings.";
      els.leaveBy.hidden = true;
      return;
    }
    const arriving = first.mins <= 1;
    els.statusChip.className = "status-chip " + (arriving ? "hot" : first.kind);
    els.statusChip.textContent = arriving ? "Arriving" : first.kind;
    els.megaNum.textContent = arriving ? "0" : String(first.mins);
    if (first.mins <= 3) els.mega.classList.add("red", "pulse");
    else if (first.mins <= 6) els.mega.classList.add("amber");
    els.heroSub.textContent = `${clockOf(first.etaMs)} · ${first.dest || "Tin Hau Station"}`;
    const slack = first.mins - state.walk;
    els.leaveBy.hidden = false;
    els.leaveBy.textContent = slack <= 0 ? "Too late to walk out now" : `Leave home within ${slack} min to catch it`;
    maybeNotify(first);
  }

  function renderNearbyTabs() {
    els.nearbyTabs.innerHTML = "";
    NEARBY.forEach((stop) => {
      const btn = document.createElement("button");
      btn.className = "tab" + (stop.id === state.nearbyId ? " active" : "");
      btn.type = "button";
      btn.innerHTML = `<b>${stop.name.split(",")[0]}</b><span>${stop.walk}${stop.highlight.length ? " · " + stop.highlight.join(" ") : ""}</span>`;
      btn.addEventListener("click", () => {
        state.nearbyId = stop.id;
        localStorage.setItem("e11s-nearby", stop.id);
        renderNearbyTabs();
        renderNearby();
        loadNearby(stop.id);
      });
      els.nearbyTabs.appendChild(btn);
    });
  }

  function renderNearby() {
    const stop = NEARBY.find((s) => s.id === state.nearbyId);
    const rows = state.nearbyCache[state.nearbyId] || [];
    let allRows = [...rows];
    if (state.nearbyId === "003454" && state.e32aRows) {
      const existingRoutes = new Set(allRows.map((r) => r.route));
      const newRows = state.e32aRows.filter((r) => !existingRoutes.has(r.route));
      allRows = [...allRows, ...newRows].sort((a, b) => a.etaMs - b.etaMs).slice(0, 8);
    }
    renderRows(
      els.nearbyRows,
      allRows,
      stop ? `No Citybus prediction at ${stop.name} right now.` : "No prediction."
    );
  }

  function nextEta(rows) {
    return (rows || []).filter((r) => r.mins !== null).sort((a, b) => a.etaMs - b.etaMs)[0] || null;
  }

  function renderConnections() {
    const e11sWhc = nextEta(state.e11sWhc || []);
    const e11sHome = nextEta(state.e11sHome || []);
    if (e11sWhc) {
      els.connMeta.textContent = `Next E11S at WHC BBI ${clockOf(e11sWhc.etaMs)} (${e11sWhc.mins} min). Interchange walk ${state.xfer} min.`;
    } else if (e11sHome) {
      els.connMeta.textContent = `E11S is ${e11sHome.mins} min from Ying Hei Road. No live WHC ping yet — using the weekday window only.`;
    } else {
      els.connMeta.textContent = isWeekday()
        ? "No live E11S to the tunnel yet. Weekday connection windows are shown below."
        : "Weekend: these WHC connectors to North Point school do not run. E11S is also off.";
    }

    els.connTable.innerHTML = CONNECTIONS.map((conn) => {
      const live = (state.connections[conn.route] || []).filter((r) => r.mins !== null);
      const first = live[0];
      const windowOn = inWindow(conn);
      let status = "off";
      let label = "Off window";
      let why = conn.window;
      if (!isWeekday()) {
        status = "off";
        label = "Weekend";
        why = "These peak connectors and E11S are weekday-only.";
      } else if (first && e11sWhc) {
        const readyAt = e11sWhc.etaMs + state.xfer * 60000;
        if (first.etaMs >= readyAt) {
          const wait = Math.max(0, Math.round((first.etaMs - readyAt) / 60000));
          status = "ok";
          label = "Possible";
          why = `Arrive WHC ${clockOf(e11sWhc.etaMs)}, walk ${state.xfer} min, ${conn.route} at ${clockOf(first.etaMs)} (${wait} min slack).`;
        } else {
          status = "miss";
          label = "Tight / miss";
          why = `${conn.route} at ${clockOf(first.etaMs)} is before you can walk off E11S.`;
        }
      } else if (first && windowOn) {
        status = "ok";
        label = "Live";
        why = `Next ${conn.route} at WHC ${clockOf(first.etaMs)} · ${first.mins} min · ${first.kind}`;
      } else if (windowOn) {
        status = "off";
        label = "In window";
        why = "Inside the weekday window, but no vehicle is reporting at WHC.";
      }
      return `<article class="conn ${status}">
        <div class="route">${conn.route}</div>
        <div>
          <div>${conn.dest}</div>
          <div class="why">${why}</div>
        </div>
        <div class="badge ${status === "ok" ? "live" : status === "miss" ? "scheduled" : ""}">${label}</div>
      </article>`;
    }).join("");
  }

  async function loadHome() {
    const json = await ctbEta(HOME_STOP, HOME_ROUTE);
    const now = Date.now();
    const rows = (json.data || []).map((row) => classify(row, now)).filter((row) => row.mins !== null);
    state.e11sHome = rows;
    renderHero(rows);
    renderRows(
      els.e11sRows,
      rows,
      inE11sWindow() ? "No E11S reporting at Century Link yet." : "No E11S today at stop 003443."
    );
    const stamp = json.data?.[0]?.data_timestamp || json.generated_timestamp;
    if (stamp) {
      els.freshness.textContent = `Updated ${Math.max(0, Math.round((now - Date.parse(stamp)) / 1000))}s ago`;
    }
  }

  async function loadNearby(stopId) {
    const json = await ctbStopEta(stopId);
    const now = Date.now();
    const rows = (json.data || [])
      .map((row) => classify(row, now))
      .filter((row) => row.mins !== null)
      .sort((a, b) => a.etaMs - b.etaMs)
      .slice(0, 8);
    state.nearbyCache[stopId] = rows;
    if (stopId === state.nearbyId) renderNearby();
  }

  async function loadE32A() {
    try {
      const now = Date.now();
      const inbound = await kmbEta(VISIONARY_KMB_INBOUND, "E32A", "1");
      const outbound = await kmbEta(VISIONARY_KMB_OUTBOUND, "E32A", "1");
      const e32aRows = [
        ...(inbound.data || []).map((row) => ({ ...row, dest_en: row.dest_en || row.dest })),
        ...(outbound.data || []).map((row) => ({ ...row, dest_en: row.dest_en || row.dest })),
      ]
        .map((row) => classify(row, now))
        .filter((row) => row.mins !== null)
        .sort((a, b) => a.etaMs - b.etaMs)
        .slice(0, 4);
      state.e32aRows = e32aRows;
      if (state.nearbyId === "003454") renderNearby();
    } catch {
      state.e32aRows = [];
    }
  }

  async function loadConnections() {
    const now = Date.now();
    try {
      const whc = await ctbEta(WHC_CTB, HOME_ROUTE);
      state.e11sWhc = (whc.data || []).map((row) => classify(row, now)).filter((row) => row.mins !== null);
    } catch {
      state.e11sWhc = [];
    }

    await Promise.all(
      CONNECTIONS.map(async (conn) => {
        try {
          const json =
            conn.co === "kmb"
              ? await kmbEta(conn.whcStop, conn.route, conn.serviceType)
              : await ctbEta(conn.whcStop, conn.route);
          state.connections[conn.route] = (json.data || [])
            .map((row) => classify({ ...row, route: conn.route }, now))
            .filter((row) => row.mins !== null)
            .sort((a, b) => a.etaMs - b.etaMs);
        } catch {
          state.connections[conn.route] = [];
        }
      })
    );
    renderConnections();
  }

  async function refresh() {
    try {
      await Promise.all([
        loadHome(),
        loadNearby(state.nearbyId),
        loadConnections(),
        loadE32A(),
        ...NEARBY.filter((s) => s.id !== state.nearbyId).map((s) => loadNearby(s.id).catch(() => {})),
      ]);
    } catch (err) {
      els.heroSub.textContent = err.message;
    }
  }

  async function maybeNotify(first) {
    if (!state.notify || !first || first.mins > 3) return;
    if (state.notifiedFor === first.etaMs) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    state.notifiedFor = first.etaMs;
    try {
      new Notification("Century Link Board", { body: `E11S at Ying Hei Road in about ${first.mins} min` });
    } catch {
      /* ignore */
    }
  }

  function tickClock() {
    els.clock.textContent = hkNow().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Hong_Kong" });
  }

  els.walkMins.value = String(state.walk);
  els.xferMins.value = String(state.xfer);
  els.notifyBtn.textContent = state.notify ? "Alerts on" : "Notify at 3 min";

  els.walkMins.addEventListener("change", () => {
    state.walk = Number(els.walkMins.value);
    localStorage.setItem("e11s-walk", String(state.walk));
    if (state.e11sHome) renderHero(state.e11sHome);
  });
  els.xferMins.addEventListener("change", () => {
    state.xfer = Number(els.xferMins.value);
    localStorage.setItem("e11s-xfer", String(state.xfer));
    renderConnections();
  });
  els.notifyBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    state.notify = !state.notify;
    localStorage.setItem("e11s-notify", state.notify ? "1" : "0");
    els.notifyBtn.textContent = state.notify ? "Alerts on" : "Notify at 3 min";
  });
  els.refreshBtn.addEventListener("click", refresh);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(state.timer);
      state.timer = null;
    } else if (!state.timer) {
      refresh();
      state.timer = setInterval(refresh, POLL_MS);
    }
  });

  renderNearbyTabs();
  renderNearby();
  renderConnections();
  tickClock();
  setInterval(tickClock, 1000);
  refresh();
  state.timer = setInterval(refresh, POLL_MS);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
