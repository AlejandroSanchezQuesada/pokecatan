import { ACTIVE_POKEMON_LIMIT, POKEMON_CATALOG, POKEMON_CATALOG as _catalog, PLAYER_COLORS, STARTING_BANK, buildDevDeck, getSpecies } from './data';
import { generateBoard, vertexById } from './board';
import { createRngFromState, hashSeed, makeRng, type Rng } from './rng';
import type {
  ActionResult,
  Board,
  DevCardType,
  GameEvent,
  GameState,
  NewGameOptions,
  PlayerState,
  Resource,
  ResourceBag,
  Vertex
} from './types';
import { RESOURCES } from './types';

void _catalog;

export const GAME_SCHEMA_VERSION = 1;

export function emptyBag(): ResourceBag {
  return { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
}

export function bagFromPartial(partial: Partial<ResourceBag>): ResourceBag {
  const bag = emptyBag();
  for (const resource of RESOURCES) bag[resource] = Math.max(0, Math.floor(partial[resource] ?? 0));
  return bag;
}

export function bagTotal(bag: ResourceBag): number {
  return RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);
}

export function addBag(a: ResourceBag, b: Partial<ResourceBag>): ResourceBag {
  const result = { ...a };
  for (const resource of RESOURCES) result[resource] += b[resource] ?? 0;
  return result;
}

export function budgetBag(a: ResourceBag, b: Partial<ResourceBag>): ResourceBag {
  const result = { ...a };
  for (const resource of RESOURCES) result[resource] = Math.max(0, result[resource] - (b[resource] ?? 0));
  return result;
}

export function canAfford(bag: ResourceBag, cost: Partial<ResourceBag>): boolean {
  return RESOURCES.every((resource) => bag[resource] >= (cost[resource] ?? 0));
}

export function findPlayer(state: GameState, playerId: number): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function requirePlayer(state: GameState, playerId: number): PlayerState {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error(`Jugador desconocido: ${playerId}`);
  return player;
}

export function currentPlayer(state: GameState): PlayerState {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error('Índice de jugador activo inválido');
  return player;
}

export function nextLogId(state: GameState): number {
  const last = state.eventLog[state.eventLog.length - 1];
  return (last?.id ?? 0) + 1;
}

export function pushLog(state: GameState, type: string, message: string, playerId?: number): GameEvent {
  const event: GameEvent = { id: nextLogId(state), turn: state.turn, type, message };
  if (playerId !== undefined) event.playerId = playerId;
  state.eventLog.push(event);
  if (state.eventLog.length > 250) state.eventLog.splice(0, state.eventLog.length - 250);
  return event;
}

export function rollDie(state: GameState): number {
  const rng = createRngFromState(state.rngState);
  const value = rng.int(6) + 1;
  state.rngState = rng.state();
  return value;
}

export function randomInt(state: GameState, maxExclusive: number): number {
  const rng = createRngFromState(state.rngState);
  const value = rng.int(maxExclusive);
  state.rngState = rng.state();
  return value;
}

export function randomPick<T>(state: GameState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('No se puede elegir de una lista vacía');
  return items[randomInt(state, items.length)] as T;
}

export function rngFor(state: GameState): Rng {
  return createRngFromState(state.rngState);
}

export function persistRng(state: GameState, rng: Rng): void {
  state.rngState = rng.state();
}

export function makeDefaultSeed(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let seed = '';
  for (let i = 0; i < 8; i++) seed += alphabet[Math.floor(Math.random() * alphabet.length)];
  return seed;
}

export function normalizeSeed(seed: string): string {
  const clean = seed.trim().toUpperCase().replace(/[^A-Z0-9-_]/g, '').slice(0, 32);
  return clean.length > 0 ? clean : makeDefaultSeed();
}

