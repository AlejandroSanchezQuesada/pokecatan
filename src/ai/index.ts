import { applyAction } from '../engine/actions';
import { edgeById, portForVertex, vertexById } from '../engine/board';
import { BUILD_COSTS, DIFFICULTY_LABEL, DICE_PIPS, PIECE_LIMITS, getSpecies } from '../engine/data';
import { canCapture, canEvolve, captureTargets } from '../engine/pokemon';
import {
  bagFromPartial,
  bagTotal,
  canAfford,
  currentPlayer,
  emptyBag,
  findPlayer,
  longestRoadLength,
  publicScore,
  scorePlayer,
  tradeRatioFor,
  validSetupSettlementVertices
} from '../engine/state';
import { makeRng, type Rng } from '../engine/rng';
import type { GameAction, GameState, PlayerState, Resource, ResourceBag } from '../engine/types';
import { RESOURCES } from '../engine/types';

type Difficulty = PlayerState['difficulty'];

export interface AIStep {
  state: GameState;
  action: GameAction | null;
  error?: string;
}

function aiRng(state: GameState, salt: string): Rng {
  return makeRng(`${state.seed}:ai:${state.turn}:${state.eventLog.length}:${salt}`);
}

function currentIsAI(state: GameState): boolean {
  return Boolean(state.players[state.currentPlayerIndex]?.isAI);
}

function tryAction(state: GameState, action: GameAction): GameState | null {
  const result = applyAction(state, action);
  return result.ok ? result.state : null;
}

function vertexPips(state: GameState, vertexId: string): number {
  const vertex = vertexById(state.board, vertexId);
  if (!vertex) return 0;
  let pips = 0;
  for (const hexId of vertex.hexIds) {
    const hex = state.board.hexes.find((h) => h.id === hexId);
    if (!hex || !hex.number || hex.terrain === 'desert') continue;
    pips += DICE_PIPS[hex.number] ?? 0;
  }
  return pips;
}

function vertexDiversity(state: GameState, vertexId: string): number {
  const vertex = vertexById(state.board, vertexId);
  if (!vertex) return 0;
  const resources = new Set<string>();
  for (const hexId of vertex.hexIds) {
    const hex = state.board.hexes.find((h) => h.id === hexId);
    if (hex && hex.terrain !== 'desert') resources.add(hex.terrain);
  }
  return resources.size;
}

function vertexPortBonus(state: GameState, vertexId: string): number {
  const port = portForVertex(state.board, vertexId);
  if (!port) return 0;
  return port.type === 'generic' ? 2 : 3;
}

function setupVertexScore(state: GameState, vertexId: string): number {
  const pips = vertexPips(state, vertexId);
  const diversity = vertexDiversity(state, vertexId);
  const port = vertexPortBonus(state, vertexId);
  const resourceBalance: Record<Resource, number> = { wood: 1, clay: 1, wool: 1, wheat: 1, ore: 1 };
  const vertex = vertexById(state.board, vertexId);
  let production = 0;
  for (const hexId of vertex?.hexIds ?? []) {
    const hex = state.board.hexes.find((h) => h.id === hexId);
    if (hex && hex.number && hex.terrain !== 'desert') {
      production += (DICE_PIPS[hex.number] ?? 0) * resourceBalance[hex.terrain as Resource];
    }
  }
  return pips * 10 + production * 2 + diversity * 12 + port * 8;
}

function setupRoadScore(state: GameState, edgeId: string, playerId: number): number {
  const edge = edgeById(state.board, edgeId);
  const player = findPlayer(state, playerId);
  if (!edge || !player) return 0;
  let best = 0;
  for (const vertexId of edge.vertexIds) {
    if (validSetupSettlementVertices(state).includes(vertexId)) {
      best = Math.max(best, setupVertexScore(state, vertexId));
    }
    const vertex = vertexById(state.board, vertexId);
    for (const hexId of vertex?.hexIds ?? []) {
      const hex = state.board.hexes.find((h) => h.id === hexId);
      if (hex && hex.number && hex.terrain !== 'desert') best += 0.4;
    }
  }
  return best;
}

