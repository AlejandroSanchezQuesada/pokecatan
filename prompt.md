# PROYECTO: POKÉMON CATÁN WEB
## Prompt maestro de implementación autónoma

Actúa como desarrollador principal, arquitecto de software, diseñador de juegos de mesa, especialista en IA de videojuegos, responsable de recursos gráficos y responsable de QA.

Tu misión es diseñar, implementar, probar y documentar un juego web completo llamado provisionalmente **Pokémon Catán Web**: un juego estratégico inspirado en Catán, ambientado en el universo Pokémon, con gráficos pixel art y una experiencia visual inspirada en los juegos de Pokémon Mundo Misterioso y PokéSurvivor.

No quiero una maqueta, una demo visual, una colección de pantallas desconectadas ni un prototipo que dependa de funcionalidades simuladas. Quiero un juego funcional, con reglas coherentes, partidas completas y pruebas ejecutadas.

Trabaja autónomamente. Analiza el repositorio, toma decisiones técnicas justificadas, implementa, ejecuta las comprobaciones, corrige los errores y continúa hasta alcanzar los criterios de aceptación.

No solicites confirmación para decisiones técnicas ordinarias. Si una decisión de diseño imprescindible no está especificada, aplica la solución más sencilla, coherente, mantenible y equilibrada, documentándola. No inventes que una función está terminada o probada si no has comprobado su funcionamiento.

---

# 1. OBJETIVO Y ALCANCE

Construir un juego web de tablero con:

- Partidas de cuatro jugadores.
- Modo individual contra tres rivales de IA.
- Multijugador local de hasta cuatro participantes humanos, con posibilidad de completar plazas mediante IA.
- Tres dificultades de IA: fácil, normal y difícil.
- Preparación arquitectónica para multijugador online futuro, sin implementar todavía un servidor online, cuentas ni infraestructura de red.
- Tablero procedural de hexágonos con generación equilibrada.
- Las reglas fundamentales de Catán clásico.
- Captura, evolución y habilidades limitadas de Pokémon.
- Cartas de desarrollo clásicas adaptadas temáticamente y un conjunto acotado de cartas Pokémon adicionales.
- Guardado automático local, reanudación, exportación e importación de partidas.
- Sprites, animaciones, efectos visuales y una interfaz pulida.
- Pruebas automatizadas de las reglas y pruebas de integración de los flujos principales.

La experiencia debe ser reconocible como Catán desde el primer turno. Pokémon aporta ambientación, colección y decisiones tácticas adicionales, pero no debe sustituir el sistema económico central.

El proyecto es un juego de aficionados no oficial. No afirmes que está afiliado a Nintendo, The Pokémon Company, sus licenciatarios o los titulares de Catán.

# 2. FASE CERO: AUDITORÍA OBLIGATORIA

Antes de modificar archivos:

1. Inspecciona el repositorio, su documentación, estructura, dependencias, scripts, pruebas, configuración y estado de Git.
2. Identifica el stack existente y reutiliza lo que resulte adecuado.
3. No borres, sobrescribas ni reorganices trabajo existente sin comprender su función.
4. Comprueba las herramientas disponibles para descargar recursos, ejecutar el juego, automatizar el navegador y validar el código.
5. Investiga las fuentes de sprites y sus licencias antes de diseñar la estrategia de descarga.
6. Identifica riesgos técnicos, funcionales, legales y de equilibrio.
7. Define una arquitectura y un plan de ejecución por fases con criterios de aceptación verificables.

Crea o actualiza documentación en el repositorio:

- `README.md`: instalación, ejecución, controles y estado real del proyecto.
- `docs/game-rules.md`: reglas completas y orden de los turnos.
- `docs/architecture.md`: arquitectura, módulos y separación de responsabilidades.
- `docs/assets.md`: fuentes, atribuciones, licencias y procedimiento de actualización.
- `docs/testing.md`: pruebas ejecutadas, resultados y limitaciones conocidas.
- `docs/decisions.md`: decisiones relevantes de diseño y sus motivos.

Adapta los nombres y ubicaciones si el repositorio ya tiene una estructura coherente. Evita duplicar documentación innecesariamente.

