import { BUILD_COSTS, PIECE_LIMITS, getSpecies } from './data';
import { edgeById, hexById, vertexById } from './board';
import {
  canCapture,
  canEvolve,
  captureTargets,
  evolvablePokemon,
  availableAbilityPokemon
} from './pokemon';
import {
  GAME_SCHEMA_VERSION,
  bagFromPartial,
  bagTotal,
  buildingOwner,
  canAfford,
  checkVictory,
  cloneState,
  currentPlayer,
  emptyBag,
  fail,
  findPlayer,
  pushLog,
  randomInt,
  randomPick,
  requirePlayer,
  resultOk,
  rollDie,
  tradeRatioFor,
  updateAwards,
  updateTimestamps,
  validSetupSettlementVertices
} from './state';
import type {
  ActionResult,
  DevCard,
  GameAction,
  GameState,
  OwnedPokemon,
  PlayerState,
  Resource,
  ResourceBag
} from './types';
import { RESOURCES } from './types';

void GAME_SCHEMA_VERSION;

function resetTurnFlags(player: PlayerState): void {
  player.flags = {
    devCardPlayedThisTurn: false,
    captureUsedThisTurn: false,
    evolveUsedThisTurn: false,
    freeRoads: 0,
    freeCaptures: 0,
    freeEvolutions: 0,
    discountRoadClay: 0,
    discountSettlementWood: 0,
    discountCityOre: 0,
    tradeWindReady: false,
    stealShield: 0,
    tradeProposedThisTurn: false
  };
}

function payToBank(state: GameState, player: PlayerState, cost: Partial<ResourceBag>): void {
  for (const resource of RESOURCES) {
    const amount = cost[resource] ?? 0;
    if (amount <= 0) continue;
    player.resources[resource] -= amount;
    state.bank[resource] += amount;
  }
}

function takeFromBank(state: GameState, player: PlayerState, amount: Partial<ResourceBag>): void {
  for (const resource of RESOURCES) {
    const count = amount[resource] ?? 0;
    if (count <= 0) continue;
    state.bank[resource] -= count;
    player.resources[resource] += count;
  }
}

function activeActionError(state: GameState, playerId: number): string | null {
  if (state.phase === 'ended') return 'La partida ha terminado';
  if (state.phase === 'setup') return 'La partida está en la fase de colocación inicial';
  if (currentPlayer(state).id !== playerId) return 'No es tu turno';
  if (state.phase !== 'action') return 'No puedes realizar esa acción en esta fase';
  return null;
}

function setupError(state: GameState, playerId: number, awaiting: 'settlement' | 'road'): string | null {
  if (state.phase !== 'setup') return 'La partida no está en colocación inicial';
  if (currentPlayer(state).id !== playerId) return 'No te corresponde colocar ahora';
  if (state.setup.awaiting !== awaiting) return awaiting === 'settlement' ? 'Debes colocar un poblado' : 'Debes colocar una carretera';
  return null;
}

function addSetupResources(state: GameState, player: PlayerState, vertexId: string): void {
  const vertex = vertexById(state.board, vertexId);
  if (!vertex) return;
  for (const hexId of vertex.hexIds) {
    const hex = hexById(state.board, hexId);
    if (!hex || hex.terrain === 'desert') continue;
    if (state.bank[hex.terrain] <= 0) continue;
    state.bank[hex.terrain] -= 1;
    player.resources[hex.terrain] += 1;
  }
}

function advanceSetup(state: GameState): void {
  const n = state.players.length;
  if (state.setup.round === 1) {
    if (state.setup.turnIndex < n - 1) {
      state.setup.turnIndex += 1;
      state.currentPlayerIndex = state.setup.turnIndex;
    } else {
      state.setup.round = 2;
      state.setup.turnIndex = 0;
      state.currentPlayerIndex = n - 1;
    }
    state.setup.awaiting = 'settlement';
    state.setup.lastSettlementVertex = null;
  } else if (state.setup.turnIndex < n - 1) {
    state.setup.turnIndex += 1;
    state.currentPlayerIndex = n - 1 - state.setup.turnIndex;
    state.setup.awaiting = 'settlement';
    state.setup.lastSettlementVertex = null;
  } else {
    state.phase = 'roll';
    state.turn = 1;
    state.round = 1;
    state.currentPlayerIndex = 0;
    state.setup.awaiting = 'settlement';
    state.setup.lastSettlementVertex = null;
    for (const player of state.players) resetTurnFlags(player);
    pushLog(state, 'setup', 'Colocación inicial completada. Comienza la partida.');
  }
}

