# Decisiones de diseño

Este documento registra las decisiones relevantes, su motivo y sus límites. Las reglas completas están en `docs/game-rules.md`.

## D1. Mesa fija de cuatro jugadores

**Decisión:** toda partida tiene cuatro jugadores. El modo local permite 2, 3 o 4 humanos y completa las plazas restantes con IA; el modo individual usa 1 humano y 3 IA.

**Motivo:** el tablero, el reparto de puertos, el equilibrio y las pruebas están diseñados para cuatro. Mantener una mesa fija reduce casos límite y conserva la experiencia clásica.

**Consecuencia:** no existe un modo de dos jugadores en un tablero reducido ni una mesa de cinco.

## D2. Motor puro con acciones serializables

**Decisión:** `src/engine` no importa React, DOM ni red. Toda mutación pasa por `applyAction`, que valida, clona y devuelve un estado nuevo.

**Motivo:** pruebas deterministas, separación de responsabilidades y preparación para un futuro transporte online.

**Consecuencia:** la UI calcula candidatos llamando al motor. Es algo más costoso que duplicar reglas en React, pero evita divergencias entre lo que se muestra y lo que se permite.

## D3. RNG con estado persistido

**Decisión:** el estado del RNG vive en `GameState.rngState` y se guarda. La generación del tablero y el mazo usan derivaciones de la semilla; la IA usa una semilla estable por turno y evento.

**Motivo:** reproducibilidad, pruebas sin parchear aleatoriedad global y restauración determinista.

**Consecuencia:** una partida guardada continúa la misma secuencia de azar. Cambiar la implementación del RNG en una versión futura requerirá una migración de guardado.

## D4. Tablero generado con heurística, no equilibrio perfecto

**Decisión:** se prueban hasta 120 distribuciones, se descartan las que tienen 6 y 8 adyacentes y se selecciona la mejor puntuación de probabilidad, diversidad y equilibrio de intersecciones.

**Motivo:** el requisito pide un reparto equilibrado razonable, no una garantía matemática.

**Consecuencia:** dos semillas pueden ofrecer calidades distintas, pero se evitan tableros claramente defectuosos. Los puertos se asignan después de la geometría.

## D5. Escasez del banco sin reparto parcial

**Decisión:** si la demanda total de un recurso supera el stock, nadie recibe ese recurso en la producción de ese turno.

**Motivo:** es una regla simple, consistente y fácil de probar. Evita discrepancias por orden de jugadores y no crea una prioridad artificial.

**Consecuencia:** en situaciones de escasez se pierde producción que en otras variantes podría repartirse parcialmente. La regla está documentada y probada.

## D6. Baraja de 31 cartas

**Decisión:** se conservan las 25 cartas clásicas y se añaden 2 Poké Ball, 2 Bayas Arcoíris y 2 Piedras Evolutivas.

**Motivo:** el requisito pide cartas Pokémon adicionales sin sustituir la base clásica. Seis cartas permiten probar efectos sin diluir en exceso las 25 clásicas.

**Consecuencia:** la composición no es la de Catán estándar. `DEV_CARD_INFO` y el manifiesto de pruebas fijan el total en 31.

## D7. Límite de una captura y una evolución por turno

**Decisión:** cada jugador puede capturar un Pokémon y evolucionar otro por turno, con un máximo de 3 Pokémon activos.

**Motivo:** la colección aporta decisiones tácticas sin convertirse en un motor de recursos paralelo. El límite de 3 contiene la acumulación de habilidades.

**Consecuencia:** no se puede liberar ni sustituir Pokémon durante la partida; las decisiones de captura son permanentes.

## D8. Costes de captura por especie y bioma

**Decisión:** cada especie tiene un coste explícito en recursos existentes, definido en el catálogo. El bioma determina qué especies pueden aparecer.

**Motivo:** evita una segunda moneda y mantiene la economía clásica como centro. Los costes se pueden ajustar sin tocar el motor.

**Consecuencia:** el coste pertenece a la especie, no al hexágono; una especie con dos biomas usa el mismo coste.

## D9. Habilidades con efectos tipados y una vez por ronda

**Decisión:** las habilidades usan un conjunto cerrado de efectos (`gain`, descuentos, 2:1, escudo, bonus de producción). No se ejecuta código de los datos.

**Motivo:** seguridad, validación sencilla, pruebas acotadas y misma regla para humanos e IA.

**Consecuencia:** añadir una habilidad con un efecto nuevo requiere ampliar el tipo y el motor; no basta con editar texto. Es una limitación deliberada.

## D10. Distinciones con retención en empate

**Decisión:** la Ruta Comercial y el Ejército conservan al titular si sigue empatado en la máxima puntuación; si el empate no incluye al titular, la distinción queda vacante. Los umbrales son 5 carreteras y 3 caballeros.

**Motivo:** conserva la lógica clásica de que el titular no pierde la ventaja por un empate, pero permite que una mesa sin titular claro quede sin bonificación.

