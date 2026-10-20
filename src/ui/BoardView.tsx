import { useMemo, type KeyboardEvent } from 'react';
import { DICE_PIPS, RESOURCE_INFO, TERRAIN_INFO, getSpecies } from '../engine/data';
import type { Edge, GameState, Hex, Terrain, Vertex } from '../engine/types';
import { Sprite, spriteUrl } from './components';

export type InteractionMode = 'none' | 'road' | 'settlement' | 'city' | 'capture' | 'robber';

interface BoardViewProps {
  state: GameState;
  mode: InteractionMode;
  vertexCandidates: Set<string>;
  edgeCandidates: Set<string>;
  hexCandidates: Set<string>;
  onVertex: (vertexId: string) => void;
  onEdge: (edgeId: string) => void;
  onHex: (hexId: string) => void;
  disabled: boolean;
}

const SCALE = 88;
const SX = (value: number): number => value * SCALE;
const SY = (value: number): number => value * SCALE;

function pointsForHex(hex: Hex): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index + 30);
    return `${SX(hex.x + Math.cos(angle))},${SY(hex.y + Math.sin(angle))}`;
  }).join(' ');
}

function decoration(terrain: Terrain, x: number, y: number): JSX.Element | null {
  if (terrain === 'wood') {
    return (
      <g className="terrain-decoration" aria-hidden="true">
        {[-22, 0, 22].map((offset, index) => (
          <g key={offset} transform={`translate(${x + offset},${y + (index % 2 === 0 ? 8 : -8)})`}>
            <rect x="-2" y="2" width="4" height="9" fill="#4d3422" />
            <path d="M0,-12 L8,4 L-8,4 Z" fill="#163e2b" />
            <path d="M0,-6 L6,5 L-6,5 Z" fill="#246044" />
          </g>
        ))}
      </g>
    );
  }
  if (terrain === 'clay') {
    return (
      <g className="terrain-decoration" aria-hidden="true">
        <path d={`M${x - 26},${y + 18} L${x - 15},${y - 12} L${x + 10},${y - 20} L${x + 27},${y + 9} L${x + 12},${y + 22} Z`} fill="#7a3f1f" />
        <path d={`M${x - 16},${y + 14} L${x - 8},${y - 7} L${x + 9},${y - 12} L${x + 17},${y + 10} Z`} fill="#c57745" />
        <path d={`M${x - 8},${y + 2} L${x + 1},${y - 4} L${x + 9},${y + 2}`} stroke="#6e371d" strokeWidth="3" fill="none" />
      </g>
    );
  }
  if (terrain === 'wool') {
    return (
      <g className="terrain-decoration" stroke="#506b32" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
        {[-24, -8, 9, 24].map((offset, index) => (
          <path key={offset} d={`M${x + offset},${y + 20} Q${x + offset - 5},${y + 4} ${x + offset + 3},${y - 10 + (index % 2) * 5}`} />
        ))}
        <circle cx={x - 2} cy={y - 2} r="7" fill="#d9e6b1" stroke="none" />
      </g>
    );
  }
  if (terrain === 'wheat') {
    return (
      <g className="terrain-decoration" aria-hidden="true">
        {[-20, 0, 20].map((offset, index) => (
          <g key={offset} transform={`translate(${x + offset},${y + (index === 1 ? -4 : 6)})`} stroke="#8f6a16" strokeWidth="2">
            <path d="M0,16 L0,-15" />
            <path d="M0,-10 L-7,-16 M0,-5 L-7,-11 M0,0 L-7,-6 M0,-10 L7,-16 M0,-5 L7,-11 M0,0 L7,-6" fill="none" />
          </g>
        ))}
      </g>
    );
  }
  if (terrain === 'ore') {
    return (
      <g className="terrain-decoration" aria-hidden="true">
        <path d={`M${x - 30},${y + 22} L${x - 11},${y - 18} L${x + 4},${y + 2} L${x + 13},${y - 24} L${x + 31},${y + 22} Z`} fill="#4e5059" />
        <path d={`M${x - 11},${y - 18} L${x - 4},${y + 22} L${x + 13},${y - 24} L${x + 8},${y + 22} Z`} fill="#b9bcc9" opacity="0.55" />
      </g>
    );
  }
  if (terrain === 'desert') {
    return (
      <g className="terrain-decoration" aria-hidden="true" fill="#b89c63">
        {[-26, -6, 18, 28].map((offset, index) => (
          <circle key={offset} cx={x + offset} cy={y + (index % 2 === 0 ? 12 : -12)} r={index % 2 === 0 ? 4 : 6} />
        ))}
        <path d={`M${x - 2},${y + 15} Q${x + 10},${y - 2} ${x + 22},${y + 15}`} fill="none" stroke="#c9af78" strokeWidth="3" />
      </g>
    );
  }
  return null;
}

