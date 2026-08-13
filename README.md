# Gerardo Barrera

Construyo **sistemas de verificación auditables para operaciones de retail** — herramientas donde cada calificación es trazable hasta el criterio que la produjo.

## 🔍 [Veristack](https://github.com/GERARDOBR01/veristack) — motor de verificación de cumplimiento visual

Foto de evidencia + mecánica de la tarea → calificación con criterio trazable.

El principio de diseño: **el código decide, el modelo interpreta.**

- Las reglas duras las resuelve 100% código determinístico — el modelo no vota ni puede sobreescribir un GRAVE
- El modelo entra en **un solo paso** del pipeline, únicamente sobre criterios marcados como delegables
- Sin evidencia suficiente el sistema responde `NO_CALIFICA` — declara lo que no sabe en vez de adivinarlo
- Cada resultado nombra su fuente: `CODIGO` o `MODELO`

El output no es *"la IA detectó un problema"*. Es:

```
imagen_oscura: GRAVE — brillo=31 (mínimo aceptable: 40) — fuente: CODIGO
```

**Stack:** Python · pipeline determinístico de 4 módulos · Streamlit · Gemini (un paso, con circuit breaker de cuota y degradación declarada) · suite de autotests que corre completa sin gastar API.

Nacido de 3 años en el piso de ventas de retail: conozco el problema porque lo audité a pie.

## Cómo trabajo

- **Reloj suizo, no cohete espacial** — robusto y verificable antes que espectacular
- Los casos de fallo (cuota agotada, JSON corrupto, respuesta malformada del modelo) son parte de la arquitectura, no sorpresas
- Commits en español, entregas honestas: si algo quedó parcial, el reporte lo dice

## Contacto

📫 elyisuswtfgg@gmail.com
