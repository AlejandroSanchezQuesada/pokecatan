# Reglas de Pokémon Catán Web

Documento de referencia de las reglas implementadas. La fuente ejecutable es `src/engine/`; los datos de costes, cartas, especies y habilidades están en `src/engine/data.ts`.

## 1. Mesa, objetivo y modos

- La mesa tiene siempre **4 jugadores**.
- **Individual:** 1 humano contra 3 IA.
- **Multijugador local:** 2, 3 o 4 humanos. Las plazas restantes hasta cuatro se completan con IA.
- El objetivo es alcanzar **10 puntos de victoria** durante el propio turno.
- Todos los jugadores, humanos e IA, usan exactamente las mismas reglas, costes, límites y acciones.
- No existe comercio de Pokémon ni una segunda moneda.

## 2. Tablero y semilla

Cada partida usa un tablero hexagonal de radio 2 con geometría fija:

- **19 hexágonos:** 4 bosques, 3 colinas, 4 pastos, 4 campos, 3 montañas y 1 desierto.
- **54 intersecciones** y **72 caminos**.
- Fichas de producción: `2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12`.
- El desierto no produce y no recibe ficha numérica.
- Los hexágonos con **6 y 8 nunca son adyacentes** entre sí.
- **9 puertos:** 4 genéricos de 3:1 y 5 especializados de 2:1, uno por recurso.
- Cada hexágono contiene un Pokémon salvaje inicial.

La semilla de partida controla el tablero, el mazo de desarrollo, los dados y las decisiones aleatorias de la IA. Una misma semilla con las mismas acciones produce el mismo resultado. El generador prueba hasta 120 distribuciones, descarta las que incumplen la regla 6/8 y elige la mejor según una heurística de probabilidad, diversidad de recursos y equilibrio de las mejores intersecciones. No se promete equilibrio perfecto.

La semilla se muestra en el menú y en el diario de la partida. Cambiarla genera otro tablero y otro mazo.

## 3. Colocación inicial

La preparación es gratuita y sigue un orden de ida y vuelta:

1. Ronda 1: jugadores en orden `0, 1, 2, 3`. Cada uno coloca un poblado y una carretera conectada a ese poblado.
2. Ronda 2: jugadores en orden inverso `3, 2, 1, 0`, con las mismas colocaciones.
3. Al colocar el **segundo poblado**, el jugador recibe **1 recurso por cada hexágono de producción adyacente**. El desierto no entrega recurso. Si el banco no tiene existencias de un recurso, no se entrega esa unidad.
4. Tras la última carretera comienza el turno 1 con el jugador 0.

Restricciones:

- Un poblado solo puede colocarse en una intersección libre que respete la **distancia mínima**: no puede haber otro poblado o ciudad en una intersección conectada por un único camino.
- La carretera inicial debe estar conectada al poblado recién colocado y el camino debe estar libre.
- No se pueden colocar piezas por encima de los límites de la reserva personal.

La interfaz marca las intersecciones y caminos legales. Las acciones ilegales se rechazan en el motor.

## 4. Orden de un turno

Cada turno sigue este orden:

1. **Lanzar dos dados de seis caras.**
2. **Resolver el resultado:** producción normal o resolución del 7.
3. **Acciones del jugador activo:** construir, comprar o jugar cartas, comerciar, capturar, evolucionar, usar habilidades y, finalmente, terminar el turno.
4. **Comprobar la victoria** después de cada acción aplicada.
5. **Finalizar el turno** y pasar al siguiente jugador. La ronda se incrementa cuando vuelve a jugar el jugador 0.

En la fase de acciones no hay un límite de construcciones, compras, intercambios o habilidades activas, salvo las restricciones específicas de cada sistema. Solo se permite **una carta de desarrollo jugada por turno**, **una captura por turno** y **una evolución por turno**.

## 5. Producción

Cuando el resultado no es 7:

- Cuenta cada poblado adyacente a un hexágono con el número obtenido: **1 recurso**.
- Cuenta cada ciudad adyacente: **2 recursos**.
- El desierto y el hexágono ocupado por el ladrón no producen.
- El recurso producido es el del terreno del hexágono.

### Escasez del banco

Si la demanda total de un recurso supera las existencias del banco, **nadie recibe ese recurso ese turno**. No se reparte una cantidad parcial ni se prioriza a un jugador. Los demás recursos del resultado se resuelven con normalidad.

El banco comienza con **19 unidades de cada recurso**. Los pagos de construcciones, cartas y capturas devuelven recursos al banco; los ingresos y cartas los retiran.

## 6. El 7, descartes y ladrón

Con un 7:

