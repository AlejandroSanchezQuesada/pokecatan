import { DICE_PIPS, baseSpeciesForTerrain } from './data';
import { makeRng, type Rng } from './rng';
import type { Board, Edge, Hex, Port, Resource, Terrain, Vertex } from './types';

const SQRT3 = Math.sqrt(3);
const TERRAIN_COUNTS: Record<Terrain, number> = { wood: 4, clay: 3, wool: 4, wheat: 4, ore: 3, desert: 1 };
const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORT_TYPES: (Resource | 'generic')[] = ['generic', 'generic', 'generic', 'generic', 'wood', 'clay', 'wool', 'wheat', 'ore'];

export function axialDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexToPixel(q: number, r: number): { x: number; y: number } {
  return { x: SQRT3 * (q + r / 2), y: 1.5 * r };
}

export function cornerOffset(index: number): { x: number; y: number } {
  const angle = (Math.PI / 180) * (60 * index + 30);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function generateBoard(seed: string): Board {
  const boardRng = makeRng(`${seed}:board`);
  let best: { hexes: Hex[]; quality: number } | null = null;

  for (let attempt = 0; attempt < 120; attempt++) {
    const terrains: Terrain[] = [];
    for (const [terrain, count] of Object.entries(TERRAIN_COUNTS) as [Terrain, number][]) {
      for (let i = 0; i < count; i++) terrains.push(terrain);
    }
    const numbers = [...NUMBER_TOKENS];
    const shuffledTerrains = boardRng.shuffle(terrains);
    const shuffledNumbers = boardRng.shuffle(numbers);
    const hexes = buildHexes(shuffledTerrains, shuffledNumbers);
    if (!sixEightConstraintOk(hexes)) continue;
    const vertexList = buildVerticesAndEdges(hexes).vertices;
    const quality = evaluateBalance(hexes, vertexList);
    if (!best || quality > best.quality) best = { hexes, quality };
  }

  const chosen = best ?? { hexes: buildHexes(buildFallbackTerrains(), buildFallbackNumbers()), quality: 0 };
  const geometry = buildVerticesAndEdges(chosen.hexes);
  const ports = buildPorts(geometry.edges, boardRng);
  const wild = assignWildPokemon(chosen.hexes, boardRng);

  return {
    hexes: wild,
    vertices: geometry.vertices,
    edges: geometry.edges,
    ports,
    radius: 2
  };
}

function buildFallbackTerrains(): Terrain[] {
  const list: Terrain[] = [];
  for (const [terrain, count] of Object.entries(TERRAIN_COUNTS) as [Terrain, number][]) {
    for (let i = 0; i < count; i++) list.push(terrain);
  }
  return list;
}

function buildFallbackNumbers(): number[] {
  return [...NUMBER_TOKENS];
}

function buildHexes(terrains: Terrain[], numbers: number[]): Hex[] {
  const coords: { q: number; r: number }[] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) <= 2) coords.push({ q, r });
    }
  }
  coords.sort((a, b) => a.r - b.r || a.q - b.q);
  const hexes: Hex[] = [];
  let numberIndex = 0;
  coords.forEach((coord, index) => {
    const terrain = terrains[index] ?? 'desert';
    const { x, y } = hexToPixel(coord.q, coord.r);
    const isDesert = terrain === 'desert';
    const number = isDesert ? null : numbers[numberIndex++] ?? null;
    hexes.push({
      id: `h${index}`,
      q: coord.q,
      r: coord.r,
      x,
      y,
      terrain,
      number,
      vertexIds: [],
      edgeIds: [],
      wildPokemonId: null
    });
  });
  return hexes;
}

function sixEightConstraintOk(hexes: Hex[]): boolean {
  const risky = hexes.filter((h) => h.number === 6 || h.number === 8);
  for (let i = 0; i < risky.length; i++) {
    for (let j = i + 1; j < risky.length; j++) {
      const a = risky[i] as Hex;
      const b = risky[j] as Hex;
      if (axialDistance(a, b) === 1) return false;
    }
  }
  return true;
}

interface Geometry {
  vertices: Vertex[];
  edges: Edge[];
}