function beginTurn(state: GameState, nextIndex: number): void {
  state.currentPlayerIndex = nextIndex;
  state.phase = 'roll';
  state.lastDice = null;
  state.pendingTrade = null;
  state.pendingRobber = null;
  state.discardsRequired = {};
  const player = state.players[nextIndex];
  if (player) resetTurnFlags(player);
  pushLog(state, 'turn', `Turno de ${player?.name ?? 'jugador'}.`);
}

function totalOf(player: PlayerState): number {
  return bagTotal(player.resources);
}

function eligibleStealTargets(state: GameState, playerId: number, hexId: string): PlayerState[] {
  const hex = hexById(state.board, hexId);
  if (!hex) return [];
  return state.players.filter((p) => {
    if (p.id === playerId) return false;
    if (totalOf(p) <= 0) return false;
    return [...p.settlements, ...p.cities].some((v) => hex.vertexIds.includes(v));
  });
}

function produce(state: GameState, total: number): void {
  const demand = emptyBag();
  const gains = new Map<number, ResourceBag>();
  const producingHexes = state.board.hexes.filter(
    (hex) => hex.number === total && hex.terrain !== 'desert' && hex.id !== state.robberHexId
  );
  for (const hex of producingHexes) {
    for (const vertexId of hex.vertexIds) {
      const owner = buildingOwner(state, vertexId);
      if (!owner) continue;
      const amount = owner.cities.includes(vertexId) ? 2 : owner.settlements.includes(vertexId) ? 1 : 0;
      if (amount === 0) continue;
      const resource = hex.terrain as Resource;
      demand[resource] += amount;
      const existing = gains.get(owner.id) ?? emptyBag();
      existing[resource] += amount;
      gains.set(owner.id, existing);
    }
  }

  for (const resource of RESOURCES) {
    if (demand[resource] === 0) continue;
    if (state.bank[resource] < demand[resource]) {
      pushLog(state, 'production', `El banco no tiene suficiente ${resource}; nadie produce ${resource} este turno.`);
      for (const bag of gains.values()) bag[resource] = 0;
    }
  }

  for (const [playerId, bag] of gains) {
    const player = findPlayer(state, playerId);
    if (!player) continue;
    const received: string[] = [];
    for (const resource of RESOURCES) {
      if (bag[resource] <= 0 || state.bank[resource] <= 0) continue;
      state.bank[resource] -= bag[resource];
      player.resources[resource] += bag[resource];
      received.push(`${bag[resource]} ${resource}`);
    }
    if (bag.wheat > 0) {
      const ability = availableAbilityPokemon(player, state.round, (s) => s.abilityId === 'photosynthesis');
      if (ability && state.bank.wheat > 0) {
        state.bank.wheat -= 1;
        player.resources.wheat += 1;
        ability.abilityUsedRound = state.round;
        received.push('+1 wheat (Fotosíntesis)');
      }
    }
    if (received.length > 0) {
      pushLog(state, 'production', `${player.name} recibe ${received.join(', ')}.`, player.id);
    }
  }
}

function startRobber(state: GameState, playerId: number, returnPhase: 'action' = 'action'): void {
  state.phase = 'robber';
  state.pendingRobber = { playerId, returnPhase };
}

function setupSettlement(state: GameState, playerId: number, vertexId: string): string | null {
  const error = setupError(state, playerId, 'settlement');
  if (error) return error;
  const player = currentPlayer(state);
  if (!validSetupSettlementVertices(state).includes(vertexId)) return 'Ese cruce no es válido: respeta la distancia mínima y debe estar libre';
  if (player.settlements.length >= PIECE_LIMITS.settlements) return 'No te quedan poblados';
  player.settlements.push(vertexId);
  state.setup.lastSettlementVertex = vertexId;
  state.setup.awaiting = 'road';
  pushLog(state, 'setup', `${player.name} coloca un poblado en ${vertexId}.`, player.id);
  if (state.setup.round === 2) {
    addSetupResources(state, player, vertexId);
    pushLog(state, 'setup', `${player.name} recibe los recursos iniciales de su segundo poblado.`, player.id);
  }
  return null;
}

function setupRoad(state: GameState, playerId: number, edgeId: string): string | null {
  const error = setupError(state, playerId, 'road');
  if (error) return error;
  const player = currentPlayer(state);
  const edge = edgeById(state.board, edgeId);
  if (!edge) return 'Camino desconocido';
  if (!state.setup.lastSettlementVertex || !edge.vertexIds.includes(state.setup.lastSettlementVertex)) {
    return 'La carretera debe estar conectada al poblado recién colocado';
  }
  if (state.players.some((p) => p.roads.includes(edgeId))) return 'Ese camino ya está ocupado';
  if (player.roads.length >= PIECE_LIMITS.roads) return 'No te quedan carreteras';
  player.roads.push(edgeId);
  pushLog(state, 'setup', `${player.name} coloca una carretera.`, player.id);
  advanceSetup(state);
  return null;
}