# 3. REGLAS DEL JUEGO

Implementa un motor de reglas determinista y verificable, independiente de la interfaz gráfica.

## 3.1. Tablero

Utiliza como configuración inicial un tablero equivalente al Catán clásico para cuatro jugadores:

- 19 hexágonos: 4 bosques, 3 colinas, 4 pastos, 4 campos, 3 montañas y 1 desierto.
- Cinco recursos: madera, arcilla, lana, trigo y mineral.
- Números de producción correspondientes a los valores clásicos: 2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11 y 12.
- El desierto no produce recursos.
- Los números 6 y 8 no deben quedar adyacentes entre sí en la configuración inicial.
- Nueve puertos: cuatro genéricos de 3:1 y cinco especializados de 2:1, uno por recurso.
- Generación aleatoria reproducible mediante una semilla de partida.
- Validación de la distribución, conectividad y legalidad del tablero.

El generador debe procurar un reparto equilibrado de probabilidades de producción y posiciones iniciales. No debe prometer equilibrio perfecto, pero sí evitar configuraciones claramente defectuosas.

Permite volver a generar el tablero y mostrar su semilla en los detalles de la partida.

## 3.2. Colocación inicial

Implementa la colocación inicial clásica en orden de ida y vuelta:

- Cada jugador coloca un poblado y una carretera adyacente.
- Se completa la primera ronda en orden.
- La segunda ronda se realiza en orden inverso.
- Cada jugador recibe los recursos iniciales correspondientes a los hexágonos adyacentes a su segundo poblado.
- Se comprueba la regla de distancia mínima entre poblados.

El jugador no puede colocar construcciones ilegales. La interfaz debe mostrar las ubicaciones válidas y explicar por qué una ubicación seleccionada no es válida cuando corresponda.

## 3.3. Turnos y producción

Implementa las fases:

1. Lanzamiento de dos dados de seis caras.
2. Producción de recursos.
3. Resolución del 7, si aparece.
4. Acciones del jugador activo.
5. Finalización del turno y comprobación de victoria.

Los resultados aleatorios deben generarse mediante un servicio de azar sustituible en las pruebas.

La producción se calcula en función de los hexágonos adyacentes a poblados y ciudades:

- Poblado: 1 unidad del recurso producido.
- Ciudad: 2 unidades.
- Un hexágono sin producción no concede recursos.
- En caso de falta de recursos en el banco, aplica de manera consistente las reglas de producción insuficiente acordadas y documentadas.

Cuando sale un 7:

- Ningún hexágono produce.
- Los jugadores con más de siete cartas de recursos descartan la mitad, redondeando hacia abajo.
- El jugador activo mueve el ladrón a otro hexágono.
- El ladrón bloquea la producción de ese hexágono.
- El jugador activo roba una carta de recurso aleatoria a un adversario con una construcción adyacente elegible, si existe.

El ladrón no puede permanecer en el hexágono que ocupa antes de moverse.

## 3.4. Construcciones

Implementa los costes clásicos:

| Construcción | Coste |
|---|---|
| Carretera | 1 madera + 1 arcilla |
| Poblado | 1 madera + 1 arcilla + 1 lana + 1 trigo |
| Ciudad | 2 trigo + 3 mineral |
| Carta de desarrollo | 1 lana + 1 trigo + 1 mineral |

Valida:

- Conectividad de carreteras.
- Regla de distancia entre poblados.
- Conexión del poblado o ciudad a la red de carreteras propia.
- Mejora de poblado a ciudad.
- Disponibilidad de piezas de construcción.
- Existencia de recursos suficientes.
- Legalidad de todas las acciones en el estado actual.

Un jugador no puede construir una carretera atravesando un cruce ocupado por un poblado o ciudad rival para prolongar su propia red.

Implementa los límites de piezas del Catán clásico, documentando cualquier excepción necesaria.

## 3.5. Comercio

Implementa exclusivamente el sistema económico clásico:

- Ofertas y contraofertas de intercambio entre jugadores.
- Comercio con el banco a 4:1.
- Comercio 3:1 en puertos genéricos.
- Comercio 2:1 en puertos especializados.
- Solo se pueden intercambiar recursos que el jugador posea.
- Las ofertas no pueden provocar estados negativos ni saltarse las reglas de turnos.

