# Pruebas y validación

## Comandos

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

En Windows PowerShell con la política de ejecución bloqueada, usar `npm.cmd`:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev -- --port 4173
npm.cmd run test:browser
```

`test:browser` requiere una instancia de Vite en `http://localhost:4173/` y un Edge o Chrome instalado. Se puede cambiar la URL con `POKECATAN_URL` y el ejecutable con `BROWSER_PATH`.

## Resultados reales

Fecha de la última ejecución: **20 de octubre de 2026**.

### Pruebas automatizadas

```text
Test Files  11 passed (11)
     Tests  95 passed (95)
  Duration  71.73s
```

| Archivo | Pruebas | Cobertura principal |
|---|---:|---|
| `tests/board.test.ts` | 4 | Recuentos, geometría, puertos, regla 6/8 y validación del tablero |
| `tests/setup.test.ts` | 5 | Colocación inicial, orden, recursos del segundo poblado y legalidad |
| `tests/production.test.ts` | 10 | Dados, producción, desierto, ladrón y escasez del banco |
| `tests/build.test.ts` | 9 | Costes, conectividad, distancia, cruce rival y límites |
| `tests/trade.test.ts` | 9 | Banco 4:1/3:1/2:1, ofertas, contraofertas y rechazo |
| `tests/cards.test.ts` | 13 | Mazo de 31, compra, restricciones, caballero, cartas especiales y PV ocultos |
| `tests/awards.test.ts` | 8 | Ruta Comercial, Ejército, empates y pérdida de titular |
| `tests/pokemon.test.ts` | 17 | Captura, evolución, límites, habilidades y reglas compartidas con IA |
| `tests/persistence.test.ts` | 8 | Serialización, determinismo, corrupción, versiones y validación |
| `tests/ai.test.ts` | 5 | Partidas completas, oferta respondida y distinción medible de dificultad |
| `tests/integration.test.ts` | 7 | Modos locales 2/3/4 humanos, setup, turno IA/humano, oferta a todos y guardado |

Duración de las simulaciones completas:

- IA fácil: 21.4 s.
- IA normal: 25.8 s.
- IA difícil: 17.7 s.
- Conjunto de `tests/ai.test.ts`: 69.7 s.

Las tres dificultades terminaron partidas completas, con ganador, al menos 10 PV y sin recursos negativos ni límites de piezas excedidos. La prueba de oferta pendiente comprueba que una IA responde y que la partida no queda bloqueada. La integración cubre además una oferta a todos con un humano y una IA pendientes: el humano puede responder y la IA no bloquea el flujo. La prueba de distinción ejecuta 400 decisiones por dificultad en un estado con acciones disponibles: la IA fácil termina el turno prematuramente en una parte medible de casos y la difícil nunca lo hace en esa muestra.

### Comprobación de tipos

```text
> tsc --noEmit
```

Sin errores.

### Lint

No hay un linter separado. El script `npm run lint` ejecuta `tsc --noEmit`, la misma comprobación estricta que `typecheck`.

### Build de producción

```text
vite v8.3.4 building client environment for production...
32 modules transformed.
dist/index.html                  0.60 kB │ gzip:  0.36 kB
dist/assets/index-DypuwD8d.css  34.68 kB │ gzip:  7.94 kB
dist/assets/index-C9ARwJDr.js  265.40 kB │ gzip: 80.96 kB
built in 762ms
```

El build incluye `tsc --noEmit` y no necesita red ni credenciales.

### Smoke de navegador

```text
OK: menú, 4 jugadores locales, privacidad, 54 cruces y 2 carreteras legales,
autoguardado, reanudación, oferta a todos con humano+IA, recursos locales,
turno completo, banco, hexágono, pausa y tutorial.
```

La prueba se ejecutó con Playwright headless sobre un navegador Chromium del sistema, tanto contra el servidor de desarrollo como contra el build de producción servido con `vite preview`. Comprueba:

- menú principal y creación de partida local;
- pantalla de privacidad;
- 54 cruces candidatos y 2 carreteras legales al inicio;
- escritura del autoguardado en `localStorage`;
- recarga y reanudación desde el menú;
- oferta dirigida a todos con un receptor humano y una IA pendiente, resuelta por el humano;
- ausencia de peticiones a hosts externos durante todo el recorrido;
- preparación completa de una partida individual;
- tirada, descarte o ladrón si aparecen, y llegada a la fase de acciones;
- apertura y cierre del comercio con el banco;
- inspección de un hexágono;
- pausa, tutorial y finalización del turno;
- ausencia de errores de consola y de página atribuibles al proyecto.

## Matriz de aceptación

| Área | Comprobación | Estado |
|---|---|---|
| Tablero | 19 hexágonos, 54 cruces, 72 caminos, 9 puertos, 6/8 no adyacentes | Verificado |
| Semilla | Tablero, mazo y azar reproducibles | Verificado |
| Setup | Orden ida/vuelta, segunda ronda inversa, recursos del segundo poblado | Verificado |
| Producción | Poblado 1, ciudad 2, desierto y ladrón bloquean | Verificado |
| Escasez | Si falta un recurso para la demanda total, nadie lo recibe | Verificado |
| 7 | Sin producción, descarte de mitad, movimiento obligatorio y robo | Verificado |
| Construcción | Costes, conectividad, distancia, límites y cruce rival | Verificado |
| Comercio | Banco, puertos, ofertas, contraofertas y rechazos | Verificado |
| Cartas | 31 cartas, restricciones de turno, efectos y PV ocultos | Verificado |
| Distinciones | Umbrales, cambios de titular y empates | Verificado |
| Victoria | 10 PV, solo jugador activo, PV ocultos | Verificado por motor y simulación IA |
| Pokémon | Captura, biomas, costes, 3 activos y 1 captura/turno | Verificado |
| Evolución | Etapas, costes, duplicados, 1 evolución/turno y Piedra Evolutiva | Verificado |
| Habilidades | 10 habilidades, frecuencia por ronda y límites | Verificado |
| IA | Partidas completas en 3 dificultades, sin bloqueos y con distinción medible | Verificado |
| Persistencia | Autosave, exportación, importación, corrupción y versión | Verificado |
| Navegador | Flujos críticos en un navegador real | Verificado |
| Offline | Bundle y assets locales, sin peticiones de runtime externas | Diseño verificado; no se probó con la red desconectada |

## Limitaciones conocidas

- El smoke de navegador no cubre todos los modales de comercio, captura y evolución; esos flujos están cubiertos por pruebas de motor e integración, no por una prueba E2E exhaustiva.
- No hay pruebas visuales por captura de pantalla ni comparación de píxeles.
- No se probó con lectores de pantalla ni con una matriz completa de dispositivos móviles. La interfaz incluye etiquetas ARIA, foco visible y media queries.
- La prueba de navegador usa Edge/Chrome del sistema. No se descargaron navegadores de Playwright.
- La validación de importación es estructural y de límites; no reproduce toda la historia de la partida para demostrar que cada carretera fue construida en su momento. Rechaza formatos, recursos negativos, piezas solapadas, límites, cartas y especies inválidas.
- La distinción de la IA se basa en heurísticas y parámetros diferentes. La prueba de decisión mide errores estratégicos en una muestra controlada, no una tasa de victoria estadísticamente significativa.
- `npm audit` informa **0 vulnerabilidades** tras actualizar Vite a 8.3.4, Vitest a 5.0.5 y `@vitejs/plugin-react` a 6.1.2. `npm audit --omit=dev` también da 0.
- El `testTimeout` de Vitest se elevó a 60 s porque las simulaciones completas de IA tardan más en esta máquina; no se redujo ninguna comprobación.
- No se implementa multijugador online, cuentas ni servidor.
- No hay servicio de guardado en la nube; el autoguardado es local al navegador.