function rollDiceAction(state: GameState, playerId: number): string | null {
  if (state.phase === 'ended') return 'La partida ha terminado';
  if (state.phase === 'setup') return 'La partida está en colocación inicial';
  if (currentPlayer(state).id !== playerId) return 'No es tu turno';
  if (state.phase !== 'roll') return 'Ya has lanzado los dados';
  const a = rollDie(state);
  const b = rollDie(state);
  const total = a + b;
  state.lastDice = [a, b];
  state.stats.rolls += 1;
  pushLog(state, 'dice', `${currentPlayer(state).name} lanza ${a} + ${b} = ${total}.`, playerId);
  if (total === 7) {
    state.discardsRequired = {};
    for (const player of state.players) {
      const count = totalOf(player);
      if (count > 7) state.discardsRequired[player.id] = Math.floor(count / 2);
    }
    if (Object.keys(state.discardsRequired).length > 0) {
      state.phase = 'discard';
      pushLog(state, 'robber', '¡Siete! Los jugadores con más de 7 recursos deben descartar.');
    } else {
      startRobber(state, playerId);
    }
  } else {
    produce(state, total);
    state.phase = 'action';
  }
  return null;
}

function discardAction(state: GameState, playerId: number, resources: Partial<ResourceBag>): string | null {
  if (state.phase !== 'discard') return 'No hay descartes pendientes';
  const required = state.discardsRequired[playerId];
  if (!required) return 'No tienes que descartar';
  const player = requirePlayer(state, playerId);
  const bag = bagFromPartial(resources);
  if (bagTotal(bag) !== required) return `Debes descartar exactamente ${required} recursos`;
  if (!canAfford(player.resources, bag)) return 'No tienes esos recursos';
  for (const resource of RESOURCES) {
    player.resources[resource] -= bag[resource];
    state.bank[resource] += bag[resource];
  }
  delete state.discardsRequired[playerId];
  pushLog(state, 'discard', `${player.name} descarta ${required} recursos.`, playerId);
  if (Object.keys(state.discardsRequired).length === 0) {
    startRobber(state, currentPlayer(state).id);
  }
  return null;
}

function moveRobberAction(state: GameState, playerId: number, hexId: string, stealFromPlayerId?: number | null): string | null {
  if (state.phase !== 'robber' || !state.pendingRobber) return 'No hay que mover al ladrón';
  if (state.pendingRobber.playerId !== playerId) return 'No eres el jugador que debe mover al ladrón';
  const hex = hexById(state.board, hexId);
  if (!hex) return 'Hexágono desconocido';
  if (hexId === state.robberHexId) return 'El ladrón debe moverse a otro hexágono';
  const previous = state.robberHexId;
  state.robberHexId = hexId;
  pushLog(state, 'robber', `${findPlayer(state, playerId)?.name} mueve al ladrón de ${previous} a ${hexId}.`, playerId);
  const targets = eligibleStealTargets(state, playerId, hexId);
  if (targets.length > 0) {
    if (stealFromPlayerId === undefined || stealFromPlayerId === null) return 'Debes elegir a quién robar';
    const target = targets.find((p) => p.id === stealFromPlayerId);
    if (!target) return 'Ese jugador no tiene construcciones junto al ladrón o no tiene recursos';
    const shield = availableAbilityPokemon(target, state.round, (s) => s.abilityId === 'gust');
    if (shield) {
      shield.abilityUsedRound = state.round;
      pushLog(state, 'robber', `${target.name} bloquea el robo con la habilidad Ráfaga.`, target.id);
    } else {
      const available = RESOURCES.filter((r) => target.resources[r] > 0);
      const resource = randomPick(state, available);
      target.resources[resource] -= 1;
      const thief = requirePlayer(state, playerId);
      thief.resources[resource] += 1;
      pushLog(state, 'robber', `${thief.name} roba 1 ${resource} a ${target.name}.`, playerId);
    }
  } else if (stealFromPlayerId !== undefined && stealFromPlayerId !== null) {
    return 'No hay objetivos válidos a los que robar';
  }
  state.pendingRobber = null;
  state.phase = 'action';
  return null;
}

function roadCost(state: GameState, player: PlayerState): { cost: ResourceBag; ability?: OwnedPokemon } {
  if (player.flags.freeRoads > 0) return { cost: emptyBag() };
  const cost = bagFromPartial(BUILD_COSTS.road);
  const ability = availableAbilityPokemon(player, state.round, (s) => s.abilityId === 'burrow');
  if (ability && cost.clay > 0) {
    cost.clay -= 1;
    return { cost, ability };
  }
  return { cost };
}

