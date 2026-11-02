"""Salud global dashboard: FastAPI backend (cached proxy + typed API) serving a static frontend."""
import asyncio
import csv
import io
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastapi import FastAPI, HTTPException, Path as PathParam, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

WHO_CSV = os.getenv("WHO_CSV_URL", "https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/WHO-COVID-19-global-daily-data.csv")
META_URL = os.getenv("COVID_META_URL", "https://disease.sh/v3/covid-19/countries")  # banderas y población
CACHE_TTL = int(os.getenv("CACHE_TTL", "21600"))  # segundos; la OMS actualiza ~semanal
STATIC_DIR = Path(__file__).parent / "static"
log = logging.getLogger("covid")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

_store: dict[str, Any] = {"expires": 0.0, "data": None}
_lock = asyncio.Lock()


class Totals(BaseModel):
    cases: int
    deaths: int
    recovered: int
    today_cases: int
    today_deaths: int
    population: int
    updated: int | None = None


class CountryRow(BaseModel):
    country: str
    iso2: str | None = None
    flag: str | None = None
    cases: int
    deaths: int
    recovered: int
    today_cases: int
    today_deaths: int
    population: int


class Series(BaseModel):
    dates: list[str]
    cases: list[int]
    deaths: list[int]
    new_cases: list[int]
    new_deaths: list[int]


def _int(v: Any) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def parse_who(text: str) -> dict[str, dict]:
    """CSV de la OMS -> {iso2: {name, dates, cases, deaths}} con acumulados (se arrastra el último valor)."""
    out: dict[str, dict] = {}
    for row in csv.DictReader(io.StringIO(text)):
        code = row["Country_code"] or row["Country"]
        c = out.setdefault(code, {"name": row["Country"], "dates": [], "cases": [], "deaths": []})
        cases, deaths = _int(row["Cumulative_cases"]), _int(row["Cumulative_deaths"])
        if c["cases"]:  # los acumulados no deben bajar
            cases, deaths = max(cases, c["cases"][-1]), max(deaths, c["deaths"][-1])
        c["dates"].append(row["Date_reported"])
        c["cases"].append(cases)
        c["deaths"].append(deaths)
    return out


async def _load(client: httpx.AsyncClient) -> dict:
    r = await client.get(WHO_CSV, timeout=60)
    r.raise_for_status()
    countries = await asyncio.to_thread(parse_who, r.content.decode("utf-8-sig"))
    meta: dict[str, dict] = {}
    try:
        m = await client.get(META_URL)
        m.raise_for_status()
        meta = {(x.get("countryInfo") or {}).get("iso2"): x for x in m.json()}
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("metadata unavailable: %s", exc)
    return {"countries": countries, "meta": meta}


async def get_data(request: Request) -> dict:
    """Datos de la OMS con caché TTL; si falla y hay copia vieja, la sirve (stale-if-error)."""
    if _store["data"] and _store["expires"] > time.monotonic():
        return _store["data"]
    async with _lock:
        if _store["data"] and _store["expires"] > time.monotonic():
            return _store["data"]
        try:
            _store["data"] = await _load(request.app.state.client)
            _store["expires"] = time.monotonic() + CACHE_TTL
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            log.warning("upstream error: %s", exc)
            if not _store["data"]:
                raise HTTPException(502, "El servicio de datos no está disponible. Intenta de nuevo.")
        return _store["data"]


def build_series(dates: list[str], cases: list[int], deaths: list[int], days: int) -> Series:
    nc = [0] + [max(cases[i] - cases[i - 1], 0) for i in range(1, len(cases))]  # max(): correcciones negativas
    nd = [0] + [max(deaths[i] - deaths[i - 1], 0) for i in range(1, len(deaths))]
    s = slice(max(len(dates) - days, 1), None)
    return Series(dates=dates[s], cases=cases[s], deaths=deaths[s], new_cases=nc[s], new_deaths=nd[s])


def _week(a: list[int]) -> int:
    return a[-1] - a[-8] if len(a) > 7 else 0


def _period(a: list[int], days: int | None) -> int:
    """Aumento del acumulado en los últimos `days` días (None = total)."""
    if days is None or len(a) <= days:
        return a[-1]
    return a[-1] - a[-1 - days]


