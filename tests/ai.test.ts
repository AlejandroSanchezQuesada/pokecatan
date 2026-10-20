import { describe, expect, it } from 'vitest';
import { aiNextAction, pendingAITradeResponder, runAITurn } from '../src/ai';
import { bagTotal, findPlayer, scorePlayer } from '../src/engine/state';
import type { Difficulty } from '../src/engine/types';
import { actionState, finishSetup, makeRich, newGame } from './helpers';

function simulate(difficulty: Difficulty, seed: string) {
  const game = newGame({ difficulty, seed });
  for (const player of game.players) player.isAI = true;
  const result = runAITurn(game, 40000);
  return result;
}

describe('IA y partidas completas', () => {
  it.each<Difficulty>(['easy', 'normal', 'hard'])('termina una partida completa en dificultad %s', (difficulty) => {
    const result = simulate(difficulty, `IA-${difficulty.toUpperCase()}-1`);
    expect(result.error).toBeUndefined();
    expect(result.actions.length).toBeGreaterThan(100);
    expect(result.state.phase).toBe('ended');
    expect(result.state.winnerId).not.toBeNull();
    const winner = findPlayer(result.state, result.state.winnerId!);
    expect(winner).toBeDefined();
    expect(scorePlayer(result.state, result.state.winnerId!, true)).toBeGreaterThanOrEqual(10);
    for (const player of result.state.players) {
      for (const amount of Object.values(player.resources)) expect(amount).toBeGreaterThanOrEqual(0);
      expect(player.settlements.length).toBeLessThanOrEqual(5);
      expect(player.cities.length).toBeLessThanOrEqual(4);
      expect(player.roads.length).toBeLessThanOrEqual(15);
      expect(player.pokemon.length).toBeLessThanOrEqual(3);
    }
    expect(bagTotal(result.state.bank)).toBeGreaterThanOrEqual(0);
  });

  it('no deja bloqueos cuando una oferta espera respuesta de una IA', () => {
    let state = newGame({ seed: 'IA-TRADE-1' });
    state.players[0]!.isAI = true;
    const first = state.players[0]!;
    const second = state.players[1]!;
    first.resources = { wood: 2, clay: 0, wool: 0, wheat: 0, ore: 0 };
    second.resources = { wood: 0, clay: 2, wool: 0, wheat: 0, ore: 0 };
    state = structuredClone(state);
    state.phase = 'action';
    state.currentPlayerIndex = 0;
    state.pendingTrade = {
      id: 'trade-test',
      fromPlayerId: first.id,
      toPlayerId: second.id,
      give: { wood: 1, clay: 0, wool: 0, wheat: 0, ore: 0 },
      receive: { wood: 0, clay: 1, wool: 0, wheat: 0, ore: 0 },
      rejectedBy: []
    };
    expect(pendingAITradeResponder(state)).toBe(second.id);
    const result = runAITurn(state, 20);
    expect(result.error).toBeUndefined();
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.state.pendingTrade).toBeNull();
  });

  it('distingue de forma medible una dificultad que comete errores estratégicos', () => {
    const base = makeRich(actionState(finishSetup(newGame({ seed: 'IA-DIFF-1' }))), 0);
    const prematureEnds: Record<'easy' | 'hard', number> = { easy: 0, hard: 0 };
    for (const difficulty of ['easy', 'hard'] as const) {
      const trial = structuredClone(base);
      trial.players[0]!.difficulty = difficulty;
      trial.players[0]!.isAI = true;
      for (let i = 0; i < 400; i++) {
        trial.seed = `IA-DIFF-${difficulty}-${i}`;
        if (aiNextAction(trial)?.type === 'endTurn') prematureEnds[difficulty]++;
      }
    }
    expect(prematureEnds.easy).toBeGreaterThan(5);
    expect(prematureEnds.hard).toBe(0);
  });
});