- Ningún hexágono produce.
- Cada jugador con **más de 7 recursos** debe descartar `floor(total / 2)` recursos, es decir, la mitad redondeada hacia abajo. Se descarta antes de mover al ladrón.
- El jugador activo debe mover el ladrón a un hexágono **distinto** del actual.
- El ladrón bloquea la producción del hexágono que ocupa.
- Después el jugador activo puede robar **1 recurso aleatorio** a un adversario que tenga al menos una construcción junto al nuevo hexágono y al menos un recurso. Si hay varios objetivos, se elige uno; el recurso robado es aleatorio.
- Si no hay objetivos válidos, no se roba.
- La habilidad **Ráfaga** puede bloquear el primer robo contra su portador en la ronda.

El robo no puede hacerse al banco ni a un jugador sin construcciones en ese hexágono.

## 7. Construcciones y piezas

| Construcción | Coste | Límite por jugador |
|---|---|---|
| Carretera | 1 madera + 1 arcilla | 15 |
| Poblado | 1 madera + 1 arcilla + 1 lana + 1 trigo | 5 |
| Ciudad | 2 trigo + 3 mineral | 4 |
| Carta de desarrollo | 1 lana + 1 trigo + 1 mineral | Sin límite propio |

Reglas:

- Una carretera debe conectar con la red propia: un camino, poblado o ciudad propio en uno de sus extremos.
- Un camino ocupado no puede reutilizarse.
- No se puede atravesar un cruce ocupado por un poblado o ciudad rival para prolongar la red.
- Un poblado nuevo debe estar conectado a una carretera propia y respetar la distancia mínima.
- Una ciudad solo puede construirse mejorando un poblado propio.
- Las piezas retiradas de la reserva al colocarlas no vuelven a estar disponibles, salvo que una regla lo indique.
- Los descuentos de habilidades se aplican antes de comprobar el pago y nunca dejan un coste negativo.

## 8. Comercio

Solo se intercambian recursos.

### Comercio con el banco

- Sin puerto: **4:1**.
- Puerto genérico: **3:1**.
- Puerto especializado: **2:1** del recurso indicado.
- Se deben entregar exactamente las unidades del ratio y recibir **1 unidad** de otro recurso distinto.
- El jugador debe poseer lo que entrega y el banco debe tener lo que recibe.
- Los puertos se activan si el jugador tiene un poblado o ciudad en un extremo del camino del puerto.

### Ofertas entre jugadores

- Se puede ofrecer a un jugador concreto o a todos.
- La oferta y la contraoferta deben incluir al menos un recurso de cada lado, con cantidades enteras no negativas.
- El proponente debe poseer lo que ofrece en el momento de aceptar la operación.
- Cada destinatario puede aceptar, rechazar o contraofertar.
- Solo hay una oferta pendiente a la vez. La primera aceptación válida resuelve el intercambio.
- Si todos los destinatarios rechazan, la oferta se cancela.
- Una contraoferta crea una nueva oferta dirigida al proponente original.
- En multijugador local, la interfaz muestra una pantalla de privacidad al destinatario humano antes de revelar su mano.

## 9. Cartas de desarrollo

El mazo contiene **31 cartas**: las 25 clásicas y 6 cartas Pokémon adicionales.

| Carta | Cantidad | Efecto |
|---|---:|---|
| Caballero Pokémon | 14 | Mueve al ladrón, permite robar y suma para el Ejército más grande. |
| Punto de victoria | 5 | Vale 1 PV. No se juega; se revela al puntuar. |
| Construcción de carreteras | 2 | Otorga 2 carreteras gratuitas ese turno. |
| Año de abundancia | 2 | Toma 2 recursos cualesquiera del banco. |
| Monopolio | 2 | Toma todos los recursos de un tipo a los demás jugadores. |
| Poké Ball | 2 | La siguiente captura del turno no paga recursos. |
| Baya Arcoíris | 2 | Toma 1 recurso cualesquiera del banco. |
| Piedra Evolutiva | 2 | La siguiente evolución del turno no paga recursos. |

Restricciones:

- No se puede jugar una carta comprada en el mismo turno.
- Solo se puede jugar **una carta de desarrollo por turno**.
- Las cartas de punto de victoria no se juegan y no se muestran a los rivales.
- El Caballero inicia la fase de mover al ladrón y cuenta para el Ejército más grande.
- Construcción de carreteras requiere al menos un camino legal. Las carreteras gratuitas no usadas se pierden al terminar el turno.
- Año de abundancia exige que el banco tenga las dos unidades solicitadas; se puede pedir el mismo recurso dos veces.
- Monopolio puede jugarse aunque los rivales no tengan ese recurso y produce 0 en ese caso.
- Poké Ball no salta el límite de 1 captura por turno ni el máximo de 3 Pokémon activos.
- Piedra Evolutiva no salta el límite de 1 evolución por turno ni la regla de especies duplicadas.
- Las cartas agotadas no se pueden robar. El mazo se baraja con la semilla de partida.

