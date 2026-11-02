"""Genera app/static/mexico.json con defunciones por causa, estado y mes (Secretaría de Salud / INEGI).

Uso: python scripts/build_mexico.py
Fuente: http://www.dgis.salud.gob.mx/contenidos/basesdedatos/da_defunciones_gobmx.html
"""
import csv
import io
import json
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

BASE = "http://www.dgis.salud.gob.mx/descargas/datosabiertos/defunciones/registro/"
FILES = ["DEFUN_2019.zip", "DEFUN_2020.zip", "DEFUN_2021.zip", "DEFUN_2022.zip", "DEFUN_2023.zip", "DEFUN_2024.zip"]
FIRST_YEAR = 2019
OUT = Path(__file__).resolve().parent.parent / "app" / "static" / "mexico.json"

STATES = {
    "01": "Aguascalientes", "02": "Baja California", "03": "Baja California Sur", "04": "Campeche",
    "05": "Coahuila", "06": "Colima", "07": "Chiapas", "08": "Chihuahua", "09": "Ciudad de México",
    "10": "Durango", "11": "Guanajuato", "12": "Guerrero", "13": "Hidalgo", "14": "Jalisco",
    "15": "Estado de México", "16": "Michoacán", "17": "Morelos", "18": "Nayarit", "19": "Nuevo León",
    "20": "Oaxaca", "21": "Puebla", "22": "Querétaro", "23": "Quintana Roo", "24": "San Luis Potosí",
    "25": "Sinaloa", "26": "Sonora", "27": "Tabasco", "28": "Tamaulipas", "29": "Tlaxcala",
    "30": "Veracruz", "31": "Yucatán", "32": "Zacatecas",
}
# Población Censo 2020 (INEGI)
POP = {
    "01": 1425607, "02": 3769020, "03": 798447, "04": 928363, "05": 3146771, "06": 731391, "07": 5543828,
    "08": 3741869, "09": 9209944, "10": 1832650, "11": 6166934, "12": 3540685, "13": 3082841, "14": 8348151,
    "15": 16992418, "16": 4748846, "17": 1971520, "18": 1235456, "19": 5784442, "20": 4132148, "21": 6583278,
    "22": 2368467, "23": 1857985, "24": 2822255, "25": 3026943, "26": 2944840, "27": 2402598, "28": 3527735,
    "29": 1342977, "30": 8062579, "31": 2320898, "32": 1622138,
}
# id: (es, en, rangos CIE-10 por los 3 primeros caracteres; None = todas)
CAUSES = {
    "total": ("Todas las causas", "All causes", None),
    "diabetes": ("Diabetes", "Diabetes", [("E10", "E14")]),
    "ischemic": ("Infarto y cardiopatía isquémica", "Heart attack & ischemic heart disease", [("I20", "I25")]),
    "stroke": ("Enfermedad cerebrovascular (derrame)", "Stroke", [("I60", "I69")]),
    "hypertension": ("Enfermedades hipertensivas", "Hypertensive diseases", [("I10", "I15")]),
    "cancer": ("Cáncer (todos)", "Cancer (all)", [("C00", "C97")]),
    "lung_cancer": ("Cáncer de pulmón", "Lung cancer", [("C33", "C34")]),
    "breast_cancer": ("Cáncer de mama", "Breast cancer", [("C50", "C50")]),
    "prostate_cancer": ("Cáncer de próstata", "Prostate cancer", [("C61", "C61")]),
    "stomach_cancer": ("Cáncer de estómago", "Stomach cancer", [("C16", "C16")]),
    "liver_cancer": ("Cáncer de hígado", "Liver cancer", [("C22", "C22")]),
    "colorectal_cancer": ("Cáncer colorrectal", "Colorectal cancer", [("C18", "C21")]),
    "cervical_cancer": ("Cáncer cervicouterino", "Cervical cancer", [("C53", "C53")]),
    "leukemia": ("Leucemia", "Leukemia", [("C91", "C95")]),
    "pneumonia": ("Neumonía e influenza", "Pneumonia & influenza", [("J09", "J18")]),
    "copd": ("EPOC y enfermedades respiratorias crónicas", "COPD & chronic respiratory disease", [("J40", "J47")]),
    "covid": ("COVID-19", "COVID-19", [("U07", "U07")]),
    "kidney": ("Enfermedad renal", "Kidney disease", [("N00", "N19")]),
    "cirrhosis": ("Enfermedades del hígado (cirrosis)", "Liver disease (cirrhosis)", [("K70", "K77")]),
    "alzheimer": ("Alzheimer", "Alzheimer's disease", [("G30", "G30")]),
    "hiv": ("VIH/SIDA", "HIV/AIDS", [("B20", "B24")]),
    "tuberculosis": ("Tuberculosis", "Tuberculosis", [("A15", "A19")]),
    "dengue": ("Dengue", "Dengue", [("A90", "A91")]),
    "homicide": ("Homicidio", "Homicide", [("X85", "Y09")]),
    "suicide": ("Suicidio", "Suicide", [("X60", "X84")]),
    "road": ("Accidentes de tránsito", "Road traffic accidents", [("V01", "V99")]),
    "falls": ("Caídas", "Falls", [("W00", "W19")]),
    "drowning": ("Ahogamiento", "Drowning", [("W65", "W74")]),
    "poisoning": ("Envenenamiento accidental", "Accidental poisoning", [("X40", "X49")]),
    "drugs": ("Drogas (sobredosis y consumo)", "Drugs (overdose & use disorders)", [("X41", "X42"), ("X44", "X44"), ("F11", "F19")]),
    "alcohol": ("Alcohol", "Alcohol", [("F10", "F10"), ("K70", "K70"), ("X45", "X45")]),
    "malnutrition": ("Desnutrición", "Malnutrition", [("E40", "E46")]),
    "obesity": ("Obesidad", "Obesity", [("E66", "E66")]),
    "maternal": ("Mortalidad materna", "Maternal deaths", [("O00", "O99")]),
    "perinatal": ("Afecciones perinatales", "Perinatal conditions", [("P00", "P96")]),
    "congenital": ("Malformaciones congénitas", "Congenital malformations", [("Q00", "Q99")]),
}


