import { test } from "node:test";
import assert from "node:assert/strict";
import { proximosVencimientos, totalFijosMensual, saldoDeuda, totalDeudas, pagoDeFijo, movimientoDeFijo } from "../motor/fijos.js";
import { ESTADOS } from "../motor/veredicto.js";
import { datosDePrueba, conMovimientos } from "./ayuda.js";

const HOY = "2026-09-08";

test("lo vencido y no pagado sigue apareciendo: es justo lo que no hay que olvidar", () => {
  const v = proximosVencimientos(datosDePrueba(), HOY, 15);
  assert.equal(v.length, 2);
  assert.equal(v[0].fijo.nombre, "Renta");
  assert.equal(v[0].dias, -3);
  assert.equal(v[0].vencido, true);
  assert.equal(v[1].fijo.nombre, "Internet");
  assert.equal(v[1].dias, 2);
});

test("un fijo ya pagado este mes desaparece de la lista", () => {
  const datos = conMovimientos(datosDePrueba(), [
    { fecha: "2026-09-05", monto: 500000, tipo: "gasto", categoria: "casa", fijoId: "f_renta" },
  ]);
  const v = proximosVencimientos(datos, HOY, 15);
  assert.equal(v.length, 1);
  assert.equal(v[0].fijo.nombre, "Internet");
  assert.ok(pagoDeFijo(datos, "f_renta", "2026-09"));
});

test("la ventana de días se respeta", () => {
  assert.equal(proximosVencimientos(datosDePrueba(), HOY, 1).length, 1, "solo la renta vencida");
  assert.ok(proximosVencimientos(datosDePrueba(), HOY, 40).length >= 3, "con más ventana entra el mes siguiente");
});

test("el total de fijos nombra los que no pudo sumar", () => {
  const t = totalFijosMensual(datosDePrueba({
    fijos: [
      { id: "f1", nombre: "Renta", monto: 500000, diaCorte: 5 },
      { id: "f2", nombre: "Gimnasio", monto: null, diaCorte: 3 },
    ],
  }));
  assert.equal(t.total, 500000);
  assert.deepEqual(t.desconocidos, ["Gimnasio"]);
  assert.match(t.veredicto.datos.falta, /Gimnasio/);
});

test("sin tasa capturada NO se proyecta interés: se declara", () => {
  const deuda = { id: "d1", nombre: "Tarjeta", montoOriginal: 1000000, tasaAnual: null, diaCorte: 20, activa: true };
  const datos = conMovimientos({ ...datosDePrueba(), deudas: [deuda] }, [
    { fecha: "2026-09-03", monto: 200000, tipo: "gasto", categoria: "deuda", deudaId: "d1" },
  ]);

  const s = saldoDeuda(datos, deuda);
  assert.equal(s.pagado, 200000);
  assert.equal(s.saldo, 800000);
  assert.match(s.veredicto.motivo, /sin intereses/);
  assert.equal(s.veredicto.datos.tasaAnual, null);
  assert.equal(totalDeudas(datos).conIntereses, false, "quien lea el total sabe que es sin intereses");
});

test("una deuda sin monto original no tiene saldo que inventar", () => {
  const deuda = { id: "d2", nombre: "Préstamo", montoOriginal: null, tasaAnual: null, diaCorte: 1, activa: true };
  const s = saldoDeuda({ ...datosDePrueba(), deudas: [deuda] }, deuda);
  assert.equal(s.saldo, null);
  assert.equal(s.veredicto.estado, ESTADOS.SIN_DATOS);
});

test("marcar un fijo como pagado produce el movimiento que lo comprueba", () => {
  const fijo = datosDePrueba().fijos[0];
  const mov = movimientoDeFijo(fijo, HOY);
  assert.equal(mov.monto, 500000);
  assert.equal(mov.fijoId, fijo.id);
  assert.equal(mov.tipo, "gasto");
});
