# Pokémon Catán Web

Juego de tablero fan, no oficial, inspirado en Catán y ambientado en el universo Pokémon. Incluye tablero hexagonal procedural, economía clásica de recursos, construcción, comercio, cartas de desarrollo, ladrón, captura y evolución de Pokémon, tres dificultades de IA, multijugador local, guardado automático y exportación/importación JSON.

No está afiliado con Nintendo, The Pokémon Company, Game Freak, Creatures ni los titulares de Catán.

## Estado del proyecto

- Partida completa de cuatro jugadores: individual contra 3 IA o local con 2-4 humanos y plazas completadas por IA.
- Motor de reglas determinista, separado de la interfaz.
- **95 pruebas automatizadas pasando** en 11 archivos.
- Comprobación de tipos y build de producción correctos.
- Smoke de navegador real con Playwright: menú, privacidad, setup, autoguardado, reanudación, oferta a todos con humano e IA, recursos locales, turno, banco, hexágono, pausa y tutorial.
- 35 retratos locales de PMDCollab/SpriteCollab bajo CC BY-NC 4.0.
- Sin servidor, sin cuentas y sin conexión a servicios externos en tiempo de ejecución.

## Requisitos

- Node.js 22.12 o superior. La verificación se hizo con **Node 22.23.2**.
- npm.
- Un navegador moderno con soporte para ES2022, SVG y `color-mix`.
- Para el smoke: Microsoft Edge o Google Chrome instalado.

En Windows, si `npm` está bloqueado por la política de ejecución de PowerShell, usar `npm.cmd`.

## Instalación y ejecución

```bash
npm install
npm run dev
```

Abrir la URL que muestra Vite, normalmente `http://localhost:5173/`.

Build de producción:

```bash
npm run build
npm run preview
```

El build queda en `dist/`. No requiere conexión ni credenciales.

## Comandos

| Comando | Función |
|---|---|
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run build` | `tsc --noEmit` y build de producción |
| `npm run preview` | Servir el build localmente |
| `npm test` | Pruebas Vitest |
| `npm run test:watch` | Vitest en modo vigilancia |
| `npm run test:browser` | Smoke de Playwright contra Vite |
| `npm run typecheck` | Comprobación estricta de TypeScript |
| `npm run lint` | Alias de `tsc --noEmit`; no hay ESLint separado |
| `npm run assets` | Descargar/verificar retratos y regenerar el manifiesto |

Para el smoke, arrancar el servidor en el puerto esperado:

```bash
npm run dev -- --port 4173
```

En otra terminal:

```bash
npm run test:browser
```

Se puede cambiar la URL con `POKECATAN_URL` y el ejecutable con `BROWSER_PATH`.

## Cómo jugar

1. Elegir **Individual** o **Multijugador local**, dificultad, nombre, semilla y número de humanos.
2. En la preparación, colocar dos poblados y dos carreteras. La interfaz marca los cruces y caminos legales.
3. En cada turno, lanzar los dados. Un 7 activa descartes, el ladrón y un posible robo.
4. Usar los botones del panel para construir, comprar cartas, comerciar con el banco, proponer intercambios, capturar Pokémon o evolucionar.
5. Terminar el turno cuando hayas acabado tus acciones.
6. Ganar al alcanzar **10 puntos de victoria** durante tu turno.

Controles principales:

- **Clic en un cruce o camino resaltado** para colocar una construcción.
- **Lanzar dados** para comenzar las acciones del turno.
- **Carretera / Poblado / Ciudad / Capturar** para activar el modo de colocación.
- **Banco** para el comercio 4:1, 3:1 o 2:1.
- **Proponer cambio** para ofertas entre jugadores.
- **Comprar carta** y las tarjetas de la mano para las cartas de desarrollo.
- **Evolucionar** y **Usar habilidad** en la lista de Pokémon.
- **Menú** para pausa, ayuda, sonido, exportación e importación.
- Las ofertas pendientes y los descartes humanos bloquean el avance hasta resolverse.

En local, aparece una pantalla de privacidad antes de mostrar la mano del jugador correspondiente. Pasa el dispositivo cuando se indique.

## Modos

- **Individual:** 1 humano contra 3 IA.
- **Local:** 2, 3 o 4 humanos en el mismo dispositivo; las plazas restantes son IA.
- **Online:** no implementado. Solo existe preparación arquitectónica.

## Guardado

- Autoguardado en `localStorage` con la clave `pokecatan.autosave.v1`.
- Reanudación desde el menú principal.
- Exportación manual a JSON.
- Importación validada; un archivo corrupto o incompatible se rechaza sin destruir la partida actual.
- El guardado incluye semilla, RNG, tablero, jugadores, recursos, cartas, Pokémon, distinciones, eventos y estado pendiente.

## Assets y licencias

Los retratos están en `public/assets/pokemon/` y su procedencia está en `public/assets/pokemon/manifest.json`.

- Fuente: PMDCollab/SpriteCollab.
- Licencia: **CC BY-NC 4.0**.
- Aviso local: `public/assets/PMDCOLLAB-LICENSE.md`.
- Uso no comercial. Se debe conservar la atribución.
- El juego funciona con retratos locales y muestra una inicial como fallback si falta un archivo.
- No se usan fuentes, servicios de imágenes ni APIs externas durante la partida.

Detalles y procedimiento de actualización: `docs/assets.md`.

## Estructura

```text
src/engine/     Motor puro: estado, reglas, tablero, Pokémon, persistencia
src/ai/         Heurísticas y ejecución de turnos de IA
src/ui/         Interfaz React, tablero SVG, paneles, modales y estilos
tests/          Pruebas de motor, integración y simulación
scripts/        Descarga de assets y smoke de navegador
public/         Assets locales, manifiesto y favicon
docs/           Reglas, arquitectura, assets, pruebas y decisiones
```

## Documentación

- [Reglas completas](docs/game-rules.md)
- [Arquitectura](docs/architecture.md)
- [Assets y licencias](docs/assets.md)
- [Pruebas y resultados](docs/testing.md)
- [Decisiones de diseño](docs/decisions.md)

## Verificación

Resultados reales de la última ejecución:

```text
Test Files  11 passed (11)
     Tests  95 passed (95)
  Duration  71.73s
```

También pasaron `tsc --noEmit`, `vite build` y el smoke de navegador. Los detalles, comandos y limitaciones están en `docs/testing.md`.

## Limitaciones conocidas

- No hay multijugador online, cuentas ni servidor.
- La mesa es siempre de cuatro jugadores.
- No se pueden liberar Pokémon ni comerciar con ellos.
- No se descargaron animaciones de sprites; las animaciones son de interfaz.
- El smoke E2E cubre el recorrido crítico, no todos los diálogos.
- La licencia de los retratos es no comercial.

## Aviso legal

Proyecto fan con fines educativos y no comerciales. Pokémon y los nombres relacionados son marcas de sus titulares. Catán es una marca de sus titulares. Este repositorio no está afiliado ni respaldado por ellos.
