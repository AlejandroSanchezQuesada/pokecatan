import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { ABILITIES, POKEMON_CATALOG, getSpecies } from '../src/engine/data';
import { canCapture, canEvolve } from '../src/engine/pokemon';
import { tradeRatioFor } from '../src/engine/state';
import { findRollState } from './helpers';
import { act, attempt, clearBoardBuildings, finishSetup, give, makeRich, newGame } from './helpers';
import type { GameState, OwnedPokemon } from '../src/engine/types';

function ready(seed = 'POKE-1'): GameState {
  const state = makeRich(finishSetup(newGame({ seed })), 0);
  state.phase = 'action';
  state.bank = { wood: 19, clay: 19, wool: 19, wheat: 19, ore: 19 };
  return state;
}

let monCounter = 0;
function addMon(state: GameState, playerId: number, speciesId: number): { state: GameState; mon: OwnedPokemon } {
  const next = structuredClone(state);
  const mon: OwnedPokemon = {
    instanceId: `mon-${monCounter++}`,
    speciesId,
    capturedOnTurn: 1,
    abilityUsedRound: 0
  };
  next.players.find((p) => p.id === playerId)!.pokemon.push(mon);
  return { state: next, mon };
}

function wildHexWithVertex(state: GameState): { hexId: string; vertexId: string } {
  const hex = state.board.hexes.find((h) => h.wildPokemonId !== null)!;
  const vertex = state.board.vertices.find((v) => v.hexIds.includes(hex.id))!;
  return { hexId: hex.id, vertexId: vertex.id };
}

describe('captura de Pokémon', () => {
  it('captura en un bioma junto a una construcción propia y paga el coste', () => {
    let state = ready();
    const { hexId, vertexId } = wildHexWithVertex(state);
    const hex = state.board.hexes.find((h) => h.id === hexId)!;
    const species = getSpecies(hex.wildPokemonId!);
    state.players[0]!.settlements = [vertexId];
    state.players[0]!.resources = { wood: 10, clay: 10, wool: 10, wheat: 10, ore: 10 };
    state = act(state, { type: 'capturePokemon', playerId: 0, hexId });
    expect(state.players[0]!.pokemon).toHaveLength(1);
    expect(state.players[0]!.pokemon[0]!.speciesId).toBe(species.id);
    expect(state.board.hexes.find((h) => h.id === hexId)!.wildPokemonId).toBeNull();
    expect(state.players[0]!.resources.wheat).toBe(10 - (species.captureCost.wheat ?? 0));
    expect(state.players[0]!.resources.wood).toBe(10 - (species.captureCost.wood ?? 0));
    expect(state.players[0]!.flags.captureUsedThisTurn).toBe(true);
    expect(state.stats.captures).toBe(1);
  });

  it('solo permite una captura por turno y como máximo tres Pokémon activos', () => {
    let state = ready();
    const first = wildHexWithVertex(state);
    const second = state.board.hexes.find((h) => h.wildPokemonId !== null && h.id !== first.hexId)!;
    const secondVertex = state.board.vertices.find((v) => v.hexIds.includes(second.id))!;
    state.players[0]!.settlements = [first.vertexId, secondVertex.id];
    state = act(state, { type: 'capturePokemon', playerId: 0, hexId: first.hexId });
    expect(attempt(state, { type: 'capturePokemon', playerId: 0, hexId: second.id }).ok).toBe(false);
    state.players[0]!.flags.captureUsedThisTurn = false;
    for (const species of POKEMON_CATALOG.filter((p) => p.stage === 1).slice(0, 2)) {
      state = addMon(state, 0, species.id).state;
    }
    expect(canCapture(state, 0, second.id)).toContain('Límite');
  });

  it('rechaza capturas sin construcción adyacente, sin recursos o en hexágono vacío', () => {
    let state = ready();
    const { hexId, vertexId } = wildHexWithVertex(state);
    state.players[0]!.settlements = [];
    expect(canCapture(state, 0, hexId)).toContain('poblado o ciudad');
    state.players[0]!.settlements = [vertexId];
    state.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(canCapture(state, 0, hexId)).toContain('recursos');
    state.players[0]!.resources = { wood: 5, clay: 5, wool: 5, wheat: 5, ore: 5 };
    state = act(state, { type: 'capturePokemon', playerId: 0, hexId });
    expect(attempt(state, { type: 'capturePokemon', playerId: 0, hexId }).ok).toBe(false);
  });

  it('la Poké Ball permite una captura gratuita', () => {
    let state = ready();
    const { hexId, vertexId } = wildHexWithVertex(state);
    state.players[0]!.settlements = [vertexId];
    state.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[0]!.devCards.push({ id: 'ball', type: 'pokeBall', boughtOnTurn: 0, played: false });
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: 'ball' });
    expect(state.players[0]!.flags.freeCaptures).toBe(1);
    state = act(state, { type: 'capturePokemon', playerId: 0, hexId });
    expect(state.players[0]!.pokemon).toHaveLength(1);
    expect(state.players[0]!.resources).toEqual({ wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 });
  });

  it('no captura Pokémon de otros jugadores ni el mismo dos veces', () => {
    let state = ready();
    const { hexId, vertexId } = wildHexWithVertex(state);
    state.players[0]!.settlements = [vertexId];
    state.players[0]!.resources = { wood: 10, clay: 10, wool: 10, wheat: 10, ore: 10 };
    state = act(state, { type: 'capturePokemon', playerId: 0, hexId });
    expect(attempt(state, { type: 'capturePokemon', playerId: 1, hexId }).ok).toBe(false);
    expect(attempt(state, { type: 'capturePokemon', playerId: 0, hexId }).ok).toBe(false);
  });
});

