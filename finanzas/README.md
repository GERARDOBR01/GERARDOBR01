# Quincena

App de finanzas personales. Ordena la quincena, controla los gastos y dice —con
números— si una meta de ahorro de verdad alcanza o no.

**Un archivo HTML que se abre solo.** Sin servidor, sin instalar nada, sin red. Se puede
abrir desde el disco, desde el celular o desde cualquier hosting estático — y subida a uno,
se instala en el teléfono como una app más, con su ícono y funcionando sin conexión.

```
finanzas/app/finanzas.html     ← esto es la app. Ábrelo y ya.
finanzas/app/                  ← esta carpeta es lo que se sube a un hosting
```

## Lo que hace

| Pantalla | Qué contesta |
|---|---|
| **Hoy** | Cuánto queda de la quincena, cuánto por día, con cuánto cierra el ciclo a este ritmo, qué se paga esta semana y cómo va el fondo de emergencia |
| **Historial** | Mes por mes: lo que entró, lo que salió y lo que se apartó. Cualquier movimiento se corrige tocándolo |
| **Presupuesto** | Cuánto va gastado por categoría contra su tope, con semáforo |
| **Metas** | Cuánto hay que apartar por quincena — y si eso cabe en la capacidad real de ahorro |
| **Fijos** | Qué vence, qué ya se pagó y cuánto se debe — con la frecuencia real de cada pago |
| **Ajustes** | Ingreso, ciclo, fondo de emergencia, respaldo en JSON |

Cuatro cosas mueven dinero y todas se capturan igual, desde el botón `+`: **gasto**,
**ingreso**, **apartar** y **retirar**. Un retiro no borra el apartado original — los dos
quedan en el historial, porque eso fue lo que pasó.

## Las tres reglas

**1. El código decide.** No hay ningún modelo de por medio: todo sale de reglas
deterministas y cada veredicto dice de dónde salió.

```
NO_ALCANZA — requiere $3,750.00 por quincena, capacidad estimada $530.00 — fuente: CODIGO
```

**2. Declarar la ignorancia es una feature.** Sin datos suficientes, la app responde
`SIN_DATOS_SUFICIENTES` y dice qué falta capturar. No promedia sobre aire:

- Sin ingreso capturado, el disponible es `—`, nunca `$0.00`.
- Con menos de 3 días corridos del ciclo no se proyecta el cierre: una despensa el día 1
  proyectaría un mes catastrófico.
- Una categoría sin tope no se pinta de verde: se marca `SIN_TOPE`, porque no hay contra
  qué comparar.
- Un fondo de emergencia a medias va `AJUSTADO`, no `NO_ALCANZA`: no es un plan que no
  cierre, es un ahorro en progreso. La urgencia se dice en la severidad.
- **Una deuda sin tasa capturada no proyecta intereses.** Reporta el saldo y declara que
  va sin ellos. Inventar una tasa "típica" daría un número creíble y falso. Con la tasa
  puesta sí proyecta —meses, intereses totales y su supuesto escrito— y dice en voz alta lo
  que casi nadie dice: si tu pago no cubre ni el interés del mes, **esa deuda nunca baja**.
- **Un pago anual no es un gasto mensual.** Cada fijo tiene su frecuencia, y el total sale en
  dos números que no son el mismo: el promedio mensualizado (lo que hay que ir apartando) y
  lo que de verdad se paga este mes.

**3. Los datos reales nunca entran al repositorio.** Lo que se versiona es el motor. Los
montos viven en el dispositivo, y el respaldo en JSON es del usuario.

## Que dure

- **Cero dependencias.** Sin npm, sin framework, sin CDN. Nada debajo que se pueda caer.
- **Dinero en centavos enteros.** Nunca coma flotante en el modelo: `0.1 + 0.2` no es `0.3`,
  y una app de finanzas que arrastra ese error miente por unos centavos cada mes.
- **Esquema versionado con migraciones.** Cambiar la forma de los datos mañana no obliga a
  tirar la historia de hoy — y un documento de una versión más nueva **no se abre**, se
  declara, en vez de perder lo que esa versión guardó.
- **Fechas sin zonas horarias.** `AAAA-MM-DD` en local: una zona mal aplicada mueve un gasto
  de quincena y descuadra el ciclo.
- **Nada falla en silencio.** En un origen aislado, hasta *leer* `localStorage` lanza: por
  eso no se pregunta con `typeof`, se intenta dentro de un `try`. Si no se puede guardar, la
  app lo dice de entrada y sigue usable; si hay datos que esta versión no sabe abrir, se
  **niega a escribir** en vez de pisarlos; y no se usa el `confirm()` del navegador, que
  también lanza ahí. Todo eso está cubierto por pruebas.

## No depende de nadie para abrirse

La sincronización entre dispositivos es **opcional**. Vive detrás de una interfaz de
almacén de cuatro métodos, en un solo archivo (`almacen/anfitrion-claude.js`).
Borrarlo deja la app funcionando igual: guarda en el navegador y lo declara en la barra
superior (`⚪ Solo este dispositivo`). Nunca se pierde una captura en silencio.

Eso no es una promesa escrita en un README: hay una prueba que recorre `motor/`,
`interfaz/` y `almacen/` y **falla si alguien nombra ese entorno fuera de su adaptador**.

| Capa | Qué guarda |
|---|---|
| IndexedDB (o localStorage) | siempre — el almacén base, en el dispositivo |
| Respaldo JSON | exportar/importar; es la mudanza a donde sea |
| Adaptador del anfitrión | opcional: sincroniza y entrega el respaldo donde un enlace no basta |

## Instalarla en el teléfono

La carpeta `app/` subida a cualquier hosting con https es una app instalable: manifest,
íconos enmascarables y un service worker que la deja abrir sin conexión. En el celular,
"Añadir a pantalla de inicio" y queda el anillo verde entre las demás apps.

El ícono se dibuja en `interfaz/logo.svg` y se rasteriza **una sola vez** con
`node herramientas/logo.mjs`, que deja los PNG en base64 dentro de `interfaz/logo-datos.js`.
Por eso el armado sigue sin depender de nada: solo decodifica.

Y la regla no se toca: `app/finanzas.html` sigue siendo un archivo suelto que abre desde el
disco, sin manifest ni service worker que apunten a archivos que no existen.

## Cómo se trabaja

```bash
node --test pruebas/*.test.js      # la suite: sin red, sin API, sin gastar un peso
node herramientas/armar.mjs        # arma las tres salidas en app/
node herramientas/humo.mjs         # navegador real: disco, sin almacenamiento, e instalada
node herramientas/logo.mjs         # solo si cambia el logo
```

El armado **falla ruidosamente** ante lo que produciría un HTML roto en silencio: un
módulo que existe pero nadie metió en la lista, dos nombres de nivel superior repetidos,
un `import` sin resolver, o un resultado que no compila.

Para cambiarle el nombre a la app, `TITULO` en `herramientas/armar.mjs`: la pantalla lo
lee del `<title>`.

## Estructura

```
motor/       cálculo puro, sin DOM: dinero, ciclos, presupuesto, ahorro, metas, fijos, deudas
almacen/     persistencia detrás de 4 métodos, con adaptadores intercambiables
interfaz/    plantilla, estilos, render y el logo
pruebas/     node --test, incluida la prueba de independencia
herramientas/armar.mjs (build), humo.mjs (navegador) y logo.mjs (íconos)
app/         la salida generada — no editar a mano
```
