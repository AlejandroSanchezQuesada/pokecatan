import { ABILITIES, ACTIVE_POKEMON_LIMIT, getSpecies } from './data';
import type { AbilityDefinition, PokemonSpecies } from './data';
import type { GameState, Hex, OwnedPokemon, PlayerState, ResourceBag } from './types';
import { canAfford, findPlayer } from './state';

export function wildHexesForPlayer(state: GameState, playerId: number): Hex[] {
  const player = findPlayer(state, playerId);
  if (!player) return [];
  const buildings = [...player.settlements, ...player.cities];
  return state.board.hexes.filter((hex) => {
    if (!hex.wildPokemonId) return false;
    return hex.vertexIds.some((vertexId) => buildings.includes(vertexId));
  });
}

export function captureTargets(state: GameState, playerId: number): string[] {
  return wildHexesForPlayer(state, playerId).map((h) => h.id);
}

export function captureCostFor(state: GameState, hexId: string): Partial<ResourceBag> | null {
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex || !hex.wildPokemonId) return null;
  return getSpecies(hex.wildPokemonId).captureCost;
}

export function canCapture(state: GameState, playerId: number, hexId: string): string | null {
  const player = findPlayer(state, playerId);
  if (!player) return 'Jugador desconocido';
  if (player.flags.captureUsedThisTurn) return 'Solo puedes capturar un Pokémon por turno';
  if (player.pokemon.length >= ACTIVE_POKEMON_LIMIT) return `Límite de ${ACTIVE_POKEMON_LIMIT} Pokémon activos alcanzado`;
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) return 'Hexágono desconocido';
  if (!hex.wildPokemonId) return 'No hay ningún Pokémon salvaje en ese hexágono';
  const buildings = [...player.settlements, ...player.cities];
  if (!hex.vertexIds.some((v) => buildings.includes(v))) return 'Necesitas un poblado o ciudad junto a ese bioma';
  const cost = getSpecies(hex.wildPokemonId).captureCost;
  if (player.flags.freeCaptures <= 0 && !canAfford(player.resources, cost)) return 'No tienes recursos suficientes para la captura';
  return null;
}

export function canEvolve(state: GameState, playerId: number, instanceId: string): string | null {
  const player = findPlayer(state, playerId);
  if (!player) return 'Jugador desconocido';
  if (player.flags.evolveUsedThisTurn) return 'Solo puedes evolucionar un Pokémon por turno';
  const pokemon = player.pokemon.find((p) => p.instanceId === instanceId);
  if (!pokemon) return 'Ese Pokémon no te pertenece';
  const species = getSpecies(pokemon.speciesId);
  if (!species.evolvesTo) return `${species.name} no tiene evolución disponible`;
  const target = getSpecies(species.evolvesTo);
  if (player.flags.freeEvolutions <= 0 && (!species.evolutionCost || !canAfford(player.resources, species.evolutionCost))) {
    return 'No tienes recursos suficientes para evolucionar';
  }
  if (player.pokemon.some((p) => p.speciesId === target.id && p.instanceId !== instanceId)) {
    return 'Ya tienes esa especie evolucionada';
  }
  return null;
}

export function evolvablePokemon(player: PlayerState): OwnedPokemon[] {
  return player.pokemon.filter((p) => getSpecies(p.speciesId).evolvesTo !== null);
}

export function abilityForPokemon(species: PokemonSpecies): AbilityDefinition {
  return ABILITIES[species.abilityId];
}

export function availableAbilityPokemon(
  player: PlayerState,
  round: number,
  predicate: (species: PokemonSpecies) => boolean
): OwnedPokemon | undefined {
  return player.pokemon.find((p) => {
    const species = getSpecies(p.speciesId);
    return predicate(species) && p.abilityUsedRound !== round;
  });
}
