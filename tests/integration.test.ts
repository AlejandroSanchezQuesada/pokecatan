import { describe, expect, it } from 'vitest';
import { pendingAITradeResponder, pendingTradeAwaitingHuman, runAITurn } from '../src/ai';
import { applyAction } from '../src/engine/actions';
import { deserializeState, serializeState } from '../src/engine/persistence';
import { createGame, currentPlayer } from '../src/engine/state';
import type { GameMode } from '../src/engine/types';
import { act, findRollState, finishSetup, newGame } from './helpers';

function localGame(humanPlayers: number, seed: string) {
  return createGame({
    mode: 'local' as GameMode,
    difficulty: 'normal',
    humanPlayers,
    playerName: 'Ash',
    gameName: 'Integración',
    seed
  });
}

describe('integración de flujos principales', () => {
  it.each([
    [2, 2],
    [3, 1],
    [4, 0]
  ])('crea una partida local con %i humanos y %i IA', (humans, ai) => {
    const game = localGame(humans, `LOCAL-${humans}`);
    expect(game.players).toHaveLength(4);
    expect(game.players.filter((player) => !player.isAI)).toHaveLength(humans);
    expect(game.players.filter((player) => player.isAI)).toHaveLength(ai);
    expect(game.players[0]!.name).toBe('Ash');
  });

  it('completa la preparación, produce, termina el turno y devuelve el control al humano', () => {
    const setup = finishSetup(newGame({ seed: 'INTEGRACION-1' }));
    expect(setup.phase).toBe('roll');
    for (const player of setup.players) {
      expect(player.settlements).toHaveLength(2);
      expect(player.roads).toHaveLength(2);
    }

    const { state: rolled } = findRollState(setup, 8);
    expect(rolled.phase).toBe('action');
    expect(rolled.lastDice?.reduce((sum, value) => sum + value, 0)).toBe(8);
    let state = act(rolled, { type: 'endTurn', playerId: 0 });
    expect(currentPlayer(state).isAI).toBe(true);

    for (let guard = 0; guard < 12 && currentPlayer(state).id !== 0; guard++) {
      const ai = runAITurn(state, 200);
      expect(ai.error).toBeUndefined();
      state = ai.state;
      const humanResponder = pendingTradeAwaitingHuman(state);
      if (humanResponder !== null) {
        state = act(state, { type: 'rejectTrade', playerId: humanResponder });
      }
    }

    expect(currentPlayer(state).id).toBe(0);
    expect(state.phase).toBe('roll');
    expect(state.turn).toBeGreaterThan(rolled.turn);
  });

  it('mantiene una oferta pendiente ante un humano y la resuelve al aceptarla', () => {
    let state = finishSetup(localGame(2, 'INTEGRACION-TRADE'));
    state = structuredClone(state);
    state.phase = 'action';
    state.currentPlayerIndex = 0;
    state.players[0]!.resources = { wood: 2, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { wood: 0, clay: 2, wool: 0, wheat: 0, ore: 0 };
    const proposed = applyAction(state, {
      type: 'proposeTrade',
      playerId: 0,
      toPlayerId: 1,
      give: { wood: 1 },
      receive: { clay: 1 }
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.state.pendingTrade).not.toBeNull();
    const accepted = applyAction(proposed.state, { type: 'acceptTrade', playerId: 1 });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.state.pendingTrade).toBeNull();
    expect(accepted.state.players[0]!.resources.wood).toBe(1);
    expect(accepted.state.players[0]!.resources.clay).toBe(1);
  });

  it('no bloquea una oferta dirigida a todos con un humano y una IA pendientes', () => {
    let state = finishSetup(localGame(2, 'INTEGRACION-TRADE-ALL'));
    state = structuredClone(state);
    state.phase = 'action';
    state.currentPlayerIndex = 0;
    state.players[0]!.resources = { wood: 2, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { wood: 0, clay: 2, wool: 0, wheat: 0, ore: 0 };
    state.pendingTrade = {
      id: 'trade-all',
      fromPlayerId: 0,
      toPlayerId: 'all',
      give: { wood: 1, clay: 0, wool: 0, wheat: 0, ore: 0 },
      receive: { wood: 0, clay: 1, wool: 0, wheat: 0, ore: 0 },
      rejectedBy: []
    };
    expect(pendingTradeAwaitingHuman(state)).toBe(1);
    expect(pendingAITradeResponder(state)).toBe(2);
    const ai = runAITurn(state, 20);
    expect(ai.error).toBeUndefined();
    expect(ai.actions).toHaveLength(0);
    const accepted = applyAction(state, { type: 'acceptTrade', playerId: 1 });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.state.pendingTrade).toBeNull();
    expect(accepted.state.players[0]!.resources.wood).toBe(1);
    expect(accepted.state.players[0]!.resources.clay).toBe(1);
  });

  it('exporta, valida e importa una partida avanzada sin perder estado', () => {
    const setup = finishSetup(newGame({ seed: 'INTEGRACION-SAVE' }));
    const rolled = findRollState(setup, 6).state;
    const imported = deserializeState(serializeState(rolled));
    expect(imported.ok).toBe(true);
    expect(imported.state).toEqual(rolled);
  });
});