describe('evolución', () => {
  it('evoluciona pagando el coste y reemplaza la especie', () => {
    let state = ready();
    const added = addMon(state, 0, 1);
    state = added.state;
    state.players[0]!.resources = { wood: 10, clay: 10, wool: 10, wheat: 10, ore: 10 };
    state = act(state, { type: 'evolvePokemon', playerId: 0, instanceId: added.mon.instanceId });
    expect(state.players[0]!.pokemon[0]!.speciesId).toBe(2);
    expect(state.players[0]!.resources.wheat).toBe(8);
    expect(state.players[0]!.resources.ore).toBe(9);
    expect(state.players[0]!.flags.evolveUsedThisTurn).toBe(true);
    expect(attempt(state, { type: 'evolvePokemon', playerId: 0, instanceId: added.mon.instanceId }).ok).toBe(false);
  });

  it('rechaza evoluciones ilegales, sin recursos o duplicadas', () => {
    let state = ready();
    const stage3 = addMon(state, 0, 3);
    state = stage3.state;
    expect(canEvolve(state, 0, stage3.mon.instanceId)).toContain('no tiene evolución');

    const noResources = addMon(ready(), 0, 1);
    let without = noResources.state;
    without.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(canEvolve(without, 0, noResources.mon.instanceId)).toContain('recursos');

    let duplicated = addMon(ready(), 0, 1);
    duplicated = addMon(duplicated.state, 0, 2);
    const evolved = addMon(duplicated.state, 0, 3);
    expect(canEvolve(evolved.state, 0, duplicated.mon.instanceId)).toContain('Ya tienes');
  });

  it('la Piedra Evolutiva permite evolucionar gratis', () => {
    let state = addMon(ready(), 0, 1).state;
    const mon = state.players[0]!.pokemon[0]!;
    state.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[0]!.devCards.push({ id: 'stone', type: 'evolutionStone', boughtOnTurn: 0, played: false });
    state = act(state, { type: 'playDevCard', playerId: 0, cardId: 'stone' });
    state = act(state, { type: 'evolvePokemon', playerId: 0, instanceId: mon.instanceId });
    expect(state.players[0]!.pokemon[0]!.speciesId).toBe(2);
    expect(state.players[0]!.resources).toEqual({ wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 });
  });

  it('no permite jugar la Piedra Evolutiva si todos los objetivos ya están activos', () => {
    let state = ready();
    state = addMon(state, 0, 1).state;
    state = addMon(state, 0, 2).state;
    state = addMon(state, 0, 3).state;
    state.players[0]!.devCards.push({ id: 'stone-dup', type: 'evolutionStone', boughtOnTurn: 0, played: false });
    expect(attempt(state, { type: 'playDevCard', playerId: 0, cardId: 'stone-dup' }).ok).toBe(false);
  });
});