def groups_for(code3: str) -> list[str]:
    return [cid for cid, (_, _, rng) in CAUSES.items()
            if rng is None or any(lo <= code3 <= hi for lo, hi in rng)]


def main() -> None:
    counts: dict[str, dict[str, dict[str, int]]] = {c: {} for c in CAUSES}
    cache: dict[str, list[str]] = {}
    tmp = Path(tempfile.mkdtemp())
    for name in FILES:
        zpath = tmp / name
        print(f"descargando {name}...", flush=True)
        urllib.request.urlretrieve(BASE + name, zpath)
        with zipfile.ZipFile(zpath) as z0:
            inner = [n for n in z0.namelist() if n.lower().endswith(".zip")]
            if inner:  # 2021 viene como zip dentro de zip
                z0.extract(inner[0], tmp)
                outer = zpath
                zpath = tmp / inner[0]
        if inner:
            outer.unlink()
        with zipfile.ZipFile(zpath) as z:
            member = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            with z.open(member) as raw:
                rd = csv.DictReader(io.TextIOWrapper(raw, encoding="latin-1", newline=""))
                rd.fieldnames = [f.strip().lower() for f in rd.fieldnames]
                for r in rd:
                    st = r["ent_resid"].zfill(2)
                    if st not in STATES:
                        continue
                    try:
                        y, m = int(r["anio_ocur"]), int(r["mes_ocurr"])
                    except ValueError:
                        continue
                    if y < FIRST_YEAR or not 1 <= m <= 12:
                        continue
                    code = r["causa_def"].strip().upper()[:3]
                    gs = cache.get(code)
                    if gs is None:
                        gs = cache[code] = groups_for(code)
                    key = f"{y}-{m:02d}"
                    for g in gs:
                        d = counts[g].setdefault(st, {})
                        d[key] = d.get(key, 0) + 1
        zpath.unlink()
    months = sorted({k for g in counts.values() for s in g.values() for k in s})
    out = {
        "months": months,
        "states": {k: {"name": v, "pop": POP[k]} for k, v in STATES.items()},
        "causes": {k: {"es": v[0], "en": v[1]} for k, v in CAUSES.items()},
        "data": {c: {st: [d.get(mo, 0) for mo in months] for st, d in sorted(g.items())} for c, g in counts.items()},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("listo", OUT, OUT.stat().st_size // 1024, "KB", months[0], "->", months[-1])


if __name__ == "__main__":
    sys.exit(main())
