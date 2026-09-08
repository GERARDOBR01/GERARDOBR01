// Almacén local — la base sobre la que corre todo, en el propio navegador.
//
// IndexedDB primero (aguanta años de movimientos y sobrevive a recargas), localStorage si
// no está disponible, y memoria como último recurso. El nivel que se logró se DECLARA:
// una app que guarda en memoria y no lo dice es una app que te va a perder los datos.

const BASE = "finanzas";
const ALMACEN = "documento";
const LLAVE = "raiz";

function abrirIndexedDB() {
  return new Promise((resolver) => {
    if (typeof indexedDB === "undefined") return resolver(null);
    let peticion;
    try {
      peticion = indexedDB.open(BASE, 1);
    } catch (e) {
      return resolver(null);
    }
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(ALMACEN)) bd.createObjectStore(ALMACEN);
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => resolver(null);
    peticion.onblocked = () => resolver(null);
  });
}

function operar(bd, modo, accion) {
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(ALMACEN, modo);
    const peticion = accion(tx.objectStore(ALMACEN));
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

export async function abrirLocal() {
  const bd = await abrirIndexedDB();

  if (bd) {
    return {
      tipo: "indexeddb",
      duradero: true,
      async cargar() {
        try {
          return (await operar(bd, "readonly", (s) => s.get(LLAVE))) || null;
        } catch (e) {
          return null;
        }
      },
      async guardar(datos) {
        await operar(bd, "readwrite", (s) => s.put(datos, LLAVE));
      },
      async borrar() {
        await operar(bd, "readwrite", (s) => s.delete(LLAVE));
      },
    };
  }

  if (typeof localStorage !== "undefined") {
    return {
      tipo: "localstorage",
      duradero: true,
      async cargar() {
        try {
          const texto = localStorage.getItem(`${BASE}:${LLAVE}`);
          return texto ? JSON.parse(texto) : null;
        } catch (e) {
          return null;
        }
      },
      async guardar(datos) {
        localStorage.setItem(`${BASE}:${LLAVE}`, JSON.stringify(datos));
      },
      async borrar() {
        localStorage.removeItem(`${BASE}:${LLAVE}`);
      },
    };
  }

  // Sin almacenamiento del navegador: la app funciona, pero al cerrar se pierde. Se avisa.
  let memoria = null;
  return {
    tipo: "memoria",
    duradero: false,
    async cargar() {
      return memoria;
    },
    async guardar(datos) {
      memoria = datos;
    },
    async borrar() {
      memoria = null;
    },
  };
}
