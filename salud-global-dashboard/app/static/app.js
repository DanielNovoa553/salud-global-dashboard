(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const I18N = {
    es: {
      locale: "es-MX", title: "Salud global · Panel de datos", desc: "COVID-19 y otras causas de muerte (suicidio, drogas, tuberculosis, homicidio…) por país, con datos abiertos.",
      h1: "Salud global · Panel de datos", cause: "Causa", d1: "Último año", d5: "5 años", d10: "10 años", d20: "20 años", rate: "Tasa", year: "Año", change: "Cambio en el periodo",
      causeNote: "Datos anuales; las fuentes publican con retraso. Datos disponibles hasta",
      worldwide: "Mundial", latest: "Último valor", highest: "Valor más alto", rank: "Posición", of: "de",
      theme: "Tema", themeAria: "Cambiar tema", totals: "Totales", cases: "Casos", deaths: "Muertes", recovered: "Recuperados",
      cfr: "Letalidad", cfrSub: "muertes / casos", region: "Región", world: "Mundo", period: "Periodo", d90: "90 días", y1: "1 año", y2: "2 años", all: "Todo",
      chartAria: "Gráfica de casos nuevos por día", countries: "Países", search: "Buscar país", country: "País", perMillion: "Casos / millón", source: "Fuente:",
      today: "últimos 7 días", updated: "Actualizado: ", noResults: "Sin resultados", chartTitle: "Casos nuevos por día", newCases: "Casos nuevos", avg7: "Promedio 7 días",
      m6: "6 meses", y5: "5 años", mxGroup: "México (Secretaría de Salud / INEGI)", mxWorld: "Mundo (OMS, ONU, Banco Mundial)", national: "Nacional", stateCol: "Estado", deathsPeriod: "Muertes en el periodo", rate100k: "Tasa anual por 100 mil hab.", vsPrev: "vs. periodo anterior", mxNote: "México: defunciones registradas por mes de ocurrencia (Secretaría de Salud/INEGI). Datos hasta", mxLag: "; los últimos meses pueden estar incompletos por rezago de registro.",
      err404: "No se encontraron datos para ese país.", err502: "El servicio de datos no está disponible. Intenta de nuevo.", err: "Error ",
    },
    en: {
      locale: "en-US", title: "Global health · Data dashboard", desc: "COVID-19 and other causes of death (suicide, drugs, tuberculosis, homicide…) by country, using open data.",
      h1: "Global health · Data dashboard", cause: "Cause", d1: "Latest year", d5: "5 years", d10: "10 years", d20: "20 years", rate: "Rate", year: "Year", change: "Change over period",
      causeNote: "Annual data; sources publish with a delay. Data available through",
      worldwide: "Worldwide", latest: "Latest value", highest: "Highest value", rank: "Rank", of: "of",
      theme: "Theme", themeAria: "Toggle theme", totals: "Totals", cases: "Cases", deaths: "Deaths", recovered: "Recovered",
      cfr: "Fatality rate", cfrSub: "deaths / cases", region: "Region", world: "World", period: "Period", d90: "90 days", y1: "1 year", y2: "2 years", all: "All",
      chartAria: "Chart of new cases per day", countries: "Countries", search: "Search country", country: "Country", perMillion: "Cases / million", source: "Source:",
      today: "last 7 days", updated: "Updated: ", noResults: "No results", chartTitle: "New cases per day", newCases: "New cases", avg7: "7-day average",
      m6: "6 months", y5: "5 years", mxGroup: "Mexico (Ministry of Health / INEGI)", mxWorld: "World (WHO, UN, World Bank)", national: "National", stateCol: "State", deathsPeriod: "Deaths in period", rate100k: "Annual rate per 100k people", vsPrev: "vs. previous period", mxNote: "Mexico: registered deaths by month of occurrence (Ministry of Health/INEGI). Data through", mxLag: "; the latest months may be incomplete due to registration lag.",
      err404: "No data found for that country.", err502: "The data service is unavailable. Please try again.", err: "Error ",
    },
  };
  const savedLang = (() => { try { return localStorage.getItem("lang"); } catch { return null; } })();
  let lang = savedLang in I18N ? savedLang : (navigator.language || "es").toLowerCase().startsWith("en") ? "en" : "es";
  const t = (k) => I18N[lang][k];
  let nf = new Intl.NumberFormat(t("locale"));
  const state = { countries: [], country: "", days: 365, sort: { k: "cases", dir: -1 }, chart: null, q: "", cause: "covid", cd: null };
  // id: [nombre es, nombre en, unidad es, unidad en]
  const CAUSE_META = {
    suicide: ["Suicidio", "Suicide", "por 100,000 hab., ajustada por edad", "per 100,000 people, age-standardized"],
    drugs: ["Trastornos por drogas (sobredosis)", "Drug use disorders (overdose)", "por 100,000 hab.", "per 100,000 people"],
    tuberculosis: ["Tuberculosis", "Tuberculosis", "por 100,000 hab.", "per 100,000 people"],
    homicide: ["Homicidio", "Homicide", "por 100,000 hab.", "per 100,000 people"],
    malaria: ["Malaria", "Malaria", "por 100,000 hab.", "per 100,000 people"],
    falls: ["Caídas", "Falls", "por 100,000 hab.", "per 100,000 people"],
    poisoning: ["Envenenamiento accidental", "Accidental poisoning", "por 100,000 hab.", "per 100,000 people"],
    cancer: ["Cáncer (todos)", "Cancer (all)", "por 100,000 hab.", "per 100,000 people"],
    stomach_cancer: ["Cáncer de estómago", "Stomach cancer", "por 100,000 hab., ajustada por edad", "per 100,000 people, age-standardized"],
    liver_cancer: ["Cáncer de hígado", "Liver cancer", "por 100,000 hab., ajustada por edad", "per 100,000 people, age-standardized"],
    road: ["Accidentes de tránsito", "Road traffic accidents", "por 100,000 hab.", "per 100,000 people"],
    ncd70: ["Cardiopatías, cáncer, diabetes y EPOC (30–70 años)", "Heart disease, cancer, diabetes & COPD (ages 30–70)", "% de probabilidad de morir entre 30 y 70 años", "% probability of dying between ages 30 and 70"],
    air: ["Contaminación del aire", "Air pollution", "por 100,000 hab., ajustada por edad", "per 100,000 people, age-standardized"],
    water: ["Agua insalubre y saneamiento", "Unsafe water & sanitation", "por 100,000 hab.", "per 100,000 people"],
    neonatal: ["Mortalidad neonatal", "Neonatal mortality", "por 1,000 nacidos vivos", "per 1,000 live births"],
    under5: ["Mortalidad de menores de 5 años", "Under-5 mortality", "por 1,000 nacidos vivos", "per 1,000 live births"],
    infant: ["Mortalidad infantil", "Infant mortality", "por 1,000 nacidos vivos", "per 1,000 live births"],
    maternal: ["Mortalidad materna", "Maternal mortality", "por 100,000 nacidos vivos", "per 100,000 live births"],
    aids: ["Muertes por VIH/SIDA", "HIV/AIDS deaths", "muertes estimadas", "estimated deaths"],
    share_comm: ["Enfermedades transmisibles, maternas y nutricionales", "Communicable, maternal & nutritional diseases", "% del total de muertes", "% of total deaths"],
    share_ncd: ["Enfermedades no transmisibles", "Non-communicable diseases", "% del total de muertes", "% of total deaths"],
    share_injury: ["Lesiones", "Injuries", "% del total de muertes", "% of total deaths"],
  };
  const CAUSES = Object.keys(CAUSE_META);
  const cn = (id) => CAUSE_META[id][lang === "es" ? 0 : 1];
  const cu = (id) => CAUSE_META[id][lang === "es" ? 2 : 3];
  const cf = () => new Intl.NumberFormat(t("locale"), { maximumFractionDigits: 2 });
  const isMx = () => state.cause.startsWith("mx:");
  const isCause = () => state.cause !== "covid" && !isMx();
  const mxName = (id) => state.mx.causes[id][lang];
  const mxId = () => state.cause.slice(3);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  async function api(path) {
    const r = await fetch("/api" + path);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(r.status === 404 ? t("err404") : r.status === 502 ? t("err502") : t("err") + r.status);
    }
    return r.json();
  }
  const showError = (msg) => { const e = $("#error"); e.textContent = msg; e.classList.toggle("d-none", !msg); };

  function renderTotals(tt) {
    state.totals = tt;
    $("#kCases").textContent = nf.format(tt.cases);
    $("#kDeaths").textContent = nf.format(tt.deaths);
    $("#kCfr").textContent = tt.cases ? ((tt.deaths / tt.cases) * 100).toFixed(2) + " %" : "–";
    $("#kCasesToday").textContent = tt.today_cases ? "+" + nf.format(tt.today_cases) + " " + t("today") : "";
    $("#kDeathsToday").textContent = tt.today_deaths ? "+" + nf.format(tt.today_deaths) + " " + t("today") : "";
    if (tt.updated) $("#updated").textContent = t("updated") + new Date(tt.updated).toLocaleString(t("locale"));
  }

  function renderRows() {
    const { k, dir } = state.sort;
    const q = state.q.trim().toLowerCase();
    const rows = state.countries
      .filter((c) => !q || c.country.toLowerCase().includes(q))
      .sort((a, b) => (k === "country" ? a.country.localeCompare(b.country, lang) * dir : (a[k] - b[k]) * dir));
    if (isMx()) {
      const f = cf();
      $("#rows").innerHTML = rows.map((c) => `
      <tr data-c="${esc(c.code)}">
        <td>${esc(c.country)}</td>
        <td class="n text-end">${nf.format(c.cases)}</td>
        <td class="n text-end">${f.format(c.deaths)}</td>
        <td class="n text-end">${c.n > 1 ? (c.per_million > 0 ? "+" : "") + f.format(c.per_million) + " %" : "–"}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="text-center text-secondary py-3">${t("noResults")}</td></tr>`;
      return;
    }
    if (isCause()) {
      const f = cf();
      $("#rows").innerHTML = rows.map((c) => `
      <tr data-c="${esc(c.country)}">
        <td>${c.flag ? `<img class="flag" src="${esc(c.flag)}" alt="" loading="lazy">` : ""}${esc(c.country)}</td>
        <td class="n text-end">${f.format(c.cases)}</td>
        <td class="n text-end">${c.deaths}</td>
        <td class="n text-end">${c.n > 1 ? (c.per_million > 0 ? "+" : "") + f.format(c.per_million) + " %" : "–"}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="text-center text-secondary py-3">${t("noResults")}</td></tr>`;
      return;
    }
    $("#rows").innerHTML = rows.map((c) => `
      <tr data-c="${esc(c.country)}">
        <td>${c.flag ? `<img class="flag" src="${esc(c.flag)}" alt="" loading="lazy">` : ""}${esc(c.country)}</td>
        <td class="n text-end">${nf.format(c.cases)}</td>
        <td class="n text-end">${nf.format(c.deaths)}</td>
        <td class="n text-end">${c.population ? nf.format(Math.round(c.per_million)) : "–"}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="text-center text-secondary py-3">${t("noResults")}</td></tr>`;
  }

  const movingAvg = (a, n = 7) => a.map((_, i) => {
    const s = a.slice(Math.max(0, i - n + 1), i + 1);
    return Math.round(s.reduce((x, y) => x + y, 0) / s.length);
  });

  function renderChart(s) {
    const data = {
      labels: s.dates,
      datasets: [
        { type: "bar", label: t("newCases"), data: s.new_cases, backgroundColor: css("--cases") + "55", order: 2 },
        { type: "line", label: t("avg7"), data: movingAvg(s.new_cases), borderColor: css("--cases"), borderWidth: 2, pointRadius: 0, tension: 0.25, order: 1 },
      ],
    };
    const muted = css("--bs-secondary-color");
    const options = {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      scales: { x: { ticks: { maxTicksLimit: 8, color: muted }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { callback: (v) => nf.format(v), color: muted } } },
      plugins: { legend: { position: "bottom", labels: { color: muted } },
                 tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${nf.format(i.parsed.y)}` } } },
    };
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($("#chart"), { data, options });
    state.last = s;
  }

  // Todos los países se comparan sobre la misma ventana, anclada al año más reciente de la fuente.
  const endYear = () => Math.max(...Object.values(state.cd.series).map((s) => s.years[s.years.length - 1]));
  function causeRange(s) {
    const end = endYear(), start = state.days ? end - state.days : -Infinity;
    const idx = s.years.map((y, i) => (y >= start && y <= end ? i : -1)).filter((i) => i >= 0);
    return { years: idx.map((i) => s.years[i]), values: idx.map((i) => s.values[i]) };
  }

  function buildCauseRows() {
    state.countries = Object.entries(state.cd.series).filter(([n]) => n !== "World").map(([country, s]) => {
      const r = causeRange(s), a = r.values[0], b = r.values[r.values.length - 1];
      return { country, flag: s.flag, n: r.values.length, cases: b, deaths: r.years[r.years.length - 1], per_million: r.values.length > 1 && a ? ((b - a) / a) * 100 : 0 };
    }).filter((c) => c.n > 0);
  }

  function renderCauseTotals() {
    const f = cf(), sel = state.country, S = state.cd.series;
    const r0 = (x) => causeRange(x).values.length > 0;
    const s = S[sel || "World"], labels = document.querySelectorAll("#totals .label"), subs = ["#kCasesToday", "#kDeathsToday"];
    const set = (i, label, num, sub) => { labels[i].textContent = label; $(["#kCases", "#kDeaths", "#kCfr"][i]).textContent = num; (i < 2 ? $(subs[i]) : $("#totals .stat:last-child .sub")).textContent = sub; };
    if (!s) { set(0, t("worldwide"), "–", ""); set(1, t("change"), "–", ""); set(2, t("highest"), "–", ""); return; }
    if (!r0(s)) { set(0, t("worldwide"), "–", ""); set(1, t("change"), "–", ""); set(2, t("highest"), "–", ""); return; }
    const r = causeRange(s), a = r.values[0], b = r.values[r.values.length - 1];
    set(0, sel ? t("latest") : t("worldwide"), f.format(b), r.years[r.years.length - 1]);
    set(1, t("change"), r.values.length > 1 && a ? (b >= a ? "+" : "") + f.format(((b - a) / a) * 100) + " %" : "–", `${r.years[0]}–${r.years[r.years.length - 1]}`);
    const sorted = [...state.countries].sort((x, y) => y.cases - x.cases);
    if (sel) set(2, t("rank"), "#" + (sorted.findIndex((c) => c.country === sel) + 1), `${t("of")} ${sorted.length}`);
    else set(2, t("highest"), sorted[0] ? f.format(sorted[0].cases) : "–", sorted[0] ? sorted[0].country : "");
  }

  function renderCauseChart() {
    const s = state.cd.series[state.country || "World"];
    if (!s) return;
    const r = causeRange(s), muted = css("--bs-secondary-color");
    $("#chartTitle").textContent = `${cn(state.cause)} · ${state.country || t("world")} (${cu(state.cause)})`;
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($("#chart"), {
      data: { labels: r.years, datasets: [{ type: "line", label: cn(state.cause), data: r.values, borderColor: css("--cases"), backgroundColor: css("--cases") + "33", borderWidth: 2, pointRadius: 3, tension: 0.2, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        scales: { x: { ticks: { color: muted }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: muted } } },
        plugins: { legend: { display: false } } },
    });
    $("#updated").textContent = `${t("causeNote")} ${endYear()}.`
  }

  function mxWin() {
    const M = state.mx.months.length, n = state.days || M;
    return { n, a: M - n, b: M };
  }
  function mxSeries(code) {
    const d = state.mx.data[mxId()], M = state.mx.months.length;
    if (code) return d[code] || new Array(M).fill(0);
    const out = new Array(M).fill(0);
    Object.values(d).forEach((s) => s.forEach((v, i) => { out[i] += v; }));
    return out;
  }
  const sumR = (arr, a, b) => arr.slice(Math.max(a, 0), b).reduce((x, y) => x + y, 0);
  function mxStats(code) {
    const { n, a, b } = mxWin(), s = mxSeries(code), cur = sumR(s, a, b), prev = a - n >= 0 ? sumR(s, a - n, a) : 0;
    const pop = code ? state.mx.states[code].pop : Object.values(state.mx.states).reduce((x, y) => x + y.pop, 0);
    return { cur, prev, rate: (cur / pop) * 1e5 * (12 / n), change: prev > 0 ? ((cur - prev) / prev) * 100 : null, pop };
  }
  function buildMxRows() {
    state.countries = Object.entries(state.mx.states).map(([code, st]) => {
      const m = mxStats(code);
      return { code, country: st.name, n: m.change === null ? 1 : 2, cases: m.cur, deaths: Math.round(m.rate * 10) / 10, per_million: m.change || 0 };
    });
  }
  function renderMxTotals() {
    const f = cf(), m = mxStats(state.country), labels = document.querySelectorAll("#totals .label");
    const subs = [$("#kCasesToday"), $("#kDeathsToday"), $("#totals .stat:last-child .sub")];
    const vals = [[t("deathsPeriod"), nf.format(m.cur), state.country ? state.mx.states[state.country].name : t("national")],
      [t("rate100k"), f.format(m.rate), ""],
      [t("change"), m.change === null ? "–" : (m.change >= 0 ? "+" : "") + f.format(m.change) + " %", t("vsPrev")]];
    vals.forEach(([l, v, s], i) => { labels[i].textContent = l; $(["#kCases", "#kDeaths", "#kCfr"][i]).textContent = v; subs[i].textContent = s; });
  }
  function renderMxChart() {
    const { a, b } = mxWin(), s = mxSeries(state.country).slice(a, b), muted = css("--bs-secondary-color");
    $("#chartTitle").textContent = `${mxName(mxId())} · ${state.country ? state.mx.states[state.country].name : t("national")} (${t("deaths")})`;
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($("#chart"), {
      data: { labels: state.mx.months.slice(a, b), datasets: [{ type: "bar", label: t("deaths"), data: s, backgroundColor: css("--cases") + "99" }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        scales: { x: { ticks: { maxTicksLimit: 12, color: muted }, grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (v) => nf.format(v), color: muted } } },
        plugins: { legend: { display: false } } },
    });
    $("#updated").textContent = `${t("mxNote")} ${state.mx.months[state.mx.months.length - 1]}${t("mxLag")}`;
  }
  async function loadMx() {
    showError("");
    try {
      if (!state.mx) state.mx = await (await fetch("/mexico.json")).json();
      buildMxRows();
      applyLang();
    } catch (e) { showError(t("err502")); }
  }

  async function loadCause() {
    showError("");
    try {
      if (!state.cd || state.cd.id !== state.cause) state.cd = await api(`/causes/${state.cause}`);
      buildCauseRows();
      if (state.country && !state.cd.series[state.country]) state.country = "";
      applyLang();
    } catch (e) { showError(e.message); }
  }

  function setRanges() {
    const opts = isMx() ? [[6, "m6"], [12, "y1"], [24, "y2"], [60, "y5"], [0, "all"]] : isCause() ? [[1, "d1"], [5, "d5"], [10, "d10"], [20, "d20"], [0, "all"]] : [[90, "d90"], [365, "y1"], [730, "y2"], [3650, "all"]];
    $("#rangeSel").innerHTML = opts.map(([v, k]) => `<option value="${v}" data-i18n="${k}">${t(k)}</option>`).join("");
    state.days = isMx() ? 12 : isCause() ? 10 : 365;
    $("#rangeSel").value = state.days;
  }

  async function load() {
    if (isMx()) return loadMx();
    if (isCause()) return loadCause();
    showError("");
    const name = state.country;
    try {
      const [tot, hist] = await Promise.all([
        name ? Promise.resolve(null) : api(`/global?days=${state.days}`),
        api(name ? `/countries/${encodeURIComponent(name)}/history?days=${state.days}` : `/history?days=${state.days}`),
      ]);
      if (tot) renderTotals(tot);
      else {
        const c = state.countries.find((x) => x.country === name);
        if (c) renderTotals(c);
      }
      $("#chartTitle").textContent = `${t("chartTitle")} · ${name || t("world")}`;
      renderChart(hist);
    } catch (e) { showError(e.message); }
  }

  function applyLang() {
    document.documentElement.lang = lang;
    nf = new Intl.NumberFormat(t("locale"));
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => el.dataset.i18nAttr.split(";").forEach((p) => {
      const [a, k] = p.split(":"); el.setAttribute(a, t(k));
    }));
    $("#langBtn").textContent = lang === "es" ? "EN" : "ES";
    const cs = $("#causeSel"), cc = state.cause;
    const mxOpts = state.mx ? `<optgroup label="${esc(t("mxGroup"))}">` + Object.keys(state.mx.causes).map((id) => `<option value="mx:${id}">${esc(mxName(id))}</option>`).join("") + "</optgroup>" : "";
    cs.innerHTML = `<option value="covid">COVID-19</option>` + mxOpts + `<optgroup label="${esc(t("mxWorld"))}">` + CAUSES.map((id) => `<option value="${id}">${esc(cn(id))}</option>`).join("") + "</optgroup>";
    cs.value = cc;
    if (isMx()) {
      ["stateCol", "deaths", "rate", "change"].forEach((k, i) => { $("#thead").querySelectorAll("th")[i].textContent = t(k); });
      renderMxTotals();
    } else if (isCause()) {
      ["country", "rate", "year", "change"].forEach((k, i) => { $("#thead").querySelectorAll("th")[i].textContent = t(k); });
      if (state.cd) renderCauseTotals();
    } else {
      $("#chartTitle").textContent = `${t("chartTitle")} · ${state.country || t("world")}`;
      if (state.totals) renderTotals(state.totals);
    }
    renderRows();
    if (isMx()) renderMxChart(); else if (isCause()) { if (state.cd) renderCauseChart(); } else if (state.last) renderChart(state.last);
    const sel = $("#countrySel");
    const cur = sel.value;
    sel.querySelectorAll("option[data-c]").forEach((o) => o.remove());
    sel.insertAdjacentHTML("beforeend", [...state.countries].sort((a, b) => a.country.localeCompare(b.country, lang))
      .map((c) => `<option data-c value="${esc(c.code || c.country)}">${esc(c.country)}</option>`).join(""));
    sel.options[0].textContent = isMx() ? t("national") : t("world");
    sel.value = isCause() || isMx() ? state.country : cur;
  }

  async function loadCountries() {
    const list = await api(`/countries?days=${state.days}`);
    state.countries = list.map((c) => ({ ...c, per_million: c.population ? (c.cases / c.population) * 1e6 : 0 }));
    applyLang();
  }

  async function init() {
    try { await loadCountries(); } catch (e) { showError(e.message); }
    try { state.mx = await (await fetch("/mexico.json")).json(); } catch (_e) { state.mx = null; }
    applyLang();
    await load();
  }

  $("#causeSel").addEventListener("change", async (e) => {
    state.cause = e.target.value;
    state.country = "";
    $("#countrySel").value = "";
    setRanges();
    try {
      if (!isCause() && !isMx()) await loadCountries();
      await load();
    } catch (err) { showError(err.message); }
  });
  $("#countrySel").addEventListener("change", (e) => { state.country = e.target.value; load(); });
  $("#rangeSel").addEventListener("change", async (e) => {
    state.days = +e.target.value;
    if (isMx()) { buildMxRows(); applyLang(); return; }
    if (isCause()) { buildCauseRows(); applyLang(); return; }
    try { await loadCountries(); } catch (err) { showError(err.message); return; }
    load();
  });
  $("#search").addEventListener("input", (e) => { state.q = e.target.value; renderRows(); });
  $("#rows").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-c]"); if (!tr) return;
    state.country = tr.dataset.c; $("#countrySel").value = state.country; load();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.querySelectorAll("th[data-k]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k;
    state.sort = { k, dir: state.sort.k === k ? -state.sort.dir : (k === "country" ? 1 : -1) };
    renderRows();
  }));

  $("#langBtn").addEventListener("click", () => {
    lang = lang === "es" ? "en" : "es";
    try { localStorage.setItem("lang", lang); } catch {}
    applyLang();
  });

  // Tema: respeta la preferencia del sistema y recuerda la elección
  const saved = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  const setTheme = (t) => { document.documentElement.setAttribute("data-bs-theme", t); if (state.last) renderChart(state.last); };
  setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeBtn").addEventListener("click", () => {
    const th = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", th); } catch {}
    setTheme(th);
  });

  init();
})();
