// Interfaz — render directo, sin framework y sin dependencias.
//
// Un estado, una función que dibuja, y delegación de eventos. No hay nada que instalar ni
// nada que se pueda pudrir: el HTML que funciona hoy funciona igual dentro de cinco años.
//
// Regla de la pantalla: ningún número aparece sin su contexto. Si el motor devolvió
// SIN_DATOS_SUFICIENTES, aquí se ve el hueco declarado con lo que falta capturar — nunca
// un cero disfrazado de dato.

import { formatear, aCentavos } from "../motor/dinero.js";
import { hoyISO, mesDe, cicloDe } from "../motor/ciclo.js";
import {
  TIPOS, agregarMovimiento, eliminarMovimiento, movimientosEntre, categoriaPorId, idNuevo, datosVacios,
} from "../motor/modelo.js";
import { resumenPresupuesto, topesVariables } from "../motor/presupuesto.js";
import { panelHoy, capacidadPorCiclo } from "../motor/ahorro.js";
import { resumenMetas, exigenciaTotal } from "../motor/metas.js";
import { proximosVencimientos, saldoDeuda, totalFijosMensual, movimientoDeFijo } from "../motor/fijos.js";
import { abrirAlmacen, MODOS } from "../almacen/almacen.js";
import { exportar, importar, nombreDeRespaldo } from "../almacen/archivo.js";

const app = {
  datos: datosVacios(),
  almacen: null,
  vista: "hoy",
  hoy: hoyISO(),
  aviso: null,
  bloqueado: false,
};

const VISTAS = [
  { id: "hoy", icono: "⌂", nombre: "Hoy" },
  { id: "presupuesto", icono: "▤", nombre: "Presupuesto" },
  { id: "metas", icono: "◎", nombre: "Metas" },
  { id: "fijos", icono: "⏱", nombre: "Fijos" },
  { id: "ajustes", icono: "⚙", nombre: "Ajustes" },
];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// --- Utilidades de pantalla ---

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function monto(centavos, opciones) {
  return centavos === null || centavos === undefined ? "—" : formatear(centavos, opciones);
}