function chooseSetup(state: GameState): GameAction {
  const player = currentPlayer(state);
  const rng = aiRng(state, 'setup');
  if (state.setup.awaiting === 'settlement') {
    const options = validSetupSettlementVertices(state);
    if (player.difficulty === 'easy') {
      return { type: 'setupSettlement', playerId: player.id, vertexId: rng.pick(options) };
    }
    const scored = options.map((id) => ({ id, score: setupVertexScore(state, id) }));
    scored.sort((a, b) => b.score - a.score);
    const pick = player.difficulty === 'hard' ? scored[0] : scored[Math.min(1, scored.length - 1)];
    return { type: 'setupSettlement', playerId: player.id, vertexId: (pick ?? scored[0] ?? { id: options[0] }).id };
  }
  const last = state.setup.lastSettlementVertex;
  const options = state.board.edges.filter(
    (edge) => last && edge.vertexIds.includes(last) && !state.players.some((p) => p.roads.includes(edge.id))
  );
  if (player.difficulty === 'easy') {
    return { type: 'setupRoad', playerId: player.id, edgeId: rng.pick(options).id };
  }
  const scored = options.map((edge) => ({ edgeId: edge.id, score: setupRoadScore(state, edge.id, player.id) }));
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0];
  return { type: 'setupRoad', playerId: player.id, edgeId: pick?.edgeId ?? options[0]?.id ?? '' };
}

function chooseDiscard(state: GameState, playerId: number): GameAction | null {
  const player = findPlayer(state, playerId);
  if (!player) return null;
  const required = state.discardsRequired[player.id];
  if (!required) return null;
  const resources = [...RESOURCES].sort((a, b) => player.resources[b] - player.resources[a]);
  const discard = emptyBag();
  let left = required;
  for (const resource of resources) {
    const take = Math.min(left, player.resources[resource]);
    if (take > 0) {
      discard[resource] = take;
      left -= take;
    }
    if (left === 0) break;
  }
  return { type: 'discard', playerId: player.id, resources: discard };
}

function robberHexScore(state: GameState, hexId: string, playerId: number): number {
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) return -Infinity;
  const rng = makeRng(`${state.seed}:robber:${hexId}:${state.turn}`);
  let score = (hex.number ? DICE_PIPS[hex.number] ?? 0 : 0) * 4;
  if (hex.terrain === 'desert') score -= 3;
  const leader = state.players.reduce((best, p) => (publicScore(state, p.id) > publicScore(state, best.id) ? p : best), state.players[0] as PlayerState);
  for (const vertexId of hex.vertexIds) {
    const owner = state.players.find((p) => p.settlements.includes(vertexId) || p.cities.includes(vertexId));
    if (!owner) continue;
    if (owner.id === playerId) score -= 60;
    else {
      score += 12;
      if (owner.id === leader.id) score += 10;
      if (owner.cities.includes(vertexId)) score += 8;
    }
  }
  return score + rng.next() * 2;
}

function chooseRobber(state: GameState, playerId: number): GameAction {
  const player = findPlayer(state, playerId);
  const difficulty = player?.difficulty ?? 'normal';
  const rng = aiRng(state, 'robber');
  const candidates = state.board.hexes.filter((h) => h.id !== state.robberHexId);
  let hex: string;
  if (difficulty === 'easy') {
    const safe = candidates.filter((h) => {
      const own = [...state.players.find((p) => p.id === playerId)?.settlements ?? [], ...state.players.find((p) => p.id === playerId)?.cities ?? []];
      return !h.vertexIds.some((v) => own.includes(v));
    });
    hex = rng.pick(safe.length > 0 ? safe : candidates).id;
  } else {
    const scored = candidates.map((h) => ({ id: h.id, score: robberHexScore(state, h.id, playerId) }));
    scored.sort((a, b) => b.score - a.score);
    hex = scored[0]?.id ?? candidates[0]?.id ?? '';
  }
  const hexData = state.board.hexes.find((h) => h.id === hex);
  let stealFrom: number | null = null;
  if (hexData) {
    const targets = state.players.filter((p) => {
      if (p.id === playerId || bagTotal(p.resources) === 0) return false;
      return [...p.settlements, ...p.cities].some((v) => hexData.vertexIds.includes(v));
    });
    if (targets.length > 0) {
      targets.sort((a, b) => bagTotal(b.resources) - bagTotal(a.resources));
      stealFrom = targets[0]?.id ?? null;
    }
  }
  return { type: 'moveRobber', playerId, hexId: hex, stealFromPlayerId: stealFrom };
}

