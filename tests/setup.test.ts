import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { currentPlayer } from '../src/engine/state';
import { act, attempt, finishSetup, newGame } from './helpers';

describe('colocación inicial', () => {
  it('empieza con el tablero generado y el jugador 0 colocando un poblado', () => {
    const game = newGame();
    expect(game.phase).toBe('setup');
    expect(game.players).toHaveLength(4);
    expect(game.players.every((p) => !p.isAI || p.difficulty === 'normal')).toBe(true);
    expect(currentPlayer(game).id).toBe(0);
    expect(game.setup.awaiting).toBe('settlement');
    expect(game.board.hexes).toHaveLength(19);
  });

  it('no permite colocar poblados adyacentes ni carreteras desconectadas', () => {
    let game = newGame();
    const vertex = game.board.vertices[0]!;
    const state = act(game, { type: 'setupSettlement', playerId: 0, vertexId: vertex.id });
    expect(state.setup.awaiting).toBe('road');
    const badEdge = state.board.edges.find((e) => !e.vertexIds.includes(vertex.id))!;
    expect(attempt(state, { type: 'setupRoad', playerId: 0, edgeId: badEdge.id }).ok).toBe(false);
    const goodEdge = state.board.edges.find((e) => e.vertexIds.includes(vertex.id))!;
    game = act(state, { type: 'setupRoad', playerId: 0, edgeId: goodEdge.id });
    expect(currentPlayer(game).id).toBe(1);
    const adjacentVertex = goodEdge.vertexIds.find((v) => v !== vertex.id)!;
    expect(attempt(game, { type: 'setupSettlement', playerId: 1, vertexId: adjacentVertex }).ok).toBe(false);
    expect(attempt(game, { type: 'setupSettlement', playerId: 1, vertexId: vertex.id }).ok).toBe(false);
  });

  it('respeta el orden de ida y vuelta y reparte recursos en la segunda ronda', () => {
    let game = newGame({ seed: 'ORDEN-1' });
    const settlementOrder: number[] = [];
    while (game.phase === 'setup') {
      const player = currentPlayer(game);
      if (game.setup.awaiting === 'settlement') {
        settlementOrder.push(player.id);
        const used = new Set(game.players.flatMap((p) => [...p.settlements, ...p.cities]));
        const vertex = game.board.vertices.find((v) => {
          if (used.has(v.id)) return false;
          return !v.edgeIds.some((edgeId) => {
            const edge = game.board.edges.find((e) => e.id === edgeId)!;
            const other = edge.vertexIds[0] === v.id ? edge.vertexIds[1] : edge.vertexIds[0];
            return used.has(other);
          });
        })!;
        game = act(game, { type: 'setupSettlement', playerId: player.id, vertexId: vertex.id });
      } else {
        const last = game.setup.lastSettlementVertex!;
        const edge = game.board.edges.find((e) => e.vertexIds.includes(last))!;
        game = act(game, { type: 'setupRoad', playerId: player.id, edgeId: edge.id });
      }
    }
    expect(settlementOrder).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(game.phase).toBe('roll');
    expect(game.turn).toBe(1);
    for (const player of game.players) {
      expect(player.settlements).toHaveLength(2);
      expect(player.roads).toHaveLength(2);
    }
    const secondSettlements = game.eventLog.filter((e) => e.type === 'setup' && e.message.includes('recursos iniciales'));
    expect(secondSettlements).toHaveLength(4);
  });

  it('asigna exactamente los recursos de los hexágonos del segundo poblado', () => {
    let game = newGame({ seed: 'RECURSOS-1' });
    const expected = new Map<number, Record<string, number>>();
    while (game.phase === 'setup') {
      const player = currentPlayer(game);
      if (game.setup.awaiting === 'settlement') {
        const used = new Set(game.players.flatMap((p) => [...p.settlements, ...p.cities]));
        const vertex = game.board.vertices.find((v) => {
          if (used.has(v.id)) return false;
          return !v.edgeIds.some((edgeId) => {
            const edge = game.board.edges.find((e) => e.id === edgeId)!;
            const other = edge.vertexIds[0] === v.id ? edge.vertexIds[1] : edge.vertexIds[0];
            return used.has(other);
          });
        })!;
        game = act(game, { type: 'setupSettlement', playerId: player.id, vertexId: vertex.id });
        if (game.setup.round === 2) {
          const bag: Record<string, number> = {};
          for (const hexId of vertex.hexIds) {
            const hex = game.board.hexes.find((h) => h.id === hexId)!;
            if (hex.terrain !== 'desert') bag[hex.terrain] = (bag[hex.terrain] ?? 0) + 1;
          }
          expected.set(player.id, bag);
        }
      } else {
        const last = game.setup.lastSettlementVertex!;
        const edge = game.board.edges.find((e) => e.vertexIds.includes(last))!;
        game = act(game, { type: 'setupRoad', playerId: player.id, edgeId: edge.id });
      }
    }
    for (const player of game.players) {
      const bag = expected.get(player.id) ?? {};
      expect(player.resources).toMatchObject(bag);
    }
  });

  it('completa la colocación y deja el juego listo para lanzar dados', () => {
    const game = finishSetup(newGame());
    expect(game.phase).toBe('roll');
    expect(game.turn).toBe(1);
    const result = attempt(game, { type: 'rollDice', playerId: 99 });
    expect(result.ok).toBe(false);
    expect(applyAction(game, { type: 'rollDice', playerId: 0 }).ok).toBe(true);
  });
});
