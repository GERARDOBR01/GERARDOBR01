import { test } from "node:test";
import assert from "node:assert/strict";
import { panelHoy, capacidadPorCiclo, ingresosDelCiclo, fijosDelCiclo, ahorroAcumulado, DIAS_MINIMOS_RITMO } from "../motor/ahorro.js";
import { topesVariables } from "../motor/presupuesto.js";
import { cicloDe } from "../motor/ciclo.js";
import { ESTADOS } from "../motor/veredicto.js";
import { datosDePrueba, conMovimientos } from "./ayuda.js";

const HOY = "2026-09-08"; // día 8 de una quincena de 15

const gastosDelCiclo = [
  { fecha: "2026-09-03", monto: 120000, tipo: "gasto", categoria: "super" },
  { fecha: "2026-09-07", monto: 155000, tipo: "gasto", categoria: "super" },
  { fecha: "2026-09-05", monto: 90000, tipo: "gasto", categoria: "transporte" },
  { fecha: "2026-09-06", monto: 95000, tipo: "gasto", categoria: "comida-fuera" },
  { fecha: "2026-09-06", monto: 40000, tipo: "gasto", categoria: "ocio" },
];

test("sin ingreso capturado ni ingreso en el perfil, el panel DECLARA que no sabe", () => {
  const datos = { ...datosDePrueba(), perfil: { ...datosDePrueba().perfil, ingresoQuincenal: null } };
  const panel = panelHoy(datos, HOY);

  assert.equal(panel.disponible, null, "un cero aquí parecería un dato, y no lo es");
  assert.equal(panel.veredicto.estado, ESTADOS.SIN_DATOS);
  assert.match(panel.veredicto.datos.falta, /ingreso quincenal/);
  assert.equal(panel.ciclo.fin, "2026-09-15", "lo que sí se sabe se sigue calculando");
});

test("el ingreso capturado le gana al del perfil, y dice cuál usó", () => {
  const base = datosDePrueba();
  assert.deepEqual(ingresosDelCiclo(base, cicloDe(HOY)), { monto: 800000, origen: "perfil" });

  const conDeposito = conMovimientos(base, [{ fecha: "2026-09-02", monto: 750000, tipo: "ingreso" }]);
  assert.deepEqual(ingresosDelCiclo(conDeposito, cicloDe(HOY)), { monto: 750000, origen: "capturado" });
});

test("los fijos del ciclo separan lo pagado de lo pendiente", () => {
  const datos = datosDePrueba();
  const sinPagar = fijosDelCiclo(datos, cicloDe(HOY));
  assert.equal(sinPagar.total, 560000, "renta 500,000 + internet 60,000, ambos vencen antes del 15");
  assert.equal(sinPagar.pendiente, 560000);

  const conRentaPagada = conMovimientos(datos, [
    { fecha: "2026-09-05", monto: 500000, tipo: "gasto", categoria: "casa", fijoId: "f_renta" },
  ]);
  const despues = fijosDelCiclo(conRentaPagada, cicloDe(HOY));
  assert.equal(despues.pagado, 500000);
  assert.equal(despues.pendiente, 60000, "lo ya pagado no se cuenta dos veces");
});

test("un fijo sin monto no se cuenta: se nombra", () => {
  const datos = datosDePrueba({ fijos: [{ id: "f_x", nombre: "Gimnasio", monto: null, diaCorte: 3 }] });
  const f = fijosDelCiclo(datos, cicloDe(HOY));
  assert.equal(f.total, 0);
  assert.deepEqual(f.desconocidos, ["Gimnasio"]);
});

test("el panel calcula el hecho: ingreso − gastado − fijos pendientes", () => {
  const datos = conMovimientos(datosDePrueba(), gastosDelCiclo);
  const panel = panelHoy(datos, HOY);

  assert.equal(panel.gasto.variable, 500000);
  assert.equal(panel.fijos.pendiente, 560000);
  assert.equal(panel.disponible, -260000, "800,000 − 500,000 − 560,000");
  assert.equal(panel.veredicto.estado, ESTADOS.NO_ALCANZA);
  assert.match(panel.veredicto.motivo, /sobregirado/);
});