function connectedEdges(state: GameState, playerId: number): string[] {
  const player = findPlayer(state, playerId);
  if (!player) return [];
  const vertices = new Set<string>();
  for (const edgeId of player.roads) {
    const edge = edgeById(state.board, edgeId);
    if (edge) edge.vertexIds.forEach((v) => vertices.add(v));
  }
  for (const v of [...player.settlements, ...player.cities]) vertices.add(v);
  const edges = new Set<string>();
  for (const vertexId of vertices) {
    const vertex = vertexById(state.board, vertexId);
    for (const edgeId of vertex?.edgeIds ?? []) edges.add(edgeId);
  }
  return [...edges];
}

function legalRoads(state: GameState, playerId: number): string[] {
  const result: string[] = [];
  for (const edgeId of connectedEdges(state, playerId)) {
    if (tryAction(state, { type: 'buildRoad', playerId, edgeId })) result.push(edgeId);
  }
  return result;
}

function candidateSettlementVertices(state: GameState, playerId: number): string[] {
  const player = findPlayer(state, playerId);
  if (!player) return [];
  const vertices = new Set<string>();
  for (const edgeId of player.roads) {
    const edge = edgeById(state.board, edgeId);
    for (const vertexId of edge?.vertexIds ?? []) vertices.add(vertexId);
  }
  return [...vertices].filter((vertexId) => Boolean(tryAction(state, { type: 'buildSettlement', playerId, vertexId })));
}

function estimateProduction(state: GameState, playerId: number): number {
  const player = findPlayer(state, playerId);
  if (!player) return 0;
  let total = 0;
  for (const hex of state.board.hexes) {
    if (!hex.number || hex.terrain === 'desert' || hex.id === state.robberHexId) continue;
    for (const vertexId of hex.vertexIds) {
      if (player.cities.includes(vertexId)) total += (DICE_PIPS[hex.number] ?? 0) * 2;
      else if (player.settlements.includes(vertexId)) total += DICE_PIPS[hex.number] ?? 0;
    }
  }
  return total;
}

function estimateValue(state: GameState, playerId: number): number {
  const player = findPlayer(state, playerId);
  if (!player) return -Infinity;
  let value = scorePlayer(state, playerId, true) * 1000;
  value += estimateProduction(state, playerId) * 8;
  value += bagTotal(player.resources) * 3;
  value += player.pokemon.length * 18;
  value += longestRoadLength(state, playerId) * 6;
  const leader = state.players.reduce((best, p) => (publicScore(state, p.id) > publicScore(state, best.id) ? p : best), state.players[0] as PlayerState);
  if (leader.id !== playerId) value -= publicScore(state, leader.id) * 12;
  value += [...player.settlements, ...player.cities].reduce((sum, v) => sum + vertexPips(state, v), 0) * 2;
  return value;
}

function bestByEvaluation(
  state: GameState,
  playerId: number,
  candidates: GameAction[],
  difficulty: Difficulty,
  salt: string
): GameAction | null {
  if (candidates.length === 0) return null;
  const rng = aiRng(state, salt);
  if (difficulty === 'easy') return rng.pick(candidates);
  const scored: { action: GameAction; value: number }[] = [];
  for (const action of candidates) {
    const next = tryAction(state, action);
    if (!next) continue;
    const noise = difficulty === 'normal' ? rng.next() * 60 : rng.next() * 5;
    scored.push({ action, value: estimateValue(next, playerId) + noise });
  }
  scored.sort((a, b) => b.value - a.value);
  return scored[0]?.action ?? null;
}

function buildCandidates(state: GameState, playerId: number, type: 'city' | 'settlement' | 'road'): GameAction[] {
  const player = findPlayer(state, playerId);
  if (!player) return [];
  if (type === 'city') {
    return player.settlements
      .filter((vertexId) => tryAction(state, { type: 'buildCity', playerId, vertexId }))
      .map((vertexId) => ({ type: 'buildCity' as const, playerId, vertexId }));
  }
  if (type === 'settlement') {
    return candidateSettlementVertices(state, playerId).map((vertexId) => ({
      type: 'buildSettlement' as const,
      playerId,
      vertexId
    }));
  }
  return legalRoads(state, playerId).map((edgeId) => ({ type: 'buildRoad' as const, playerId, edgeId }));
}