## 10. Ruta Comercial y Ejército más grande

### Ruta Comercial más larga

- Requiere una red de al menos **5 carreteras conectadas**.
- Se calcula el camino simple más largo de la red propia.
- Las construcciones rivales bloquean los cruces que ocupan: la ruta no puede atravesarlos.
- Vale **2 PV** para su titular.

### Ejército más grande

- Requiere haber jugado al menos **3 caballeros**.
- Vale **2 PV** para su titular.

### Empates y cambios de titular

- Si hay un único líder con la puntuación máxima y supera la longitud o el número del titular actual, toma la distinción.
- Si hay empate y el titular actual está entre los empatados, conserva la distinción.
- Si hay empate y el titular actual no está entre los empatados, la distinción queda vacante.
- La Ruta Comercial también queda vacante si ningún jugador alcanza 5 carreteras.
- Las distinciones se recalcular al construir carreteras, poblados o ciudades y al jugar caballeros.

## 11. Puntuación y victoria

Puntos:

| Concepto | Puntos |
|---|---:|
| Poblado | 1 |
| Ciudad | 2 |
| Ruta Comercial más larga | 2 |
| Ejército más grande | 2 |
| Carta de punto de victoria | 1 |

- La partida termina cuando el jugador activo alcanza **10 PV** al comprobarse una acción.
- Las cartas de PV ocultas cuentan para la victoria, pero no para la puntuación pública de los rivales.
- Las habilidades y cartas Pokémon no conceden PV directos.
- Al terminar, la interfaz muestra el ganador y el resumen de la partida.

## 12. Captura de Pokémon

Cada hexágono tiene un Pokémon salvaje. Para capturarlo:

- Debe existir un **poblado o ciudad propia** en uno de los cruces del hexágono.
- El hexágono debe conservar su Pokémon salvaje.
- El jugador debe pagar el coste de captura de la especie con recursos propios, salvo que use una Poké Ball.
- Solo se permite **1 captura por turno**.
- El jugador puede tener como máximo **3 Pokémon activos**.
- Al capturar, el Pokémon salvaje desaparece del hexágono y pasa al jugador. No se regenera ni se puede comerciar.
- La captura no genera PV directos.

### Costes de captura

| Bioma o especie | Coste |
|---|---|
| Bosque: Bulbasaur, Ivysaur, Venusaur, Caterpie, Metapod, Butterfree | 1 madera + 1 trigo |
| Montaña: Charmander, Charmeleon, Charizard, Machop, Machoke, Machamp, Geodude, Graveler, Golem | 1 mineral + 1 trigo |
| Pasto: Pidgey, Pidgeotto, Pidgeot, Mareep, Flaaffy, Ampharos, Miltank | 1 lana + 1 trigo |
| Campo: Pikachu, Raichu, Oddish, Gloom, Vileplume, Meowth, Persian | 2 trigo |
| Colina: Sandshrew, Sandslash, Diglett, Dugtrio | 1 arcilla + 1 trigo |
| Desierto: Cacnea, Cacturne | 1 arcilla + 1 trigo |

## 13. Catálogo local

El catálogo tiene **35 especies** y se amplía editando `POKEMON_CATALOG` en `src/engine/data.ts`; el motor no contiene listas de especies codificadas en la interfaz.

| Línea evolutiva | Bioma | Etapas | Habilidad |
|---|---|---|---|
| Bulbasaur (1), Ivysaur (2), Venusaur (3) | Bosque | 1 → 2 → 3 | Síntesis |
| Charmander (4), Charmeleon (5), Charizard (6) | Montaña | 1 → 2 → 3 | Llama |
| Caterpie (10), Metapod (11), Butterfree (12) | Bosque | 1 → 2 → 3 | Viento comercial |
| Pidgey (16), Pidgeotto (17), Pidgeot (18) | Pasto, Bosque | 1 → 2 → 3 | Ráfaga |
| Pikachu (25), Raichu (26) | Campo | 1 → 2 | Chispa |
| Sandshrew (27), Sandslash (28) | Colina, Desierto | 1 → 2 | Madriguera |
| Oddish (43), Gloom (44), Vileplume (45) | Campo | 1 → 2 → 3 | Fotosíntesis |
| Diglett (50), Dugtrio (51) | Colina | 1 → 2 | Madriguera |
| Meowth (52), Persian (53) | Campo | 1 → 2 | Viento comercial |
| Machop (66), Machoke (67), Machamp (68) | Montaña | 1 → 2 → 3 | Constructor |
| Geodude (74), Graveler (75), Golem (76) | Montaña | 1 → 2 → 3 | Fortaleza |
| Mareep (179), Flaaffy (180), Ampharos (181) | Pasto | 1 → 2 → 3 | Carga lanuda |
| Miltank (241) | Pasto | 1 | Carga lanuda |
| Cacnea (331), Cacturne (332) | Desierto | 1 → 2 | Ráfaga |

