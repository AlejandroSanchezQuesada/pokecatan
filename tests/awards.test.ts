import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import {
  checkVictory,
  longestRoadLength,
  publicScore,
  scorePlayer,
  updateAwards,
  visibleScore
} from '../src/engine/state';
import { finishSetup, newGame } from './helpers';
import type { Board, GameState } from '../src/engine/types';

function findEdgePath(board: Board, length: number): string[] {
  const visited = new Set<string>();
  const path: string[] = [];
  const dfs = (vertexId: string): boolean => {
    if (path.length === length) return true;
    visited.add(vertexId);
    const vertex = board.vertices.find((v) => v.id === vertexId)!;
    for (const edgeId of vertex.edgeIds) {
      const edge = board.edges.find((e) => e.id === edgeId)!;
      const next = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
      if (visited.has(next)) continue;
      path.push(edgeId);
      if (dfs(next)) return true;
      path.pop();
    }
    visited.delete(vertexId);
    return false;
  };
  for (const vertex of board.vertices) {
    path.length = 0;
    visited.clear();
    if (dfs(vertex.id)) return [...path];
  }
  throw new Error('No se encontró un camino');
}

function ready(seed = 'AWARD-1'): GameState {
  const state = finishSetup(newGame({ seed }));
  state.phase = 'action';
  for (const player of state.players) {
    player.roads = [];
    player.settlements = [];
    player.cities = [];
  }
  return state;
}

describe('ruta comercial y ejército', () => {
  it('concede la ruta comercial con al menos cinco carreteras conectadas', () => {
    const state = ready();
    const path = findEdgePath(state.board, 5);
    state.players[0]!.roads = path;
    expect(longestRoadLength(state, 0)).toBe(5);
    updateAwards(state);
    expect(state.awards.longestRoad).toBe(0);
  });

  it('no concede la ruta con solo cuatro carreteras', () => {
    const state = ready();
    state.players[0]!.roads = findEdgePath(state.board, 4);
    expect(longestRoadLength(state, 0)).toBe(4);
    updateAwards(state);
    expect(state.awards.longestRoad).toBeNull();
  });

  it('interrumpe la ruta con una construcción rival en un cruce intermedio', () => {
    const state = ready();
    const path = findEdgePath(state.board, 5);
    state.players[0]!.roads = path;
    const middleEdge = state.board.edges.find((e) => e.id === path[2])!;
    const middleVertex = middleEdge.vertexIds[0]!;
    state.players[1]!.settlements.push(middleVertex);
    expect(longestRoadLength(state, 0)).toBeLessThan(5);
    updateAwards(state);
    expect(state.awards.longestRoad).toBeNull();
  });

  it('mantiene la distinción en caso de empate y la transfiere al superar', () => {
    const state = ready();
    state.players[0]!.roads = findEdgePath(state.board, 5);
    updateAwards(state);
    expect(state.awards.longestRoad).toBe(0);
    state.players[1]!.roads = findEdgePath(state.board, 5);
    updateAwards(state);
    expect(state.awards.longestRoad).toBe(0);
    state.players[1]!.roads = findEdgePath(state.board, 6);
    expect(longestRoadLength(state, 1)).toBe(6);
    updateAwards(state);
    expect(state.awards.longestRoad).toBe(1);
  });

  it('concede el ejército más grande a partir de tres caballeros', () => {
    const state = ready();
    state.players[0]!.knightsPlayed = 3;
    state.players[1]!.knightsPlayed = 2;
    updateAwards(state);
    expect(state.awards.largestArmy).toBe(0);
    state.players[1]!.knightsPlayed = 3;
    updateAwards(state);
    expect(state.awards.largestArmy).toBe(0);
    state.players[1]!.knightsPlayed = 4;
    updateAwards(state);
    expect(state.awards.largestArmy).toBe(1);
  });
});

describe('victoria', () => {
  it('declara ganador al alcanzar 10 puntos en el propio turno', () => {
    const state = ready();
    state.players[0]!.settlements = state.board.vertices.slice(0, 5).map((v) => v.id);
    state.players[0]!.cities = state.board.vertices.slice(5, 8).map((v) => v.id);
    state.players[0]!.devCards.push({ id: 'vp-1', type: 'victory', boughtOnTurn: 1, played: false });
    expect(scorePlayer(state, 0, true)).toBe(12);
    state.phase = 'action';
    state.currentPlayerIndex = 0;
    expect(checkVictory(state)).toBe(true);
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe(0);
    expect(applyAction(state, { type: 'endTurn', playerId: 0 }).ok).toBe(false);
  });

  it('no declara victoria fuera del turno del jugador', () => {
    const state = ready();
    state.players[0]!.cities = state.board.vertices.slice(0, 5).map((v) => v.id);
    state.phase = 'action';
    state.currentPlayerIndex = 1;
    expect(checkVictory(state)).toBe(false);
    expect(state.phase).toBe('action');
  });

  it('oculta las cartas de punto de victoria a los rivales', () => {
    const state = ready();
    state.players[0]!.settlements = state.board.vertices.slice(0, 2).map((v) => v.id);
    state.players[0]!.devCards.push({ id: 'vp-1', type: 'victory', boughtOnTurn: 1, played: false });
    expect(publicScore(state, 0)).toBe(2);
    expect(visibleScore(state, 0, 0)).toBe(3);
    expect(visibleScore(state, 1, 0)).toBe(2);
    state.phase = 'ended';
    expect(visibleScore(state, 1, 0)).toBe(3);
  });
});
