// Prueba de humo en un navegador de verdad, abriendo el archivo desde el DISCO (file://),
// sin servidor y sin red. Si esto pasa, la app no depende de nadie para funcionar.
//
// Es la única pieza del proyecto que usa algo de fuera (Playwright, si está instalado en la
// máquina). No es una dependencia de la app: si no está, esta prueba se salta sola y la
// suite de `node --test` —que sí cubre todo el motor— sigue corriendo igual.
//
// Uso: node herramientas/humo.mjs

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (e) {
  try {
    ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs"));
  } catch (e2) {
    console.log("· Playwright no está instalado: se salta la prueba de navegador.");
    console.log("  El motor se prueba igual con: node --test pruebas/*.test.js");
    process.exit(0);
  }
}

const ARCHIVO = pathToFileURL(join(RAIZ, "app/finanzas.html")).href;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
const pagina = await contexto.newPage();

const errores = [];
pagina.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pagina.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });

await pagina.goto(ARCHIVO);
await pagina.waitForSelector(".barra", { timeout: 5000 });

const paso = (nombre, ok, detalle = "") => console.log(`${ok ? "  ✓" : "  ✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
let fallos = 0;
const revisar = (nombre, ok, detalle) => { paso(nombre, ok, detalle); if (!ok) fallos++; };

// 1. Abre y declara su modo de guardado
const estado = (await pagina.textContent(".estado")).trim();
revisar("abre desde el disco y declara dónde guarda", estado.includes("Solo este dispositivo"), estado);

// 2. Estado vacío: no inventa números
const cifraInicial = await pagina.textContent(".cifra");
revisar("sin ingreso capturado NO muestra un cero disfrazado", cifraInicial.trim() === "—", cifraInicial.trim());
const veredictoInicial = await pagina.textContent(".marca");
revisar("declara SIN_DATOS_SUFICIENTES", veredictoInicial.includes("SIN_DATOS"), veredictoInicial);

// 3. Capturar el ingreso quincenal
await pagina.click('[data-accion="editar-ingreso"]');
await pagina.fill('[data-clave="monto"]', "8000");
await pagina.click('button[type="submit"]');
await pagina.waitForSelector(".velo", { state: "detached" });
const trasIngreso = (await pagina.textContent(".cifra")).trim();
revisar("con el ingreso capturado aparece el disponible", trasIngreso === "$8,000.00", trasIngreso);

// 4. Capturar un gasto: + → monto → categoría → guardar
await pagina.click('[data-accion="capturar"]');
await pagina.fill('[data-clave="monto"]', "450.50");
await pagina.click('.chips [data-valor="super"]');
await pagina.click('button[type="submit"]');
await pagina.waitForSelector(".velo", { state: "detached" });
const trasGasto = (await pagina.textContent(".cifra")).trim();
revisar("el gasto se descuenta del disponible", trasGasto === "$7,549.50", trasGasto);
revisar("el movimiento aparece en la lista", (await pagina.textContent("main")).includes("Súper"));

// 5. Presupuesto y semáforo
await pagina.click('[data-vista="presupuesto"]');
await pagina.waitForSelector(".barra-progreso");
revisar("una categoría sin tope se declara SIN_TOPE", (await pagina.textContent("main")).includes("SIN_TOPE"));
await pagina.click('[data-accion="editar-tope"]');
await pagina.fill('[data-clave="tope"]', "400");
await pagina.click('button[type="submit"]');
await pagina.waitForSelector(".velo", { state: "detached" });
revisar("con tope puesto, el semáforo marca el exceso", (await pagina.textContent("main")).includes("NO_ALCANZA"));

// 6. Meta imposible → NO_ALCANZA con su alternativa
await pagina.click('[data-vista="metas"]');
await pagina.click('[data-accion="nueva-meta"]');
await pagina.fill('[data-clave="nombre"]', "Coche");
await pagina.fill('[data-clave="objetivo"]', "300000");
await pagina.fill('[data-clave="fechaLimite"]', "2026-12-31");
await pagina.click('button[type="submit"]');
await pagina.waitForSelector(".velo", { state: "detached" });
const metas = await pagina.textContent("main");
revisar("una meta imposible se declara NO_ALCANZA", metas.includes("NO_ALCANZA"));
revisar("y ofrece la fecha realista calculada", /fecha realista/.test(metas), metas.match(/Con .* la fecha realista es el [^.]*/)?.[0] || "");

// 7. Persistencia real: recargar
await pagina.reload();
await pagina.waitForSelector(".barra");
const trasRecarga = (await pagina.textContent(".cifra")).trim();
revisar("tras recargar, los datos siguen ahí", trasRecarga === "$7,549.50", trasRecarga);

// 8. Fijos
await pagina.click('[data-vista="fijos"]');
await pagina.click('[data-accion="nuevo-fijo"]');
await pagina.fill('[data-clave="nombre"]', "Renta");
await pagina.fill('[data-clave="monto"]', "5000");
await pagina.fill('[data-clave="diaCorte"]', "5");
await pagina.click('button[type="submit"]');
await pagina.waitForSelector(".velo", { state: "detached" });
revisar("el fijo entra en el comprometido del mes", (await pagina.textContent("main")).includes("$5,000.00"));

await pagina.click('[data-vista="hoy"]');
revisar("y aparece en 'Por pagar' del panel", (await pagina.textContent("main")).includes("Por pagar"));


revisar("ni un solo error de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));

await navegador.close();
console.log(fallos === 0 ? "\n✓ La app funciona abierta desde el disco.\n" : `\n✗ ${fallos} fallo(s).\n`);
process.exit(fallos ? 1 : 0);