function normalizeCoord(value: number): number {
  const rounded = Number(value.toFixed(5));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function buildVerticesAndEdges(hexes: Hex[]): Geometry {
  const vertexMap = new Map<string, Vertex>();
  const edgeMap = new Map<string, Edge>();
  const vertexKey = (x: number, y: number): string => `${Math.round(x * 10000) / 10000},${Math.round(y * 10000) / 10000}`;

  for (const hex of hexes) {
    const corners: string[] = [];
    for (let i = 0; i < 6; i++) {
      const off = cornerOffset(i);
      const x = hex.x + off.x;
      const y = hex.y + off.y;
      const key = vertexKey(x, y);
      let vertex = vertexMap.get(key);
      if (!vertex) {
        vertex = {
          id: `v${vertexMap.size}`,
          x: normalizeCoord(x),
          y: normalizeCoord(y),
          hexIds: [],
          edgeIds: [],
          portId: null
        };
        vertexMap.set(key, vertex);
      }
      if (!vertex.hexIds.includes(hex.id)) vertex.hexIds.push(hex.id);
      corners.push(vertex.id);
    }
    for (let i = 0; i < 6; i++) {
      const a = corners[i] as string;
      const b = corners[(i + 1) % 6] as string;
      const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      let edge = edgeMap.get(edgeKey);
      if (!edge) {
        const va = vertexMap.get(vertexKeyById(vertexMap, a)) as Vertex;
        const vb = vertexMap.get(vertexKeyById(vertexMap, b)) as Vertex;
        edge = {
          id: `e${edgeMap.size}`,
          x1: va.x,
          y1: va.y,
          x2: vb.x,
          y2: vb.y,
          vertexIds: [a, b],
          hexIds: [],
          portId: null
        };
        edgeMap.set(edgeKey, edge);
        va.edgeIds.push(edge.id);
        vb.edgeIds.push(edge.id);
      }
      if (!edge.hexIds.includes(hex.id)) edge.hexIds.push(hex.id);
    }
  }

  const edgeById = new Map<string, Edge>();
  for (const edge of edgeMap.values()) edgeById.set(edge.id, edge);

  for (const hex of hexes) {
    const ids = new Set<string>();
    for (const vertex of vertexMap.values()) {
      if (vertex.hexIds.includes(hex.id)) ids.add(vertex.id);
    }
    hex.vertexIds = [...ids].sort((a, b) => vertexOrder(a) - vertexOrder(b));
    const edges = new Set<string>();
    for (const vertex of vertexMap.values()) {
      if (vertex.hexIds.includes(hex.id)) {
        for (const edgeId of vertex.edgeIds) {
          const edge = edgeById.get(edgeId);
          if (edge && edge.hexIds.includes(hex.id)) edges.add(edgeId);
        }
      }
    }
    hex.edgeIds = [...edges].sort((a, b) => edgeOrder(a) - edgeOrder(b));
  }

  const vertices = [...vertexMap.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  const idRemap = new Map<string, string>();
  vertices.forEach((v, i) => {
    const oldId = v.id;
    const newId = `v${i}`;
    idRemap.set(oldId, newId);
    v.id = newId;
  });
  for (const v of vertices) {
    v.edgeIds = [...new Set(v.edgeIds)].sort();
  }
  const edges = [...edgeMap.values()].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  for (const e of edges) {
    e.vertexIds = [idRemap.get(e.vertexIds[0]) as string, idRemap.get(e.vertexIds[1]) as string];
  }
  for (const hex of hexes) {
    hex.vertexIds = hex.vertexIds.map((id) => idRemap.get(id) as string);
  }
  return { vertices, edges };
}

function vertexKeyById(map: Map<string, Vertex>, id: string): string {
  for (const [key, vertex] of map) if (vertex.id === id) return key;
  throw new Error(`Vértice no encontrado: ${id}`);
}

function vertexOrder(id: string): number {
  return Number(id.replace('v', ''));
}

function edgeOrder(id: string): number {
  return Number(id.replace('e', ''));
}

function evaluateBalance(hexes: Hex[], vertices: Vertex[]): number {
  const hexById = new Map(hexes.map((h) => [h.id, h]));
  const scored = vertices.map((v) => {
    let pips = 0;
    const resources = new Set<Resource>();
    for (const hid of v.hexIds) {
      const hex = hexById.get(hid);
      if (!hex || !hex.number) continue;
      pips += DICE_PIPS[hex.number] ?? 0;
      if (hex.terrain !== 'desert') resources.add(hex.terrain);
    }
    return { vertex: v, pips, diversity: resources.size };
  });
  scored.sort((a, b) => b.pips - a.pips);
  const chosen: typeof scored = [];
  for (const candidate of scored) {
    if (chosen.every((c) => !verticesAdjacent(c.vertex, candidate.vertex))) chosen.push(candidate);
    if (chosen.length === 4) break;
  }
  if (chosen.length < 4) {
    for (const candidate of scored) {
      if (!chosen.includes(candidate)) chosen.push(candidate);
      if (chosen.length === 4) break;
    }
  }
  const minPips = Math.min(...chosen.map((c) => c.pips));
  const totalPips = chosen.reduce((sum, c) => sum + c.pips, 0);
  const diversity = chosen.reduce((sum, c) => sum + c.diversity, 0);
  const spread = Math.max(...chosen.map((c) => c.pips)) - minPips;
  return minPips * 100 + totalPips * 2 + diversity * 5 - spread * 20;
}

function verticesAdjacent(a: Vertex, b: Vertex): boolean {
  return a.edgeIds.some((e) => b.edgeIds.includes(e));
}

function buildPorts(edges: Edge[], rng: Rng): Port[] {
  const boundary = edges
    .filter((e) => e.hexIds.length === 1)
    .map((e) => ({
      edge: e,
      angle: Math.atan2((e.y1 + e.y2) / 2, (e.x1 + e.x2) / 2)
    }))
    .sort((a, b) => a.angle - b.angle);
  const selected: Edge[] = [];
  const spacing = boundary.length / 9;
  for (let i = 0; i < 9; i++) {
    const index = Math.floor(i * spacing + spacing / 2) % boundary.length;
    const entry = boundary[index];
    if (!entry) continue;
    if (selected.includes(entry.edge)) continue;
    selected.push(entry.edge);
  }
  let fill = 0;
  while (selected.length < 9 && fill < boundary.length) {
    const entry = boundary[fill];
    if (entry && !selected.includes(entry.edge)) selected.push(entry.edge);
    fill++;
  }
  const types = rng.shuffle(PORT_TYPES);
  return selected.map((edge, index) => {
    const type = types[index] ?? 'generic';
    const port: Port = {
      id: `p${index}`,
      edgeId: edge.id,
      type,
      ratio: type === 'generic' ? 3 : 2
    };
    edge.portId = port.id;
    return port;
  });
}

function assignWildPokemon(hexes: Hex[], rng: Rng): Hex[] {
  const result = hexes.map((hex) => ({ ...hex }));
  const verticesByHex = new Map<string, string[]>();
  for (const hex of result) verticesByHex.set(hex.id, []);
  for (const hex of result) {
    const candidates = baseSpeciesForTerrain(hex.terrain);
    hex.wildPokemonId = candidates.length > 0 ? rng.pick(candidates) : null;
  }
  return result;
}

export function validateBoard(board: Board): string[] {
  const errors: string[] = [];
  if (board.hexes.length !== 19) errors.push(`Se esperaban 19 hexágonos y hay ${board.hexes.length}`);
  const terrainCounts: Partial<Record<Terrain, number>> = {};
  for (const hex of board.hexes) terrainCounts[hex.terrain] = (terrainCounts[hex.terrain] ?? 0) + 1;
  for (const [terrain, count] of Object.entries(TERRAIN_COUNTS) as [Terrain, number][]) {
    if ((terrainCounts[terrain] ?? 0) !== count) errors.push(`Terreno ${terrain}: ${terrainCounts[terrain] ?? 0}/${count}`);
  }
  const numbers = board.hexes.filter((h) => h.number !== null).map((h) => h.number as number).sort((a, b) => a - b);
  const expected = [...NUMBER_TOKENS].sort((a, b) => a - b);
  if (numbers.join(',') !== expected.join(',')) errors.push('Los números de producción no coinciden con los clásicos');
  if (!sixEightConstraintOk(board.hexes)) errors.push('Hay fichas 6 y 8 adyacentes');
  if (board.ports.length !== 9) errors.push(`Se esperaban 9 puertos y hay ${board.ports.length}`);
  if (board.vertices.length !== 54) errors.push(`Se esperaban 54 intersecciones y hay ${board.vertices.length}`);
  if (board.edges.length !== 72) errors.push(`Se esperaban 72 caminos y hay ${board.edges.length}`);
  return errors;
}

export function vertexById(board: Board, id: string): Vertex | undefined {
  return board.vertices.find((v) => v.id === id);
}

export function edgeById(board: Board, id: string): Edge | undefined {
  return board.edges.find((e) => e.id === id);
}

export function hexById(board: Board, id: string): Hex | undefined {
  return board.hexes.find((h) => h.id === id);
}

export function portForVertex(board: Board, vertexId: string): Port | null {
  for (const port of board.ports) {
    const edge = edgeById(board, port.edgeId);
    if (edge && edge.vertexIds.includes(vertexId)) return port;
  }
  return null;
}

export function adjacentVertices(board: Board, vertexId: string): Vertex[] {
  const vertex = vertexById(board, vertexId);
  if (!vertex) return [];
  return vertex.edgeIds
    .map((id) => edgeById(board, id))
    .filter((e): e is Edge => Boolean(e))
    .map((e) => (e.vertexIds[0] === vertexId ? e.vertexIds[1] : e.vertexIds[0]))
    .map((id) => vertexById(board, id))
    .filter((v): v is Vertex => Boolean(v));
}

export function edgesForVertex(board: Board, vertexId: string): Edge[] {
  const vertex = vertexById(board, vertexId);
  if (!vertex) return [];
  return vertex.edgeIds.map((id) => edgeById(board, id)).filter((e): e is Edge => Boolean(e));
}

export function verticesForHex(board: Board, hexId: string): Vertex[] {
  const hex = hexById(board, hexId);
  if (!hex) return [];
  return hex.vertexIds.map((id) => vertexById(board, id)).filter((v): v is Vertex => Boolean(v));
}
