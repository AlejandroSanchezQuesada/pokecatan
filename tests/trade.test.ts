import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { availablePortRatios, tradeRatioFor } from '../src/engine/state';
import { act, attempt, finishSetup, makeRich, newGame } from './helpers';
import type { GameState } from '../src/engine/types';

function ready(seed = 'TRADE-1'): GameState {
  const state = makeRich(finishSetup(newGame({ seed })), 0);
  state.phase = 'action';
  state.bank = { wood: 19, clay: 19, wool: 19, wheat: 19, ore: 19 };
  return state;
}

function portVertex(state: GameState, type: 'generic' | 'wood' | 'clay' | 'wool' | 'wheat' | 'ore'): string {
  const port = state.board.ports.find((p) => p.type === type)!;
  const edge = state.board.edges.find((e) => e.id === port.edgeId)!;
  return edge.vertexIds[0]!;
}

describe('comercio', () => {
  it('comercio con banco a 4:1 sin puertos', () => {
    const state = ready();
    state.players[0]!.settlements = [];
    state.players[0]!.cities = [];
    state.players[0]!.resources = { wood: 4, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(tradeRatioFor(state, 0, 'wood').ratio).toBe(4);
    const after = act(state, { type: 'bankTrade', playerId: 0, give: 'wood', receive: 'ore' });
    expect(after.players[0]!.resources.wood).toBe(0);
    expect(after.players[0]!.resources.ore).toBe(1);
    expect(after.bank.wood).toBe(19 + 4);
  });

  it('aplica 3:1 en puerto genérico y 2:1 en el especializado', () => {
    const generic = ready('TRADE-2');
    generic.players[0]!.settlements = [portVertex(generic, 'generic')];
    generic.players[0]!.cities = [];
    generic.players[0]!.resources = { wood: 3, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(availablePortRatios(generic, 0).get('wood')).toBe(3);
    const traded = act(generic, { type: 'bankTrade', playerId: 0, give: 'wood', receive: 'wool' });
    expect(traded.players[0]!.resources.wool).toBe(1);

    const specialized = ready('TRADE-3');
    specialized.players[0]!.settlements = [portVertex(specialized, 'wood')];
    specialized.players[0]!.cities = [];
    specialized.players[0]!.resources = { wood: 2, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(tradeRatioFor(specialized, 0, 'wood').ratio).toBe(2);
    const traded2 = act(specialized, { type: 'bankTrade', playerId: 0, give: 'wood', receive: 'ore' });
    expect(traded2.players[0]!.resources.ore).toBe(1);
    expect(traded2.players[0]!.resources.wood).toBe(0);
  });

  it('rechaza intercambios ilegales con el banco', () => {
    const state = ready();
    state.players[0]!.resources = { wood: 4, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(attempt(state, { type: 'bankTrade', playerId: 0, give: 'wood', receive: 'wood' }).ok).toBe(false);
    expect(attempt(state, { type: 'bankTrade', playerId: 0, give: 'clay', receive: 'ore' }).ok).toBe(false);
    expect(applyAction(state, { type: 'bankTrade', playerId: 1, give: 'wood', receive: 'ore' }).ok).toBe(false);
  });

  it('permite ofrecer, aceptar y transferir entre jugadores', () => {
    let state = ready();
    state.players[0]!.resources = { wood: 5, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 3 };
    state = act(state, {
      type: 'proposeTrade',
      playerId: 0,
      toPlayerId: 1,
      give: { wood: 2 },
      receive: { ore: 1 }
    });
    expect(state.pendingTrade?.fromPlayerId).toBe(0);
    const accepted = act(state, { type: 'acceptTrade', playerId: 1 });
    expect(accepted.pendingTrade).toBeNull();
    expect(accepted.players[0]!.resources.wood).toBe(3);
    expect(accepted.players[0]!.resources.ore).toBe(1);
    expect(accepted.players[1]!.resources.wood).toBe(2);
    expect(accepted.players[1]!.resources.ore).toBe(2);
  });

  it('rechaza ofertas sin recursos y ofertas duplicadas', () => {
    let state = ready();
    state.players[0]!.resources = { wood: 1, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(
      attempt(state, { type: 'proposeTrade', playerId: 0, toPlayerId: 1, give: { wood: 2 }, receive: { ore: 1 } }).ok
    ).toBe(false);
    state.players[0]!.resources.wood = 5;
    state = act(state, { type: 'proposeTrade', playerId: 0, toPlayerId: 1, give: { wood: 1 }, receive: { ore: 1 } });
    expect(
      attempt(state, { type: 'proposeTrade', playerId: 0, toPlayerId: 2, give: { wood: 1 }, receive: { ore: 1 } }).ok
    ).toBe(false);
  });

  it('exige que el aceptante tenga los recursos solicitados', () => {
    let state = ready();
    state.players[0]!.resources = { wood: 5, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state = act(state, { type: 'proposeTrade', playerId: 0, toPlayerId: 1, give: { wood: 1 }, receive: { ore: 1 } });
    expect(attempt(state, { type: 'acceptTrade', playerId: 1 }).ok).toBe(false);
  });

  it('gestiona el rechazo de todos los destinatarios', () => {
    let state = ready();
    state.players[0]!.resources = { wood: 5, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state = act(state, { type: 'proposeTrade', playerId: 0, toPlayerId: 'all', give: { wood: 1 }, receive: { ore: 1 } });
    state = act(state, { type: 'rejectTrade', playerId: 1 });
    expect(state.pendingTrade).not.toBeNull();
    state = act(state, { type: 'rejectTrade', playerId: 2 });
    state = act(state, { type: 'rejectTrade', playerId: 3 });
    expect(state.pendingTrade).toBeNull();
  });

  it('permite contraofertas que invierten la propuesta', () => {
    let state = ready();
    state.players[0]!.resources = { wood: 5, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 5 };
    state = act(state, { type: 'proposeTrade', playerId: 0, toPlayerId: 1, give: { wood: 2 }, receive: { ore: 1 } });
    state = act(state, { type: 'counterTrade', playerId: 1, give: { ore: 1 }, receive: { wood: 3 } });
    expect(state.pendingTrade?.fromPlayerId).toBe(1);
    expect(state.pendingTrade?.toPlayerId).toBe(0);
    const accepted = act(state, { type: 'acceptTrade', playerId: 0 });
    expect(accepted.players[0]!.resources.wood).toBe(2);
    expect(accepted.players[0]!.resources.ore).toBe(1);
    expect(accepted.players[1]!.resources.wood).toBe(3);
    expect(accepted.players[1]!.resources.ore).toBe(4);
  });

  it('solo el jugador activo puede proponer intercambios', () => {
    const state = ready();
    expect(
      applyAction(state, { type: 'proposeTrade', playerId: 1, toPlayerId: 2, give: { ore: 1 }, receive: { wood: 1 } }).ok
    ).toBe(false);
  });
});