function playableDevCards(state: GameState, player: PlayerState): PlayerState['devCards'] {
  return player.devCards.filter(
    (card) =>
      !card.played &&
      card.type !== 'victory' &&
      card.boughtOnTurn !== state.turn &&
      !player.flags.devCardPlayedThisTurn
  );
}

function chooseDevCardAction(state: GameState, player: PlayerState): GameAction | null {
  const cards = playableDevCards(state, player);
  if (cards.length === 0) return null;
  const difficulty = player.difficulty;
  for (const card of cards) {
    if (difficulty === 'easy' && card.type !== 'knight') continue;
    if (card.type === 'knight') {
      const robberOnOwn = (() => {
        const hex = state.board.hexes.find((h) => h.id === state.robberHexId);
        return Boolean(hex && [...player.settlements, ...player.cities].some((v) => hex.vertexIds.includes(v)));
      })();
      const closeToArmy = player.knightsPlayed >= 2;
      if (difficulty === 'easy' && aiRng(state, 'knight').next() > 0.45) continue;
      if (difficulty !== 'hard' && !robberOnOwn && !closeToArmy) continue;
      const action: GameAction = { type: 'playDevCard', playerId: player.id, cardId: card.id };
      if (tryAction(state, action)) return action;
    }
    if (card.type === 'roadBuilding') {
      if (legalRoads(state, player.id).length === 0) continue;
      const action: GameAction = { type: 'playDevCard', playerId: player.id, cardId: card.id };
      if (tryAction(state, action)) return action;
    }
    if (card.type === 'yearOfPlenty') {
      const missing = missingForGoal(state, player).filter((r) => state.bank[r] > 0).slice(0, 2);
      if (missing.length === 0) continue;
      const resources = missing.length === 2 ? missing : [missing[0] as Resource, missing[0] as Resource];
      const action: GameAction = { type: 'playDevCard', playerId: player.id, cardId: card.id, params: { resources } };
      if (tryAction(state, action)) return action;
    }
    if (card.type === 'monopoly') {
      const totals = RESOURCES.map((r) => ({
        resource: r,
        total: state.players.filter((p) => p.id !== player.id).reduce((sum, p) => sum + p.resources[r], 0)
      })).sort((a, b) => b.total - a.total);
      const best = totals[0];
      if (!best || best.total < 2) continue;
      const action: GameAction = { type: 'playDevCard', playerId: player.id, cardId: card.id, params: { resource: best.resource } };
      if (tryAction(state, action)) return action;
    }
    if (card.type === 'berry') {
      const missing = missingForGoal(state, player).filter((r) => state.bank[r] > 0);
      const resource = missing[0] ?? 'wheat';
      const action: GameAction = { type: 'playDevCard', playerId: player.id, cardId: card.id, params: { resource } };
      if (tryAction(state, action)) return action;
    }
    if (card.type === 'pokeBall') {
      if (captureTargets(state, player.id).length === 0 || player.pokemon.length >= 3) continue;
      const action: GameAction = { type: 'playDevCard', playerId: player.id, cardId: card.id };
      if (tryAction(state, action)) return action;
    }
    if (card.type === 'evolutionStone') {
      if (player.flags.evolveUsedThisTurn) continue;
      if (!player.pokemon.some((p) => canEvolve(state, player.id, p.instanceId) === null)) continue;
      const action: GameAction = { type: 'playDevCard', playerId: player.id, cardId: card.id };
      if (tryAction(state, action)) return action;
    }
  }
  return null;
}

function chooseAbilityAction(state: GameState, player: PlayerState): GameAction | null {
  if (player.difficulty === 'easy' && aiRng(state, 'ability').next() > 0.5) return null;
  const candidates = player.pokemon
    .map((p) => ({ p, action: { type: 'useAbility' as const, playerId: player.id, instanceId: p.instanceId } }))
    .filter(({ action }) => tryAction(state, action));
  return candidates[0]?.action ?? null;
}

