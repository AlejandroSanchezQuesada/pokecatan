import { describe, expect, it } from 'vitest';
import { generateBoard, validateBoard, axialDistance } from '../src/engine/board';
import { POKEMON_CATALOG } from '../src/engine/data';

describe('generación del tablero', () => {
  it('genera un tablero clásico válido de 19 hexágonos', () => {
    const board = generateBoard('TABLERO1');
    expect(validateBoard(board)).toEqual([]);
    expect(board.hexes).toHaveLength(19);
    expect(board.vertices).toHaveLength(54);
    expect(board.edges).toHaveLength(72);
    expect(board.ports).toHaveLength(9);
    for (const hex of board.hexes) {
      expect(hex.vertexIds).toHaveLength(6);
      expect(hex.edgeIds).toHaveLength(6);
    }
    for (const vertex of board.vertices) {
      expect(Object.is(vertex.x, -0)).toBe(false);
      expect(Object.is(vertex.y, -0)).toBe(false);
    }
    const terrains = board.hexes.map((h) => h.terrain);
    expect(terrains.filter((t) => t === 'wood')).toHaveLength(4);
    expect(terrains.filter((t) => t === 'clay')).toHaveLength(3);
    expect(terrains.filter((t) => t === 'wool')).toHaveLength(4);
    expect(terrains.filter((t) => t === 'wheat')).toHaveLength(4);
    expect(terrains.filter((t) => t === 'ore')).toHaveLength(3);
    expect(terrains.filter((t) => t === 'desert')).toHaveLength(1);
    expect(board.hexes.filter((h) => h.number === 6 || h.number === 8)).toHaveLength(4);
    expect(board.ports.filter((p) => p.ratio === 3)).toHaveLength(4);
    expect(board.ports.filter((p) => p.ratio === 2)).toHaveLength(5);
    expect(board.ports.filter((p) => p.type !== 'generic').map((p) => p.type).sort()).toEqual(
      ['clay', 'ore', 'wheat', 'wood', 'wool'].sort()
    );
  });

  it('es reproducible con la misma semilla y cambia con otra', () => {
    const a = generateBoard('SEMILLA-X');
    const b = generateBoard('SEMILLA-X');
    const c = generateBoard('SEMILLA-Y');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('nunca coloca fichas 6 y 8 adyacentes', () => {
    for (const seed of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const board = generateBoard(seed);
      const risky = board.hexes.filter((h) => h.number === 6 || h.number === 8);
      for (let i = 0; i < risky.length; i++) {
        for (let j = i + 1; j < risky.length; j++) {
          expect(axialDistance(risky[i]!, risky[j]!)).toBeGreaterThan(1);
        }
      }
    }
  });

  it('asigna un Pokémon salvaje de bioma compatible a cada hexágono', () => {
    const board = generateBoard('POKE');
    for (const hex of board.hexes) {
      expect(hex.wildPokemonId).not.toBeNull();
      const species = POKEMON_CATALOG.find((p) => p.id === hex.wildPokemonId);
      expect(species).toBeDefined();
      expect(species?.biomes).toContain(hex.terrain);
      expect(species?.stage).toBe(1);
    }
  });
});