function fechaCorta(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

function fechaLarga(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** El veredicto tal como lo devolvió el motor: estado, motivo y fuente. */
function veredictoHTML(v) {
  if (!v) return "";
  const falta = v.datos && v.datos.falta ? `<div class="rotulo" style="width:100%">→ ${esc(v.datos.falta)}</div>` : "";
  return `<div class="veredicto"><span class="marca ${esc(v.estado)}">${esc(v.estado)}</span>
    <span>${esc(v.motivo)}</span><span class="fuente">fuente: ${esc(v.fuente)}</span>${falta}</div>`;
}

function tarjetaCifra({ rotulo, valor, clase = "", extra = "", veredicto }) {
  return `<div class="tarjeta">
    <div class="rotulo">${esc(rotulo)}</div>
    <div class="cifra ${clase}">${valor}</div>
    ${extra}
    ${veredictoHTML(veredicto)}
  </div>`;
}

function vacio(texto) {
  return `<div class="vacio">${esc(texto)}</div>`;
}

// --- Render ---

function render() {
  const raiz = document.getElementById("raiz");
  const ciclo = cicloDe(app.hoy, app.datos.perfil.cortes);
  const estado = app.almacen ? app.almacen.estado() : { modo: MODOS.LOCAL, tipoLocal: "—" };
  const sincronizado = estado.modo === MODOS.SINCRONIZADO;

  const etiquetaEstado = sincronizado
    ? "Sincronizado"
    : estado.modo === MODOS.EFIMERO
      ? "Sin guardar"
      : "Solo este dispositivo";

  raiz.innerHTML = `
    <header class="barra"><div class="envoltura">
      <div>
        <h1>${esc(document.title || "Finanzas")}</h1>
        <div class="ciclo">${esc(ciclo.etiqueta)} · ${fechaCorta(ciclo.inicio)} – ${fechaCorta(ciclo.fin)}</div>
      </div>
      <button class="estado" data-accion="ver-estado">
        <i class="punto ${sincronizado ? "vivo" : ""}"></i>${esc(etiquetaEstado)}
      </button>
    </div></header>

    <main class="envoltura">
      ${app.aviso ? `<div class="aviso ${app.bloqueado ? "malo" : ""}">${esc(app.aviso)}
        <div class="acciones"><button class="boton chico tenue" data-accion="cerrar-aviso">Entendido</button></div></div>` : ""}
      ${vistaActual()}
      <div class="pie">Tus datos viven en este dispositivo${sincronizado ? " y en tu cuenta" : ""}. Nunca en el repositorio.</div>
    </main>

    <button class="flotante" data-accion="capturar" aria-label="Capturar gasto">+</button>

    <nav class="nav"><div class="envoltura">
      ${VISTAS.map((v) => `<button data-accion="ir" data-vista="${v.id}" aria-current="${app.vista === v.id}">
        <span>${v.icono}</span>${esc(v.nombre)}</button>`).join("")}
    </div></nav>`;
}

function vistaActual() {
  if (app.vista === "presupuesto") return vistaPresupuesto();
  if (app.vista === "metas") return vistaMetas();
  if (app.vista === "fijos") return vistaFijos();
  if (app.vista === "ajustes") return vistaAjustes();
  return vistaHoy();
}

// --- Vista: Hoy ---

function nombreCiclo(ciclo) {
  return ciclo.total > 1 ? "quincena" : "mensualidad";
}

function vistaHoy() {
  const { datos, hoy } = app;
  const panel = panelHoy(datos, hoy);
  const vencimientos = proximosVencimientos(datos, hoy, 10);
  const recientes = movimientosEntre(datos, panel.ciclo.inicio, hoy).slice(0, 6);

  const primeraVez = datos.perfil.ingresoQuincenal === null && Object.keys(datos.movimientos).length === 0;
  const arranque = primeraVez
    ? `<div class="aviso">
        <b>Empieza por aquí.</b> Con tu ingreso quincenal y tus pagos fijos, los paneles se encienden.
        Son tres minutos; lo demás lo puedes ir capturando sobre la marcha.
        <div class="acciones">
          <button class="boton chico" data-accion="editar-ingreso">Mi ingreso</button>
          <button class="boton chico tenue" data-accion="nuevo-fijo">Agregar un fijo</button>
        </div>
      </div>`
    : "";

  const principal =
    panel.disponible === null
      ? tarjetaCifra({
          rotulo: `Disponible en esta ${nombreCiclo(panel.ciclo)}`,
          valor: "—",
          clase: "vacia",
          veredicto: panel.veredicto,
        })
      : tarjetaCifra({
          rotulo: `Disponible en esta ${nombreCiclo(panel.ciclo)}`,
          valor: monto(panel.disponible),
          clase: panel.disponible < 0 ? "mal" : "",
          extra: `<div class="rotulo">quedan ${panel.ciclo.diasRestantes} de ${panel.ciclo.dias} días · ya gastaste ${monto(panel.gasto.total)}${
            panel.fijos.pendiente > 0 ? ` · fijos por pagar ${monto(panel.fijos.pendiente)}` : ""
          }</div>`,
          veredicto: panel.veredicto,
        });

  const porDia =
    panel.porDia === null
      ? `<div class="tarjeta"><div class="rotulo">Por día</div><div class="cifra vacia">—</div></div>`
      : `<div class="tarjeta"><div class="rotulo">Por día</div>
          <div class="cifra ${panel.porDia < 0 ? "mal" : ""}">${monto(panel.porDia)}</div>
          <div class="rotulo">hasta el ${fechaCorta(panel.ciclo.fin)}</div></div>`;

  const capacidad =
    panel.capacidad.monto === null
      ? `<div class="tarjeta"><div class="rotulo">Cierre proyectado</div><div class="cifra vacia">—</div>
          <div class="rotulo">${esc(panel.capacidad.veredicto.motivo)}</div></div>`
      : `<div class="tarjeta"><div class="rotulo">Cierre proyectado</div>
          <div class="cifra ${panel.capacidad.monto < 0 ? "mal" : ""}">${monto(panel.capacidad.monto)}</div>
          <div class="rotulo">a ${monto(panel.capacidad.ritmoDiario)} por día</div></div>`;

  const listaVencimientos = vencimientos.length
    ? `<div class="titulo-seccion">Por pagar</div><div class="tarjeta">${vencimientos
        .map(
          (v) => `<div class="fila">
            <div class="crece">
              <div class="nombre">${esc(v.fijo.nombre)}</div>
              <div class="sub">${v.vencido ? `venció hace ${Math.abs(v.dias)} día(s)` : v.dias === 0 ? "vence hoy" : `en ${v.dias} día(s)`} · ${fechaCorta(v.fecha)}</div>
            </div>
            <div class="monto">${monto(v.monto)}</div>
            <button class="boton chico tenue" data-accion="pagar-fijo" data-id="${esc(v.fijo.id)}">Pagué</button>
          </div>`,
        )
        .join("")}</div>`
    : "";

  const listaMovimientos = recientes.length
    ? `<div class="titulo-seccion">Últimos movimientos</div><div class="tarjeta">${recientes.map(filaMovimiento).join("")}</div>`
    : `<div class="titulo-seccion">Últimos movimientos</div><div class="tarjeta">${vacio("Nada capturado en este ciclo todavía. El botón + es para eso.")}</div>`;

  return `${arranque}${principal}<div class="duo">${porDia}${capacidad}</div>${listaVencimientos}${listaMovimientos}`;
}

function filaMovimiento(m) {
  const categoria = categoriaPorId(app.datos, m.categoria);
  const signo = m.tipo === TIPOS.INGRESO ? "+" : m.tipo === TIPOS.AHORRO ? "→" : "−";
  const nombre = m.tipo === TIPOS.INGRESO ? "Ingreso" : m.tipo === TIPOS.AHORRO ? "Apartado a meta" : categoria ? categoria.nombre : "Gasto";
  const icono = m.tipo === TIPOS.INGRESO ? "↓" : m.tipo === TIPOS.AHORRO ? "◎" : categoria ? categoria.emoji : "•";

  return `<div class="fila">
    <div class="emoji">${esc(icono)}</div>
    <div class="crece">
      <div class="nombre">${esc(m.nota || nombre)}</div>
      <div class="sub">${fechaCorta(m.fecha)}${m.nota ? ` · ${esc(nombre)}` : ""}</div>
    </div>
    <div class="monto">${signo}${formatear(m.monto)}</div>
    <button class="boton chico tenue" data-accion="borrar-movimiento" data-id="${esc(m.id)}" aria-label="Borrar">✕</button>
  </div>`;
}

// --- Vista: Presupuesto ---

function vistaPresupuesto() {
  const filas = resumenPresupuesto(app.datos, app.hoy);
  const mes = mesDe(app.hoy);

  if (!filas.length) {
    return `<div class="tarjeta">${vacio("Sin topes ni gastos este mes. Ponle tope a una categoría para tener contra qué comparar.")}
      <button class="boton" data-accion="editar-topes">Poner topes</button></div>`;
  }

  const cuerpo = filas
    .map((f) => {
      const pct = f.veredicto.datos.pct;
      const ancho = Math.min(pct === null || pct === undefined ? 0 : pct, 100);
      return `<div class="fila" style="border-bottom:0;padding-bottom:4px">
          <div class="emoji">${esc(f.categoria.emoji)}</div>
          <div class="crece">
            <div class="nombre">${esc(f.categoria.nombre)}</div>
            <div class="sub">${f.tope === null ? "sin tope" : `${monto(f.gastado)} de ${monto(f.tope)}`}</div>
            <div class="barra-progreso"><i class="${esc(f.veredicto.estado)}" style="width:${ancho}%"></i></div>
          </div>
          <button class="boton chico tenue" data-accion="editar-tope" data-id="${esc(f.categoria.id)}">
            ${f.tope === null ? "Poner tope" : monto(f.tope)}
          </button>
        </div>
        <div class="veredicto" style="margin:0 0 14px 42px;border-top:0;padding-top:2px">
          <span class="marca ${esc(f.veredicto.estado)}">${esc(f.veredicto.estado)}</span>
          <span>${esc(f.veredicto.motivo)}</span></div>`;
    })
    .join("");

  const topes = topesVariables(app.datos, mes);
  const nota = topes.completo
    ? ""
    : `<div class="aviso">Estas categorías todavía no tienen tope: ${esc(
        topes.sinTope.map((id) => (categoriaPorId(app.datos, id) || {}).nombre || id).join(", "),
      )}. Sin tope no hay semáforo, y tampoco entran en tu capacidad de ahorro.</div>`;

  return `${nota}<div class="tarjeta">${cuerpo}</div>
    <div class="acciones"><button class="boton tenue" data-accion="nueva-categoria">Nueva categoría</button></div>`;
}

// --- Vista: Metas ---

function vistaMetas() {
  const capacidad = capacidadPorCiclo(app.datos, app.hoy, topesVariables(app.datos, mesDe(app.hoy)));
  const planes = resumenMetas(app.datos, app.hoy, capacidad.monto);

  const cabecera = tarjetaCifra({
    rotulo: "Capacidad de ahorro por quincena",
    valor: monto(capacidad.monto),
    clase: capacidad.monto === null ? "vacia" : capacidad.monto < 0 ? "mal" : "",
    extra:
      capacidad.monto === null
        ? ""
        : `<div class="rotulo">ingreso ${monto(capacidad.ingreso)} − fijos ${monto(capacidad.fijosCiclo)} − presupuesto ${monto(capacidad.variableCiclo)}</div>`,
    veredicto: capacidad.veredicto,
  });

  if (!planes.length) {
    return `${cabecera}<div class="tarjeta">${vacio("Sin metas todavía. Una meta es un monto y una fecha; el resto lo calcula la app.")}
      <button class="boton" data-accion="nueva-meta">Crear una meta</button></div>`;
  }

  const total = exigenciaTotal(planes, capacidad.monto);
  const tarjetas = planes
    .map((p) => {
      const pct = p.objetivo ? Math.min(Math.round((p.ahorrado * 100) / p.objetivo), 100) : 0;
      const alternativa = p.veredicto.datos && p.veredicto.datos.alternativa;
      const salida =
        alternativa && alternativa.tipo === "mover-fecha"
          ? `<div class="rotulo" style="margin-top:8px">Con ${monto(alternativa.aportacionPosible)} por quincena, la fecha realista es el ${fechaLarga(
              alternativa.fechaRealista,
            )}.</div>`
          : "";

      return `<div class="tarjeta">
        <div class="fila" style="border-bottom:0;padding:0">
          <div class="crece"><div class="nombre">${esc(p.meta.nombre)}</div>
            <div class="sub">${monto(p.ahorrado)} de ${monto(p.objetivo)}${p.meta.fechaLimite ? ` · para el ${fechaCorta(p.meta.fechaLimite)}` : ""}</div></div>
          <button class="boton chico" data-accion="apartar" data-id="${esc(p.meta.id)}">Apartar</button>
        </div>
        <div class="barra-progreso"><i class="${esc(p.veredicto.estado)}" style="width:${pct}%"></i></div>
        <div class="cifra" style="font-size:26px;margin-top:12px">${monto(p.requerido)}<span class="rotulo"> por quincena</span></div>
        ${veredictoHTML(p.veredicto)}${salida}
        <div class="acciones"><button class="boton chico tenue" data-accion="editar-meta" data-id="${esc(p.meta.id)}">Editar</button>
        <button class="boton chico peligro" data-accion="borrar-meta" data-id="${esc(p.meta.id)}">Borrar</button></div>
      </div>`;
    })
    .join("");

  const suma =
    planes.length > 1
      ? `<div class="tarjeta plana"><div class="rotulo">Todas tus metas juntas piden</div>
          <div class="cifra" style="font-size:26px">${monto(total.requerido)}</div>${veredictoHTML(total.veredicto)}</div>`
      : "";

  return `${cabecera}${suma}<div class="titulo-seccion">Metas</div>${tarjetas}
    <div class="acciones"><button class="boton tenue" data-accion="nueva-meta">Nueva meta</button></div>`;
}

// --- Vista: Fijos y deudas ---

function vistaFijos() {
  const { datos, hoy } = app;
  const total = totalFijosMensual(datos);

  const fijos = datos.fijos.length
    ? datos.fijos
        .map((f) => {
          const pagado = (datos.movimientos[mesDe(hoy)] || []).some((m) => m.fijoId === f.id);
          return `<div class="fila">
            <div class="crece"><div class="nombre">${esc(f.nombre)}</div>
              <div class="sub">día ${f.diaCorte} de cada mes${pagado ? " · pagado este mes" : ""}</div></div>
            <div class="monto">${monto(f.monto)}</div>
            <button class="boton chico tenue" data-accion="editar-fijo" data-id="${esc(f.id)}">Editar</button>
          </div>`;
        })
        .join("")
    : vacio("Sin pagos fijos capturados.");

  const deudas = datos.deudas.length
    ? datos.deudas
        .map((d) => {
          const s = saldoDeuda(datos, d);
          return `<div class="tarjeta">
            <div class="fila" style="border-bottom:0;padding:0">
              <div class="crece"><div class="nombre">${esc(d.nombre)}</div>
                <div class="sub">${s.pagos} pago(s) · abonado ${monto(s.pagado)}</div></div>
              <div class="monto">${monto(s.saldo)}</div>
            </div>
            ${veredictoHTML(s.veredicto)}
            <div class="acciones">
              <button class="boton chico" data-accion="pagar-deuda" data-id="${esc(d.id)}">Registrar pago</button>
              <button class="boton chico tenue" data-accion="editar-deuda" data-id="${esc(d.id)}">Editar</button>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="tarjeta">${vacio("Sin deudas capturadas.")}</div>`;

  return `${tarjetaCifra({
    rotulo: "Comprometido cada mes",
    valor: monto(total.total),
    veredicto: total.veredicto,
  })}
    <div class="titulo-seccion">Pagos fijos</div><div class="tarjeta">${fijos}</div>
    <div class="acciones"><button class="boton tenue" data-accion="nuevo-fijo">Nuevo fijo</button></div>
    <div class="titulo-seccion">Deudas</div>${deudas}
    <div class="acciones"><button class="boton tenue" data-accion="nueva-deuda">Nueva deuda</button></div>`;
}

// --- Vista: Ajustes ---

function vistaAjustes() {
  const { perfil } = app.datos;
  const estado = app.almacen ? app.almacen.estado() : {};
  const movimientos = Object.values(app.datos.movimientos).reduce((t, l) => t + l.length, 0);

  return `<div class="tarjeta">
      <div class="fila"><div class="crece"><div class="nombre">Ingreso por quincena</div>
        <div class="sub">lo que entra cada 15 días</div></div>
        <button class="boton chico tenue" data-accion="editar-ingreso">${monto(perfil.ingresoQuincenal)}</button></div>
      <div class="fila"><div class="crece"><div class="nombre">Días de corte</div>
        <div class="sub">${perfil.cortes.length ? `quincenal (día ${perfil.cortes.join(", ")} y fin de mes)` : "mensual"}</div></div>
        <button class="boton chico tenue" data-accion="editar-cortes">Cambiar</button></div>
      <div class="fila"><div class="crece"><div class="nombre">Tema</div>
        <div class="sub">claro, oscuro o el del sistema</div></div>
        <button class="boton chico tenue" data-accion="cambiar-tema">Cambiar</button></div>
    </div>

    <div class="titulo-seccion">Tus datos</div>
    <div class="tarjeta">
      <div class="fila"><div class="crece"><div class="nombre">${movimientos} movimiento(s) guardado(s)</div>
        <div class="sub">${esc(estado.modo === MODOS.SINCRONIZADO ? "en este dispositivo y sincronizados" : `en este dispositivo (${estado.tipoLocal || "—"})`)}</div></div></div>
      <div class="acciones">
        <button class="boton tenue" data-accion="exportar">Descargar respaldo</button>
        <button class="boton tenue" data-accion="importar">Importar</button>
      </div>
      <div class="acciones"><button class="boton peligro" data-accion="borrar-todo">Borrar todo</button></div>
      <div class="rotulo" style="margin-top:10px">El respaldo es un JSON con todo dentro. Es tuyo y sirve para llevártelo a donde quieras.</div>
    </div>`;
}

// --- Hojas (formularios) ---

let cerrarHoja = null;

function abrirHoja({ titulo, campos, textoGuardar = "Guardar", alGuardar, extra = "", peligro = false }) {
  const contenedor = document.getElementById("hojas");

  contenedor.innerHTML = `<div class="velo" data-velo="1"><form class="hoja" novalidate>
      <h2>${esc(titulo)}</h2>
      <div id="error-hoja"></div>
      ${campos.map(campoHTML).join("")}
      ${extra}
      <div class="acciones">
        <button type="button" class="boton tenue" data-accion="cerrar-hoja">Cancelar</button>
        <button type="submit" class="boton${peligro ? " peligro" : ""}">${esc(textoGuardar)}</button>
      </div>
    </form></div>`;

  const formulario = contenedor.querySelector("form");
  cerrarHoja = () => {
    contenedor.innerHTML = "";
    cerrarHoja = null;
  };

  contenedor.querySelector(".velo").addEventListener("click", (e) => {
    if (e.target.dataset.velo) cerrarHoja();
  });

  formulario.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const grupo = chip.parentElement;
      grupo.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      grupo.dataset.valor = chip.dataset.valor;
    });
  });

  formulario.addEventListener("submit", async (e) => {
    e.preventDefault();
    const valores = {};
    for (const campo of campos) {
      const nodo = formulario.querySelector(`[data-clave="${campo.clave}"]`);
      const crudo = campo.tipo === "chips" ? nodo.dataset.valor || "" : nodo.value.trim();

      if (campo.tipo === "monto") {
        const centavos = aCentavos(crudo);
        if (centavos === null && campo.requerido) return error(`Falta ${campo.etiqueta.toLowerCase()}.`);
        valores[campo.clave] = centavos;
      } else if (campo.tipo === "numero") {
        valores[campo.clave] = crudo === "" ? null : Number(crudo);
      } else {
        if (!crudo && campo.requerido) return error(`Falta ${campo.etiqueta.toLowerCase()}.`);
        valores[campo.clave] = crudo || null;
      }
    }

    let problema = null;
    try {
      problema = await alGuardar(valores);
    } catch (e) {
      problema = (e && e.message) || "No se pudo guardar.";
    }
    if (problema) return error(problema);
    if (cerrarHoja) cerrarHoja();
  });

  const primero = formulario.querySelector("input:not([type=hidden])");
  if (primero) primero.focus();

  function error(texto) {
    formulario.querySelector("#error-hoja").innerHTML = `<div class="aviso malo">${esc(texto)}</div>`;
  }
}