En partidas individuales, los tres rivales son IA y deben poder aceptar, rechazar o proponer intercambios según su estrategia.

En partidas locales, las ofertas deben gestionarse mediante una interfaz comprensible, sin revelar información privada innecesaria.

No introduzcas comercio de Pokémon ni monedas adicionales.

## 3.6. Cartas de desarrollo

Implementa el mazo clásico de 25 cartas:

- 14 caballeros.
- 5 puntos de victoria.
- 2 cartas de construcción de carreteras.
- 2 cartas de año de abundancia.
- 2 cartas de monopolio.

Adapta sus nombres y presentación al universo Pokémon, pero conserva los efectos fundamentales.

Restricciones:

- No se puede jugar una carta de desarrollo comprada durante el mismo turno.
- Como regla inicial, solo se puede jugar una carta de desarrollo por turno.
- Los puntos de victoria ocultos se contabilizan correctamente.
- Las cartas de efecto único se resuelven de manera atómica y validada.
- Las cartas agotadas no se pueden robar.
- Las cartas no pueden provocar recursos negativos ni duplicación de efectos.

## 3.7. Ruta comercial y ejército

Implementa:

- Ruta comercial más larga: al menos cinco carreteras conectadas, respetando las interrupciones causadas por construcciones rivales.
- Ejército más grande: al menos tres caballeros jugados.
- Bonificaciones de dos puntos para el titular de cada distinción.
- Reglas documentadas para cambios de titular y empates.

## 3.8. Victoria

La partida termina cuando un jugador alcanza diez puntos de victoria durante su propio turno y se cumplen las condiciones para declarar la victoria.

Contabiliza:

- Poblados: 1 punto.
- Ciudades: 2 puntos.
- Ruta comercial más larga: 2 puntos.
- Ejército más grande: 2 puntos.
- Cartas de puntos de victoria: 1 punto cada una.

Las habilidades Pokémon no otorgan puntos de victoria directos. Las cartas Pokémon tampoco deben crear puntos adicionales fuera del sistema expresamente definido.

La interfaz debe mostrar la puntuación conocida y mantener correctamente ocultas las cartas de puntos de victoria de los adversarios.

# 4. MECÁNICAS POKÉMON

## 4.1. Captura

Introduce Pokémon asociados a biomas y terrenos.

- La disponibilidad de Pokémon debe proceder de un catálogo local de datos.
- Cada Pokémon tiene identificador estable, nombre, tipos, biomas compatibles, fase evolutiva y habilidad.
- La captura debe requerir una acción válida y un coste explícito.
- La captura no puede generar recursos, cartas ni puntos ilimitados.
- Cada jugador tiene un límite inicial documentado de tres Pokémon activos.
- Los Pokémon capturados pertenecen al jugador durante la partida.
- El sistema debe permitir ampliar el catálogo sin modificar el motor de reglas.

Diseña una regla inicial sencilla de captura que utilice recursos existentes y no cree una segunda economía. Por ejemplo, capturar un Pokémon disponible en un bioma conectado a una construcción propia puede requerir una acción y un coste de recursos documentado.

Define los costes y las restricciones en `docs/game-rules.md` antes de implementarlos.

## 4.2. Evolución

- Solo se puede evolucionar un Pokémon si existe una fase evolutiva válida en los datos.
- Cada evolución debe cumplir requisitos explícitos.
- La evolución consume la acción o el coste definido por las reglas.
- No se puede evolucionar indefinidamente ni duplicar Pokémon.
- Los Pokémon sin evolución disponible siguen siendo útiles.
- La evolución no concede puntos de victoria directamente.

La primera versión no necesita reproducir todos los métodos evolutivos oficiales. Utiliza reglas de partida simplificadas, consistentes y verificables.

## 4.3. Habilidades

Implementa inicialmente un catálogo reducido de habilidades, idealmente entre seis y diez, escogidas por variedad estratégica.

Las habilidades pueden:

- Mejorar una operación comercial limitada.
- Reducir una vez por ronda un coste elegible, sin llevarlo por debajo de cero.
- Proporcionar protección frente a un efecto concreto.
- Facilitar una construcción cuando se cumplen requisitos.
- Modificar de manera limitada una acción o interacción.

Estas son categorías de diseño, no una autorización para conceder ventajas ilimitadas. Define para cada habilidad:

- Nombre y descripción.
- Requisitos.
- Momento de activación.
- Coste.
- Frecuencia máxima.
- Prioridad frente a otras reglas.
- Condiciones de cancelación.
- Pruebas de funcionamiento y posibles abusos.

Utiliza identificadores estables y efectos explícitos. Evita ejecutar código arbitrario proveniente de los datos de los Pokémon.

La misma regla debe aplicarse al jugador humano y a la IA.

## 4.4. Cartas Pokémon adicionales

Después de verificar el sistema clásico, incorpora un pequeño conjunto inicial de cartas Pokémon especiales.

- Cada carta debe tener un efecto único y claramente descrito.
- Las cartas se integran en el mismo sistema de acciones y validación.
- No pueden invalidar las reglas fundamentales de producción, construcción, comercio o victoria.
- No pueden generar recursos ilimitados, turnos infinitos o puntos de victoria directos.
- Cada efecto debe disponer de pruebas específicas.

Mantén la baraja clásica como base. Documenta el número inicial de cartas Pokémon, su distribución y sus efectos.

Si la ampliación compromete el equilibrio, reduce su alcance en lugar de debilitar el motor clásico.

# 5. IA DE TRES DIFICULTADES

Implementa tres niveles de dificultad con un motor de reglas compartido.

## Fácil

- Prioriza acciones legales y comprensibles.
- Valora recursos y construcciones básicas.
- Evita quedarse sin movimientos por errores de planificación.
- Puede cometer errores estratégicos razonables.

## Normal

- Evalúa las probabilidades de producción.
- Prioriza poblados, ciudades y carreteras según su utilidad.
- Tiene en cuenta costes, recursos escasos y puertos.
- Utiliza cartas y habilidades de forma razonable.
- Considera oportunidades de intercambio.

## Difícil

- Evalúa varias acciones candidatas.
- Considera el potencial de producción, los accesos a intersecciones, las rutas comerciales y la puntuación.
- Estima las necesidades de recursos de los adversarios.
- Gestiona cartas, habilidades y capturas de forma estratégica.
- Evita regalar oportunidades de victoria evidentes.

Todas las dificultades deben utilizar exactamente las mismas reglas, costes y límites que los jugadores humanos.

La dificultad no puede conceder recursos adicionales, alterar resultados de dados ni consultar información privada que no estaría disponible para un jugador.

Establece límites de tiempo y expansión de búsqueda para que la IA no bloquee la interfaz. Documenta las heurísticas utilizadas y crea pruebas de simulación.

# 6. MODOS DE PARTIDA

## Individual

- Un jugador humano y tres rivales controlados por IA.
- Selección de dificultad.
- Configuración de semilla y nombre de partida.
- Inicio, desarrollo y finalización de una partida completa.

## Multijugador local

- De dos a cuatro jugadores.
- Posibilidad de combinar jugadores humanos y rivales de IA.
- Flujo de turnos consistente.
- Interfaz de privacidad para evitar que se revelen accidentalmente cartas o información oculta de otros jugadores.
- Sin necesidad de servidor ni de conexión a Internet para jugar.

## Online futuro

No implementes todavía partidas por Internet, cuentas, salas, autenticación ni un servidor multijugador.

Prepara únicamente las interfaces necesarias para una futura capa de transporte:

- Acciones serializables.
- Estado de partida independiente de la UI.
- Validación de acciones en el motor.
- Identidad estable de jugadores.
- Registro de eventos.
- Versionado del formato de guardado.
- Separación entre lógica, presentación y transporte.

No añadas dependencias, contenedores ni infraestructura de red solo para simular que el online está preparado.

# 7. GUARDADO Y EXPORTACIÓN

Implementa:

