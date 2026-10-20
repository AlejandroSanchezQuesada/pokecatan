import type { DevCardType, Difficulty, Resource, ResourceBag, Terrain } from './types';

export const RESOURCE_INFO: Record<Resource, { name: string; short: string; color: string; terrain: string }> = {
  wood: { name: 'Madera', short: 'MAD', color: '#1f6f43', terrain: 'Bosque' },
  clay: { name: 'Arcilla', short: 'ARC', color: '#a3542c', terrain: 'Colina' },
  wool: { name: 'Lana', short: 'LAN', color: '#8a9a5b', terrain: 'Pasto' },
  wheat: { name: 'Trigo', short: 'TRI', color: '#c9a227', terrain: 'Campo' },
  ore: { name: 'Mineral', short: 'MIN', color: '#6d6f7a', terrain: 'Montaña' }
};

export const TERRAIN_INFO: Record<Terrain, { name: string; color: string; dark: string }> = {
  wood: { name: 'Bosque', color: '#2f7d4f', dark: '#1d5233' },
  clay: { name: 'Colina', color: '#b05f31', dark: '#7a3f1f' },
  wool: { name: 'Pasto', color: '#9aae64', dark: '#6c7c41' },
  wheat: { name: 'Campo', color: '#d6b23c', dark: '#9d7f1f' },
  ore: { name: 'Montaña', color: '#7b7d88', dark: '#545661' },
  desert: { name: 'Desierto', color: '#d9c08a', dark: '#a88d55' }
};

export const PLAYER_COLORS = ['#e4572e', '#2e86ab', '#7b2cbf', '#2a9d8f'];

export const BUILD_COSTS = {
  road: { wood: 1, clay: 1 },
  settlement: { wood: 1, clay: 1, wool: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { wool: 1, wheat: 1, ore: 1 }
} satisfies Record<string, Partial<ResourceBag>>;

export const PIECE_LIMITS = { roads: 15, settlements: 5, cities: 4 } as const;
export const ACTIVE_POKEMON_LIMIT = 3;
export const VICTORY_POINTS = 10;
export const MAP_RADIUS = 2;
export const STARTING_BANK = 19;

export const DEV_CARD_INFO: Record<DevCardType, { name: string; description: string; count: number; classic: boolean }> = {
  knight: {
    name: 'Caballero Pokémon',
    description: 'Mueve al ladrón y roba 1 recurso. Cuenta para el Ejército más grande.',
    count: 14,
    classic: true
  },
  victory: {
    name: 'Punto de victoria',
    description: 'Vale 1 punto de victoria. Se revela al final de la partida.',
    count: 5,
    classic: true
  },
  roadBuilding: {
    name: 'Construcción de carreteras',
    description: 'Coloca 2 carreteras gratuitas.',
    count: 2,
    classic: true
  },
  yearOfPlenty: {
    name: 'Año de abundancia',
    description: 'Toma 2 recursos cualesquiera del banco.',
    count: 2,
    classic: true
  },
  monopoly: {
    name: 'Monopolio',
    description: 'Toma todos los recursos de un tipo de los demás jugadores.',
    count: 2,
    classic: true
  },
  pokeBall: {
    name: 'Poké Ball',
    description: 'Captura un Pokémon salvaje sin pagar recursos.',
    count: 2,
    classic: false
  },
  berry: {
    name: 'Baya Arcoíris',
    description: 'Toma 1 recurso cualesquiera del banco.',
    count: 2,
    classic: false
  },
  evolutionStone: {
    name: 'Piedra Evolutiva',
    description: 'Evoluciona un Pokémon sin pagar recursos.',
    count: 2,
    classic: false
  }
};

export function buildDevDeck(): DevCardType[] {
  const deck: DevCardType[] = [];
  for (const [type, info] of Object.entries(DEV_CARD_INFO) as [DevCardType, typeof DEV_CARD_INFO[DevCardType]][]) {
    for (let i = 0; i < info.count; i++) deck.push(type);
  }
  return deck;
}

export type AbilityEffect =
  | { kind: 'gain'; resource: Resource }
  | { kind: 'productionBonus'; resource: Resource }
  | { kind: 'discountRoad'; resource: Resource; amount: number }
  | { kind: 'discountSettlement'; resource: Resource; amount: number }
  | { kind: 'discountCity'; resource: Resource; amount: number }
  | { kind: 'bankTrade2' }
  | { kind: 'stealShield' };

export type AbilityId =
  | 'harvest'
  | 'blaze'
  | 'charge'
  | 'spark'
  | 'burrow'
  | 'builder'
  | 'fortify'
  | 'tradeWind'
  | 'gust'
  | 'photosynthesis';

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  description: string;
  effect: AbilityEffect;
  frequency: 'perRound' | 'passive';
  timing: 'turn' | 'production' | 'robbery';
}