/**
 * Confirmación propia. No se usa `confirm()` del navegador: en un contexto aislado
 * (un iframe restringido, por ejemplo) lanza SecurityError y se lleva la acción por delante.
 */
function confirmar({ titulo, mensaje, textoBoton, alConfirmar }) {
  abrirHoja({
    titulo,
    campos: [],
    textoGuardar: textoBoton,
    peligro: true,
    extra: `<p class="rotulo" style="margin:0 0 4px">${esc(mensaje)}</p>`,
    alGuardar: alConfirmar,
  });
}

function campoHTML(campo) {
  const id = `campo-${campo.clave}`;
  const valor = campo.valor === null || campo.valor === undefined ? "" : campo.valor;

  if (campo.tipo === "chips") {
    return `<div class="campo"><label>${esc(campo.etiqueta)}</label>
      <div class="chips" data-clave="${campo.clave}" data-valor="${esc(valor)}">
        ${campo.opciones
          .map(
            (o) => `<button type="button" class="chip" data-valor="${esc(o.valor)}" aria-pressed="${o.valor === valor}">
              ${esc(o.etiqueta)}</button>`,
          )
          .join("")}
      </div></div>`;
  }

  if (campo.tipo === "select") {
    return `<div class="campo"><label for="${id}">${esc(campo.etiqueta)}</label>
      <select id="${id}" data-clave="${campo.clave}">
        ${campo.opciones.map((o) => `<option value="${esc(o.valor)}" ${o.valor === valor ? "selected" : ""}>${esc(o.etiqueta)}</option>`).join("")}
      </select></div>`;
  }

  const tipos = { monto: "text", texto: "text", fecha: "date", numero: "number" };
  const extras =
    campo.tipo === "monto"
      ? 'inputmode="decimal" class="monto" placeholder="0.00"'
      : campo.tipo === "numero"
        ? 'inputmode="numeric"'
        : "";

  return `<div class="campo"><label for="${id}">${esc(campo.etiqueta)}</label>
    <input id="${id}" data-clave="${campo.clave}" type="${tipos[campo.tipo] || "text"}" value="${esc(valor)}" ${extras}>
    ${campo.ayuda ? `<div class="rotulo" style="margin-top:5px">${esc(campo.ayuda)}</div>` : ""}</div>`;
}

