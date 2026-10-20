import { DEV_CARD_INFO, PIECE_LIMITS, getSpecies } from './data';
import { validateBoard } from './board';
import type { DevCardType, GameState, Resource, ResourceBag } from './types';
import { RESOURCES } from './types';

export const SAVE_STORAGE_KEY = 'pokecatan.autosave.v1';
export const SAVE_FORMAT = 'pokecatan-save';
export const SAVE_VERSION = 1;

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  version: number;
  exportedAt: string;
  state: GameState;
}

export interface LoadResult {
  ok: boolean;
  state?: GameState;
  error?: string;
}

export function createSaveEnvelope(state: GameState): SaveEnvelope {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(createSaveEnvelope(state), null, 2);
}

export function deserializeState(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no contiene JSON válido.' };
  }
  return validateSave(parsed);
}

export function validateSave(raw: unknown): LoadResult {
  if (!isRecord(raw)) return { ok: false, error: 'El archivo no tiene el formato esperado.' };
  if (raw.format !== SAVE_FORMAT) return { ok: false, error: 'El archivo no es una partida de Pokémon Catán.' };
  if (raw.version !== SAVE_VERSION) {
    return { ok: false, error: `Versión de guardado no compatible: ${String(raw.version)} (se esperaba ${SAVE_VERSION}).` };
  }
  const state = raw.state;
  const validation = validateState(state);
  if (!validation.ok) return validation;
  return { ok: true, state: structuredClone(state as GameState) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isBag(value: unknown): value is ResourceBag {
  if (!isRecord(value)) return false;
  return RESOURCES.every((resource) => isInt(value[resource], 0, 9999));
}

function checkBag(value: unknown, name: string, errors: string[], max = 9999): void {
  if (!isRecord(value)) {
    errors.push(`${name} no es un objeto de recursos válido`);
    return;
  }
  for (const resource of RESOURCES) {
    if (!isInt(value[resource], 0, max)) errors.push(`${name}.${resource} debe ser un entero entre 0 y ${max}`);
  }
}

export function validateState(raw: unknown): LoadResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, error: 'El estado guardado no es un objeto válido.' };
  if (raw.schemaVersion !== 1) return { ok: false, error: 'Versión de estado no compatible.' };
  if (typeof raw.seed !== 'string' || raw.seed.length === 0) errors.push('Semilla inválida');
  if (!isInt(raw.rngState, 0, 0xffffffff)) errors.push('Estado aleatorio inválido');
  if (!isInt(raw.turn, 0)) errors.push('Turno inválido');
  if (!isInt(raw.round, 1)) errors.push('Ronda inválida');
  if (!['setup', 'roll', 'discard', 'robber', 'action', 'ended'].includes(String(raw.phase))) errors.push('Fase inválida');
  if (!Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 4) {
    return { ok: false, error: 'La partida debe tener entre 2 y 4 jugadores.' };
  }
  if (!isInt(raw.currentPlayerIndex, 0, (raw.players as unknown[]).length - 1)) errors.push('Jugador activo inválido');
  if (!isRecord(raw.board)) return { ok: false, error: 'Tablero ausente.' };
  try {
    errors.push(...validateBoard(raw.board as unknown as GameState['board']));
  } catch {
    errors.push('El tablero no se puede interpretar');
  }
  if (!isRecord(raw.bank)) errors.push('Banco ausente');
  else checkBag(raw.bank, 'banco', errors, 19);
  if (raw.robberHexId !== null && typeof raw.robberHexId !== 'string') errors.push('Posición del ladrón inválida');
  if (raw.lastDice !== null) {
    if (!Array.isArray(raw.lastDice) || raw.lastDice.length !== 2 || !raw.lastDice.every((v) => isInt(v, 1, 6))) {
      errors.push('Dados inválidos');
    }
  }
  if (raw.winnerId !== null && !isInt(raw.winnerId, 0)) errors.push('Ganador inválido');

  const board = raw.board as unknown as GameState['board'];
  const vertexIds = new Set(board.vertices?.map((v) => v.id));
  const edgeIds = new Set(board.edges?.map((e) => e.id));
  const hexIds = new Set(board.hexes?.map((h) => h.id));
  if (typeof raw.robberHexId === 'string' && !hexIds.has(raw.robberHexId)) errors.push('El ladrón no está en un hexágono válido');

  const allSettlements = new Set<string>();
  const allCities = new Set<string>();
  const allRoads = new Set<string>();
  const allDevCardIds = new Set<string>();
  const playerIds = new Set<number>();
  let totalDevCards = 0;

  (raw.players as unknown[]).forEach((p, index) => {
    if (!isRecord(p)) {
      errors.push(`Jugador ${index} inválido`);
      return;
    }
    if (!isInt(p.id, 0, 3) || playerIds.has(p.id)) errors.push(`Jugador ${index}: id inválido o duplicado`);
    else playerIds.add(p.id);
    if (typeof p.name !== 'string' || p.name.length === 0) errors.push(`Jugador ${index}: nombre inválido`);
    if (typeof p.color !== 'string') errors.push(`Jugador ${index}: color inválido`);
    if (typeof p.isAI !== 'boolean') errors.push(`Jugador ${index}: isAI inválido`);
    checkBag(p.resources, `Jugador ${index} recursos`, errors);
    if (!Array.isArray(p.settlements) || !Array.isArray(p.cities) || !Array.isArray(p.roads)) {
      errors.push(`Jugador ${index}: listas de construcciones inválidas`);
      return;
    }
    if (p.settlements.length > PIECE_LIMITS.settlements) errors.push(`Jugador ${index}: demasiados poblados`);
    if (p.cities.length > PIECE_LIMITS.cities) errors.push(`Jugador ${index}: demasiadas ciudades`);
    if (p.roads.length > PIECE_LIMITS.roads) errors.push(`Jugador ${index}: demasiadas carreteras`);
    for (const v of p.settlements) {
      if (typeof v !== 'string' || !vertexIds.has(v)) errors.push(`Jugador ${index}: poblado en cruce inexistente`);
      else if (allSettlements.has(v) || allCities.has(v)) errors.push(`Cruce ${v} ocupado por dos jugadores`);
      else allSettlements.add(v);
    }
    for (const v of p.cities) {
      if (typeof v !== 'string' || !vertexIds.has(v)) errors.push(`Jugador ${index}: ciudad en cruce inexistente`);
      else if (allSettlements.has(v) || allCities.has(v)) errors.push(`Cruce ${v} ocupado dos veces`);
      else allCities.add(v);
    }
    const ownVertices = new Set([...(p.settlements as string[]), ...(p.cities as string[])]);
    if (ownVertices.size !== (p.settlements as string[]).length + (p.cities as string[]).length) {
      errors.push(`Jugador ${index}: un cruce aparece como poblado y ciudad a la vez`);
    }
    for (const e of p.roads) {
      if (typeof e !== 'string' || !edgeIds.has(e)) errors.push(`Jugador ${index}: carretera inexistente`);
      else if (allRoads.has(e)) errors.push(`Camino ${e} ocupado dos veces`);
      else allRoads.add(e);
    }
    if (!Array.isArray(p.devCards)) errors.push(`Jugador ${index}: cartas de desarrollo inválidas`);
    else {
      const ids = new Set<string>();
      for (const card of p.devCards) {
        totalDevCards++;
        if (!isRecord(card) || typeof card.id !== 'string' || typeof card.type !== 'string') {
          errors.push(`Jugador ${index}: carta inválida`);
          continue;
        }
        if (ids.has(card.id) || allDevCardIds.has(card.id)) errors.push(`Jugador ${index}: carta duplicada`);
        ids.add(card.id);
        allDevCardIds.add(card.id);
        if (!(card.type in DEV_CARD_INFO)) errors.push(`Jugador ${index}: tipo de carta desconocido`);
        if (!isInt(card.boughtOnTurn, 0)) errors.push(`Jugador ${index}: turno de compra inválido`);
      }
    }
    if (!isInt(p.knightsPlayed, 0, 999)) errors.push(`Jugador ${index}: caballeros inválidos`);
    if (!Array.isArray(p.pokemon)) errors.push(`Jugador ${index}: Pokémon inválidos`);
    else {
      if (p.pokemon.length > 3) errors.push(`Jugador ${index}: más de 3 Pokémon activos`);
      const instances = new Set<string>();
      for (const mon of p.pokemon) {
        if (!isRecord(mon) || typeof mon.instanceId !== 'string') {
          errors.push(`Jugador ${index}: Pokémon inválido`);
          continue;
        }
        if (instances.has(mon.instanceId)) errors.push(`Jugador ${index}: Pokémon duplicado`);
        instances.add(mon.instanceId);
        if (!isInt(mon.speciesId, 1)) errors.push(`Jugador ${index}: especie inválida`);
        else {
          try {
            getSpecies(mon.speciesId as number);
          } catch {
            errors.push(`Jugador ${index}: especie desconocida`);
          }
        }
        if (!isInt(mon.abilityUsedRound, 0)) errors.push(`Jugador ${index}: uso de habilidad inválido`);
      }
    }
    if (!isRecord(p.flags)) errors.push(`Jugador ${index}: flags inválidos`);
    else {
      const flags = p.flags;
      for (const key of ['freeRoads', 'freeCaptures', 'freeEvolutions']) {
        if (!isInt(flags[key], 0, 10)) errors.push(`Jugador ${index}: ${key} inválido`);
      }
    }
    if (!isInt(p.difficulty, 0) && !['easy', 'normal', 'hard'].includes(String(p.difficulty))) {
      errors.push(`Jugador ${index}: dificultad inválida`);
    }
  });

  for (const v of allSettlements) if (allCities.has(v)) errors.push(`Cruce ${v} con poblado y ciudad`);
  for (const v of allCities) if (allSettlements.has(v)) errors.push(`Cruce ${v} con ciudad y poblado`);

  if (!Array.isArray(raw.devDeck)) errors.push('Mazo de desarrollo inválido');
  else {
    for (const type of raw.devDeck) {
      totalDevCards++;
      if (!(typeof type === 'string' && type in DEV_CARD_INFO)) errors.push('Carta desconocida en el mazo');
    }
  }
  if (totalDevCards > 31) errors.push('Hay más cartas de desarrollo que en el mazo original');
  const counts: Partial<Record<DevCardType, number>> = {};
  const countCard = (type: string) => {
    if (!(type in DEV_CARD_INFO)) return;
    const key = type as DevCardType;
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const p of raw.players as Record<string, unknown>[]) {
    if (Array.isArray(p.devCards)) {
      for (const card of p.devCards) if (isRecord(card) && typeof card.type === 'string') countCard(card.type);
    }
  }
  if (Array.isArray(raw.devDeck)) for (const type of raw.devDeck) if (typeof type === 'string') countCard(type);
  for (const [type, count] of Object.entries(counts) as [DevCardType, number][]) {
    if (count > DEV_CARD_INFO[type].count) errors.push(`Hay más cartas de tipo ${type} de las permitidas`);
  }

  if (!isRecord(raw.setup)) errors.push('Estado de colocación inicial inválido');
  else {
    if (raw.phase === 'setup') {
      if (raw.setup.awaiting !== 'settlement' && raw.setup.awaiting !== 'road') errors.push('Colocación inicial inválida');
      if (raw.setup.round !== 1 && raw.setup.round !== 2) errors.push('Ronda de colocación inválida');
      if (!isInt(raw.setup.turnIndex, 0, (raw.players as unknown[]).length - 1)) errors.push('Índice de colocación inválido');
    }
  }
  if (!isRecord(raw.awards)) errors.push('Distinciones inválidas');
  else {
    for (const key of ['longestRoad', 'largestArmy']) {
      const value = raw.awards[key];
      if (value !== null && (!isInt(value, 0) || !playerIds.has(value as number))) errors.push(`Distinción ${key} inválida`);
    }
  }
  if (!isRecord(raw.stats)) errors.push('Estadísticas inválidas');
  if (!Array.isArray(raw.eventLog)) errors.push('Registro de eventos inválido');
  if (raw.pendingTrade !== null && !isRecord(raw.pendingTrade)) errors.push('Oferta pendiente inválida');
  if (raw.pendingRobber !== null && !isRecord(raw.pendingRobber)) errors.push('Estado del ladrón inválido');
  if (raw.phase === 'ended' && raw.winnerId === null) errors.push('Partida terminada sin ganador');

  if (errors.length > 0) {
    return { ok: false, error: `Guardado inválido: ${errors.slice(0, 6).join('; ')}${errors.length > 6 ? '…' : ''}` };
  }
  return { ok: true, state: structuredClone(raw) as unknown as GameState };
}

