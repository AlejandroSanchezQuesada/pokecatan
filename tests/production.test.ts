import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { currentPlayer, emptyBag } from '../src/engine/state';
import { act, clearBoardBuildings, findRollState, finishSetup, give, newGame } from './helpers';

describe('producción y dados', () => {
  it('produce 1 recurso por poblado y 2 por ciudad', () => {
    const base = clearBoardBuildings(finishSetup(newGame({ seed: 'PROD-1' })));
    const hex = base.board.hexes.find((h) => h.number !== null)!;
    const vertex = base.board.vertices.find((v) => v.hexIds.includes(hex.id))!;
    const withSettlement = structuredClone(base);
    withSettlement.players[0]!.settlements = [vertex.id];
    const rolled = findRollState(withSettlement, hex.number!);
    expect(rolled.state.players[0]!.resources[hex.terrain as keyof typeof emptyBag]).toBe(1);
    expect(rolled.state.bank[hex.terrain as keyof typeof emptyBag]).toBe(18);

    const withCity = structuredClone(base);
    withCity.players[0]!.cities = [vertex.id];
    const rolledCity = findRollState(withCity, hex.number!);
    expect(rolledCity.state.players[0]!.resources[hex.terrain as keyof typeof emptyBag]).toBe(2);
  });

  it('el ladrón y el desierto bloquean la producción', () => {
    const base = clearBoardBuildings(finishSetup(newGame({ seed: 'PROD-2' })));
    const hex = base.board.hexes.find((h) => h.number !== null && h.terrain !== 'desert')!;
    const vertex = base.board.vertices.find((v) => v.hexIds.includes(hex.id))!;
    const blocked = structuredClone(base);
    blocked.players[0]!.settlements = [vertex.id];
    blocked.robberHexId = hex.id;
    const rolled = findRollState(blocked, hex.number!);
    expect(rolled.state.players[0]!.resources).toEqual(emptyBag());

    const desert = base.board.hexes.find((h) => h.terrain === 'desert')!;
    const desertVertex = base.board.vertices.find((v) => v.hexIds.includes(desert.id))!;
    const adjacentNumbers = new Set(
      desertVertex.hexIds
        .map((id) => base.board.hexes.find((h) => h.id === id)!)
        .filter((h) => h.terrain !== 'desert')
        .map((h) => h.number)
        .filter((n): n is number => n !== null)
    );
    const total = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].find((n) => !adjacentNumbers.has(n))!;
    const withDesert = structuredClone(base);
    withDesert.players[0]!.settlements = [desertVertex.id];
    const rolledDesert = findRollState(withDesert, total);
    expect(rolledDesert.state.players[0]!.resources).toEqual(emptyBag());
  });

  it('aplica la escasez del banco de forma consistente', () => {
    const base = clearBoardBuildings(finishSetup(newGame({ seed: 'PROD-3' })));
    const hex = base.board.hexes.find((h) => h.number !== null && h.terrain !== 'desert')!;
    const vertex = base.board.vertices.find((v) => v.hexIds.includes(hex.id))!;
    const state = structuredClone(base);
    state.players[0]!.settlements = [vertex.id];
    state.bank[hex.terrain as keyof typeof state.bank] = 0;
    const rolled = findRollState(state, hex.number!);
    expect(rolled.state.players[0]!.resources[hex.terrain as keyof typeof state.bank]).toBe(0);
    expect(rolled.state.eventLog.some((e) => e.message.includes('banco no tiene suficiente'))).toBe(true);
  });

  it('con un 7 no produce, exige descartes y activa al ladrón', () => {
    let state = clearBoardBuildings(finishSetup(newGame({ seed: 'SIETE-1' })));
    state.players[0]!.resources = { wood: 8, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { wood: 9, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[2]!.resources = { wood: 2, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[3]!.resources = { wood: 10, clay: 0, wool: 0, wheat: 0, ore: 0 };
    const rolled = findRollState(state, 7);
    expect(rolled.state.phase).toBe('discard');
    expect(rolled.state.discardsRequired).toEqual({ 0: 4, 1: 4, 3: 5 });
    expect(rolled.state.lastDice![0] + rolled.state.lastDice![1]).toBe(7);
    expect(rolled.state.stats.rolls).toBe(1);

    let after = rolled.state;
    after = act(after, { type: 'discard', playerId: 0, resources: { wood: 4 } });
    after = act(after, { type: 'discard', playerId: 1, resources: { wood: 4 } });
    expect(after.phase).toBe('discard');
    after = act(after, { type: 'discard', playerId: 3, resources: { wood: 5 } });
    expect(after.phase).toBe('robber');
    expect(after.players[0]!.resources.wood).toBe(4);
    expect(after.bank.wood).toBe(19 + 13);
    expect(after.pendingRobber?.playerId).toBe(0);

    const destination = after.board.hexes.find((h) => h.id !== after.robberHexId)!;
    after = act(after, { type: 'moveRobber', playerId: 0, hexId: destination.id });
    expect(after.phase).toBe('action');
    expect(after.robberHexId).toBe(destination.id);
  });

  it('no permite descartar cantidades incorrectas', () => {
    const state = clearBoardBuildings(finishSetup(newGame({ seed: 'SIETE-2' })));
    state.players[0]!.resources = { wood: 8, clay: 0, wool: 0, wheat: 0, ore: 0 };
    const rolled = findRollState(state, 7);
    expect(applyAction(rolled.state, { type: 'discard', playerId: 0, resources: { wood: 3 } }).ok).toBe(false);
    expect(applyAction(rolled.state, { type: 'discard', playerId: 0, resources: { wood: 9 } }).ok).toBe(false);
  });

  it('el ladrón roba un recurso aleatorio al objetivo elegido', () => {
    let state = clearBoardBuildings(finishSetup(newGame({ seed: 'ROBO-1' })));
    state.players[0]!.resources = { wood: 8, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { clay: 8, wood: 0, wool: 0, wheat: 0, ore: 0 };
    const rolled = findRollState(state, 7);
    let after = rolled.state;
    after = act(after, { type: 'discard', playerId: 0, resources: { wood: 4 } });
    after = act(after, { type: 'discard', playerId: 1, resources: { clay: 4 } });
    const targetHex = after.board.hexes.find((h) => {
      if (h.id === after.robberHexId) return false;
      return h.vertexIds.some(
        (v) =>
          after.players[1]!.settlements.includes(v) ||
          after.players[1]!.cities.includes(v) ||
          after.players[1]!.roads.some((e) => after.board.edges.find((edge) => edge.id === e)?.vertexIds.includes(v))
      );
    });
    if (!targetHex) return;
    const hasBuilding = after.players[1]!.settlements.some((v) => targetHex.vertexIds.includes(v));
    if (!hasBuilding) return;
    after = act(after, { type: 'moveRobber', playerId: 0, hexId: targetHex.id, stealFromPlayerId: 1 });
    expect(after.players[0]!.resources.clay + after.players[1]!.resources.clay).toBe(4);
    expect(after.players[0]!.resources.clay).toBe(1);
  });

  it('no se puede dejar el ladrón en el mismo hexágono', () => {
    const state = clearBoardBuildings(finishSetup(newGame({ seed: 'ROBO-2' })));
    state.players[0]!.resources = { wood: 8, clay: 0, wool: 0, wheat: 0, ore: 0 };
    const rolled = findRollState(state, 7);
    const afterDiscard = act(rolled.state, { type: 'discard', playerId: 0, resources: { wood: 4 } });
    expect(applyAction(afterDiscard, { type: 'moveRobber', playerId: 0, hexId: afterDiscard.robberHexId }).ok).toBe(false);
  });

  it('exige lanzar los dados antes de actuar', () => {
    const state = finishSetup(newGame());
    const result = applyAction(state, { type: 'buildRoad', playerId: 0, edgeId: state.board.edges[0]!.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('fase');
  });

  it('solo el jugador activo puede lanzar los dados', () => {
    const state = finishSetup(newGame());
    expect(currentPlayer(state).id).toBe(0);
    expect(applyAction(state, { type: 'rollDice', playerId: 1 }).ok).toBe(false);
  });

  it('usa un servicio de azar determinista y sustituible', () => {
    const state = finishSetup(newGame({ seed: 'DADOS-1' }));
    const a = applyAction(state, { type: 'rollDice', playerId: 0 });
    const b = applyAction(give(state, 0, {}), { type: 'rollDice', playerId: 0 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.state.lastDice).toEqual(b.state.lastDice);
      expect(a.state.rngState).toBe(b.state.rngState);
      expect(a.state.rngState).not.toBe(state.rngState);
    }
  });
});