describe('habilidades Pokémon', () => {
  it('las habilidades de recursos se limitan a una vez por ronda', () => {
    let state = addMon(ready(), 0, 1).state;
    const mon = state.players[0]!.pokemon[0]!;
    state.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    const before = state.bank.wheat;
    state = act(state, { type: 'useAbility', playerId: 0, instanceId: mon.instanceId });
    expect(state.players[0]!.resources.wheat).toBe(1);
    expect(state.bank.wheat).toBe(before - 1);
    expect(attempt(state, { type: 'useAbility', playerId: 0, instanceId: mon.instanceId }).ok).toBe(false);
    state.round += 1;
    state = act(state, { type: 'useAbility', playerId: 0, instanceId: mon.instanceId });
    expect(state.players[0]!.resources.wheat).toBe(2);
  });

  it('no concede recursos si el banco no los tiene', () => {
    let state = addMon(ready(), 0, 1).state;
    const mon = state.players[0]!.pokemon[0]!;
    state.bank.wheat = 0;
    expect(attempt(state, { type: 'useAbility', playerId: 0, instanceId: mon.instanceId }).ok).toBe(false);
  });

  it('Viento comercial mejora un intercambio a 2:1 por ronda', () => {
    let state = addMon(ready(), 0, 52).state;
    const mon = state.players[0]!.pokemon[0]!;
    state.players[0]!.settlements = [];
    state.players[0]!.cities = [];
    state.players[0]!.resources = { wood: 2, clay: 0, wool: 0, wheat: 0, ore: 0 };
    expect(tradeRatioFor(state, 0, 'wood').ratio).toBe(2);
    state = act(state, { type: 'bankTrade', playerId: 0, give: 'wood', receive: 'ore' });
    expect(state.players[0]!.resources.ore).toBe(1);
    expect(state.players[0]!.pokemon[0]!.abilityUsedRound).toBe(state.round);
    expect(tradeRatioFor(state, 0, 'wood').ratio).toBe(4);
    expect(mon.instanceId).toBe(state.players[0]!.pokemon[0]!.instanceId);
  });

  it('Madriguera reduce una arcilla y Constructor una madera', () => {
    let state = addMon(ready(), 0, 50).state;
    state.players[0]!.resources = { wood: 10, clay: 0, wool: 10, wheat: 10, ore: 10 };
    const player = state.players[0]!;
    const edge = state.board.edges.find(
      (e) =>
        !state.players.some((p) => p.roads.includes(e.id)) &&
        e.vertexIds.some((v) => player.settlements.includes(v) || player.cities.includes(v)) &&
        e.vertexIds.every((v) => {
          const owner = state.players.find((p) => p.settlements.includes(v) || p.cities.includes(v));
          return !owner || owner.id === 0;
        })
    )!;
    state = act(state, { type: 'buildRoad', playerId: 0, edgeId: edge.id });
    expect(state.players[0]!.resources.clay).toBe(0);
    expect(state.players[0]!.pokemon[0]!.abilityUsedRound).toBe(state.round);

    let builder = addMon(ready('BUILD-POKE'), 0, 66).state;
    builder.players[0]!.resources = { wood: 0, clay: 10, wool: 10, wheat: 10, ore: 10 };
    const target = builder.board.vertices.find((v) => {
      if (builder.players.some((p) => p.settlements.includes(v.id) || p.cities.includes(v.id))) return false;
      if (!builder.players[0]!.roads.some((e) => builder.board.edges.find((edge) => edge.id === e)?.vertexIds.includes(v.id))) return false;
      return !v.edgeIds.some((edgeId) => {
        const e = builder.board.edges.find((edge) => edge.id === edgeId)!;
        const other = e.vertexIds[0] === v.id ? e.vertexIds[1] : e.vertexIds[0];
        return builder.players.some((p) => p.settlements.includes(other) || p.cities.includes(other));
      });
    });
    if (target) {
      builder = act(builder, { type: 'buildSettlement', playerId: 0, vertexId: target.id });
      expect(builder.players[0]!.resources.wood).toBe(0);
    }
  });

  it('Fortaleza abarata la ciudad una vez por ronda', () => {
    let state = addMon(ready('FORT'), 0, 74).state;
    const settlement = state.players[0]!.settlements[0]!;
    state.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 2, ore: 2 };
    state = act(state, { type: 'buildCity', playerId: 0, vertexId: settlement });
    expect(state.players[0]!.cities).toContain(settlement);
    expect(state.players[0]!.resources.ore).toBe(0);
  });

  it('Fotosíntesis da 1 trigo extra al producir trigo', () => {
    let state = clearBoardBuildings(finishSetup(newGame({ seed: 'PHOTO' })));
    state = addMon(state, 0, 43).state;
    const wheatHex = state.board.hexes.find((h) => h.terrain === 'wheat' && h.number !== null)!;
    const vertex = state.board.vertices.find((v) => v.hexIds.includes(wheatHex.id))!;
    state.players[0]!.settlements = [vertex.id];
    state.phase = 'roll';
    const rolled = findRollState(state, wheatHex.number!);
    expect(rolled.state.players[0]!.resources.wheat).toBe(2);
    expect(rolled.state.players[0]!.pokemon[0]!.abilityUsedRound).toBe(rolled.state.round);
  });

  it('Ráfaga bloquea el primer robo de la ronda', () => {
    const base = clearBoardBuildings(finishSetup(newGame({ seed: 'GUST' })));
    const targetHex = base.board.hexes.find((h) => h.id !== base.robberHexId)!;
    const vertex = base.board.vertices.find((v) => v.hexIds.includes(targetHex.id))!;
    let state = addMon(base, 1, 16).state;
    state.phase = 'robber';
    state.pendingRobber = { playerId: 0, returnPhase: 'action' };
    state.players[1]!.settlements = [vertex.id];
    state.players[0]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1]!.resources = { wood: 0, clay: 0, wool: 0, wheat: 3, ore: 0 };
    const after = act(state, { type: 'moveRobber', playerId: 0, hexId: targetHex.id, stealFromPlayerId: 1 });
    expect(after.players[0]!.resources.wheat).toBe(0);
    expect(after.players[1]!.resources.wheat).toBe(3);
    expect(after.players[1]!.pokemon[0]!.abilityUsedRound).toBe(after.round);
  });

  it('las reglas son idénticas para humanos e IA', () => {
    const state = addMon(ready(), 1, 1).state;
    const mon = state.players[1]!.pokemon[0]!;
    state.players[1]!.isAI = true;
    state.currentPlayerIndex = 1;
    const after = act(state, { type: 'useAbility', playerId: 1, instanceId: mon.instanceId });
    expect(after.players[1]!.resources.wheat).toBe(1);
    expect(ABILITIES.harvest.timing).toBe('turn');
  });
});
