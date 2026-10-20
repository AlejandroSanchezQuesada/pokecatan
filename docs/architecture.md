# Arquitectura

## Resumen

Pokémon Catán Web es una aplicación web TypeScript con React 18 y Vite. La lógica de juego vive en un motor puro, sin DOM, red ni componentes visuales. La interfaz envía acciones tipadas y recibe un estado nuevo o un error; nunca modifica recursos, puntuaciones o construcciones directamente.

```text
Entrada del usuario
        |
        v
GameAction tipada
        |
        v
applyAction(estado, accion)
        |
        +--> validacion y reglas del motor
        +--> nuevo GameState clonado
        +--> eventos del cambio
        |
        v
React actualiza la interfaz y el autoguardado
```

## Tecnologías

- **TypeScript 5.6** en modo estricto.
- **React 18.3** para la interfaz.
- **Vite 8.3** para desarrollo y build.
- **Vitest 5.0** para pruebas unitarias y de integración.
- **playwright-core 1.55** para el smoke test con Edge o Chrome del sistema.
- Sin framework CSS, sin fuentes externas, sin servicios de red en tiempo de ejecución.

## Estructura

```text
src/
  engine/
    types.ts          Tipos de estado, acciones y resultados
    data.ts           Costes, cartas, catálogo Pokémon y habilidades
    rng.ts            RNG determinista con estado serializable
    board.ts          Geometría hexagonal, generación y validación
    state.ts          Creación de partida, puntuación, distinciones, consultas
    actions.ts        Validación y ejecución centralizada de acciones
    pokemon.ts        Captura, evolución y consultas de habilidades
    persistence.ts    Validación, autosave, exportación e importación
  ai/
    index.ts          Heurísticas, respuestas de comercio y runAITurn
  ui/
    App.tsx           Carga de partida y notificaciones
    MainMenu.tsx      Configuración, reanudación, importación y sonido
    GameScreen.tsx    Orquestación de turnos, IA, privacidad y autosave
    BoardView.tsx     Tablero SVG interactivo
    Panels.tsx        Jugador activo, recursos, cartas y Pokémon
    Dialogs.tsx       Comercio, banco, descarte, ladrón, victoria y pausa
    components.tsx    Sprites, recursos, dados y modales reutilizables
    sound.ts          Efectos opcionales con WebAudio
    styles.css        Sistema visual pixel art responsive
    Tutorial.tsx      Contenido de ayuda
tests/                Pruebas de motor, IA e integración
scripts/              Descarga de assets y smoke de navegador
public/               Assets locales, manifiesto y favicon
```

## Motor de juego

### Estado

`GameState` contiene todo lo necesario para continuar una partida:

- semilla, estado del RNG, turno, ronda y jugador activo;
- fase (`setup`, `roll`, `discard`, `robber`, `action`, `ended`);
- tablero completo con hexágonos, cruces, caminos y puertos;
- banco, jugadores, recursos, cartas, piezas, Pokémon y banderas de turno;
- ladrón, dados, oferta pendiente, descartes pendientes y distinciones;
- registro de eventos y estadísticas;
- versión de esquema.

Los jugadores tienen ID estable y `isAI`; las acciones llevan `playerId`. Esto deja preparada una futura capa de transporte sin cambiar las reglas.

### Acciones

`GameAction` es una unión discriminada y serializable. `applyAction`:

1. Rechaza la acción si la partida terminó.
2. Clona el estado con `structuredClone`.
3. Ejecuta la validación correspondiente.
4. Si hay error, devuelve el estado original sin aplicar cambios parciales.
5. Si es válida, actualiza timestamps, comprueba victoria y devuelve el nuevo estado y los eventos nuevos.

La UI calcula candidatos llamando a `applyAction` sobre acciones legales. No hay reglas de construcción duplicadas en React.

### Azar

`src/engine/rng.ts` implementa un RNG determinista. El estado del RNG se guarda en `GameState.rngState`, de modo que una partida restaurada sigue la misma secuencia. La generación del tablero usa un RNG derivado de `semilla:board`, el mazo usa `semilla:game` y la IA usa semillas derivadas de turno, eventos y salto.

Las tiradas usan este servicio; las pruebas pueden preparar estados con dados concretos sin depender del azar real.

### Tablero

`board.ts` usa coordenadas axiales y convierte a píxeles. La geometría se construye una vez por semilla:

- 19 hexágonos, 54 vértices y 72 aristas;
- IDs estables `h*`, `v*`, `e*` y `p*`;
- puertos en aristas de borde;
- asignación de Pokémon salvajes por bioma;
- validación de recuentos, fichas, puertos y regla 6/8.

La UI recibe coordenadas y relaciones ya resueltas; no genera geometría.

### Economía, construcción y cartas

Estas reglas están en `actions.ts`, con datos en `data.ts`:

- producción y escasez del banco;
- descarte del 7 y robo;
- costes y conectividad de piezas;
- comercio con banco, puertos, ofertas y contraofertas;
- compra y resolución atómica de cartas;
- distinciones y victoria.

Las operaciones que pagan o reciben recursos usan funciones comunes para evitar duplicar cálculos.

### Pokémon

`pokemon.ts` contiene las consultas de legalidad de captura y evolución. `actions.ts` aplica los costes y efectos. El catálogo de `data.ts` es la única fuente de especies, biomas, habilidades y costes. Añadir una especie no requiere cambiar la UI ni las reglas centrales.

Las habilidades no ejecutan código arbitrario: usan efectos tipados (`gain`, `discountRoad`, `bankTrade2`, `stealShield`, etc.).

## IA

`src/ai/index.ts` expone:

- `aiNextAction`: una acción para el jugador activo o un descarte pendiente.
- `aiTradeResponse`: aceptar o rechazar una oferta.
- `runAITurn`: ejecuta acciones hasta que el control debe volver a un humano, la partida termina o se alcanza el límite.
- `pendingAITradeResponder`: siguiente IA que debe responder.
- `pendingTradeAwaitingHuman`: humano que bloquea la resolución de una oferta.

La IA no tiene acceso a información privada de otros jugadores. Para evaluar al líder usa `publicScore`; solo usa la puntuación completa de su propio jugador. Sus decisiones se basan en probabilidades de dados, producción, diversidad, puertos, recursos propios, distinciones y valor de las especies.

Límites:

- La evaluación es de una acción (1-ply), no un árbol profundo.
- `runAITurn` tiene un máximo de acciones por llamada (120 por defecto, 240 desde la UI).
- La IA fácil introduce azar y errores; la normal añade ruido medio; la difícil reduce el ruido y usa mejor el ladrón, las cartas y las ofertas.
- Todas usan las mismas acciones y validaciones que el humano.

## Interfaz

`App.tsx` mantiene el estado de la partida y las notificaciones. `GameScreen.tsx`:

- calcula candidatos legales con el motor;
- ejecuta la IA con temporizadores y evita bucles;
- gestiona la pantalla de privacidad local;
- autoguarda en `localStorage` con un debounce de 500 ms;
- abre los modales de comercio, banco, descarte, ladrón, pausa, ayuda y victoria;
- ofrece exportación e importación JSON.

`BoardView.tsx` renderiza el tablero en SVG y expone zonas de interacción para cruces, caminos y hexágonos. Los estilos usan variables CSS, `color-mix`, animaciones breves y media queries. La información importante no depende solo del color: hay etiquetas, iconos, texto y formas.

## Persistencia

`persistence.ts` define el sobre:

```json
{
  "format": "pokecatan-save",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "state": {}
}
```

La validación comprueba:

- formato, versión y `schemaVersion`;
- tipos y rangos de recursos, banco, turno, ronda y fases;
- tablero, IDs y recuentos;
- piezas dentro de límites y sin cruces duplicados;
- cartas conocidas y sin superar cantidades;
- especies y límites de Pokémon;
- coherencia básica de ganador, distinciones y guardado.

Los archivos corruptos, incompatibles o manipulados se rechazan sin reemplazar la partida actual. La importación crea una copia del estado validado.

## Preparación para online futuro

No se implementa servidor, salas, autenticación ni red. La base deja preparados:

- acciones serializables;
- estado separado de la presentación;
- validación centralizada de acciones;
- IDs estables de jugadores;
- registro de eventos;
- versionado de guardado;
- separación entre motor, UI y persistencia.

Una capa futura podría enviar `GameAction` y recibir `GameState` o eventos, reutilizando el mismo motor y la misma validación.

## Decisiones de mantenimiento

- El motor no importa React, DOM ni módulos de UI.
- La UI no recalcula costes ni reglas de negocio.
- El catálogo y las cartas se editan en datos tipados.
- El estado se clona antes de mutar para que una acción fallida no deje cambios parciales.
- El registro se limita a 250 eventos para acotar el tamaño del guardado.
- Los assets se sirven localmente y tienen fallback visual.
- El build no necesita red ni credenciales.
