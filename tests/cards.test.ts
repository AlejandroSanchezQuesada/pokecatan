import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { DEV_CARD_INFO, buildDevDeck } from '../src/engine/data';
import { act, attempt, finishSetup, makeRich, newGame } from './helpers';
import type { DevCardType, GameState } from '../src/engine/types';

function ready(seed = 'CARD-1'): GameState {
  const state = makeRich(finishSetup(newGame({ seed })), 0);
  state.phase = 'action';
  state.bank = { wood: 19, clay: 19, wool: 19, wheat: 19, ore: 19 };
  return state;
}

let cardCounter = 0;
function withCard(state: GameState, playerId: number, type: DevCardType, boughtOnTurn = 0): GameState {
  const next = structuredClone(state);
  next.players.find((p) => p.id === playerId)!.devCards.push({
    id: `test-${cardCounter++}`,
    type,
    boughtOnTurn,
    played: false
  });
  return next;
}

describe('cartas de desarrollo', () => {
  it('el mazo contiene las 25 cartas clásicas más 6 cartas Pokémon', () => {
    const deck = buildDevDeck();
    expect(deck).toHaveLength(31);
    expect(deck.filter((c) => c === 'knight')).toHaveLength(14);
    expect(deck.filter((c) => c === 'victory')).toHaveLength(5);
    expect(deck.filter((c) => c === 'roadBuilding')).toHaveLength(2);
    expect(deck.filter((c) => c === 'yearOfPlenty')).toHaveLength(2);
    expect(deck.filter((c) => c === 'monopoly')).toHaveLength(2);
    expect(deck.filter((c) => !DEV_CARD_INFO[c].classic)).toHaveLength(6);
  });

  it('compra cartas con el coste clásico y no deja jugarlas en el mismo turno', () => {
    let state = ready();
    state = act(state, { type: 'buyDevCard', playerId: 0 });
    expect(state.players[0]!.devCards).toHaveLength(1);
    expect(state.players[0]!.resources.wool).toBe(9);
    expect(state.players[0]!.resources.wheat).toBe(9);
    expect(state.players[0]!.resources.ore).toBe(9);
    const card = state.players[0]!.devCards[0]!;
    expect(attempt(state, { type: 'playDevCard', playerId: 0, cardId: card.id }).ok).toBe(false);
  });

  it('no roba si el mazo está agotado', () => {
    const state = ready();
    state.devDeck = [];
    expect(attempt(state, { type: 'buyDevCard', playerId: 0 }).ok).toBe(false);
  });

  it('permite jugar una sola carta por turno', () => {
    let state = withCard(ready(), 0, 'berry');
    state = withCard(state, 0, 'berry');
    const cards = state.players[0]!.devCards;
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: cards[0]!.id, params: { resource: 'wood' } });
    expect(attempt(state, { type: 'playDevCard', playerId: 0, cardId: cards[1]!.id, params: { resource: 'wood' } }).ok).toBe(false);
  });

  it('el caballero mueve al ladrón y cuenta para el ejército', () => {
    let state = withCard(ready(), 0, 'knight');
    for (const p of state.players) if (p.id !== 0) p.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    const card = state.players[0]!.devCards[0]!;
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: card.id });
    expect(state.phase).toBe('robber');
    expect(state.players[0]!.knightsPlayed).toBe(1);
    const destination = state.board.hexes.find((h) => h.id !== state.robberHexId)!;
    state = act(state, { type: 'moveRobber', playerId: 0, hexId: destination.id });
    expect(state.phase).toBe('action');
    expect(state.players[0]!.devCards).toHaveLength(0);
  });

  it('otorga el ejército más grande con tres caballeros', () => {
    let state = withCard(ready(), 0, 'knight');
    state.players[0]!.knightsPlayed = 2;
    const card = state.players[0]!.devCards[0]!;
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: card.id });
    expect(state.awards.largestArmy).toBe(0);
    expect(state.players[0]!.knightsPlayed).toBe(3);
  });

  it('año de abundancia toma dos recursos del banco', () => {
    let state = withCard(ready(), 0, 'yearOfPlenty');
    const card = state.players[0]!.devCards[0]!;
    state = act(state, {
      type: 'playDevCard',
      playerId: 0,
      cardId: card.id,
      params: { resources: ['wood', 'wood'] }
    });
    expect(state.players[0]!.resources.wood).toBe(12);
    expect(state.bank.wood).toBe(17);
    expect(attempt(state, { type: 'playDevCard', playerId: 0, cardId: card.id, params: { resources: ['wood'] } }).ok).toBe(false);
  });

  it('monopolio toma todos los recursos elegidos de los rivales', () => {
    let state = withCard(ready(), 0, 'monopoly');
    state.players[1]!.resources.ore = 3;
    state.players[2]!.resources.ore = 2;
    const card = state.players[0]!.devCards[0]!;
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: card.id, params: { resource: 'ore' } });
    expect(state.players[0]!.resources.ore).toBe(15);
    expect(state.players[1]!.resources.ore).toBe(0);
    expect(state.players[2]!.resources.ore).toBe(0);
  });

  it('construcción de carreteras concede dos carreteras gratuitas', () => {
    let state = withCard(ready(), 0, 'roadBuilding');
    const card = state.players[0]!.devCards[0]!;
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: card.id });
    expect(state.players[0]!.flags.freeRoads).toBe(2);
    const player = state.players[0]!;
    const edge = state.board.edges.find((e) => {
      if (state.players.some((p) => p.roads.includes(e.id))) return false;
      return e.vertexIds.some((v) => player.settlements.includes(v) || player.cities.includes(v));
    })!;
    const before = { ...state.players[0]!.resources };
    state = act(state, { type: 'buildRoad', playerId: 0, edgeId: edge.id });
    expect(state.players[0]!.flags.freeRoads).toBe(1);
    expect(state.players[0]!.resources).toEqual(before);
  });

  it('la baya da un recurso y no se puede jugar la carta de punto de victoria', () => {
    let state = withCard(ready(), 0, 'berry');
    const card = state.players[0]!.devCards[0]!;
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: card.id, params: { resource: 'ore' } });
    expect(state.players[0]!.resources.ore).toBe(11);
    const vp = withCard(ready(), 0, 'victory');
    const vpCard = vp.players[0]!.devCards[0]!;
    expect(attempt(vp, { type: 'playDevCard', playerId: 0, cardId: vpCard.id }).ok).toBe(false);
  });

  it('las cartas de punto de victoria se ocultan y cuentan al propietario', async () => {
    const { publicScore, scorePlayer } = await import('../src/engine/state');
    const state = withCard(ready(), 0, 'victory');
    expect(publicScore(state, 0)).toBe(2);
    expect(scorePlayer(state, 0, true)).toBe(3);
  });

  it('no permite jugar cartas de otro jugador', () => {
    const state = withCard(ready(), 1, 'knight');
    const card = state.players[1]!.devCards[0]!;
    expect(applyAction(state, { type: 'playDevCard', playerId: 0, cardId: card.id }).ok).toBe(false);
  });

  it('pierde el ejército más grande si otro jugador supera los caballeros', async () => {
    const { updateAwards } = await import('../src/engine/state');
    const state = ready();
    state.players[0]!.knightsPlayed = 3;
    state.players[1]!.knightsPlayed = 2;
    updateAwards(state);
    expect(state.awards.largestArmy).toBe(0);
    state.players[1]!.knightsPlayed = 4;
    updateAwards(state);
    expect(state.awards.largestArmy).toBe(1);
  });
});