function chooseEvolveAction(state: GameState, player: PlayerState): GameAction | null {
  if (player.flags.evolveUsedThisTurn) return null;
  const evolvable = player.pokemon
    .filter((p) => canEvolve(state, player.id, p.instanceId) === null)
    .map((p) => ({ p, species: getSpecies(p.speciesId) }))
    .sort((a, b) => (b.species.evolvesTo ? getSpecies(b.species.evolvesTo).stage : 0) - (a.species.evolvesTo ? getSpecies(a.species.evolvesTo).stage : 0));
  const first = evolvable[0];
  if (!first) return null;
  const action: GameAction = { type: 'evolvePokemon', playerId: player.id, instanceId: first.p.instanceId };
  return tryAction(state, action) ? action : null;
}

function captureScore(state: GameState, playerId: number, hexId: string): number {
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex || !hex.wildPokemonId) return 0;
  const species = getSpecies(hex.wildPokemonId);
  let score = 10;
  if (species.abilityId === 'tradeWind') score += 8;
  if (species.evolvesTo) score += 6;
  if (species.abilityId === 'photosynthesis') score += 5;
  if (species.abilityId === 'burrow' || species.abilityId === 'builder' || species.abilityId === 'fortify') score += 4;
  if (species.stage === 1) score += 2;
  const player = findPlayer(state, playerId);
  if (player && player.difficulty === 'hard') {
    const need = missingForGoal(state, player);
    if (need.length > 0) score += 3;
  }
  return score;
}

function chooseCaptureAction(state: GameState, player: PlayerState): GameAction | null {
  if (player.pokemon.length >= 3 || player.flags.captureUsedThisTurn) return null;
  const targets = captureTargets(state, player.id).filter((hexId) => canCapture(state, player.id, hexId) === null);
  if (targets.length === 0) return null;
  if (player.difficulty === 'easy' && aiRng(state, 'capture').next() > 0.5) return null;
  const sorted = targets
    .map((hexId) => ({ hexId, score: captureScore(state, player.id, hexId) }))
    .sort((a, b) => b.score - a.score);
  const target = sorted[0];
  if (!target) return null;
  const action: GameAction = { type: 'capturePokemon', playerId: player.id, hexId: target.hexId };
  return tryAction(state, action) ? action : null;
}

function goalCosts(player: PlayerState): Partial<ResourceBag>[] {
  const costs: { cost: Partial<ResourceBag>; preference: number }[] = [];
  if (player.settlements.length > 0) costs.push({ cost: BUILD_COSTS.city, preference: 0 });
  if (player.settlements.length + player.cities.length < 5) costs.push({ cost: BUILD_COSTS.settlement, preference: 0.15 });
  costs.push({ cost: BUILD_COSTS.dev, preference: 0.4 });
  costs.push({ cost: BUILD_COSTS.road, preference: 0.6 });
  return costs
    .sort((a, b) => a.preference - b.preference)
    .map((entry) => entry.cost);
}

function missingForGoal(state: GameState, player: PlayerState): Resource[] {
  void state;
  let bestMissing: Resource[] = [];
  let bestScore = Infinity;
  for (const [index, cost] of goalCosts(player).entries()) {
    if (canAfford(player.resources, cost)) continue;
    const missing: Resource[] = [];
    let units = 0;
    for (const resource of RESOURCES) {
      const lack = (cost[resource] ?? 0) - player.resources[resource];
      if (lack > 0) {
        missing.push(resource);
        units += lack;
      }
    }
    const score = units + index * 0.25;
    if (missing.length > 0 && score < bestScore) {
      bestMissing = missing;
      bestScore = score;
    }
  }
  return bestMissing;
}

function tradeCompletesBuild(state: GameState, player: PlayerState, give: Resource, receive: Resource): boolean {
  const ratio = tradeRatioFor(state, player.id, give).ratio;
  if (player.resources[give] < ratio) return false;
  const next = { ...player.resources, [give]: player.resources[give] - ratio, [receive]: player.resources[receive] + 1 };
  return goalCosts(player).some((cost) => !canAfford(player.resources, cost) && canAfford(next, cost));
}

function chooseBankTrade(state: GameState, player: PlayerState): GameAction | null {
  const missing = missingForGoal(state, player);
  if (missing.length === 0) return null;
  const giveOptions = [...RESOURCES]
    .filter((r) => !missing.includes(r))
    .sort((a, b) => player.resources[b] - player.resources[a]);
  for (const give of giveOptions) {
    for (const receive of missing) {
      if (give === receive || state.bank[receive] <= 0) continue;
      if (!tradeCompletesBuild(state, player, give, receive)) continue;
      const action: GameAction = { type: 'bankTrade', playerId: player.id, give, receive };
      if (tryAction(state, action)) return action;
    }
  }
  return null;
}