function settlementCost(state: GameState, player: PlayerState): { cost: ResourceBag; ability?: OwnedPokemon } {
  const cost = bagFromPartial(BUILD_COSTS.settlement);
  const ability = availableAbilityPokemon(player, state.round, (s) => s.abilityId === 'builder');
  if (ability && cost.wood > 0) {
    cost.wood -= 1;
    return { cost, ability };
  }
  return { cost };
}

function cityCost(state: GameState, player: PlayerState): { cost: ResourceBag; ability?: OwnedPokemon } {
  const cost = bagFromPartial(BUILD_COSTS.city);
  const ability = availableAbilityPokemon(player, state.round, (s) => s.abilityId === 'fortify');
  if (ability && cost.ore > 1) {
    cost.ore -= 1;
    return { cost, ability };
  }
  return { cost };
}

function buildRoadAction(state: GameState, playerId: number, edgeId: string): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  if (player.roads.length >= PIECE_LIMITS.roads) return 'No te quedan carreteras';
  const edge = edgeById(state.board, edgeId);
  if (!edge) return 'Camino desconocido';
  if (state.players.some((p) => p.roads.includes(edgeId))) return 'Ese camino ya está ocupado';
  for (const v of edge.vertexIds) {
    const owner = buildingOwner(state, v);
    if (owner && owner.id !== playerId) return 'No puedes construir a través de una construcción rival';
  }
  const connected = edge.vertexIds.some(
    (v) => player.roads.some((roadId) => edgeById(state.board, roadId)?.vertexIds.includes(v)) ||
      player.settlements.includes(v) ||
      player.cities.includes(v)
  );
  if (!connected) return 'La carretera debe conectar con tu red';
  const { cost, ability } = roadCost(state, player);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';
  const isFree = player.flags.freeRoads > 0;
  payToBank(state, player, cost);
  if (isFree) player.flags.freeRoads -= 1;
  if (ability) ability.abilityUsedRound = state.round;
  player.roads.push(edgeId);
  pushLog(state, 'build', `${player.name} construye una carretera${isFree ? ' gratuita' : ''}.`, playerId);
  updateAwards(state);
  return null;
}

function buildSettlementAction(state: GameState, playerId: number, vertexId: string): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  if (player.settlements.length >= PIECE_LIMITS.settlements) return 'No te quedan poblados';
  const vertex = vertexById(state.board, vertexId);
  if (!vertex) return 'Cruce desconocido';
  if (buildingOwner(state, vertexId)) return 'Ese cruce ya está ocupado';
  const adjacentOccupied = vertex.edgeIds.some((edgeId) => {
    const edge = edgeById(state.board, edgeId);
    if (!edge) return false;
    const other = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    return Boolean(buildingOwner(state, other));
  });
  if (adjacentOccupied) return 'Debe respetarse la distancia mínima entre poblados';
  const connected = vertex.edgeIds.some((edgeId) => player.roads.includes(edgeId));
  if (!connected) return 'El poblado debe conectarse a tu red de carreteras';
  const { cost, ability } = settlementCost(state, player);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';
  payToBank(state, player, cost);
  if (ability) ability.abilityUsedRound = state.round;
  player.settlements.push(vertexId);
  pushLog(state, 'build', `${player.name} construye un poblado.`, playerId);
  updateAwards(state);
  return null;
}

function buildCityAction(state: GameState, playerId: number, vertexId: string): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  if (!player.settlements.includes(vertexId)) return 'Solo puedes mejorar un poblado propio';
  if (player.cities.length >= PIECE_LIMITS.cities) return 'No te quedan ciudades';
  const { cost, ability } = cityCost(state, player);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';
  payToBank(state, player, cost);
  if (ability) ability.abilityUsedRound = state.round;
  player.settlements = player.settlements.filter((v) => v !== vertexId);
  player.cities.push(vertexId);
  pushLog(state, 'build', `${player.name} mejora un poblado a ciudad.`, playerId);
  updateAwards(state);
  return null;
}

function buyDevCardAction(state: GameState, playerId: number): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  if (state.devDeck.length === 0) return 'No quedan cartas de desarrollo';
  const cost = bagFromPartial(BUILD_COSTS.dev);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';
  payToBank(state, player, cost);
  const type = state.devDeck.pop();
  if (!type) return 'No quedan cartas de desarrollo';
  const card: DevCard = {
    id: `c${state.stats.cardSeq++}`, 
    type,
    boughtOnTurn: state.turn,
    played: false
  };
  player.devCards.push(card);
  pushLog(state, 'dev', `${player.name} compra una carta de desarrollo.`, playerId);
  return null;
}

function removePlayedCard(player: PlayerState, card: DevCard): void {
  player.devCards = player.devCards.filter((c) => c.id !== card.id);
}