- Guardado automático en el almacenamiento local del navegador.
- Reanudación de partidas guardadas.
- Opción de comenzar una partida nueva.
- Exportación de una partida a un archivo JSON.
- Importación de una partida exportada.
- Validación completa del archivo importado.
- Versionado del formato.
- Gestión de archivos corruptos, incompatibles o manipulados.
- Avisos comprensibles cuando no sea posible recuperar una partida.

El guardado debe incluir todo lo necesario para continuar la partida: semilla, turno, jugador activo, tablero, recursos, construcciones, cartas, Pokémon, estado del ladrón, datos de IA relevantes y cualquier otra información de juego.

No guardes únicamente el estado visual.

No aceptes estados importados con recursos negativos, construcciones imposibles, cartas duplicadas ilegalmente o turnos inconsistentes.

La restauración debe ser determinista en lo relativo al estado guardado. Documenta las limitaciones si una versión posterior cambia las reglas.

# 8. ASSETS: INVESTIGACIÓN Y DESCARGA

La prioridad visual es Pokémon Mundo Misterioso, SpriteCollab y recursos compatibles con el estilo de PokéSurvivor.

Investiga como mínimo:

- Repositorio oficial de SpriteCollab: https://github.com/PMDCollab/SpriteCollab
- Repositorio de PokéSurvivor: https://github.com/JPTER78/pokesurvivor
- PokeAPI sprites, como fuente alternativa cuando resulte necesaria: https://github.com/PokeAPI/sprites

No presupongas que todos los recursos de estas fuentes tienen la misma licencia.

## Procedimiento obligatorio

1. Inspecciona los repositorios y sus archivos de licencia.
2. Identifica los recursos realmente útiles para el juego.
3. Comprueba las condiciones de redistribución y uso antes de incorporarlos.
4. Prioriza recursos descargables de forma reproducible y fuentes oficiales del proyecto correspondiente.
5. Registra procedencia, licencia, atribución, URL original e identificador del recurso.
6. Conserva los avisos de licencia exigidos.
7. Evita descargar todo el catálogo sin una necesidad demostrada.
8. No extraigas ni reutilices recursos protegidos si la licencia o autorización necesaria no está clara.
9. No evadas controles de acceso ni mecanismos de protección.
10. No dependas de una URL remota durante la partida si el recurso puede distribuirse localmente con autorización.
11. Genera un índice local de recursos, metadatos y animaciones disponibles.
12. Valida que los archivos descargados no estén vacíos, corruptos o duplicados innecesariamente.
13. Incluye una alternativa visual local cuando falte un recurso.
14. No inventes que un Pokémon tiene animaciones que no existen.

Crea scripts idempotentes: volver a ejecutarlos no debe producir duplicados, sobrescribir recursos sin justificación ni destruir modificaciones locales.

El proceso de construcción del proyecto no debe requerir credenciales privadas ni depender de servicios de pago.

Si un recurso no puede obtenerse legalmente o la descarga falla, documenta la limitación y utiliza un recurso alternativo compatible con su licencia.

# 9. INTERFAZ Y EXPERIENCIA VISUAL

La estética debe recordar a un juego Pokémon de navegador con pixel art, animaciones y una interfaz moderna, sin sacrificar la claridad de las reglas.

Incluye:

- Pantalla inicial.
- Creación y configuración de partida.
- Tablero interactivo.
- Panel de jugador activo.
- Inventario de recursos.
- Cartas y Pokémon capturados.
- Indicadores de construcciones y puntos.
- Selección clara de ubicaciones válidas.
- Historial de eventos y mensajes de reglas.
- Controles para dados, construcción, comercio, cartas y habilidades.
- Menús de pausa y opciones.
- Guardar, reanudar, exportar e importar.
- Pantalla de victoria y resumen de partida.
- Ayudas y tutorial inicial.
- Animaciones breves para dados, producción, capturas y construcciones.
- Sonido opcional con controles de volumen y silencio.
- Adaptación a escritorio y móvil.

No utilices animaciones que impidan jugar o ralenticen innecesariamente los turnos.

El tablero es el elemento principal de la pantalla. La información debe ser legible, las acciones deben tener respuesta visual y las reglas no deben depender exclusivamente del color.

