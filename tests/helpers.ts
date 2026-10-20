import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { createGame, currentPlayer, emptyBag } from '../src/engine/state';
import type { GameState, NewGameOptions, ResourceBag } from '../src/engine/types';

export const BASE_OPTIONS: NewGameOptions = {
  mode: 'solo',
  difficulty: 'normal',
  seed: 'TEST-1',
  gameName: 'Prueba',
  humanPlayers: 1,
  playerName: 'Ash'
};

export function newGame(overrides: Partial<NewGameOptions> = {}): GameState {
  return createGame({ ...BASE_OPTIONS, ...overrides });
}

export function act(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

export function attempt(state: GameState, action: Parameters<typeof applyAction>[1]) {
  return applyAction(state, action);
}

export function setupIndex(state: GameState): number {
  return currentPlayer(state).id;
}

export function firstVertices(state: GameState, count: number): string[] {
  return state.board.vertices.slice(0, count).map((v) => v.id);
}

export function empty(): ReturnType<typeof emptyBag> {
  return emptyBag();
}

export function finishSetup(state: GameState): GameState {
  let next = state;
  const placements: Record<number, string[]> = {};
  while (next.phase === 'setup') {
    const player = currentPlayer(next);
    if (next.setup.awaiting === 'settlement') {
      const used = new Set<string>();
      for (const p of next.players) {
        for (const v of [...p.settlements, ...p.cities]) used.add(v);
      }
      const vertex = next.board.vertices.find((v) => {
        if (used.has(v.id)) return false;
        const adjacentOccupied = v.edgeIds.some((edgeId) => {
          const edge = next.board.edges.find((e) => e.id === edgeId);
          if (!edge) return false;
          const other = edge.vertexIds[0] === v.id ? edge.vertexIds[1] : edge.vertexIds[0];
          return next.players.some((p) => p.settlements.includes(other) || p.cities.includes(other));
        });
        return !adjacentOccupied;
      });
      if (!vertex) throw new Error('sin vértice disponible');
      placements[player.id] = [vertex.id];
      next = act(next, { type: 'setupSettlement', playerId: player.id, vertexId: vertex.id });
    } else {
      const last = next.setup.lastSettlementVertex;
      const edge = next.board.edges.find(
        (e) =>
          last !== null &&
          e.vertexIds.includes(last) &&
          !next.players.some((p) => p.roads.includes(e.id))
      );
      if (!edge) throw new Error('sin carretera disponible');
      next = act(next, { type: 'setupRoad', playerId: player.id, edgeId: edge.id });
    }
  }
  return next;
}

export function makeRich(state: GameState, playerId: number, bag = { wood: 10, clay: 10, wool: 10, wheat: 10, ore: 10 }): GameState {
  const next = structuredClone(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new Error('jugador no encontrado');
  player.resources = { ...emptyBag(), ...bag };
  return next;
}

export function actionState(state: GameState, playerIndex = 0): GameState {
  const next = structuredClone(state);
  next.phase = 'action';
  next.currentPlayerIndex = playerIndex;
  next.lastDice = [3, 4];
  return next;
}

export function findRollState(state: GameState, total: number): { state: GameState; dice: [number, number] } {
  for (let rng = 1; rng < 200000; rng++) {
    const candidate = structuredClone(state);
    candidate.rngState = rng;
    const result = applyAction(candidate, { type: 'rollDice', playerId: currentPlayer(candidate).id });
    if (!result.ok) continue;
    if (result.state.lastDice && result.state.lastDice[0] + result.state.lastDice[1] === total) {
      return { state: result.state, dice: result.state.lastDice };
    }
  }
  throw new Error('No se encontr? un estado aleatorio para el total ' + total);
}

export function clearBoardBuildings(state: GameState): GameState {
  const next = structuredClone(state);
  for (const player of next.players) {
    player.settlements = [];
    player.cities = [];
    player.roads = [];
    player.resources = emptyBag();
  }
  next.bank = { wood: 19, clay: 19, wool: 19, wheat: 19, ore: 19 };
  return next;
}

export function give(state: GameState, playerId: number, bag: Partial<ResourceBag>): GameState {
  const next = structuredClone(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new Error('jugador no encontrado');
  player.resources = { ...player.resources, ...bag };
  return next;
}