function playDevCardAction(
  state: GameState,
  playerId: number,
  cardId: string,
  params?: { resources?: Resource[]; resource?: Resource }
): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  const card = player.devCards.find((c) => c.id === cardId);
  if (!card) return 'No tienes esa carta';
  if (card.played) return 'Esa carta ya se ha jugado';
  if (card.type === 'victory') return 'Las cartas de punto de victoria no se juegan';
  if (card.boughtOnTurn === state.turn) return 'No puedes jugar una carta comprada este mismo turno';
  if (player.flags.devCardPlayedThisTurn) return 'Solo puedes jugar una carta de desarrollo por turno';

  if (card.type === 'knight') {
    card.played = true;
    removePlayedCard(player, card);
    player.knightsPlayed += 1;
    player.flags.devCardPlayedThisTurn = true;
    state.stats.devCardsPlayed += 1;
    pushLog(state, 'dev', `${player.name} juega un Caballero Pokémon (${player.knightsPlayed} en total).`, playerId);
    updateAwards(state);
    if (checkVictory(state)) return null;
    startRobber(state, playerId);
    return null;
  }

  if (card.type === 'roadBuilding') {
    const hasSpot = state.board.edges.some((edge) => {
      if (state.players.some((p) => p.roads.includes(edge.id))) return false;
      return edge.vertexIds.some(
        (v) => player.roads.some((rid) => edgeById(state.board, rid)?.vertexIds.includes(v)) ||
          player.settlements.includes(v) || player.cities.includes(v)
      );
    });
    if (!hasSpot) return 'No hay ningún camino legal para la carta';
    player.flags.freeRoads += 2;
    player.flags.devCardPlayedThisTurn = true;
    state.stats.devCardsPlayed += 1;
    card.played = true;
    removePlayedCard(player, card);
    pushLog(state, 'dev', `${player.name} juega Construcción de carreteras: 2 carreteras gratuitas.`, playerId);
    return null;
  }

  if (card.type === 'yearOfPlenty') {
    const resources = params?.resources ?? [];
    if (resources.length !== 2 || resources.some((r) => !RESOURCES.includes(r))) {
      return 'Debes elegir exactamente 2 recursos';
    }
    const needed = emptyBag();
    for (const resource of resources) needed[resource] += 1;
    if (!canAfford(state.bank, needed)) return 'El banco no tiene esos recursos';
    takeFromBank(state, player, needed);
    player.flags.devCardPlayedThisTurn = true;
    state.stats.devCardsPlayed += 1;
    card.played = true;
    removePlayedCard(player, card);
    pushLog(state, 'dev', `${player.name} juega Año de abundancia y toma ${resources.join(' + ')}.`, playerId);
    return null;
  }

  if (card.type === 'monopoly') {
    const resource = params?.resource;
    if (!resource || !RESOURCES.includes(resource)) return 'Debes elegir un recurso';
    let total = 0;
    for (const other of state.players) {
      if (other.id === playerId) continue;
      const amount = other.resources[resource];
      if (amount > 0) {
        other.resources[resource] = 0;
        player.resources[resource] += amount;
        total += amount;
      }
    }
    player.flags.devCardPlayedThisTurn = true;
    state.stats.devCardsPlayed += 1;
    card.played = true;
    removePlayedCard(player, card);
    pushLog(state, 'dev', `${player.name} juega Monopolio de ${resource}: obtiene ${total}.`, playerId);
    return null;
  }

  if (card.type === 'berry') {
    const resource = params?.resource;
    if (!resource || !RESOURCES.includes(resource)) return 'Debes elegir un recurso';
    if (state.bank[resource] <= 0) return 'El banco no tiene ese recurso';
    takeFromBank(state, player, { [resource]: 1 } as Partial<ResourceBag>);
    player.flags.devCardPlayedThisTurn = true;
    state.stats.devCardsPlayed += 1;
    card.played = true;
    removePlayedCard(player, card);
    pushLog(state, 'dev', `${player.name} juega Baya Arcoíris y toma 1 ${resource}.`, playerId);
    return null;
  }

  if (card.type === 'pokeBall') {
    if (player.flags.captureUsedThisTurn) return 'Ya has capturado un Pokémon este turno';
    if (player.pokemon.length >= 3) return 'Límite de Pokémon activos alcanzado';
    if (captureTargets(state, playerId).length === 0) return 'No hay Pokémon salvajes junto a tus construcciones';
    player.flags.freeCaptures += 1;
    player.flags.devCardPlayedThisTurn = true;
    state.stats.devCardsPlayed += 1;
    card.played = true;
    removePlayedCard(player, card);
    pushLog(state, 'dev', `${player.name} juega Poké Ball: su próxima captura es gratuita.`, playerId);
    return null;
  }

  if (card.type === 'evolutionStone') {
    if (player.flags.evolveUsedThisTurn) return 'Ya has evolucionado un Pokémon este turno';
    const hasValidEvolution = evolvablePokemon(player).some((candidate) => {
      const target = getSpecies(candidate.speciesId).evolvesTo;
      return target !== null && !player.pokemon.some((other) => other.instanceId !== candidate.instanceId && other.speciesId === target);
    });
    if (!hasValidEvolution) return 'No tienes una evolución válida disponible';
    player.flags.freeEvolutions += 1;
    player.flags.devCardPlayedThisTurn = true;
    state.stats.devCardsPlayed += 1;
    card.played = true;
    removePlayedCard(player, card);
    pushLog(state, 'dev', `${player.name} juega Piedra Evolutiva: su próxima evolución es gratuita.`, playerId);
    return null;
  }

  return 'Tipo de carta no soportado';
}