test("el disponible por día reparte lo que queda entre los días que faltan", () => {
  const datos = conMovimientos(datosDePrueba({ fijos: [] }), [
    { fecha: "2026-09-01", monto: 800000, tipo: "ingreso" },
    { fecha: "2026-09-03", monto: 160000, tipo: "gasto", categoria: "super" },
  ]);
  const panel = panelHoy(datos, HOY);
  assert.equal(panel.disponible, 640000);
  assert.equal(panel.ciclo.diasRestantes, 8);
  assert.equal(panel.porDia, 80000, "640,000 entre los 8 días que faltan");
  assert.equal(panel.veredicto.estado, ESTADOS.VA_BIEN);
});

test("con menos de 3 días de ritmo NO se proyecta: se declara qué falta", () => {
  const datos = conMovimientos(datosDePrueba({ fijos: [] }), [
    { fecha: "2026-09-02", monto: 300000, tipo: "gasto", categoria: "super" },
  ]);
  const panel = panelHoy(datos, "2026-09-02");

  assert.equal(panel.capacidad.monto, null, "una despensa el día 1 proyectaría un mes catastrófico");
  assert.equal(panel.capacidad.veredicto.estado, ESTADOS.SIN_DATOS);
  assert.ok(panel.disponible !== null, "pero el disponible real sí se sigue mostrando");
  assert.ok(DIAS_MINIMOS_RITMO >= 3);
});

test("con ritmo suficiente proyecta el cierre del ciclo y lo etiqueta como proyección", () => {
  const datos = conMovimientos(datosDePrueba(), gastosDelCiclo);
  const panel = panelHoy(datos, HOY);

  assert.equal(panel.capacidad.ritmoDiario, 62500, "500,000 gastados en 8 días");
  assert.equal(panel.capacidad.proyectadoRestante, 437500, "62,500 × los 7 días que quedan después de hoy");
  assert.equal(panel.capacidad.monto, -697500);
  assert.equal(panel.capacidad.veredicto.estado, ESTADOS.NO_ALCANZA);
  assert.equal(panel.capacidad.veredicto.fuente, "CODIGO");
});

test("capacidadPorCiclo baja los montos mensuales a la quincena", () => {
  const datos = datosDePrueba();
  const cap = capacidadPorCiclo(datos, HOY, topesVariables(datos, "2026-09"));

  assert.equal(cap.fijosCiclo, 280000, "560,000 al mes entre 2 quincenas");
  assert.equal(cap.variableCiclo, 240000, "480,000 de topes entre 2 quincenas");
  assert.equal(cap.monto, 280000, "800,000 − 280,000 − 240,000");
  assert.match(cap.veredicto.motivo, /sin tope no entran/, "avisa que ocio no está contado");
});

test("sin ingreso quincenal no hay capacidad que planear", () => {
  const base = datosDePrueba();
  const datos = { ...base, perfil: { ...base.perfil, ingresoQuincenal: null } };
  const cap = capacidadPorCiclo(datos, HOY, topesVariables(datos, "2026-09"));
  assert.equal(cap.monto, null);
  assert.equal(cap.veredicto.estado, ESTADOS.SIN_DATOS);
});

test("el ahorro acumulado suma solo lo apartado", () => {
  const datos = conMovimientos(datosDePrueba(), [
    { fecha: "2026-09-02", monto: 100000, tipo: "ahorro", metaId: "meta_1" },
    { fecha: "2026-08-02", monto: 50000, tipo: "ahorro", metaId: "meta_2" },
    { fecha: "2026-09-02", monto: 999999, tipo: "gasto", categoria: "super" },
  ]);
  assert.equal(ahorroAcumulado(datos), 150000);
  assert.equal(ahorroAcumulado(datos, "meta_1"), 100000);
});