Cada hexágono recibe inicialmente una especie de etapa 1 compatible con su bioma. La asignación usa el azar de la semilla.

## 14. Evolución

- Solo se puede evolucionar una especie que tenga `evolvesTo` en el catálogo.
- La evolución consume **1 evolución por turno**.
- No se puede evolucionar a una especie que el jugador ya tenga activa.
- La evolución paga el coste de la especie actual, salvo que se use una Piedra Evolutiva.
- La evolución conserva la instancia, actualiza la especie y reinicia el uso de habilidad de ese Pokémon.
- No se puede evolucionar indefinidamente: las etapas 3 y las especies sin `evolvesTo` no tienen evolución.
- La evolución no concede PV directos.

| Evolución | Coste |
|---|---|
| Etapa 1 → etapa 2 | 2 trigo + 1 mineral |
| Etapa 2 → etapa 3 | 3 trigo + 2 mineral |

## 15. Habilidades

Cada Pokémon tiene una habilidad fija. Las habilidades se activan automáticamente o mediante la acción de habilidad, según el tipo. Cada Pokémon puede usar su habilidad **una vez por ronda**.

| Habilidad | Efecto | Frecuencia | Activación |
|---|---|---|---|
| Síntesis | Obtén 1 trigo del banco. | 1 por ronda | Manual |
| Llama | Obtén 1 mineral del banco. | 1 por ronda | Manual |
| Carga lanuda | Obtén 1 lana del banco. | 1 por ronda | Manual |
| Chispa | Obtén 1 mineral del banco. | 1 por ronda | Manual |
| Madriguera | La siguiente carretera cuesta 1 arcilla menos, mínimo 0. | 1 por ronda | Automática |
| Constructor | El siguiente poblado cuesta 1 madera menos, mínimo 0. | 1 por ronda | Automática |
| Fortaleza | La siguiente ciudad cuesta 1 mineral menos, mínimo 0. | 1 por ronda | Automática |
| Viento comercial | Permite un intercambio con el banco a 2:1; no se consume si el puerto ya ofrece 2:1. | 1 por ronda | Automática |
| Ráfaga | Bloquea el primer robo del ladrón contra su portador en la ronda. | Pasiva, 1 por ronda | Automática |
| Fotosíntesis | La primera producción de trigo de la ronda con construcciones propias añade 1 trigo extra. | 1 por ronda | Automática |

- Las habilidades de ganancia requieren existencias en el banco.
- Los descuentos se aplican una sola vez y nunca generan recursos ni costes negativos.
- Una habilidad automática consume su uso de ronda cuando se aplica.
- No se pueden acumular usos del mismo Pokémon en la misma ronda.
- Las habilidades no conceden PV ni saltan límites de construcción, captura o evolución.

## 16. Privacidad y flujo local

En multijugador local:

- Antes de actuar, el jugador correspondiente ve una pantalla de privacidad.
- Las manos, cartas ocultas y PV privados no se muestran a otros jugadores.
- La interfaz muestra solo la información pública de los rivales: construcciones, recursos totales, número de cartas, Pokémon visibles, distinciones y puntuación pública.
- El orden de atención es: descarte humano pendiente, receptor humano de una oferta, jugador activo humano.
- La IA no lee manos ni cartas de puntos de victoria de los humanos. Sus decisiones usan información pública y sus propios recursos.

## 17. Aclaraciones y límites

- No hay comercio de Pokémon, monedas, préstamos ni alianzas.
- No hay expansiones, puertos adicionales ni tablero alternativo.
- No se pueden liberar Pokémon para hacer sitio a otros.
- No hay límite de cartas en mano ni descarte por mano al terminar el turno; solo el descarte del 7.
- Las ofertas pendientes se cancelan al terminar el turno.
- La partida se autoguarda después de cada cambio de estado.
- Las reglas de este documento y el motor tienen prioridad sobre cualquier texto abreviado del tutorial.