Incluye estados de carga, error y ausencia de recursos. La falta de una animación no puede bloquear una partida.

# 10. ARQUITECTURA TÉCNICA

Elige la tecnología después de auditar el repositorio.

Si no existe una base adecuada, prioriza una aplicación web TypeScript mantenible con una interfaz moderna y una arquitectura modular. React es una opción razonable, pero no introduzcas complejidad innecesaria si otra solución satisface mejor los requisitos.

Separa al menos estas responsabilidades:

- `game-engine`: estado y reglas.
- `board`: generación y geometría del tablero.
- `economy`: producción, recursos y comercio.
- `construction`: carreteras, poblados y ciudades.
- `cards`: cartas clásicas y especiales.
- `pokemon`: catálogo, captura, evolución y habilidades.
- `ai`: heurísticas y planificación.
- `persistence`: guardado, migraciones, exportación e importación.
- `assets`: índices, metadatos y carga de recursos.
- `ui`: presentación e interacción.
- `testing`: pruebas unitarias, integración y navegador.

Adapta la estructura a la tecnología escogida. No es obligatorio crear un paquete o archivo independiente para cada concepto si una organización más sencilla es igual de clara.

El motor debe recibir acciones y devolver estados o resultados verificables. No debe manipular el DOM, realizar llamadas de red ni depender de componentes visuales.

Utiliza un catálogo de acciones tipadas y validación centralizada. No permitas que la UI modifique directamente recursos, puntuaciones o construcciones para saltarse las reglas.

Mantén las dependencias justificadas y evita incorporar paquetes redundantes.

# 11. FASES AUTÓNOMAS DE IMPLEMENTACIÓN

Ejecuta las fases en orden. No avances dejando errores críticos conocidos en la fase anterior.

## Fase 0 — Auditoría

Inspecciona y documenta el proyecto, los riesgos y el plan.

Criterio de aceptación: arquitectura definida, fuentes de assets evaluadas y plan verificable.

## Fase 1 — Recursos gráficos

Crea los scripts de descarga, los índices locales y la documentación de licencias.

Criterio de aceptación: el proceso es reproducible, los recursos tienen procedencia registrada y la aplicación puede mostrar alternativas cuando falten assets.

## Fase 2 — Motor clásico

Implementa el tablero, las reglas, los turnos, los recursos, el comercio, las construcciones, las cartas, las bonificaciones y la victoria.

Criterio de aceptación: las reglas críticas disponen de pruebas automatizadas y no dependen de la UI.

## Fase 3 — Interfaz y partida local

Implementa el tablero interactivo y el flujo completo de una partida con humanos.

Criterio de aceptación: se puede iniciar, jugar y finalizar una partida legal sin manipular manualmente el estado.

## Fase 4 — IA

Implementa las tres dificultades y la lógica de los intercambios.

Criterio de aceptación: se puede completar una partida contra tres IA; todas sus acciones respetan las reglas y no existen bloqueos indefinidos.

## Fase 5 — Pokémon

Implementa captura, evolución, habilidades y cartas especiales.

Criterio de aceptación: cada efecto dispone de reglas documentadas y pruebas de legalidad, límites y casos extremos.

## Fase 6 — Guardado

Implementa guardado automático, reanudación, exportación e importación.

Criterio de aceptación: una partida guardada puede reanudarse y un archivo válido puede importarse; los archivos corruptos o inválidos se rechazan sin destruir el estado actual.

## Fase 7 — Acabado y validación

Mejora la presentación, accesibilidad, animaciones, rendimiento y mensajes de error.

Criterio de aceptación: los flujos principales funcionan en un navegador real, la consola está libre de errores atribuibles al proyecto y las pruebas se ejecutan correctamente.

Después de cada fase:

1. Ejecuta las pruebas pertinentes.
2. Corrige los fallos encontrados.
3. Actualiza la documentación.
4. Registra los cambios realizados.
5. Comprueba que no has roto funcionalidades anteriores.
6. Continúa automáticamente si se cumplen los criterios de aceptación.

Si una dependencia, herramienta o fuente externa no está disponible, busca una alternativa razonable y documenta la limitación. No declares completada una fase cuyo criterio de aceptación no hayas verificado.