export function createGame(options: NewGameOptions): GameState {
  const seed = normalizeSeed(options.seed ?? makeDefaultSeed());
  const board = generateBoard(seed);
  const humanPlayers = Math.max(1, Math.min(4, Math.floor(options.humanPlayers)));
  const totalPlayers = 4;
  const rng = makeRng(`${seed}:game`);
  const deck = rng.shuffle(buildDevDeck());
  const players: PlayerState[] = [];
  for (let i = 0; i < totalPlayers; i++) {
    const isAI = options.mode === 'solo' ? i > 0 : i >= humanPlayers;
    players.push({
      id: i,
      name: i === 0 && options.playerName ? options.playerName.slice(0, 20) : isAI ? `Rival ${i}` : `Jugador ${i + 1}`,
      color: PLAYER_COLORS[i] ?? '#888888',
      isAI,
      difficulty: options.difficulty,
      resources: emptyBag(),
      devCards: [],
      knightsPlayed: 0,
      roads: [],
      settlements: [],
      cities: [],
      pokemon: [],
      flags: {
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
      }
    });
  }

  const state: GameState = {
    schemaVersion: GAME_SCHEMA_VERSION,
    gameId: `game-${Date.now().toString(36)}-${seed.toLowerCase()}`,
    gameName: options.gameName?.trim().slice(0, 40) || `Partida ${seed}`,
    seed,
    rngState: rng.state(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: options.mode,
    difficulty: options.difficulty,
    turn: 0,
    round: 1,
    currentPlayerIndex: 0,
    phase: 'setup',
    setup: { round: 1, turnIndex: 0, awaiting: 'settlement', lastSettlementVertex: null },
    board,
    robberHexId: board.hexes.find((h) => h.terrain === 'desert')?.id ?? board.hexes[0]?.id ?? '',
    bank: { wood: STARTING_BANK, clay: STARTING_BANK, wool: STARTING_BANK, wheat: STARTING_BANK, ore: STARTING_BANK },
    players,
    devDeck: deck,
    discardsRequired: {},
    eventLog: [],
    awards: { longestRoad: null, largestArmy: null },
    winnerId: null,
    lastDice: null,
    pendingTrade: null,
    pendingRobber: null,
    stats: { rolls: 0, turnsPlayed: 0, captures: 0, evolutions: 0, devCardsPlayed: 0, cardSeq: 0, tradeSeq: 0 }
  };

  state.eventLog = [];
  pushLog(state, 'system', `Partida creada con semilla ${seed}. Tablero de 19 hexágonos.`);
  return state;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function playerHasVertexBuilding(state: GameState, vertexId: string): PlayerState | undefined {
  return state.players.find((p) => p.settlements.includes(vertexId) || p.cities.includes(vertexId));
}

export function buildingOwner(state: GameState, vertexId: string): PlayerState | undefined {
  return playerHasVertexBuilding(state, vertexId);
}

export function hasAdjacentOwnBuilding(state: GameState, playerId: number, vertexId: string): boolean {
  const vertex = vertexById(state.board, vertexId);
  if (!vertex) return false;
  return vertex.edgeIds.some((edgeId) => {
    const edge = state.board.edges.find((e) => e.id === edgeId);
    if (!edge) return false;
    const other = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    const owner = buildingOwner(state, other);
    return owner?.id === playerId;
  });
}

export function roadsOfPlayerAtVertex(state: GameState, playerId: number, vertexId: string): boolean {
  const player = findPlayer(state, playerId);
  if (!player) return false;
  return player.roads.some((edgeId) => {
    const edge = state.board.edges.find((e) => e.id === edgeId);
    return edge?.vertexIds.includes(vertexId) ?? false;
  });
}

export function connectedToOwnRoad(state: GameState, playerId: number, vertexId: string): boolean {
  if (roadsOfPlayerAtVertex(state, playerId, vertexId)) return true;
  const owner = buildingOwner(state, vertexId);
  if (owner?.id === playerId) return true;
  return false;
}

export function scorePlayer(state: GameState, playerId: number, includeHidden: boolean): number {
  const player = findPlayer(state, playerId);
  if (!player) return 0;
  let score = player.settlements.length + player.cities.length * 2;
  if (state.awards.longestRoad === playerId) score += 2;
  if (state.awards.largestArmy === playerId) score += 2;
  if (includeHidden) score += player.devCards.filter((c) => c.type === 'victory' && !c.played).length;
  return score;
}

export function publicScore(state: GameState, playerId: number): number {
  return scorePlayer(state, playerId, false);
}

export function visibleScore(state: GameState, viewerId: number, playerId: number): number {
  return scorePlayer(state, playerId, playerId === viewerId || state.phase === 'ended');
}

export function updateAwards(state: GameState): void {
  const roadLengths = state.players.map((p) => ({ id: p.id, length: longestRoadLength(state, p.id) }));
  const maxRoad = Math.max(...roadLengths.map((r) => r.length));
  const roadLeaders = roadLengths.filter((r) => r.length === maxRoad && maxRoad >= 5);
  const currentRoad = state.awards.longestRoad;
  const currentRoadLength = currentRoad === null ? 0 : roadLengths.find((r) => r.id === currentRoad)?.length ?? 0;
  if (roadLeaders.length === 1) {
    const leader = roadLeaders[0];
    if (leader && (currentRoad === null || maxRoad > currentRoadLength)) {
      if (state.awards.longestRoad !== leader.id) {
        state.awards.longestRoad = leader.id;
        pushLog(state, 'award', `${findPlayer(state, leader.id)?.name} obtiene la Ruta Comercial más larga (${leader.length}).`, leader.id);
      }
    }
  } else if (roadLeaders.length > 1 && currentRoad !== null && !roadLeaders.some((r) => r.id === currentRoad)) {
    state.awards.longestRoad = null;
    pushLog(state, 'award', 'La Ruta Comercial más larga queda empatada y sin titular.');
  } else if (roadLeaders.length === 0 && currentRoad !== null) {
    state.awards.longestRoad = null;
  }

  const knightCounts = state.players.map((p) => ({ id: p.id, knights: p.knightsPlayed }));
  const maxKnights = Math.max(...knightCounts.map((k) => k.knights));
  const armyLeaders = knightCounts.filter((k) => k.knights === maxKnights && maxKnights >= 3);
  const currentArmy = state.awards.largestArmy;
  const currentArmyKnights = currentArmy === null ? 0 : knightCounts.find((k) => k.id === currentArmy)?.knights ?? 0;
  if (armyLeaders.length === 1) {
    const leader = armyLeaders[0];
    if (leader && (currentArmy === null || maxKnights > currentArmyKnights)) {
      if (state.awards.largestArmy !== leader.id) {
        state.awards.largestArmy = leader.id;
        pushLog(state, 'award', `${findPlayer(state, leader.id)?.name} obtiene el Ejército más grande (${leader.knights} caballeros).`, leader.id);
      }
    }
  } else if (armyLeaders.length > 1 && currentArmy !== null && !armyLeaders.some((k) => k.id === currentArmy)) {
    state.awards.largestArmy = null;
  }
}

export function longestRoadLength(state: GameState, playerId: number): number {
  const player = findPlayer(state, playerId);
  if (!player) return 0;
  const blocked = new Set<string>();
  for (const vertex of state.board.vertices) {
    const owner = buildingOwner(state, vertex.id);
    if (owner && owner.id !== playerId) blocked.add(vertex.id);
  }
  const adjacency = new Map<string, string[]>();
  for (const edgeId of player.roads) {
    const edge = state.board.edges.find((e) => e.id === edgeId);
    if (!edge) continue;
    const [a, b] = edge.vertexIds;
    if (blocked.has(a) || blocked.has(b)) continue;
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }
  let best = 0;
  const vertices = [...adjacency.keys()];
  for (const start of vertices) {
    const visited = new Set<string>([start]);
    const walk = (current: string, used: number): void => {
      best = Math.max(best, used);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        walk(next, used + 1);
        visited.delete(next);
      }
    };
    walk(start, 0);
  }
  return best;
}

export function checkVictory(state: GameState): boolean {
  if (state.phase === 'ended' || state.phase === 'setup') return false;
  const player = currentPlayer(state);
  if (scorePlayer(state, player.id, true) >= 10) {
    state.phase = 'ended';
    state.winnerId = player.id;
    pushLog(state, 'victory', `${player.name} alcanza 10 puntos de victoria y gana la partida.`, player.id);
    return true;
  }
  return false;
}

export function updateTimestamps(state: GameState): void {
  state.updatedAt = new Date().toISOString();
}

export function availablePortRatios(state: GameState, playerId: number): Map<Resource, number> {
  const player = findPlayer(state, playerId);
  const ratios = new Map<Resource, number>();
  for (const resource of RESOURCES) ratios.set(resource, 4);
  if (!player) return ratios;
  const vertices = [...player.settlements, ...player.cities];
  for (const port of state.board.ports) {
    const edge = state.board.edges.find((e) => e.id === port.edgeId);
    if (!edge) continue;
    if (!edge.vertexIds.some((v) => vertices.includes(v))) continue;
    if (port.type === 'generic') {
      for (const resource of RESOURCES) ratios.set(resource, Math.min(ratios.get(resource) ?? 4, 3));
    } else if (RESOURCES.includes(port.type)) {
      ratios.set(port.type, Math.min(ratios.get(port.type) ?? 4, 2));
    }
  }
  return ratios;
}

export function findTradeWindPokemon(player: PlayerState, round: number) {
  return player.pokemon.find((p) => {
    const species = getSpecies(p.speciesId);
    return species.abilityId === 'tradeWind' && p.abilityUsedRound !== round;
  });
}

export function tradeRatioFor(state: GameState, playerId: number, resource: Resource): { ratio: number; viaAbility: boolean } {
  const player = findPlayer(state, playerId);
  if (!player) return { ratio: 4, viaAbility: false };
  const ratios = availablePortRatios(state, playerId);
  let ratio = ratios.get(resource) ?? 4;
  let viaAbility = false;
  if (ratio > 2 && findTradeWindPokemon(player, state.round)) {
    ratio = 2;
    viaAbility = true;
  }
  return { ratio, viaAbility };
}

export function activePokemonCount(player: PlayerState): number {
  return player.pokemon.length;
}

export function canAddPokemon(player: PlayerState): boolean {
  return activePokemonCount(player) < ACTIVE_POKEMON_LIMIT + (player.flags.stealShield > 0 ? 0 : 0);
}

export function allPokemonSpecies(): string[] {
  return POKEMON_CATALOG.map((p) => p.name);
}

export function vertexCoordinates(board: Board, vertexId: string): Vertex | undefined {
  return board.vertices.find((v) => v.id === vertexId);
}

export function validSetupSettlementVertices(state: GameState): string[] {
  const player = currentPlayer(state);
  return state.board.vertices
    .filter((v) => !buildingOwner(state, v.id))
    .filter((v) => !state.board.vertices.some((other) => {
      if (buildingOwner(state, other.id)) {
        const mine = v.edgeIds.some((e) => other.edgeIds.includes(e));
        return mine;
      }
      return false;
    }))
    .map((v) => v.id);
}

export function resultOk(state: GameState, events: GameEvent[]): ActionResult {
  return { ok: true, state, events };
}

export function fail(error: string): ActionResult {
  return { ok: false, error };
}