function bankTradeAction(state: GameState, playerId: number, give: Resource, receive: Resource): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  if (!RESOURCES.includes(give) || !RESOURCES.includes(receive)) return 'Recurso inválido';
  if (give === receive) return 'Debes intercambiar recursos distintos';
  const { ratio, viaAbility } = tradeRatioFor(state, playerId, give);
  if (player.resources[give] < ratio) return `Necesitas ${ratio} ${give} para ese intercambio`;
  if (state.bank[receive] <= 0) return 'El banco no tiene ese recurso';
  if (viaAbility) {
    const pokemon = availableAbilityPokemon(player, state.round, (s) => s.abilityId === 'tradeWind');
    if (pokemon) pokemon.abilityUsedRound = state.round;
  }
  player.resources[give] -= ratio;
  state.bank[give] += ratio;
  state.bank[receive] -= 1;
  player.resources[receive] += 1;
  pushLog(state, 'trade', `${player.name} intercambia ${ratio} ${give} por 1 ${receive} con el banco.`, playerId);
  return null;
}

function validTradeBag(bag: Partial<ResourceBag>): boolean {
  return RESOURCES.every((r) => {
    const value = bag[r] ?? 0;
    return Number.isInteger(value) && value >= 0;
  }) && bagTotal(bagFromPartial(bag)) > 0;
}

function proposeTradeAction(
  state: GameState,
  playerId: number,
  toPlayerId: number | 'all',
  give: Partial<ResourceBag>,
  receive: Partial<ResourceBag>
): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  if (state.pendingTrade) return 'Ya hay una oferta de intercambio pendiente';
  if (!validTradeBag(give) || !validTradeBag(receive)) return 'La oferta debe incluir al menos un recurso de cada lado';
  if (!canAfford(player.resources, give)) return 'No tienes los recursos que ofreces';
  if (toPlayerId !== 'all') {
    if (toPlayerId === playerId || !findPlayer(state, toPlayerId)) return 'Destinatario inválido';
  }
  player.flags.tradeProposedThisTurn = true;
  state.pendingTrade = {
    id: `t${state.stats.tradeSeq++}`, 
    fromPlayerId: playerId,
    toPlayerId,
    give: bagFromPartial(give),
    receive: bagFromPartial(receive),
    rejectedBy: []
  };
  pushLog(state, 'trade', `${player.name} propone un intercambio a ${toPlayerId === 'all' ? 'todos' : findPlayer(state, toPlayerId)?.name}.`, playerId);
  return null;
}

function tradeRecipientIds(state: GameState): number[] {
  const trade = state.pendingTrade;
  if (!trade) return [];
  if (trade.toPlayerId === 'all') {
    return state.players.filter((p) => p.id !== trade.fromPlayerId).map((p) => p.id);
  }
  return [trade.toPlayerId];
}

function tradeResponseError(state: GameState, playerId: number): string | null {
  if (state.phase === 'ended') return 'La partida ha terminado';
  if (state.phase !== 'action') return 'No se pueden responder ofertas en esta fase';
  const trade = state.pendingTrade;
  if (!trade) return 'No hay ninguna oferta pendiente';
  if (!tradeRecipientIds(state).includes(playerId)) return 'No eres el destinatario de esa oferta';
  return null;
}