# 12. PRUEBAS Y CRITERIOS DE ACEPTACIÓN GLOBALES

Las pruebas deben incluir, como mínimo:

## Motor de reglas

- Producción correcta para todos los resultados de dados.
- Ausencia de producción en el desierto y en el hexágono ocupado por el ladrón.
- Descarte correcto al obtener un 7.
- Validación de distancias y conexiones de construcciones.
- Costes exactos de todas las construcciones.
- Intercambios válidos y rechazo de intercambios ilegales.
- Funcionamiento de cartas y restricciones de turno.
- Cálculo correcto de ruta comercial más larga y ejército más grande.
- Detección correcta de la victoria.
- Ausencia de recursos negativos y duplicaciones ilegales.

## Pokémon

- Captura solo en condiciones permitidas.
- Evoluciones válidas y rechazo de evoluciones ilegales.
- Aplicación correcta de habilidades.
- Respeto de límites de frecuencia.
- Ausencia de bucles infinitos o duplicaciones de efectos.
- Comportamiento consistente entre jugadores humanos e IA.

## Persistencia

- Guardado y reanudación.
- Exportación e importación.
- Rechazo de archivos corruptos.
- Validación de versiones incompatibles.
- Integridad de la partida tras una restauración.

## IA

- Legalidad de todas las acciones.
- Ausencia de bloqueos indefinidos.
- Finalización de partidas simuladas bajo un límite razonable de turnos o tiempo.
- Distinción medible entre las dificultades sin alterar las reglas.
- Ausencia de acceso a información oculta no disponible para los jugadores.

## Interfaz

- Inicio de partida.
- Colocación inicial.
- Producción y gestión de recursos.
- Construcción.
- Comercio.
- Cartas y habilidades.
- Finalización de partida.
- Guardado y restauración.
- Funcionamiento sin conexión después de disponer de los recursos locales necesarios.

Utiliza pruebas unitarias para las reglas, pruebas de integración para los flujos y automatización del navegador para los recorridos críticos. No sustituyas las pruebas de funcionamiento por capturas de pantalla.

Ejecuta los comandos reales del repositorio para comprobar lint, tipos, pruebas y build cuando existan. Si no existen, crea los necesarios con la mínima complejidad.

No ocultes fallos ni reduzcas las comprobaciones para conseguir un resultado verde artificialmente.

# 13. CALIDAD DEL CÓDIGO Y SEGURIDAD

- No dejes botones sin funcionalidad.
- No uses datos falsos para aparentar que existe una función.
- No implementes reglas de negocio duplicadas en el frontend.
- No uses `any` indiscriminadamente ni desactives el sistema de tipos para evitar errores.
- No captures excepciones silenciosamente.
- No guardes información sensible innecesaria.
- Valida todas las importaciones y acciones.
- Evita dependencias abandonadas o innecesarias.
- No introduzcas credenciales, claves ni secretos en el repositorio.
- No elimines pruebas existentes para hacer pasar la compilación.
- No afirmes haber ejecutado comandos que no hayas ejecutado.
- No dejes errores conocidos sin documentar.

# 14. ENTREGA FINAL

Al finalizar, proporciona un informe breve pero verificable con:

1. Funcionalidades implementadas.
2. Funcionalidades que siguen pendientes.
3. Arquitectura y tecnologías elegidas.
4. Fuentes de assets y documentación de licencias.
5. Comandos ejecutados para comprobar el proyecto.
6. Resultados reales de lint, comprobación de tipos, pruebas y build.
7. Resultados de las pruebas de navegador, si se han podido ejecutar.
8. Limitaciones conocidas y decisiones pendientes.
9. Instrucciones exactas para instalar, arrancar y jugar.
10. Ubicación de la documentación y los scripts de recursos.

No consideres el proyecto terminado simplemente porque compile o arranque. La entrega solo puede calificarse como completa cuando los criterios de aceptación correspondientes hayan sido ejecutados y satisfechos.

**Empieza ahora por la Fase 0. Inspecciona el repositorio y ejecuta el plan de implementación de forma autónoma. No te limites a devolverme un plan: realiza el trabajo.**