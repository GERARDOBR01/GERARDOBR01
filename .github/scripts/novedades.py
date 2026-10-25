"""Actualiza la sección «Novedades» del README con los últimos commits de mis repos públicos."""
import json, os, re, urllib.request
from datetime import datetime

USUARIO = "GERARDOBR01"
NOMBRES = {"CAJITAS-": "Guardadito", "Grind001": "Serie", "Asistente-de-piso": "Asistente de Piso", "CRM-CLIENTES-": "CRM Certeza"}
MOSTRAR = set(NOMBRES)  | {"veristack", "Grip"}  # solo los proyectos que presento en el perfil
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def api(ruta):
    req = urllib.request.Request("https://api.github.com" + ruta, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
        "User-Agent": "novedades-perfil",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


novedades = []
for repo in api(f"/users/{USUARIO}/repos?per_page=100&type=owner"):
    if repo["fork"] or repo["private"] or repo["name"] not in MOSTRAR:
        continue
    for c in api(f"/repos/{USUARIO}/{repo['name']}/commits?per_page=8"):
        titulo = c["commit"]["message"].splitlines()[0].strip()
        if titulo.lower().startswith(("merge ", "revert ", "readme", "docs", "novedades")):  # solo trabajo de producto
            continue
        novedades.append((c["commit"]["author"]["date"], repo["name"], titulo, c["html_url"]))

novedades.sort(reverse=True)
lineas = []
vistos = {}
for fecha, repo, titulo, url in novedades:
    if vistos.get(repo, 0) >= 2:  # a lo más dos por proyecto, para que se vea variedad
        continue
    vistos[repo] = vistos.get(repo, 0) + 1
    d = datetime.fromisoformat(fecha.replace("Z", "+00:00"))
    titulo = titulo.replace("|", "/")
    lineas.append(f"- **{NOMBRES.get(repo, repo)}** · [{titulo}]({url}) <sub>{d.day} {MESES[d.month - 1]}</sub>")
    if len(lineas) == 5:
        break

bloque = "<!--NOVEDADES:INICIO-->\n" + "\n".join(lineas) + "\n<!--NOVEDADES:FIN-->"
ruta = "README.md"
texto = open(ruta, encoding="utf-8").read()
nuevo = re.sub(r"<!--NOVEDADES:INICIO-->.*?<!--NOVEDADES:FIN-->", lambda _: bloque, texto, flags=re.S)
if nuevo != texto:
    open(ruta, "w", encoding="utf-8", newline="").write(nuevo)
    print("README actualizado")
else:
    print("sin cambios")