function opcionesCategorias() {
  return app.datos.categorias.filter((c) => !c.archivada).map((c) => ({ valor: c.id, etiqueta: `${c.emoji} ${c.nombre}` }));
}

// --- Acciones ---

async function guardar(datos) {
  if (!app.almacen) throw new Error("La app todavía está abriendo tus datos. Intenta otra vez en un segundo.");

  const previos = app.datos;
  app.datos = datos; // optimista: la pantalla responde al instante
  render();

  try {
    app.datos = await app.almacen.guardar(datos);
    app.aviso = null;
  } catch (e) {
    // Nada de fallar en silencio: se revierte la pantalla y se dice qué pasó.
    app.datos = previos;
    app.aviso = `No se pudo guardar: ${e.message}`;
    app.bloqueado = true;
    render();
    throw e;
  }
  render();
}

const acciones = {
  ir(el) {
    app.vista = el.dataset.vista;
    render();
  },

  "cerrar-aviso"() {
    app.aviso = null;
    render();
  },

  "ver-estado"() {
    const estado = app.almacen.estado();
    const texto =
      estado.modo === MODOS.SINCRONIZADO
        ? "Sincronizado: lo que capturas aquí aparece también en tus otros dispositivos, y una copia queda guardada en éste."
        : estado.modo === MODOS.EFIMERO
          ? "Este navegador no deja guardar nada. Descarga un respaldo antes de cerrar la pestaña."
          : `Todo se guarda en este dispositivo (${estado.tipoLocal}). No hay sincronización, así que para pasarlo a otro lado usa el respaldo en Ajustes.`;
    app.aviso = estado.motivo ? `${texto} ${estado.motivo}` : texto;
    render();
  },

  capturar() {
    abrirHoja({
      titulo: "Capturar gasto",
      textoGuardar: "Guardar gasto",
      campos: [
        { clave: "monto", etiqueta: "Monto", tipo: "monto", requerido: true },
        { clave: "categoria", etiqueta: "Categoría", tipo: "chips", opciones: opcionesCategorias(), valor: "super" },
        { clave: "nota", etiqueta: "Nota (opcional)", tipo: "texto" },
        { clave: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: app.hoy, requerido: true },
      ],
      async alGuardar(v) {
        const { datos, error } = agregarMovimiento(app.datos, {
          fecha: v.fecha, monto: v.monto, tipo: TIPOS.GASTO, categoria: v.categoria || "otros", nota: v.nota,
        });
        if (error) return error;
        await guardar(datos);
      },
    });
  },

  "editar-ingreso"() {
    abrirHoja({
      titulo: "Ingreso por quincena",
      campos: [
        {
          clave: "monto", etiqueta: "Cuánto entra cada quincena", tipo: "monto",
          valor: app.datos.perfil.ingresoQuincenal === null ? "" : (app.datos.perfil.ingresoQuincenal / 100).toFixed(2),
          requerido: true, ayuda: "Si varía, pon lo que entra seguro. Lo de más se captura como ingreso extra.",
        },
      ],
      async alGuardar(v) {
        await guardar({ ...app.datos, perfil: { ...app.datos.perfil, ingresoQuincenal: v.monto } });
      },
    });
  },

  "editar-cortes"() {
    abrirHoja({
      titulo: "Cómo entra tu dinero",
      campos: [
        {
          clave: "modo", etiqueta: "Ritmo", tipo: "chips", valor: app.datos.perfil.cortes.length ? "quincenal" : "mensual",
          opciones: [{ valor: "quincenal", etiqueta: "Quincenal (15 y fin de mes)" }, { valor: "mensual", etiqueta: "Mensual" }],
        },
      ],
      async alGuardar(v) {
        await guardar({ ...app.datos, perfil: { ...app.datos.perfil, cortes: v.modo === "mensual" ? [] : [15] } });
      },
    });
  },

  "cambiar-tema"() {
    const actual = document.documentElement.dataset.tema || "sistema";
    const siguiente = actual === "sistema" ? "claro" : actual === "claro" ? "oscuro" : "sistema";
    if (siguiente === "sistema") delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = siguiente;
    try { localStorage.setItem("finanzas:tema", siguiente); } catch (e) {}
    app.aviso = `Tema: ${siguiente}.`;
    render();
  },

  "editar-tope"(el) {
    const categoria = categoriaPorId(app.datos, el.dataset.id);
    abrirHoja({
      titulo: `Tope mensual · ${categoria.nombre}`,
      campos: [
        {
          clave: "tope", etiqueta: "Cuánto al mes", tipo: "monto",
          valor: categoria.tope === null ? "" : (categoria.tope / 100).toFixed(2),
          ayuda: "Déjalo vacío para quitarle el tope. Sin tope no hay semáforo.",
        },
      ],
      async alGuardar(v) {
        const categorias = app.datos.categorias.map((c) => (c.id === categoria.id ? { ...c, tope: v.tope } : c));
        await guardar({ ...app.datos, categorias });
      },
    });
  },

  "editar-topes"() {
    app.vista = "presupuesto";
    render();
  },

  "nueva-categoria"() {
    abrirHoja({
      titulo: "Nueva categoría",
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
        { clave: "emoji", etiqueta: "Emoji", tipo: "texto", valor: "•" },
        { clave: "tope", etiqueta: "Tope mensual (opcional)", tipo: "monto" },
        {
          clave: "clase", etiqueta: "Tipo", tipo: "chips", valor: "variable",
          opciones: [{ valor: "variable", etiqueta: "Variable" }, { valor: "fija", etiqueta: "Fija" }],
        },
      ],
      async alGuardar(v) {
        const id = `cat_${v.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        if (categoriaPorId(app.datos, id)) return "Ya existe una categoría con ese nombre.";
        const categorias = [...app.datos.categorias, { id, nombre: v.nombre, emoji: v.emoji || "•", clase: v.clase, tope: v.tope, archivada: false }];
        await guardar({ ...app.datos, categorias });
      },
    });
  },

  "nueva-meta"() {
    hojaMeta(null);
  },

  "editar-meta"(el) {
    hojaMeta(app.datos.metas.find((m) => m.id === el.dataset.id));
  },

  "borrar-meta"(el) {
    const meta = app.datos.metas.find((m) => m.id === el.dataset.id);
    confirmar({
      titulo: `¿Borrar "${meta ? meta.nombre : "la meta"}"?`,
      mensaje: "Lo que ya apartaste no se borra: sigue contando como ahorro.",
      textoBoton: "Sí, borrar la meta",
      alConfirmar: async () => {
        await guardar({ ...app.datos, metas: app.datos.metas.filter((m) => m.id !== el.dataset.id) });
      },
    });
  },

  apartar(el) {
    const meta = app.datos.metas.find((m) => m.id === el.dataset.id);
    abrirHoja({
      titulo: `Apartar para ${meta.nombre}`,
      textoGuardar: "Apartar",
      campos: [
        { clave: "monto", etiqueta: "Cuánto apartas", tipo: "monto", requerido: true },
        { clave: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: app.hoy, requerido: true },
      ],
      async alGuardar(v) {
        const { datos, error } = agregarMovimiento(app.datos, {
          fecha: v.fecha, monto: v.monto, tipo: TIPOS.AHORRO, metaId: meta.id, nota: `Apartado: ${meta.nombre}`,
        });
        if (error) return error;
        await guardar(datos);
      },
    });
  },

  "nuevo-fijo"() {
    hojaFijo(null);
  },

  "editar-fijo"(el) {
    hojaFijo(app.datos.fijos.find((f) => f.id === el.dataset.id));
  },

  async "pagar-fijo"(el) {
    const fijo = app.datos.fijos.find((f) => f.id === el.dataset.id);
    if (fijo.monto === null) return acciones["editar-fijo"](el);
    const { datos, error } = agregarMovimiento(app.datos, movimientoDeFijo(fijo, app.hoy));
    if (error) return;
    await guardar(datos);
  },

  "nueva-deuda"() {
    hojaDeuda(null);
  },

  "editar-deuda"(el) {
    hojaDeuda(app.datos.deudas.find((d) => d.id === el.dataset.id));
  },

  "pagar-deuda"(el) {
    const deuda = app.datos.deudas.find((d) => d.id === el.dataset.id);
    abrirHoja({
      titulo: `Pago a ${deuda.nombre}`,
      campos: [
        { clave: "monto", etiqueta: "Cuánto pagaste", tipo: "monto", requerido: true },
        { clave: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: app.hoy, requerido: true },
      ],
      async alGuardar(v) {
        const { datos, error } = agregarMovimiento(app.datos, {
          fecha: v.fecha, monto: v.monto, tipo: TIPOS.GASTO, categoria: "deuda", deudaId: deuda.id, nota: `Pago: ${deuda.nombre}`,
        });
        if (error) return error;
        await guardar(datos);
      },
    });
  },

  async "borrar-movimiento"(el) {
    await guardar(eliminarMovimiento(app.datos, el.dataset.id));
  },

  async exportar() {
    const texto = exportar(app.datos);
    const nombre = nombreDeRespaldo(app.hoy);

    // Hay visores donde un enlace de descarga no hace absolutamente nada. Si el anfitrión
    // sabe entregar archivos, que lo entregue él; si no, el enlace de toda la vida, que es
    // lo que funciona con la app abierta desde el disco.
    const entregado =
      typeof descargarEnAnfitrion === "function" ? await descargarEnAnfitrion({ nombre, texto }) : false;

    if (!entregado) {
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    }

    app.aviso = `Respaldo listo: ${nombre}. Es un JSON con todo dentro; guárdalo donde tú quieras.`;
    render();
  },

  importar() {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = "application/json,.json";
    entrada.addEventListener("change", async () => {
      const archivo = entrada.files[0];
      if (!archivo) return;
      const resultado = importar(await archivo.text());
      if (!resultado.ok) {
        app.aviso = resultado.motivo;
        app.bloqueado = true;
        return render();
      }
      await guardar(resultado.datos);
      app.aviso = "Respaldo importado.";
      app.bloqueado = false;
      render();
    });
    entrada.click();
  },

  "borrar-todo"() {
    confirmar({
      titulo: "¿Borrar TODO?",
      mensaje: "Esto no se puede deshacer. Si lo quieres conservar, descarga primero un respaldo.",
      textoBoton: "Sí, borrar todo",
      alConfirmar: async () => {
        await app.almacen.borrarTodo();
        app.bloqueado = false;
        await guardar(datosVacios(app.hoy));
        app.aviso = "Todo borrado.";
        render();
      },
    });
  },

  "cerrar-hoja"() {
    if (cerrarHoja) cerrarHoja();
  },
};

function hojaMeta(meta) {
  abrirHoja({
    titulo: meta ? `Editar ${meta.nombre}` : "Nueva meta",
    campos: [
      { clave: "nombre", etiqueta: "Para qué", tipo: "texto", valor: meta ? meta.nombre : "", requerido: true },
      {
        clave: "objetivo", etiqueta: "Cuánto necesitas", tipo: "monto",
        valor: meta && meta.objetivo !== null ? (meta.objetivo / 100).toFixed(2) : "", requerido: true,
      },
      {
        clave: "fechaLimite", etiqueta: "Para cuándo", tipo: "fecha", valor: meta ? meta.fechaLimite : "",
        ayuda: "Sin fecha no hay cuánto por quincena: la app te lo dirá en vez de inventarlo.",
      },
    ],
    async alGuardar(v) {
      const nueva = {
        id: meta ? meta.id : idNuevo("meta"),
        nombre: v.nombre, objetivo: v.objetivo, fechaLimite: v.fechaLimite, prioridad: 1, lograda: false,
      };
      const metas = meta ? app.datos.metas.map((m) => (m.id === meta.id ? nueva : m)) : [...app.datos.metas, nueva];
      await guardar({ ...app.datos, metas });
    },
  });
}

function hojaFijo(fijo) {
  abrirHoja({
    titulo: fijo ? `Editar ${fijo.nombre}` : "Nuevo pago fijo",
    campos: [
      { clave: "nombre", etiqueta: "Qué es", tipo: "texto", valor: fijo ? fijo.nombre : "", requerido: true },
      {
        clave: "monto", etiqueta: "Cuánto", tipo: "monto",
        valor: fijo && fijo.monto !== null ? (fijo.monto / 100).toFixed(2) : "",
        ayuda: "Si todavía no lo sabes, déjalo vacío: la app lo contará como pendiente por capturar.",
      },
      { clave: "diaCorte", etiqueta: "Qué día del mes se paga", tipo: "numero", valor: fijo ? fijo.diaCorte : 1, requerido: true },
      { clave: "categoria", etiqueta: "Categoría", tipo: "chips", valor: fijo ? fijo.categoria : "servicios", opciones: opcionesCategorias() },
    ],
    async alGuardar(v) {
      const nuevo = {
        id: fijo ? fijo.id : idNuevo("fijo"),
        nombre: v.nombre, monto: v.monto, diaCorte: Math.min(Math.max(Number(v.diaCorte) || 1, 1), 31),
        categoria: v.categoria || "servicios", activo: true,
      };
      const fijos = fijo ? app.datos.fijos.map((f) => (f.id === fijo.id ? nuevo : f)) : [...app.datos.fijos, nuevo];
      await guardar({ ...app.datos, fijos });
    },
  });
}

function hojaDeuda(deuda) {
  abrirHoja({
    titulo: deuda ? `Editar ${deuda.nombre}` : "Nueva deuda",
    campos: [
      { clave: "nombre", etiqueta: "A quién", tipo: "texto", valor: deuda ? deuda.nombre : "", requerido: true },
      {
        clave: "montoOriginal", etiqueta: "Cuánto debías al inicio", tipo: "monto",
        valor: deuda && deuda.montoOriginal !== null ? (deuda.montoOriginal / 100).toFixed(2) : "", requerido: true,
      },
      {
        clave: "tasaAnual", etiqueta: "Tasa anual % (opcional)", tipo: "numero", valor: deuda ? deuda.tasaAnual : "",
        ayuda: "Sin tasa, la app reporta el saldo SIN intereses y lo dice. No se inventa ninguna.",
      },
    ],
    async alGuardar(v) {
      const nueva = {
        id: deuda ? deuda.id : idNuevo("deuda"),
        nombre: v.nombre, montoOriginal: v.montoOriginal, tasaAnual: v.tasaAnual, diaCorte: deuda ? deuda.diaCorte : 1, activa: true,
      };
      const deudas = deuda ? app.datos.deudas.map((d) => (d.id === deuda.id ? nueva : d)) : [...app.datos.deudas, nueva];
      await guardar({ ...app.datos, deudas });
    },
  });
}

// --- Arranque ---

export async function arrancar() {
  try {
    const tema = localStorage.getItem("finanzas:tema");
    if (tema && tema !== "sistema") document.documentElement.dataset.tema = tema;
  } catch (e) {}

  document.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const accion = acciones[boton.dataset.accion];
    if (accion) accion(boton);
  });

  render(); // pinta de inmediato: la app no espera al almacenamiento para existir

  try {
    app.almacen = await abrirAlmacen();
    const { datos, aviso, bloqueado } = await app.almacen.cargar();
    app.datos = datos;
    app.aviso = aviso;
    app.bloqueado = Boolean(bloqueado);
  } catch (e) {
    app.aviso = `No se pudo abrir el almacenamiento: ${e.message} Puedes seguir usando la app, pero descarga un respaldo antes de cerrar.`;
  }

  // Si ya se sabe que esto no va a guardar, se dice de entrada — no cuando ya se perdió algo.
  const estado = app.almacen ? app.almacen.estado() : null;
  if (estado && estado.modo === MODOS.EFIMERO && !app.aviso) {
    app.aviso = estado.motivo || "Este navegador no deja guardar datos: descarga un respaldo antes de cerrar la pestaña.";
  }
  render();

  // Si otro dispositivo escribe, esta pantalla se entera.
  app.almacen.suscribir(async () => {
    const fresco = await app.almacen.cargar();
    app.datos = fresco.datos;
    render();
  });

  // Si la app queda abierta y cambia el día, el ciclo se recalcula solo.
  setInterval(() => {
    const ahora = hoyISO();
    if (ahora !== app.hoy) {
      app.hoy = ahora;
      render();
    }
  }, 60000);
}