function chooseProposeTrade(state: GameState, player: PlayerState): GameAction | null {
  if (state.pendingTrade || player.flags.tradeProposedThisTurn) return null;
  if (player.difficulty === 'easy') return null;
  if (player.difficulty === 'normal' && aiRng(state, 'trade').next() > 0.35) return null;
  const missing = missingForGoal(state, player);
  if (missing.length === 0) return null;
  const receive = missing[0] as Resource;
  const give = [...RESOURCES]
    .filter((r) => r !== receive && player.resources[r] >= 2 && !missing.includes(r))
    .sort((a, b) => player.resources[b] - player.resources[a])[0];
  if (!give) return null;
  const action: GameAction = {
    type: 'proposeTrade',
    playerId: player.id,
    toPlayerId: 'all',
    give: { [give]: 1 },
    receive: { [receive]: 1 }
  };
  return tryAction(state, action) ? action : null;
}

function neededWeight(state: GameState, player: PlayerState, resource: Resource): number {
  const missing = missingForGoal(state, player);
  let weight = 1 + 1 / (1 + player.resources[resource]);
  if (missing.includes(resource)) weight += 2;
  if (resource === 'wheat' || resource === 'ore') weight += 0.2;
  void state;
  return weight;
}

function bagValue(state: GameState, player: PlayerState, bag: Partial<ResourceBag>): number {
  return RESOURCES.reduce((sum, r) => sum + (bag[r] ?? 0) * neededWeight(state, player, r), 0);
}

export function aiTradeResponse(state: GameState, playerId: number): GameAction | null {
  const trade = state.pendingTrade;
  if (!trade) return null;
  const player = findPlayer(state, playerId);
  if (!player || !player.isAI) return null;
  const isRecipient =
    trade.fromPlayerId !== playerId &&
    (trade.toPlayerId === 'all' || trade.toPlayerId === playerId) &&
    !trade.rejectedBy.includes(playerId);
  if (!isRecipient) return null;
  if (!canAfford(player.resources, trade.receive)) {
    return { type: 'rejectTrade', playerId };
  }
  const proposer = findPlayer(state, trade.fromPlayerId);
  if (!proposer || !canAfford(proposer.resources, trade.give)) {
    return { type: 'rejectTrade', playerId };
  }
  const gain = bagValue(state, player, trade.receive);
  const cost = bagValue(state, player, trade.give);
  const givesNeededAway = RESOURCES.some(
    (r) => (trade.give[r] ?? 0) > 0 && neededWeight(state, player, r) >= 2.5
  );
  const threshold = player.difficulty === 'easy' ? 0.8 : player.difficulty === 'hard' ? 1.02 : 1.12;
  if (!givesNeededAway && gain >= cost * threshold) {
    return { type: 'acceptTrade', playerId };
  }
  return { type: 'rejectTrade', playerId };
}

function chooseAction(state: GameState, player: PlayerState): GameAction {
  const difficulty = player.difficulty;
  const rng = aiRng(state, 'action');
  if (difficulty === 'easy' && rng.next() < 0.04) {
    return { type: 'endTurn', playerId: player.id };
  }
  if (player.flags.freeRoads > 0) {
    const roads = legalRoads(state, player.id);
    if (roads.length > 0) {
      const chosen =
        difficulty === 'easy'
          ? ({ type: 'buildRoad' as const, playerId: player.id, edgeId: rng.pick(roads) } as GameAction)
          : bestByEvaluation(
              state,
              player.id,
              roads.map((edgeId) => ({ type: 'buildRoad' as const, playerId: player.id, edgeId })),
              difficulty,
              'free-road'
            );
      if (chosen && chosen.type === 'buildRoad') return chosen;
    }
  }
  const cardAction = chooseDevCardAction(state, player);
  if (cardAction) return cardAction;
  const ability = chooseAbilityAction(state, player);
  if (ability) return ability;

  const cityCandidates = buildCandidates(state, player.id, 'city');
  if (cityCandidates.length > 0) {
    const chosen = bestByEvaluation(state, player.id, cityCandidates, difficulty, 'city');
    if (chosen) return chosen;
  }
  const settlementCandidates = buildCandidates(state, player.id, 'settlement');
  if (settlementCandidates.length > 0) {
    const chosen = bestByEvaluation(state, player.id, settlementCandidates, difficulty, 'settlement');
    if (chosen) return chosen;
  }

  const capture = chooseCaptureAction(state, player);
  if (capture) return capture;
  const evolve = chooseEvolveAction(state, player);
  if (evolve) return evolve;

  const roadCandidates = buildCandidates(state, player.id, 'road');
  const noExpansion = settlementCandidates.length === 0 && cityCandidates.length === 0;
  if (
    noExpansion &&
    player.devCards.length < 3 &&
    canAfford(player.resources, BUILD_COSTS.dev) &&
    (roadCandidates.length === 0 || player.resources.ore >= 2 || player.roads.length >= PIECE_LIMITS.roads)
  ) {
    const action: GameAction = { type: 'buyDevCard', playerId: player.id };
    if (tryAction(state, action)) return action;
  }

  if (roadCandidates.length > 0) {
    const chosen = bestByEvaluation(state, player.id, roadCandidates, difficulty, 'road');
    if (chosen) return chosen;
  }

  const bankTrade = chooseBankTrade(state, player);
  if (bankTrade) return bankTrade;
  const proposal = chooseProposeTrade(state, player);
  if (proposal) return proposal;
  return { type: 'endTurn', playerId: player.id };
}