**Consecuencia:** la Ruta Comercial puede quedar vacante si una construcción rival corta la red. Las reglas exactas están en `docs/game-rules.md` y cubiertas por `tests/awards.test.ts`.

## D11. Victoria comprobada tras cada acción

**Decisión:** `applyAction` comprueba la victoria del jugador activo después de aplicar una acción válida. La puntuación incluye PV ocultos del jugador activo.

**Motivo:** evita ventanas en las que un jugador alcanza 10 PV y la partida continúa, y mantiene la condición de victoria en el propio turno.

**Consecuencia:** una carta de PV comprada puede terminar la partida inmediatamente si lleva al jugador a 10. La interfaz debe revelar el resultado en la pantalla de victoria.

## D12. Autoguardado local y formato versionado

**Decisión:** se usa `localStorage` con la clave `pokecatan.autosave.v1` y un sobre `{format, version, exportedAt, state}`. La importación valida antes de reemplazar el estado.

**Motivo:** requisito de funcionamiento sin servidor y recuperación ante archivos corruptos.

**Consecuencia:** el guardado es local al navegador y no se sincroniza entre dispositivos. La validación es estructural; no reconstruye la historia completa de la partida.

## D13. IA de evaluación 1-ply con límites

**Decisión:** la IA evalúa acciones candidatas con heurísticas y un paso de simulación. Difícil usa menos ruido y más criterios; fácil introduce azar y errores; normal queda en un punto medio. `runAITurn` tiene un tope de acciones.

**Motivo:** mantener respuestas rápidas y evitar bloqueos, sin introducir un motor de búsqueda complejo ni información privilegiada.

**Consecuencia:** no es una IA óptima. La diferencia entre dificultades es de heurística y ruido, no de reglas ni de acceso a información oculta.

## D14. Sin online en esta versión

**Decisión:** no hay servidor, salas, autenticación ni transporte de red. Solo se preparan acciones serializables, estado puro, IDs y versionado.

**Motivo:** el alcance prohíbe implementar online y pide preparación arquitectónica.

**Consecuencia:** el multijugador es de dispositivo compartido. Añadir online requerirá una capa de transporte, autorización, sincronización y gestión de reconexiones.

## D15. Retratos estáticos de SpriteCollab

**Decisión:** se usan 35 retratos PNG locales de PMDCollab/SpriteCollab bajo CC BY-NC 4.0. No se descargan animaciones ni recursos de otras fuentes.

**Motivo:** procedencia clara, estilo de Mundo Misterioso, descarga reproducible y licencia compatible con un proyecto fan no comercial.

**Consecuencia:** no hay animaciones de sprites importadas. La interfaz anima los retratos con CSS. El proyecto no puede explotarse comercialmente sin licencias adicionales.

## D16. React + Vite sin framework CSS

**Decisión:** React 18 y Vite; CSS propio con variables, grid, SVG y media queries.

**Motivo:** la interfaz tiene muchos estados interactivos y el ecosistema ya estaba disponible. Evitar una librería visual reduce dependencias y permite el estilo pixel art.

**Consecuencia:** el CSS es propio y debe mantenerse. No hay tema externo ni sistema de componentes de terceros.

## D17. Pruebas por capas

**Decisión:** Vitest para motor e integración; Playwright para el recorrido crítico de navegador. El smoke no forma parte de `npm test`.

**Motivo:** las pruebas de motor son rápidas y deterministas; el navegador aporta una validación real pero requiere servidor y binario del sistema.

**Consecuencia:** hay que arrancar Vite para `npm run test:browser`. El smoke cubre el flujo principal, no todos los diálogos.

## D18. Validación de importación estructural

**Decisión:** la importación valida formato, versión, tipos, rangos, tablero, piezas, cartas, especies, límites y coherencia básica. No re-simula la partida completa.

**Motivo:** mantener la carga rápida y permitir estados legítimos donde una red quedó cortada por una construcción rival, algo que una comprobación ingenua de conectividad rechazaría.

**Consecuencia:** un archivo manipulado de forma muy sofisticada podría pasar la validación estructural si respeta todos los límites. Para una competición online haría falta validación del servidor y, posiblemente, un registro de acciones verificable.

## D19. Sin service worker

**Decisión:** no se añade PWA ni service worker en esta versión.

**Motivo:** el requisito pide funcionar sin conexión después de cargar los recursos locales, no instalar una aplicación offline. Un service worker añadiría caché, versionado y riesgos de actualización no necesarios para el alcance.

**Consecuencia:** la página necesita el servidor local o el hosting para cargarse; una vez cargada, no depende de servicios externos.

## D20. Seguridad y dependencias

**Decisión:** no se añaden credenciales, telemetría ni llamadas a servicios de terceros. Las dependencias se limitan a React, Vite, TypeScript, Vitest y Playwright Core.

**Motivo:** reducir superficie de ataque y mantener el build reproducible.

**Consecuencia:** se actualizaron Vite, Vitest y el plugin de React a versiones actuales compatibles; `npm audit` y `npm audit --omit=dev` informan 0 vulnerabilidades. Las versiones se fijan mediante `package-lock.json`.