export const ABILITIES: Record<AbilityId, AbilityDefinition> = {
  harvest: {
    id: 'harvest',
    name: 'Síntesis',
    description: 'Una vez por ronda, obtén 1 trigo del banco.',
    effect: { kind: 'gain', resource: 'wheat' },
    frequency: 'perRound',
    timing: 'turn'
  },
  blaze: {
    id: 'blaze',
    name: 'Llama',
    description: 'Una vez por ronda, obtén 1 mineral del banco.',
    effect: { kind: 'gain', resource: 'ore' },
    frequency: 'perRound',
    timing: 'turn'
  },
  charge: {
    id: 'charge',
    name: 'Carga lanuda',
    description: 'Una vez por ronda, obtén 1 lana del banco.',
    effect: { kind: 'gain', resource: 'wool' },
    frequency: 'perRound',
    timing: 'turn'
  },
  spark: {
    id: 'spark',
    name: 'Chispa',
    description: 'Una vez por ronda, obtén 1 mineral del banco.',
    effect: { kind: 'gain', resource: 'ore' },
    frequency: 'perRound',
    timing: 'turn'
  },
  burrow: {
    id: 'burrow',
    name: 'Madriguera',
    description: 'Una vez por ronda, la siguiente carretera cuesta 1 arcilla menos (mínimo 0).',
    effect: { kind: 'discountRoad', resource: 'clay', amount: 1 },
    frequency: 'perRound',
    timing: 'turn'
  },
  builder: {
    id: 'builder',
    name: 'Constructor',
    description: 'Una vez por ronda, el siguiente poblado cuesta 1 madera menos (mínimo 0).',
    effect: { kind: 'discountSettlement', resource: 'wood', amount: 1 },
    frequency: 'perRound',
    timing: 'turn'
  },
  fortify: {
    id: 'fortify',
    name: 'Fortaleza',
    description: 'Una vez por ronda, la siguiente ciudad cuesta 1 mineral menos (mínimo 0).',
    effect: { kind: 'discountCity', resource: 'ore', amount: 1 },
    frequency: 'perRound',
    timing: 'turn'
  },
  tradeWind: {
    id: 'tradeWind',
    name: 'Viento comercial',
    description: 'Una vez por ronda, realiza un intercambio con el banco a 2:1.',
    effect: { kind: 'bankTrade2' },
    frequency: 'perRound',
    timing: 'turn'
  },
  gust: {
    id: 'gust',
    name: 'Ráfaga',
    description: 'Bloquea el primer robo del ladrón contra ti en cada ronda.',
    effect: { kind: 'stealShield' },
    frequency: 'passive',
    timing: 'robbery'
  },
  photosynthesis: {
    id: 'photosynthesis',
    name: 'Fotosíntesis',
    description: 'La primera vez por ronda que produces trigo con tus construcciones, obtén 1 trigo extra.',
    effect: { kind: 'productionBonus', resource: 'wheat' },
    frequency: 'perRound',
    timing: 'production'
  }
};

export interface PokemonSpecies {
  id: number;
  name: string;
  types: string[];
  biomes: Terrain[];
  stage: 1 | 2 | 3;
  evolvesTo: number | null;
  abilityId: AbilityId;
  captureCost: Partial<ResourceBag>;
  evolutionCost: Partial<ResourceBag> | null;
}

const stage2Cost: Partial<ResourceBag> = { wheat: 2, ore: 1 };
const stage3Cost: Partial<ResourceBag> = { wheat: 3, ore: 2 };
const forestCapture: Partial<ResourceBag> = { wood: 1, wheat: 1 };
const clayCapture: Partial<ResourceBag> = { clay: 1, wheat: 1 };
const woolCapture: Partial<ResourceBag> = { wool: 1, wheat: 1 };
const wheatCapture: Partial<ResourceBag> = { wheat: 2 };
const oreCapture: Partial<ResourceBag> = { ore: 1, wheat: 1 };
const desertCapture: Partial<ResourceBag> = { clay: 1, wheat: 1 };

