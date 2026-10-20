import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { BUILD_COSTS, PIECE_LIMITS } from '../src/engine/data';
import { actionState, act, attempt, finishSetup, makeRich, newGame } from './helpers';
import type { GameState } from '../src/engine/types';

function ready(seed = 'BUILD-1'): GameState {
  const state = makeRich(actionState(finishSetup(newGame({ seed }))), 0);
  state.bank = { wood: 19, clay: 19, wool: 19, wheat: 19, ore: 19 };
  return state;
}

function findRoadEdge(state: GameState, playerId: number): string | undefined {
  const player = state.players.find((p) => p.id === playerId)!;
  return state.board.edges.find((edge) => {
    if (state.players.some((p) => p.roads.includes(edge.id))) return false;
    if (!edge.vertexIds.some((v) => player.settlements.includes(v) || player.cities.includes(v))) return false;
    return edge.vertexIds.every((v) => {
      const owner = state.players.find((p) => p.settlements.includes(v) || p.cities.includes(v));
      return !owner || owner.id === playerId;
    });
  })?.id;
}

describe('construcciones', () => {
  it('construye una carretera conectada con el coste exacto', () => {
    const state = ready();
    const edgeId = findRoadEdge(state, 0);
    expect(edgeId).toBeDefined();
    const after = act(state, { type: 'buildRoad', playerId: 0, edgeId: edgeId! });
    expect(after.players[0]!.roads).toContain(edgeId);
    expect(after.players[0]!.resources.wood).toBe(9);
    expect(after.players[0]!.resources.clay).toBe(9);
    expect(after.bank.wood).toBe(20);
    expect(after.bank.clay).toBe(20);
  });

  it('rechaza carreteras desconectadas, ocupadas o a través de un rival', () => {
    const state = ready();
    const player = state.players[0]!;
    const connected = findRoadEdge(state, 0)!;
    const disconnected = state.board.edges.find(
      (edge) =>
        !state.players.some((p) => p.roads.includes(edge.id)) &&
        !edge.vertexIds.some((v) => player.settlements.includes(v) || player.cities.includes(v))
    )!;
    expect(attempt(state, { type: 'buildRoad', playerId: 0, edgeId: disconnected.id }).ok).toBe(false);
    const occupied = structuredClone(state);
    occupied.players[1]!.roads.push(disconnected.id);
    expect(attempt(occupied, { type: 'buildRoad', playerId: 0, edgeId: disconnected.id }).ok).toBe(false);

    const blocked = structuredClone(state);
    const target = findRoadEdge(blocked, 0)!;
    const edge = blocked.board.edges.find((e) => e.id === target)!;
    const other = edge.vertexIds.find((v) => !player.settlements.includes(v))!;
    blocked.players[1]!.settlements.push(other);
    expect(attempt(blocked, { type: 'buildRoad', playerId: 0, edgeId: target }).ok).toBe(false);
  });

  it('no permite construir sin recursos', () => {
    const state = ready();
    state.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    const edgeId = findRoadEdge(state, 0)!;
    expect(attempt(state, { type: 'buildRoad', playerId: 0, edgeId }).ok).toBe(false);
  });

  it('respeta la distancia mínima entre poblados', () => {
    const state = ready();
    const settlement = state.players[0]!.settlements[0]!;
    const vertex = state.board.vertices.find((v) => v.id === settlement)!;
    const adjacent = state.board.vertices.find(
      (v) => v.id !== settlement && vertex.edgeIds.some((edgeId) => v.edgeIds.includes(edgeId))
    )!;
    expect(attempt(state, { type: 'buildSettlement', playerId: 0, vertexId: adjacent.id }).ok).toBe(false);
  });

  it('construye y mejora poblados y ciudades con costes clásicos', () => {
    const state = ready();
    const vertex = state.board.vertices.find((v) => {
      if (state.players.some((p) => p.settlements.includes(v.id) || p.cities.includes(v.id))) return false;
      if (!state.players[0]!.roads.some((edgeId) => state.board.edges.find((e) => e.id === edgeId)?.vertexIds.includes(v.id))) return false;
      const adjacentOccupied = v.edgeIds.some((edgeId) => {
        const edge = state.board.edges.find((e) => e.id === edgeId)!;
        const other = edge.vertexIds[0] === v.id ? edge.vertexIds[1] : edge.vertexIds[0];
        return state.players.some((p) => p.settlements.includes(other) || p.cities.includes(other));
      });
      return !adjacentOccupied;
    });
    if (!vertex) return;
    const withSettlement = act(state, { type: 'buildSettlement', playerId: 0, vertexId: vertex.id });
    expect(withSettlement.players[0]!.settlements).toContain(vertex.id);
    expect(withSettlement.players[0]!.resources.wood).toBe(9);
    const withCity = act(withSettlement, { type: 'buildCity', playerId: 0, vertexId: vertex.id });
    expect(withCity.players[0]!.cities).toContain(vertex.id);
    expect(withCity.players[0]!.settlements).not.toContain(vertex.id);
    expect(withCity.players[0]!.resources.wheat).toBe(7);
    expect(withCity.players[0]!.resources.ore).toBe(7);
    expect(attempt(withCity, { type: 'buildCity', playerId: 0, vertexId: vertex.id }).ok).toBe(false);
  });

  it('solo permite mejorar poblados propios', () => {
    const state = ready();
    const enemySettlement = state.players[1]!.settlements[0]!;
    expect(attempt(state, { type: 'buildCity', playerId: 0, vertexId: enemySettlement }).ok).toBe(false);
  });

  it('respeta los límites de piezas', () => {
    const state = ready();
    state.players[0]!.roads = state.board.edges.slice(0, PIECE_LIMITS.roads).map((e) => e.id);
    const edgeId = state.board.edges[PIECE_LIMITS.roads]!.id;
    expect(attempt(state, { type: 'buildRoad', playerId: 0, edgeId }).ok).toBe(false);

    const cityState = ready();
    cityState.players[0]!.cities = cityState.board.vertices.slice(0, PIECE_LIMITS.cities).map((v) => v.id);
    cityState.players[0]!.settlements = [cityState.board.vertices[PIECE_LIMITS.cities + 1]!.id];
    expect(
      attempt(cityState, { type: 'buildCity', playerId: 0, vertexId: cityState.players[0]!.settlements[0]! }).ok
    ).toBe(false);
  });

  it('cobra exactamente los costes documentados', () => {
    expect(BUILD_COSTS.road).toEqual({ wood: 1, clay: 1 });
    expect(BUILD_COSTS.settlement).toEqual({ wood: 1, clay: 1, wool: 1, wheat: 1 });
    expect(BUILD_COSTS.city).toEqual({ wheat: 2, ore: 3 });
    expect(BUILD_COSTS.dev).toEqual({ wool: 1, wheat: 1, ore: 1 });
  });

  it('no permite actuar dos veces seguidas al mismo jugador tras finalizar turno', () => {
    const state = act(ready(), { type: 'endTurn', playerId: 0 });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.phase).toBe('roll');
    expect(applyAction(state, { type: 'buildRoad', playerId: 0, edgeId: state.board.edges[0]!.id }).ok).toBe(false);
  });
});