def _country_row(code: str, c: dict, meta: dict, days: int | None) -> CountryRow:
    m = meta.get(code) or {}
    return CountryRow(
        country=c["name"], iso2=code if len(code) == 2 else None, flag=(m.get("countryInfo") or {}).get("flag"),
        cases=_period(c["cases"], days), deaths=_period(c["deaths"], days), recovered=0,
        today_cases=_week(c["cases"]), today_deaths=_week(c["deaths"]), population=_int(m.get("population")),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(timeout=httpx.Timeout(10.0), headers={"User-Agent": "salud-global-dashboard/1.0"})
    yield
    await app.state.client.aclose()


app = FastAPI(title="Salud global Dashboard", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(GZipMiddleware, minimum_size=1000)

CSP = (
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "
    "style-src 'self' https://cdn.jsdelivr.net; img-src 'self' https://disease.sh data:; "
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.update({
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "DENY",
    })
    if not request.url.path.startswith("/api/docs"):  # Swagger UI necesita su propia CSP
        resp.headers["Content-Security-Policy"] = CSP
    if request.url.path.startswith("/api/") and request.method == "GET":
        resp.headers["Cache-Control"] = f"public, max-age={min(CACHE_TTL, 300)}"
    return resp


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


Days = Annotated[int, Query(ge=7, le=3650, description="Últimos N días disponibles")]
CountryName = Annotated[str, PathParam(min_length=2, max_length=80, pattern=r"^[\w\s.'’\-()]+$")]


@app.get("/api/global", response_model=Totals)
async def global_totals(request: Request, days: Days | None = None):
    g = _global_series(await get_data(request))
    return Totals(
        cases=_period(g["cases"], days), deaths=_period(g["deaths"], days), recovered=0,
        today_cases=_week(g["cases"]), today_deaths=_week(g["deaths"]),
        population=0, updated=int(datetime.fromisoformat(g["dates"][-1]).timestamp() * 1000),
    )


def _global_series(data: dict) -> dict:
    if "global" not in data:
        cases: dict[str, int] = {}
        deaths: dict[str, int] = {}
        for c in data["countries"].values():
            for d, a, b in zip(c["dates"], c["cases"], c["deaths"]):
                cases[d] = cases.get(d, 0) + a
                deaths[d] = deaths.get(d, 0) + b
        dates = sorted(cases)
        data["global"] = {"dates": dates, "cases": [cases[d] for d in dates], "deaths": [deaths[d] for d in dates]}
    return data["global"]


@app.get("/api/countries", response_model=list[CountryRow])
async def countries(request: Request, days: Days | None = None):
    data = await get_data(request)
    return [_country_row(code, c, data["meta"], days) for code, c in data["countries"].items() if c["cases"]]



@app.get("/api/history", response_model=Series)
async def global_history(request: Request, days: Days = 365):
    g = _global_series(await get_data(request))
    return build_series(g["dates"], g["cases"], g["deaths"], days)


@app.get("/api/countries/{country}/history", response_model=Series)
async def country_history(request: Request, country: CountryName, days: Days = 365):
    data = await get_data(request)
    name = country.casefold()
    c = next((c for c in data["countries"].values() if c["name"].casefold() == name), None)
    if not c:
        raise HTTPException(404, "No se encontraron datos para ese país.")
    return build_series(c["dates"], c["cases"], c["deaths"], days)


# Causas anuales: id -> (fuente, código). owid = gráfico de Our World in Data; wb = indicador del Banco Mundial.
CAUSES = {
    "suicide": ("owid", "death-rate-from-suicides-gho"),
    "drugs": ("owid", "death-rate-from-drug-use-disorders"),
    "tuberculosis": ("owid", "tuberculosis-death-rate"),
    "homicide": ("owid", "homicide-rate-unodc"),
    "malaria": ("owid", "death-rate-from-malaria"),
    "falls": ("owid", "death-rate-from-falls"),
    "poisoning": ("owid", "death-rate-from-poisonings"),
    "cancer": ("owid", "death-rate-from-cancer"),
    "stomach_cancer": ("owid", "stomach-cancer-death-rate"),
    "liver_cancer": ("owid", "liver-cancer-death-rate"),
    "road": ("wb", "SH.STA.TRAF.P5"),
    "ncd70": ("wb", "SH.DYN.NCOM.ZS"),
    "air": ("wb", "SH.STA.AIRP.P5"),
    "water": ("wb", "SH.STA.WASH.P5"),
    "neonatal": ("wb", "SH.DYN.NMRT"),
    "under5": ("wb", "SH.DYN.MORT"),
    "infant": ("wb", "SP.DYN.IMRT.IN"),
    "maternal": ("wb", "SH.STA.MMRT"),
    "aids": ("wb", "SH.DYN.AIDS.DH"),
    "share_comm": ("wb", "SH.DTH.COMM.ZS"),
    "share_ncd": ("wb", "SH.DTH.NCOM.ZS"),
    "share_injury": ("wb", "SH.DTH.INJR.ZS"),
}
OWID_URL = os.getenv("OWID_BASE", "https://ourworldindata.org/grapher")
WB_URL = os.getenv("WB_BASE", "https://api.worldbank.org/v2")
FLAG_URL = "https://disease.sh/assets/img/flags/{}.png"
_cause_cache: dict[str, tuple[float, dict]] = {}
_iso: dict[str, tuple[str, str]] = {}  # iso3 -> (iso2, nombre)


class CauseSeries(BaseModel):
    flag: str | None = None
    years: list[int]
    values: list[float]


def _flag(iso2: str | None) -> str | None:
    return FLAG_URL.format(iso2.lower()) if iso2 else None


async def get_iso(client: httpx.AsyncClient) -> dict[str, tuple[str, str]]:
    if not _iso:
        r = await client.get(f"{WB_URL}/country", params={"format": "json", "per_page": 400}, timeout=30)
        r.raise_for_status()
        for c in r.json()[1]:
            if c["region"]["value"] != "Aggregates":
                _iso[c["id"]] = (c["iso2Code"], c["name"])
    return _iso


class CauseData(BaseModel):
    id: str
    series: dict[str, CauseSeries]


def _add(out: dict[str, CauseSeries], name: str, iso2: str | None, year: int, v: float) -> None:
    s = out.setdefault(name, CauseSeries(flag=_flag(iso2), years=[], values=[]))
    s.years.append(year)
    s.values.append(v)


def parse_owid(text: str, iso: dict) -> dict[str, CauseSeries]:
    out: dict[str, CauseSeries] = {}
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 4 or not row[2].isdigit() or row[3] == "":
            continue
        name, code = row[0], row[1]
        if name != "World" and code not in iso:
            continue
        try:
            v = float(row[3])
        except ValueError:
            continue
        _add(out, name, iso.get(code, (None,))[0], int(row[2]), v)
    return out


def parse_wb(rows: list, iso: dict) -> dict[str, CauseSeries]:
    out: dict[str, CauseSeries] = {}
    for r in sorted(rows or [], key=lambda r: r["date"]):
        code = r.get("countryiso3code")
        if r.get("value") is None or (code != "WLD" and code not in iso):
            continue
        name, iso2 = ("World", None) if code == "WLD" else (iso[code][1], iso[code][0])
        _add(out, name, iso2, int(r["date"]), float(r["value"]))
    return out


@app.get("/api/causes/{cause}", response_model=CauseData)
async def cause_data(request: Request, cause: str):
    spec = CAUSES.get(cause)
    if not spec:
        raise HTTPException(404, "Causa desconocida.")
    hit = _cause_cache.get(cause)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    client, (source, code) = request.app.state.client, spec
    try:
        iso = await get_iso(client)
        if source == "owid":
            r = await client.get(f"{OWID_URL}/{code}.csv", params={"v": "1", "csvType": "full"},
                                headers={"User-Agent": "Mozilla/5.0 salud-global-dashboard"}, timeout=30, follow_redirects=True)
            r.raise_for_status()
            series = await asyncio.to_thread(parse_owid, r.content.decode("utf-8-sig"), iso)
        else:
            r = await client.get(f"{WB_URL}/country/all/indicator/{code}",
                                 params={"format": "json", "per_page": 20000, "date": "1990:2030"}, timeout=60)
            r.raise_for_status()
            series = await asyncio.to_thread(parse_wb, r.json()[1], iso)
        data = CauseData(id=cause, series=series)
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        log.warning("cause error %s: %s", cause, exc)
        if hit:
            return hit[1]
        raise HTTPException(502, "El servicio de datos no está disponible. Intenta de nuevo.")
    _cause_cache[cause] = (time.monotonic() + 86400, data)
    return data


# El frontend se monta al final para no tapar /api/*
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