function acceptTradeAction(state: GameState, playerId: number): string | null {
  const error = tradeResponseError(state, playerId);
  if (error) return error;
  const trade = state.pendingTrade;
  if (!trade) return 'No hay ninguna oferta pendiente';
  if (!tradeRecipientIds(state).includes(playerId)) return 'No eres el destinatario de esa oferta';
  if (trade.rejectedBy.includes(playerId)) return 'Ya has rechazado esa oferta';
  const proposer = requirePlayer(state, trade.fromPlayerId);
  const acceptor = requirePlayer(state, playerId);
  if (!canAfford(proposer.resources, trade.give)) return 'El proponente ya no tiene los recursos ofrecidos';
  if (!canAfford(acceptor.resources, trade.receive)) return 'No tienes los recursos solicitados';
  for (const resource of RESOURCES) {
    const give = trade.give[resource];
    const receive = trade.receive[resource];
    if (give > 0) {
      proposer.resources[resource] -= give;
      acceptor.resources[resource] += give;
    }
    if (receive > 0) {
      acceptor.resources[resource] -= receive;
      proposer.resources[resource] += receive;
    }
  }
  state.pendingTrade = null;
  pushLog(state, 'trade', `${acceptor.name} acepta el intercambio de ${proposer.name}.`, playerId);
  return null;
}

function rejectTradeAction(state: GameState, playerId: number): string | null {
  const trade = state.pendingTrade;
  if (!trade) return 'No hay ninguna oferta pendiente';
  if (!tradeRecipientIds(state).includes(playerId)) return 'No eres el destinatario de esa oferta';
  if (!trade.rejectedBy.includes(playerId)) trade.rejectedBy.push(playerId);
  const allRejected = tradeRecipientIds(state).every((id) => trade.rejectedBy.includes(id));
  pushLog(state, 'trade', `${findPlayer(state, playerId)?.name} rechaza la oferta.`, playerId);
  if (allRejected) {
    state.pendingTrade = null;
    pushLog(state, 'trade', 'La oferta ha sido rechazada por todos los destinatarios.');
  }
  return null;
}

function counterTradeAction(
  state: GameState,
  playerId: number,
  give: Partial<ResourceBag>,
  receive: Partial<ResourceBag>
): string | null {
  const error = tradeResponseError(state, playerId);
  if (error) return error;
  const trade = state.pendingTrade;
  if (!trade) return 'No hay ninguna oferta que contraofertar';
  const player = requirePlayer(state, playerId);
  if (!validTradeBag(give) || !validTradeBag(receive)) return 'La contraoferta debe incluir al menos un recurso de cada lado';
  if (!canAfford(player.resources, give)) return 'No tienes los recursos que ofreces';
  state.pendingTrade = {
    id: `t${state.stats.tradeSeq++}-c`, 
    fromPlayerId: playerId,
    toPlayerId: trade.fromPlayerId,
    give: bagFromPartial(give),
    receive: bagFromPartial(receive),
    rejectedBy: []
  };
  pushLog(state, 'trade', `${player.name} lanza una contraoferta a ${findPlayer(state, trade.fromPlayerId)?.name}.`, playerId);
  return null;
}

function capturePokemonAction(state: GameState, playerId: number, hexId: string): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const captureError = canCapture(state, playerId, hexId);
  if (captureError) return captureError;
  const player = requirePlayer(state, playerId);
  const hex = hexById(state.board, hexId);
  if (!hex || !hex.wildPokemonId) return 'No hay Pokémon salvaje';
  const species = getSpecies(hex.wildPokemonId);
  if (player.flags.freeCaptures > 0) {
    player.flags.freeCaptures -= 1;
  } else {
    if (!canAfford(player.resources, species.captureCost)) return 'No tienes recursos suficientes';
    payToBank(state, player, species.captureCost);
  }
  const instance: OwnedPokemon = {
    instanceId: `pk-${playerId}-${state.turn}-${player.pokemon.length}-${hexId}`,
    speciesId: species.id,
    capturedOnTurn: state.turn,
    abilityUsedRound: 0
  };
  player.pokemon.push(instance);
  hex.wildPokemonId = null;
  player.flags.captureUsedThisTurn = true;
  state.stats.captures += 1;
  pushLog(state, 'pokemon', `${player.name} captura un ${species.name} en ${hexId}.`, playerId);
  return null;
}

function evolvePokemonAction(state: GameState, playerId: number, instanceId: string): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const evolveError = canEvolve(state, playerId, instanceId);
  if (evolveError) return evolveError;
  const player = requirePlayer(state, playerId);
  const pokemon = player.pokemon.find((p) => p.instanceId === instanceId);
  if (!pokemon) return 'Ese Pokémon no te pertenece';
  const species = getSpecies(pokemon.speciesId);
  if (!species.evolvesTo) return 'No tiene evolución';
  const target = getSpecies(species.evolvesTo);
  if (player.flags.freeEvolutions > 0) {
    player.flags.freeEvolutions -= 1;
  } else if (species.evolutionCost) {
    if (!canAfford(player.resources, species.evolutionCost)) return 'No tienes recursos suficientes';
    payToBank(state, player, species.evolutionCost);
  }
  pokemon.speciesId = target.id;
  pokemon.abilityUsedRound = 0;
  player.flags.evolveUsedThisTurn = true;
  state.stats.evolutions += 1;
  pushLog(state, 'pokemon', `${player.name}: ${species.name} evoluciona a ${target.name}.`, playerId);
  return null;
}