export const POKEMON_CATALOG: PokemonSpecies[] = [
  { id: 1, name: 'Bulbasaur', types: ['Planta', 'Veneno'], biomes: ['wood'], stage: 1, evolvesTo: 2, abilityId: 'harvest', captureCost: forestCapture, evolutionCost: stage2Cost },
  { id: 2, name: 'Ivysaur', types: ['Planta', 'Veneno'], biomes: ['wood'], stage: 2, evolvesTo: 3, abilityId: 'harvest', captureCost: forestCapture, evolutionCost: stage3Cost },
  { id: 3, name: 'Venusaur', types: ['Planta', 'Veneno'], biomes: ['wood'], stage: 3, evolvesTo: null, abilityId: 'harvest', captureCost: forestCapture, evolutionCost: null },
  { id: 4, name: 'Charmander', types: ['Fuego'], biomes: ['ore'], stage: 1, evolvesTo: 5, abilityId: 'blaze', captureCost: oreCapture, evolutionCost: stage2Cost },
  { id: 5, name: 'Charmeleon', types: ['Fuego'], biomes: ['ore'], stage: 2, evolvesTo: 6, abilityId: 'blaze', captureCost: oreCapture, evolutionCost: stage3Cost },
  { id: 6, name: 'Charizard', types: ['Fuego', 'Volador'], biomes: ['ore'], stage: 3, evolvesTo: null, abilityId: 'blaze', captureCost: oreCapture, evolutionCost: null },
  { id: 10, name: 'Caterpie', types: ['Bicho'], biomes: ['wood'], stage: 1, evolvesTo: 11, abilityId: 'tradeWind', captureCost: forestCapture, evolutionCost: stage2Cost },
  { id: 11, name: 'Metapod', types: ['Bicho'], biomes: ['wood'], stage: 2, evolvesTo: 12, abilityId: 'tradeWind', captureCost: forestCapture, evolutionCost: stage3Cost },
  { id: 12, name: 'Butterfree', types: ['Bicho', 'Volador'], biomes: ['wood'], stage: 3, evolvesTo: null, abilityId: 'tradeWind', captureCost: forestCapture, evolutionCost: null },
  { id: 16, name: 'Pidgey', types: ['Normal', 'Volador'], biomes: ['wool', 'wood'], stage: 1, evolvesTo: 17, abilityId: 'gust', captureCost: woolCapture, evolutionCost: stage2Cost },
  { id: 17, name: 'Pidgeotto', types: ['Normal', 'Volador'], biomes: ['wool', 'wood'], stage: 2, evolvesTo: 18, abilityId: 'gust', captureCost: woolCapture, evolutionCost: stage3Cost },
  { id: 18, name: 'Pidgeot', types: ['Normal', 'Volador'], biomes: ['wool', 'wood'], stage: 3, evolvesTo: null, abilityId: 'gust', captureCost: woolCapture, evolutionCost: null },
  { id: 25, name: 'Pikachu', types: ['Eléctrico'], biomes: ['wheat'], stage: 1, evolvesTo: 26, abilityId: 'spark', captureCost: wheatCapture, evolutionCost: stage2Cost },
  { id: 26, name: 'Raichu', types: ['Eléctrico'], biomes: ['wheat'], stage: 2, evolvesTo: null, abilityId: 'spark', captureCost: wheatCapture, evolutionCost: null },
  { id: 27, name: 'Sandshrew', types: ['Tierra'], biomes: ['clay', 'desert'], stage: 1, evolvesTo: 28, abilityId: 'burrow', captureCost: clayCapture, evolutionCost: stage2Cost },
  { id: 28, name: 'Sandslash', types: ['Tierra'], biomes: ['clay', 'desert'], stage: 2, evolvesTo: null, abilityId: 'burrow', captureCost: clayCapture, evolutionCost: null },
  { id: 43, name: 'Oddish', types: ['Planta', 'Veneno'], biomes: ['wheat'], stage: 1, evolvesTo: 44, abilityId: 'photosynthesis', captureCost: wheatCapture, evolutionCost: stage2Cost },
  { id: 44, name: 'Gloom', types: ['Planta', 'Veneno'], biomes: ['wheat'], stage: 2, evolvesTo: 45, abilityId: 'photosynthesis', captureCost: wheatCapture, evolutionCost: stage3Cost },
  { id: 45, name: 'Vileplume', types: ['Planta', 'Veneno'], biomes: ['wheat'], stage: 3, evolvesTo: null, abilityId: 'photosynthesis', captureCost: wheatCapture, evolutionCost: null },
  { id: 50, name: 'Diglett', types: ['Tierra'], biomes: ['clay'], stage: 1, evolvesTo: 51, abilityId: 'burrow', captureCost: clayCapture, evolutionCost: stage2Cost },
  { id: 51, name: 'Dugtrio', types: ['Tierra'], biomes: ['clay'], stage: 2, evolvesTo: null, abilityId: 'burrow', captureCost: clayCapture, evolutionCost: null },
  { id: 52, name: 'Meowth', types: ['Normal'], biomes: ['wheat'], stage: 1, evolvesTo: 53, abilityId: 'tradeWind', captureCost: wheatCapture, evolutionCost: stage2Cost },
  { id: 53, name: 'Persian', types: ['Normal'], biomes: ['wheat'], stage: 2, evolvesTo: null, abilityId: 'tradeWind', captureCost: wheatCapture, evolutionCost: null },
  { id: 66, name: 'Machop', types: ['Lucha'], biomes: ['ore'], stage: 1, evolvesTo: 67, abilityId: 'builder', captureCost: oreCapture, evolutionCost: stage2Cost },
  { id: 67, name: 'Machoke', types: ['Lucha'], biomes: ['ore'], stage: 2, evolvesTo: 68, abilityId: 'builder', captureCost: oreCapture, evolutionCost: stage3Cost },
  { id: 68, name: 'Machamp', types: ['Lucha'], biomes: ['ore'], stage: 3, evolvesTo: null, abilityId: 'builder', captureCost: oreCapture, evolutionCost: null },
  { id: 74, name: 'Geodude', types: ['Roca', 'Tierra'], biomes: ['ore'], stage: 1, evolvesTo: 75, abilityId: 'fortify', captureCost: oreCapture, evolutionCost: stage2Cost },
  { id: 75, name: 'Graveler', types: ['Roca', 'Tierra'], biomes: ['ore'], stage: 2, evolvesTo: 76, abilityId: 'fortify', captureCost: oreCapture, evolutionCost: stage3Cost },
  { id: 76, name: 'Golem', types: ['Roca', 'Tierra'], biomes: ['ore'], stage: 3, evolvesTo: null, abilityId: 'fortify', captureCost: oreCapture, evolutionCost: null },
  { id: 179, name: 'Mareep', types: ['Eléctrico'], biomes: ['wool'], stage: 1, evolvesTo: 180, abilityId: 'charge', captureCost: woolCapture, evolutionCost: stage2Cost },
  { id: 180, name: 'Flaaffy', types: ['Eléctrico'], biomes: ['wool'], stage: 2, evolvesTo: 181, abilityId: 'charge', captureCost: woolCapture, evolutionCost: stage3Cost },
  { id: 181, name: 'Ampharos', types: ['Eléctrico'], biomes: ['wool'], stage: 3, evolvesTo: null, abilityId: 'charge', captureCost: woolCapture, evolutionCost: null },
  { id: 241, name: 'Miltank', types: ['Normal'], biomes: ['wool'], stage: 1, evolvesTo: null, abilityId: 'charge', captureCost: woolCapture, evolutionCost: null },
  { id: 331, name: 'Cacnea', types: ['Planta'], biomes: ['desert'], stage: 1, evolvesTo: 332, abilityId: 'gust', captureCost: desertCapture, evolutionCost: stage2Cost },
  { id: 332, name: 'Cacturne', types: ['Planta', 'Siniestro'], biomes: ['desert'], stage: 2, evolvesTo: null, abilityId: 'gust', captureCost: desertCapture, evolutionCost: null }
];

const SPECIES_BY_ID = new Map<number, PokemonSpecies>(POKEMON_CATALOG.map((p) => [p.id, p]));

export function getSpecies(id: number): PokemonSpecies {
  const species = SPECIES_BY_ID.get(id);
  if (!species) throw new Error(`Pokémon desconocido: ${id}`);
  return species;
}

export function baseSpeciesForTerrain(terrain: Terrain): number[] {
  const preferred = POKEMON_CATALOG.filter((p) => p.stage === 1 && p.biomes.includes(terrain)).map((p) => p.id);
  if (preferred.length > 0) return preferred;
  return POKEMON_CATALOG.filter((p) => p.stage === 1).map((p) => p.id);
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Fácil',
  normal: 'Normal',
  hard: 'Difícil'
};

export const DICE_PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