export function aiNextAction(state: GameState): GameAction | null {
  if (state.phase === 'ended') return null;
  if (state.phase === 'discard') {
    const pending = Object.keys(state.discardsRequired)
      .map((id) => Number(id))
      .find((id) => findPlayer(state, id)?.isAI);
    return pending === undefined ? null : chooseDiscard(state, pending);
  }
  const player = currentPlayer(state);
  if (!player.isAI) return null;
  if (state.phase === 'setup') return chooseSetup(state);
  if (state.phase === 'roll') return { type: 'rollDice', playerId: player.id };
  if (state.phase === 'robber') {
    const pending = state.pendingRobber;
    if (!pending) return null;
    return chooseRobber(state, pending.playerId);
  }
  if (state.phase === 'action') {
    if (state.pendingTrade) {
      if (state.pendingTrade.fromPlayerId === player.id) return { type: 'endTurn', playerId: player.id };
      return aiTradeResponse(state, player.id);
    }
    return chooseAction(state, player);
  }
  return null;
}

function tradeRecipients(state: GameState): number[] {
  const trade = state.pendingTrade;
  if (!trade) return [];
  if (trade.toPlayerId === 'all') {
    return state.players.filter((p) => p.id !== trade.fromPlayerId).map((p) => p.id);
  }
  return [trade.toPlayerId];
}

export function pendingTradeAwaitingHuman(state: GameState): number | null {
  const trade = state.pendingTrade;
  if (!trade) return null;
  for (const id of tradeRecipients(state)) {
    if (trade.rejectedBy.includes(id)) continue;
    const player = findPlayer(state, id);
    if (player && !player.isAI) return id;
  }
  return null;
}

export function pendingAITradeResponder(state: GameState): number | null {
  const trade = state.pendingTrade;
  if (!trade) return null;
  for (const id of tradeRecipients(state)) {
    if (trade.rejectedBy.includes(id)) continue;
    const player = findPlayer(state, id);
    if (player && player.isAI) return id;
  }
  return null;
}

export function runAITurn(previous: GameState, maxActions = 120): { state: GameState; actions: GameAction[]; error?: string } {
  let state = previous;
  const actions: GameAction[] = [];
  for (let i = 0; i < maxActions; i++) {
    if (state.phase === 'ended') break;
    if (state.pendingTrade && pendingTradeAwaitingHuman(state) !== null) break;
    const responder = state.pendingTrade ? pendingAITradeResponder(state) : null;
    let action: GameAction | null = null;
    if (responder !== null) {
      action = aiTradeResponse(state, responder);
    } else {
      action = aiNextAction(state);
    }
    if (!action) break;
    const result = applyAction(state, action);
    if (!result.ok) {
      return { state, actions, error: result.error };
    }
    state = result.state;
    actions.push(action);
  }
  return { state, actions };
}

export function describeAI(player: PlayerState): string {
  return player.isAI ? `IA ${DIFFICULTY_LABEL[player.difficulty]}` : 'Humano';
}
