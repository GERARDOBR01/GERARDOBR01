import { test } from "node:test";
import assert from "node:assert/strict";
import { exportar, importar, nombreDeRespaldo } from "../almacen/archivo.js";
import { masReciente } from "../almacen/almacen.js";
import { VERSION_DATOS } from "../motor/modelo.js";
import { datosDePrueba, conMovimientos } from "./ayuda.js";

test("exportar e importar devuelve exactamente lo mismo", () => {
  const datos = conMovimientos(datosDePrueba(), [
    { fecha: "2026-09-03", monto: 120000, tipo: "gasto", categoria: "super", nota: "despensa" },
  ]);
  const resultado = importar(exportar(datos));

  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.datos.movimientos, datos.movimientos);
  assert.deepEqual(resultado.datos.perfil, datos.perfil);
  assert.deepEqual(resultado.datos.fijos, datos.fijos);
});

test("un archivo que no es JSON se rechaza con motivo, no con una pantalla rota", () => {
  const r = importar("{esto no es json");
  assert.equal(r.ok, false);
  assert.match(r.motivo, /JSON válido/);
});

test("un respaldo de una versión más nueva no se abre a medias", () => {
  const r = importar(JSON.stringify({ ...datosDePrueba(), version: VERSION_DATOS + 3 }));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /más nueva/);
});

test("gana la copia con el sello más reciente", () => {
  const viejo = { actualizado: "2026-09-01T10:00:00.000Z", marca: "viejo" };
  const nuevo = { actualizado: "2026-09-08T10:00:00.000Z", marca: "nuevo" };
  assert.equal(masReciente(viejo, nuevo).marca, "nuevo");
  assert.equal(masReciente(nuevo, viejo).marca, "nuevo");
  assert.equal(masReciente(null, nuevo).marca, "nuevo");
  assert.equal(masReciente(viejo, null).marca, "viejo");
  assert.equal(masReciente(null, null), null);
});

test("el nombre del respaldo lleva la fecha", () => {
  assert.equal(nombreDeRespaldo("2026-09-08"), "finanzas-2026-09-08.json");
});
