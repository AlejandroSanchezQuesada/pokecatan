export type Resource = 'wood' | 'clay' | 'wool' | 'wheat' | 'ore';
export type Terrain = Resource | 'desert';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameMode = 'solo' | 'local';
export type Phase = 'setup' | 'roll' | 'discard' | 'robber' | 'action' | 'ended';

export const RESOURCES: readonly Resource[] = ['wood', 'clay', 'wool', 'wheat', 'ore'] as const;

export type ResourceBag = Record<Resource, number>;

export interface Hex {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  number: number | null;
  vertexIds: string[];
  edgeIds: string[];
  wildPokemonId: number | null;
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  hexIds: string[];
  edgeIds: string[];
  portId: string | null;
}

export interface Edge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  vertexIds: [string, string];
  hexIds: string[];
  portId: string | null;
}

export interface Port {
  id: string;
  edgeId: string;
  type: Resource | 'generic';
  ratio: 2 | 3;
}

export interface Board {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
  radius: number;
}

export type DevCardType =
  | 'knight'
  | 'victory'
  | 'roadBuilding'
  | 'yearOfPlenty'
  | 'monopoly'
  | 'pokeBall'
  | 'berry'
  | 'evolutionStone';

export interface DevCard {
  id: string;
  type: DevCardType;
  boughtOnTurn: number;
  played: boolean;
}

export interface OwnedPokemon {
  instanceId: string;
  speciesId: number;
  capturedOnTurn: number;
  abilityUsedRound: number;
}

export interface PlayerFlags {
  devCardPlayedThisTurn: boolean;
  captureUsedThisTurn: boolean;
  evolveUsedThisTurn: boolean;
  freeRoads: number;
  freeCaptures: number;
  freeEvolutions: number;
  discountRoadClay: number;
  discountSettlementWood: number;
  discountCityOre: number;
  tradeWindReady: boolean;
  stealShield: number;
  tradeProposedThisTurn: boolean;
}

export interface PlayerState {
  id: number;
  name: string;
  color: string;
  isAI: boolean;
  difficulty: Difficulty;
  resources: ResourceBag;
  devCards: DevCard[];
  knightsPlayed: number;
  roads: string[];
  settlements: string[];
  cities: string[];
  pokemon: OwnedPokemon[];
  flags: PlayerFlags;
}

export interface SetupState {
  round: 1 | 2;
  turnIndex: number;
  awaiting: 'settlement' | 'road';
  lastSettlementVertex: string | null;
}

export interface PendingTrade {
  id: string;
  fromPlayerId: number;
  toPlayerId: number | 'all';
  give: ResourceBag;
  receive: ResourceBag;
  rejectedBy: number[];
}

export interface GameEvent {
  id: number;
  turn: number;
  type: string;
  message: string;
  playerId?: number;
}

export interface Awards {
  longestRoad: number | null;
  largestArmy: number | null;
}

export interface GameStats {
  rolls: number;
  turnsPlayed: number;
  captures: number;
  evolutions: number;
  devCardsPlayed: number;
  cardSeq: number;
  tradeSeq: number;
}

export interface GameState {
  schemaVersion: 1;
  gameId: string;
  gameName: string;
  seed: string;
  rngState: number;
  createdAt: string;
  updatedAt: string;
  mode: GameMode;
  difficulty: Difficulty;
  turn: number;
  round: number;
  currentPlayerIndex: number;
  phase: Phase;
  setup: SetupState;
  board: Board;
  robberHexId: string;
  bank: ResourceBag;
  players: PlayerState[];
  devDeck: DevCardType[];
  discardsRequired: Record<number, number>;
  eventLog: GameEvent[];
  awards: Awards;
  winnerId: number | null;
  lastDice: [number, number] | null;
  pendingTrade: PendingTrade | null;
  pendingRobber: { playerId: number; returnPhase: 'action' } | null;
  stats: GameStats;
}

export type GameAction =
  | { type: 'setupSettlement'; playerId: number; vertexId: string }
  | { type: 'setupRoad'; playerId: number; edgeId: string }
  | { type: 'rollDice'; playerId: number }
  | { type: 'discard'; playerId: number; resources: Partial<ResourceBag> }
  | { type: 'moveRobber'; playerId: number; hexId: string; stealFromPlayerId?: number | null }
  | { type: 'buildRoad'; playerId: number; edgeId: string }
  | { type: 'buildSettlement'; playerId: number; vertexId: string }
  | { type: 'buildCity'; playerId: number; vertexId: string }
  | { type: 'buyDevCard'; playerId: number }
  | { type: 'playDevCard'; playerId: number; cardId: string; params?: { resources?: Resource[]; resource?: Resource } }
  | { type: 'bankTrade'; playerId: number; give: Resource; receive: Resource }
  | { type: 'proposeTrade'; playerId: number; toPlayerId: number | 'all'; give: Partial<ResourceBag>; receive: Partial<ResourceBag> }
  | { type: 'acceptTrade'; playerId: number }
  | { type: 'rejectTrade'; playerId: number }
  | { type: 'counterTrade'; playerId: number; give: Partial<ResourceBag>; receive: Partial<ResourceBag> }
  | { type: 'capturePokemon'; playerId: number; hexId: string }
  | { type: 'evolvePokemon'; playerId: number; instanceId: string }
  | { type: 'useAbility'; playerId: number; instanceId: string }
  | { type: 'endTurn'; playerId: number };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };

export interface NewGameOptions {
  mode: GameMode;
  difficulty: Difficulty;
  seed?: string;
  gameName?: string;
  humanPlayers: number;
  playerName?: string;
}