function useAbilityAction(state: GameState, playerId: number, instanceId: string): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = requirePlayer(state, playerId);
  const pokemon = player.pokemon.find((p) => p.instanceId === instanceId);
  if (!pokemon) return 'Ese Pokémon no te pertenece';
  if (pokemon.abilityUsedRound === state.round) return 'Esa habilidad ya se usó en esta ronda';
  const species = getSpecies(pokemon.speciesId);
  const ability = species.abilityId;
  if (ability === 'harvest' || ability === 'blaze' || ability === 'charge' || ability === 'spark') {
    const resource: Resource = ability === 'harvest' ? 'wheat' : ability === 'charge' ? 'wool' : 'ore';
    if (state.bank[resource] <= 0) return 'El banco no tiene ese recurso';
    state.bank[resource] -= 1;
    player.resources[resource] += 1;
    pokemon.abilityUsedRound = state.round;
    pushLog(state, 'pokemon', `${player.name} usa ${species.name} y obtiene 1 ${resource}.`, playerId);
    return null;
  }
  if (ability === 'tradeWind') return 'La habilidad Viento comercial se aplica automáticamente al comerciar con el banco';
  if (ability === 'burrow') return 'La habilidad Madriguera se aplica automáticamente al construir una carretera';
  if (ability === 'builder') return 'La habilidad Constructor se aplica automáticamente al construir un poblado';
  if (ability === 'fortify') return 'La habilidad Fortaleza se aplica automáticamente al mejorar una ciudad';
  if (ability === 'gust') return 'La habilidad Ráfaga se activa automáticamente al intentar robar';
  if (ability === 'photosynthesis') return 'La habilidad Fotosíntesis se activa automáticamente al producir trigo';
  return 'Habilidad no soportada';
}

function endTurnAction(state: GameState, playerId: number): string | null {
  const error = activeActionError(state, playerId);
  if (error) return error;
  const player = currentPlayer(state);
  state.stats.turnsPlayed += 1;
  state.pendingTrade = null;
  pushLog(state, 'turn', `${player.name} finaliza su turno.`, playerId);
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turn += 1;
  if (nextIndex === 0) state.round += 1;
  beginTurn(state, nextIndex);
  return null;
}

function execute(state: GameState, action: GameAction): string | null {
  switch (action.type) {
    case 'setupSettlement':
      return setupSettlement(state, action.playerId, action.vertexId);
    case 'setupRoad':
      return setupRoad(state, action.playerId, action.edgeId);
    case 'rollDice':
      return rollDiceAction(state, action.playerId);
    case 'discard':
      return discardAction(state, action.playerId, action.resources);
    case 'moveRobber':
      return moveRobberAction(state, action.playerId, action.hexId, action.stealFromPlayerId);
    case 'buildRoad':
      return buildRoadAction(state, action.playerId, action.edgeId);
    case 'buildSettlement':
      return buildSettlementAction(state, action.playerId, action.vertexId);
    case 'buildCity':
      return buildCityAction(state, action.playerId, action.vertexId);
    case 'buyDevCard':
      return buyDevCardAction(state, action.playerId);
    case 'playDevCard':
      return playDevCardAction(state, action.playerId, action.cardId, action.params);
    case 'bankTrade':
      return bankTradeAction(state, action.playerId, action.give, action.receive);
    case 'proposeTrade':
      return proposeTradeAction(state, action.playerId, action.toPlayerId, action.give, action.receive);
    case 'acceptTrade':
      return acceptTradeAction(state, action.playerId);
    case 'rejectTrade':
      return rejectTradeAction(state, action.playerId);
    case 'counterTrade':
      return counterTradeAction(state, action.playerId, action.give, action.receive);
    case 'capturePokemon':
      return capturePokemonAction(state, action.playerId, action.hexId);
    case 'evolvePokemon':
      return evolvePokemonAction(state, action.playerId, action.instanceId);
    case 'useAbility':
      return useAbilityAction(state, action.playerId, action.instanceId);
    case 'endTurn':
      return endTurnAction(state, action.playerId);
    default:
      return 'Acción desconocida';
  }
}

export function applyAction(previous: GameState, action: GameAction): ActionResult {
  if (previous.phase === 'ended') return fail('La partida ha terminado');
  const state = cloneState(previous);
  const logStart = state.eventLog.length;
  const error = execute(state, action);
  if (error) return fail(error);
  if (state.phase !== 'setup') checkVictory(state);
  updateTimestamps(state);
  return resultOk(state, state.eventLog.slice(logStart));
}

export function isActionLegal(state: GameState, action: GameAction): boolean {
  return applyAction(state, action).ok;
}