export function saveToLocalStorage(state: GameState): { ok: boolean; error?: string } {
  try {
    if (typeof localStorage === 'undefined') return { ok: false, error: 'Almacenamiento local no disponible.' };
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(createSaveEnvelope(state)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo guardar la partida.' };
  }
}

export function loadFromLocalStorage(): LoadResult {
  try {
    if (typeof localStorage === 'undefined') return { ok: false, error: 'Almacenamiento local no disponible.' };
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return { ok: false, error: 'No hay ninguna partida guardada.' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'El guardado automático está corrupto.' };
    }
    return validateSave(parsed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo cargar la partida.' };
  }
}

export function hasLocalSave(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearLocalSave(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // El almacenamiento no está disponible: no hay nada que borrar.
  }
}

export function downloadFileName(state: GameState): string {
  const safeName = state.gameName.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'partida';
  return `pokecatan-${safeName}-${state.seed}.json`;
}

export function resourceBagToText(bag: Partial<ResourceBag>): string {
  const parts = RESOURCES.filter((r) => (bag[r] ?? 0) > 0).map((r) => `${bag[r]} ${r}`);
  return parts.length > 0 ? parts.join(', ') : 'nada';
}

export function sanitizeResource(value: unknown): Resource {
  if (typeof value === 'string' && RESOURCES.includes(value as Resource)) return value as Resource;
  return 'wood';
}
