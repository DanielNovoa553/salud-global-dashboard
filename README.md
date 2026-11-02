# salud-global-dashboard

Panel de datos de salud global: COVID-19 actualizado, 22 causas de muerte por país y 35 causas de muerte para México por estado y mes. Interfaz en español e inglés, tema claro/oscuro.

FastAPI (API tipada + caché + cabeceras de seguridad) · JavaScript vanilla · Bootstrap 5 · Chart.js.

## Qué incluye
| Vista | Fuente | Granularidad |
|---|---|---|
| COVID-19 | [OMS](https://data.who.int/dashboards/covid19/data) (banderas y población: [disease.sh](https://disease.sh)) | Diaria/semanal, filtros 90 días – todo |
| Causas mundiales (suicidio, drogas, tuberculosis, homicidio, cáncer, mortalidad infantil…) | [Our World in Data](https://ourworldindata.org) y [Banco Mundial](https://data.worldbank.org) | Anual, con 2–4 años de retraso |
| México (diabetes, infarto, homicidio, sobredosis, cánceres…) | Secretaría de Salud / INEGI (defunciones registradas) | Mensual por estado, 2019–2024 |

Los últimos meses de México pueden estar incompletos por rezago de registro.

## Local
    python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
    pip install -r requirements-dev.txt
    pytest
    uvicorn app.main:app --reload      # http://localhost:8000  ·  docs: /api/docs

## Datos de México
`app/static/mexico.json` se genera con los microdatos de defunciones (archivos DEFUN_AAAA.zip de la DGIS). Cuando se publique un año nuevo, agrégalo en `FILES` y ejecuta:

    python scripts/build_mexico.py

## API
- `GET /api/global?days=` · `GET /api/countries?days=` · `GET /api/history?days=` · `GET /api/countries/{pais}/history?days=`
- `GET /api/causes/{causa}` — serie anual por país
- `GET /health`

## Variables de entorno
- `WHO_CSV_URL`, `COVID_META_URL`, `OWID_BASE`, `WB_BASE` — cambian de fuente sin tocar código
- `CACHE_TTL` segundos (21600) · `LOG_LEVEL` (INFO)

## Publicar (Render / Railway / Fly.io)
Sube el repo a GitHub y crea un *Web Service* desde el Dockerfile (o con Python:
build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`).
Health check: `/health`. HTTPS lo da la plataforma.