function hexLabel(hex: Hex): string {
  const terrain = TERRAIN_INFO[hex.terrain].name;
  const number = hex.number ? `, ficha ${hex.number}` : ', sin producción';
  const pokemon = hex.wildPokemonId ? `, ${getSpecies(hex.wildPokemonId).name} salvaje` : '';
  return `Hexágono ${hex.id}: ${terrain}${number}${pokemon}`;
}

function activate(event: KeyboardEvent, action: () => void): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export function BoardView({
  state,
  mode,
  vertexCandidates,
  edgeCandidates,
  hexCandidates,
  onVertex,
  onEdge,
  onHex,
  disabled
}: BoardViewProps): JSX.Element {
  const roadOwners = useMemo(() => {
    const map = new Map<string, { color: string; name: string }>();
    for (const player of state.players) {
      for (const edgeId of player.roads) map.set(edgeId, { color: player.color, name: player.name });
    }
    return map;
  }, [state.players]);

  const playerById = useMemo(() => new Map(state.players.map((player) => [player.id, player])), [state.players]);
  const edgeById = useMemo(() => new Map(state.board.edges.map((edge) => [edge.id, edge])), [state.board.edges]);
  const vertexById = useMemo(() => new Map(state.board.vertices.map((vertex) => [vertex.id, vertex])), [state.board.vertices]);

  const verticesInteractive = mode === 'settlement' || mode === 'city';
  const edgesInteractive = mode === 'road';
  const playedPorts = useMemo(() => {
    const result = new Set<string>();
    for (const player of state.players) {
      for (const vertexId of [...player.settlements, ...player.cities]) {
        for (const port of state.board.ports) {
          const edge = edgeById.get(port.edgeId);
          if (edge?.vertexIds.includes(vertexId)) result.add(port.id);
        }
      }
    }
    return result;
  }, [edgeById, state.board.ports, state.players]);

  function clickVertex(vertexId: string): void {
    if (disabled) return;
    onVertex(vertexId);
  }

  function clickEdge(edgeId: string): void {
    if (disabled) return;
    onEdge(edgeId);
  }

  function clickHex(hexId: string): void {
    if (disabled && mode !== 'none') return;
    onHex(hexId);
  }

  function renderPort(port: GameState['board']['ports'][number]): JSX.Element | null {
    const edge = edgeById.get(port.edgeId);
    if (!edge) return null;
    const mx = (edge.x1 + edge.x2) / 2;
    const my = (edge.y1 + edge.y2) / 2;
    const length = Math.hypot(mx, my) || 1;
    const bx = mx + (mx / length) * 0.78;
    const by = my + (my / length) * 0.78;
    const owned = playedPorts.has(port.id);
    const label = port.type === 'generic' ? '3:1' : '2:1';
    const detail = port.type === 'generic' ? 'GEN' : RESOURCE_INFO[port.type].short;
    return (
      <g key={port.id} className={`port ${owned ? 'owned' : ''}`} aria-label={`Puerto ${label} ${detail}`}>
        <line
          x1={SX(mx)}
          y1={SY(my)}
          x2={SX(bx)}
          y2={SY(by)}
          stroke="#3a2a1f"
          strokeWidth="4"
          strokeDasharray="5 4"
        />
        <g transform={`translate(${SX(bx)},${SY(by)})`}>
          <rect x="-33" y="-17" width="66" height="34" rx="4" fill={owned ? '#f7d774' : '#efe0b8'} stroke="#35251b" strokeWidth="3" />
          <text className="port-ratio" x="0" y="-1" textAnchor="middle">
            {label}
          </text>
          <text className="port-detail" x="0" y="12" textAnchor="middle">
            {detail}
          </text>
        </g>
      </g>
    );
  }

  return (
    <div className="board-shell">
      <svg
        className={`board ${disabled ? 'board-disabled' : ''}`}
        viewBox="-520 -430 1040 860"
        role="group"
        aria-label={`Tablero de ${state.gameName}. Turno ${state.turn}, ronda ${state.round}.`}
      >
        <defs>
          <pattern id="water-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
            <rect width="28" height="28" fill="#154e63" />
            <path d="M0,20 Q7,14 14,20 T28,20" stroke="#2e8193" strokeWidth="3" fill="none" opacity="0.65" />
            <circle cx="5" cy="6" r="2" fill="#75bfca" opacity="0.55" />
          </pattern>
          <pattern id="sand-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="#d9c08a" />
            <circle cx="6" cy="7" r="2" fill="#b99a61" opacity="0.55" />
            <circle cx="18" cy="17" r="1.7" fill="#b99a61" opacity="0.5" />
          </pattern>
          <filter id="board-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="7" stdDeviation="4" floodColor="#07141c" floodOpacity="0.65" />
          </filter>
        </defs>

        <rect x="-520" y="-430" width="1040" height="860" fill="url(#water-pattern)" />
        <ellipse cx="0" cy="0" rx="450" ry="390" fill="none" stroke="#65b9c5" strokeWidth="3" opacity="0.25" strokeDasharray="12 12" />

        {state.board.ports.map(renderPort)}

        <g filter="url(#board-shadow)">
          {state.board.hexes.map((hex) => {
            const info = TERRAIN_INFO[hex.terrain];
            const isRobber = state.robberHexId === hex.id;
            const isCandidate = hexCandidates.has(hex.id);
            const pokemon = hex.wildPokemonId ? getSpecies(hex.wildPokemonId) : null;
            const number = hex.number;
            return (
              <g
                key={hex.id}
                className={`hex ${isCandidate ? 'hex-candidate' : ''} ${isRobber ? 'hex-robber' : ''}`}
                onClick={() => clickHex(hex.id)}
                onKeyDown={(event) => activate(event, () => clickHex(hex.id))}
                tabIndex={0}
                role="button"
                aria-label={hexLabel(hex)}
              >
                <title>{hexLabel(hex)}</title>
                <polygon points={pointsForHex(hex)} fill={info.color} stroke="#2a2019" strokeWidth="5" strokeLinejoin="round" />
                <polygon points={pointsForHex(hex)} fill="url(#sand-pattern)" opacity={hex.terrain === 'desert' ? 0.28 : 0} />
                <polygon points={pointsForHex(hex)} fill={info.dark} opacity="0.13" />
                {decoration(hex.terrain, SX(hex.x), SY(hex.y))}
                {number && (
                  <g transform={`translate(${SX(hex.x)},${SY(hex.y) + 20})`} className="number-token">
                    <circle r="22" fill="#f3e4bd" stroke="#3a2a1f" strokeWidth="4" />
                    <text className={`token-number ${number === 6 || number === 8 ? 'hot' : ''}`} x="0" y="8" textAnchor="middle">
                      {number}
                    </text>
                    <g transform="translate(0,14)">
                      {Array.from({ length: DICE_PIPS[number] ?? 0 }, (_, index) => {
                        const pips = DICE_PIPS[number] ?? 0;
                        return <circle key={index} cx={(index - (pips - 1) / 2) * 5.5} cy="0" r="1.7" fill="#5b4938" />;
                      })}
                    </g>
                  </g>
                )}
                {pokemon && hex.wildPokemonId && (
                  <g className="wild-portrait" transform={`translate(${SX(hex.x) + 25},${SY(hex.y) - 47})`}>
                    <title>{`${pokemon.name} salvaje en ${TERRAIN_INFO[hex.terrain].name}`}</title>
                    <circle r="23" fill="#f4e6c4" stroke="#2c241d" strokeWidth="3" />
                    <text className="wild-fallback" x="0" y="6" textAnchor="middle">
                      {pokemon.name.slice(0, 1)}
                    </text>
                    <image href={spriteUrl(pokemon.id)} x="-21" y="-21" width="42" height="42" preserveAspectRatio="xMidYMid meet" />
                  </g>
                )}
                {isRobber && (
                  <g transform={`translate(${SX(hex.x) - 22},${SY(hex.y) - 22})`} className="robber" aria-label="Ladrón">
                    <circle r="20" fill="#211b27" stroke="#f5e6c0" strokeWidth="3" />
                    <text x="0" y="7" textAnchor="middle" className="robber-mark">
                      7
                    </text>
                  </g>
                )}
                {isCandidate && (
                  <polygon points={pointsForHex(hex)} className="hex-candidate-ring" fill="none" stroke="#ffe36e" strokeWidth="7" strokeDasharray="14 8" />
                )}
              </g>
            );
          })}
        </g>

        {state.board.edges.map((edge) => {
          const owner = roadOwners.get(edge.id);
          const candidate = edgeCandidates.has(edge.id);
          return (
            <g key={edge.id} className={`edge ${owner ? 'owned' : ''} ${candidate ? 'edge-candidate' : ''}`}>
              {owner && (
                <>
                  <line x1={SX(edge.x1)} y1={SY(edge.y1)} x2={SX(edge.x2)} y2={SY(edge.y2)} stroke="#241b16" strokeWidth="15" strokeLinecap="square" />
                  <line x1={SX(edge.x1)} y1={SY(edge.y1)} x2={SX(edge.x2)} y2={SY(edge.y2)} stroke={owner.color} strokeWidth="9" strokeLinecap="square" />
                </>
              )}
              {candidate && (
                <line
                  x1={SX(edge.x1)}
                  y1={SY(edge.y1)}
                  x2={SX(edge.x2)}
                  y2={SY(edge.y2)}
                  className="edge-candidate-line"
                  stroke="#ffe36e"
                  strokeWidth="9"
                  strokeDasharray="9 7"
                  strokeLinecap="round"
                />
              )}
              {edgesInteractive && (
                <line
                  x1={SX(edge.x1)}
                  y1={SY(edge.y1)}
                  x2={SX(edge.x2)}
                  y2={SY(edge.y2)}
                  stroke="transparent"
                  strokeWidth="30"
                  className="edge-hit"
                  role="button"
                  tabIndex={0}
                  aria-label={`Camino ${edge.id}`}
                  onClick={() => clickEdge(edge.id)}
                  onKeyDown={(event) => activate(event, () => clickEdge(edge.id))}
                >
                  <title>{`Camino ${edge.id}`}</title>
                </line>
              )}
            </g>
          );
        })}

        {state.players.flatMap((player) => [
          ...player.settlements.map((vertexId) => {
            const vertex = vertexById.get(vertexId);
            if (!vertex) return null;
            return (
              <g key={`${player.id}-s-${vertexId}`} className="building settlement" transform={`translate(${SX(vertex.x)},${SY(vertex.y)})`}>
                <title>{`Poblado de ${player.name}`}</title>
                <rect x="-13" y="-8" width="26" height="21" fill="#2a2019" rx="2" />
                <rect x="-10" y="-5" width="20" height="16" fill={player.color} rx="1" />
                <path d="M-15,-6 L0,-19 L15,-6 Z" fill="#2a2019" />
                <path d="M-11,-7 L0,-16 L11,-7 Z" fill={player.color} />
                <rect x="-4" y="2" width="8" height="9" fill="#f6e7be" opacity="0.8" />
              </g>
            );
          }),
          ...player.cities.map((vertexId) => {
            const vertex = vertexById.get(vertexId);
            if (!vertex) return null;
            return (
              <g key={`${player.id}-c-${vertexId}`} className="building city" transform={`translate(${SX(vertex.x)},${SY(vertex.y)})`}>
                <title>{`Ciudad de ${player.name}`}</title>
                <rect x="-19" y="-9" width="38" height="25" fill="#2a2019" rx="2" />
                <rect x="-16" y="-6" width="32" height="19" fill={player.color} rx="1" />
                <rect x="-18" y="-25" width="14" height="18" fill="#2a2019" />
                <rect x="-15" y="-22" width="8" height="15" fill={player.color} />
                <rect x="4" y="-25" width="14" height="18" fill="#2a2019" />
                <rect x="7" y="-22" width="8" height="15" fill={player.color} />
                <rect x="-11" y="-37" width="4" height="12" fill={player.color} stroke="#2a2019" strokeWidth="2" />
                <rect x="7" y="-37" width="4" height="12" fill={player.color} stroke="#2a2019" strokeWidth="2" />
                <rect x="-6" y="2" width="12" height="11" fill="#f6e7be" opacity="0.8" />
              </g>
            );
          })
        ])}

        {state.board.vertices.map((vertex: Vertex) => {
          const candidate = vertexCandidates.has(vertex.id);
          if (!verticesInteractive) return null;
          return (
            <g
              key={`v-hit-${vertex.id}`}
              className={`vertex-hit ${candidate ? 'candidate' : ''}`}
              transform={`translate(${SX(vertex.x)},${SY(vertex.y)})`}
              role="button"
              tabIndex={0}
              aria-label={`Cruce ${vertex.id}`}
              onClick={() => clickVertex(vertex.id)}
              onKeyDown={(event) => activate(event, () => clickVertex(vertex.id))}
            >
              <title>{`Cruce ${vertex.id}`}</title>
              <circle r={candidate ? 15 : 12} fill={candidate ? '#ffe36e' : 'transparent'} opacity={candidate ? 0.75 : 0} stroke="#3a2a1f" strokeWidth="3" />
              {candidate && <circle r="8" fill="#fff7cf" />}
            </g>
          );
        })}

        {state.board.edges.map((edge: Edge) => {
          const candidate = edgeCandidates.has(edge.id);
          if (!candidate) return null;
          const player = playerById.get(state.currentPlayerIndex);
          return (
            <circle
              key={`edge-dot-${edge.id}`}
              cx={SX((edge.x1 + edge.x2) / 2)}
              cy={SY((edge.y1 + edge.y2) / 2)}
              r="5"
              fill={player?.color ?? '#ffe36e'}
              stroke="#2a2019"
              strokeWidth="2"
              pointerEvents="none"
            />
          );
        })}
      </svg>
      <div className="board-legend" aria-hidden="true">
        <span className="legend-chip">Clic en un cruce para poblado o ciudad</span>
        <span className="legend-chip">Clic en un camino para carretera</span>
        <span className="legend-chip">Clic en un hexágono para inspeccionar</span>
      </div>
    </div>
  );
}

