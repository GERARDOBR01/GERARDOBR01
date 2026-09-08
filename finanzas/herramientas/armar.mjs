// Armado — junta los módulos en un archivo HTML que se abre solo.
//
// No hay bundler, ni npm, ni nada que instalar: los módulos se concatenan en un orden fijo
// y se les quitan los `import`/`export`, porque en el navegador viven todos en el mismo
// ámbito. Es suficiente para este proyecto y no envejece.
//
// El armado FALLA RUIDOSAMENTE ante lo que produciría un HTML roto en silencio:
//   · un archivo .js que existe pero nadie metió en la lista,
//   · dos módulos que declaran el mismo nombre de nivel superior,
//   · un import o export que quedó sin resolver.
// Un build que calla y entrega basura es peor que un build que se detiene.
//
// Uso: node herramientas/armar.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Orden de armado. Las funciones se izan, pero las constantes de nivel superior no:
// el motor va antes que quien lo usa.
const MODULOS = [
  "motor/dinero.js",
  "motor/veredicto.js",
  "motor/ciclo.js",
  "motor/modelo.js",
  "motor/migraciones.js",
  "motor/presupuesto.js",
  "motor/ahorro.js",
  "motor/metas.js",
  "motor/fijos.js",
  "motor/deudas.js",
  "almacen/archivo.js",
  "almacen/local.js",
  "almacen/almacen.js",
  { ruta: "almacen/anfitrion-claude.js", opcional: true }, // borrarlo no rompe nada
  "interfaz/ui.js",
];

// El nombre de la app vive AQUÍ y en ningún otro lado: la pantalla lo lee del <title>.
const TITULO = "Quincena";
const DESCRIPCION = "Ordena tu quincena, controla tus gastos y sabe si tus metas de ahorro de verdad alcanzan.";

function fallar(mensaje) {
  console.error(`\n✗ Armado detenido: ${mensaje}\n`);
  process.exit(1);
}

const declarados = new Map();

function declaraciones(codigo, ruta) {
  const nombres = [];
  const patron = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  let coincidencia;
  while ((coincidencia = patron.exec(codigo))) nombres.push(coincidencia[1]);

  for (const nombre of nombres) {
    if (declarados.has(nombre)) {
      fallar(`"${nombre}" está declarado en ${declarados.get(nombre)} y otra vez en ${ruta}. ` +
        `Al concatenar comparten ámbito y uno pisaría al otro.`);
    }
    declarados.set(nombre, ruta);
  }
}

function limpiar(codigo) {
  return codigo
    .replace(/^import\b[^;]*;\s*$/gm, "") // los imports sobran: todo queda en el mismo ámbito
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, "")
    .trimEnd();
}

// 1) Nadie se queda fuera de la lista por olvido.
const enLista = new Set(MODULOS.map((m) => (typeof m === "string" ? m : m.ruta)));
for (const carpeta of ["motor", "almacen", "interfaz"]) {
  for (const archivo of readdirSync(join(RAIZ, carpeta)).filter((n) => n.endsWith(".js"))) {
    const ruta = `${carpeta}/${archivo}`;
    if (!enLista.has(ruta)) fallar(`${ruta} existe pero no está en MODULOS: no se armaría en la app.`);
  }
}

// 2) Concatenar.
const partes = [];
for (const entrada of MODULOS) {
  const ruta = typeof entrada === "string" ? entrada : entrada.ruta;
  let codigo;
  try {
    codigo = readFileSync(join(RAIZ, ruta), "utf8");
  } catch (e) {
    if (typeof entrada !== "string" && entrada.opcional) {
      console.log(`  · ${ruta} no está — se arma sin él (es opcional, así está diseñado)`);
      continue;
    }
    fallar(`no se pudo leer ${ruta}: ${e.message}`);
  }
  declaraciones(codigo, ruta);
  partes.push(`// ═══ ${ruta} ═══\n${limpiar(codigo)}`);
}

const cuerpo = partes.join("\n\n");

// 3) Nada de imports o exports vivos: en el navegador reventarían.
const sobrantes = cuerpo.match(/^\s*(import|export)\b.*$/gm);
if (sobrantes) fallar(`quedaron sentencias sin resolver:\n    ${sobrantes.slice(0, 5).join("\n    ")}`);

const guion = `(function () {
"use strict";

${cuerpo}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
else arrancar();
})();`;

// 4) Y que lo armado sea JavaScript válido. Parece obvio: por no comprobarlo, un `\\"`
//    dentro de una expresión de plantilla se coló hasta el navegador y la app no arrancó.
//    `new Function` lo parsea sin ejecutar una sola línea.
try {
  new Function(guion);
} catch (e) {
  fallar(`lo armado no es JavaScript válido: ${e.message}`);
}

const estilos = readFileSync(join(RAIZ, "interfaz/estilos.css"), "utf8");
const marcado = readFileSync(join(RAIZ, "interfaz/plantilla.html"), "utf8");
const sello = new Date().toISOString().slice(0, 10);

const encabezado = `<title>${TITULO}</title>
<meta name="description" content="${DESCRIPCION}">
<style>
${estilos}</style>`;

// Salida A: autónoma. Ésta es la app. Se abre desde el disco, sin servidor y sin red.
const autonoma = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#1f8a55">
${encabezado}
</head>
<body>
<!-- Armado el ${sello} desde finanzas/. No editar a mano: se regenera con armar.mjs. -->
${marcado}
<script>
${guion}
</script>
</body>
</html>
`;

// Salida B: la misma app para publicar donde el entorno pone su propio envoltorio.
const publicable = `${encabezado}
${marcado}
<script>
${guion}
</script>
`;

mkdirSync(join(RAIZ, "app"), { recursive: true });
writeFileSync(join(RAIZ, "app/finanzas.html"), autonoma);
writeFileSync(join(RAIZ, "app/finanzas.artifact.html"), publicable);

const kb = (t) => `${(Buffer.byteLength(t) / 1024).toFixed(1)} KB`;
console.log(`\n✓ Armado (${MODULOS.length - 1}+ módulos, ${declarados.size} nombres, 0 dependencias)`);
console.log(`  app/finanzas.html           ${kb(autonoma)}  ← autónoma: ábrela desde el disco`);
console.log(`  app/finanzas.artifact.html  ${kb(publicable)}\n`);
