import type { CSSProperties } from 'react';
import { ABILITIES, BUILD_COSTS, DEV_CARD_INFO, DIFFICULTY_LABEL, PIECE_LIMITS, getSpecies } from '../engine/data';
import { canCapture, canEvolve, captureTargets } from '../engine/pokemon';
import { bagTotal, findPlayer, publicScore, tradeRatioFor, visibleScore } from '../engine/state';
import type { DevCard, GameAction, GameState, PlayerState, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { Cost, ResourceChip, ResourceRow, SectionTitle, Sprite } from './components';

export function PlayerList({
  state,
  viewerId,
  onSelect
}: {
  state: GameState;
  viewerId: number | null;
  onSelect: (playerId: number) => void;
}): JSX.Element {
  return (
    <aside className="player-list" aria-label="Jugadores">
      {state.players.map((player) => {
        const active = state.currentPlayerIndex === player.id;
        const score = viewerId === null ? publicScore(state, player.id) : visibleScore(state, viewerId, player.id);
        const awards: string[] = [];
        if (state.awards.longestRoad === player.id) awards.push('Ruta');
        if (state.awards.largestArmy === player.id) awards.push('Ejército');
        return (
          <button
            key={player.id}
            type="button"
            className={`player-card ${active ? 'active' : ''} ${viewerId === player.id ? 'viewer' : ''}`}
            style={{ '--player-color': player.color } as CSSProperties}
            onClick={() => onSelect(player.id)}
            aria-label={`${player.name}, ${score} puntos${active ? ', turno activo' : ''}`}
          >
            <div className="player-card-head">
              <span className="player-dot" aria-hidden="true" />
              <span className="player-name">{player.name}</span>
              <span className="player-score">{score} PV</span>
            </div>
            <div className="player-meta">
              <span>{player.isAI ? `IA ${DIFFICULTY_LABEL[player.difficulty]}` : 'Humano'}</span>
              <span>{bagTotal(player.resources)} recursos</span>
              <span>{player.devCards.length} cartas</span>
            </div>
            <div className="player-buildings">
              <span title="Poblados">{player.settlements.length}/{PIECE_LIMITS.settlements} poblados</span>
              <span title="Ciudades">{player.cities.length}/{PIECE_LIMITS.cities} ciudades</span>
              <span title="Carreteras">{player.roads.length}/{PIECE_LIMITS.roads} rutas</span>
            </div>
            {player.pokemon.length > 0 && (
              <div className="player-pokemon">
                {player.pokemon.map((pokemon) => (
                  <Sprite key={pokemon.instanceId} speciesId={pokemon.speciesId} size={28} />
                ))}
              </div>
            )}
            {awards.length > 0 && <div className="player-awards">{awards.map((award) => <span key={award}>{award}</span>)}</div>}
          </button>
        );
      })}
    </aside>
  );
}

function CardRow({
  card,
  state,
  player,
  probe,
  onPlayCard
}: {
  card: DevCard;
  state: GameState;
  player: PlayerState;
  probe: (action: GameAction) => string | null;
  onPlayCard: (card: DevCard) => void;
}): JSX.Element {
  const info = DEV_CARD_INFO[card.type];
  const blocked =
    card.played ||
    card.type === 'victory' ||
    card.boughtOnTurn === state.turn ||
    player.flags.devCardPlayedThisTurn;
  const reason = card.played
    ? 'Ya jugada'
    : card.type === 'victory'
      ? 'Se revela al final'
      : card.boughtOnTurn === state.turn
        ? 'Comprada este turno'
        : player.flags.devCardPlayedThisTurn
          ? 'Ya jugaste una carta este turno'
          : probe({ type: 'playDevCard', playerId: player.id, cardId: card.id }) ?? '';
  return (
    <button
      type="button"
      className={`dev-card ${blocked ? 'blocked' : ''}`}
      disabled={blocked}
      onClick={() => onPlayCard(card)}
      title={reason || info.description}
    >
      <span className="dev-card-name">{info.name}</span>
      <span className="dev-card-description">{info.description}</span>
      {card.type === 'victory' && <span className="dev-tag">PV oculto</span>}
      {card.boughtOnTurn === state.turn && card.type !== 'victory' && <span className="dev-tag">Nueva</span>}
    </button>
  );
}

function PokemonRow({
  state,
  player,
  pokemonId,
  probe,
  onAction
}: {
  state: GameState;
  player: PlayerState;
  pokemonId: string;
  probe: (action: GameAction) => string | null;
  onAction: (action: GameAction) => void;
}): JSX.Element {
  const pokemon = player.pokemon.find((entry) => entry.instanceId === pokemonId);
  if (!pokemon) return <></>;
  const species = getSpecies(pokemon.speciesId);
  const ability = ABILITIES[species.abilityId];
  const evolveError = canEvolve(state, player.id, pokemon.instanceId);
  const evolveTarget = species.evolvesTo ? getSpecies(species.evolvesTo) : null;
  const abilityError = probe({ type: 'useAbility', playerId: player.id, instanceId: pokemon.instanceId });
  const automatic = ['tradeWind', 'burrow', 'builder', 'fortify', 'gust', 'photosynthesis'].includes(species.abilityId);
  return (
    <div className="pokemon-card">
      <Sprite speciesId={species.id} size={54} />
      <div className="pokemon-info">
        <div className="pokemon-heading">
          <strong>{species.name}</strong>
          <span>{species.types.join(' / ')}</span>
        </div>
        <p>
          <b>{ability.name}</b>: {ability.description}
        </p>
        <div className="pokemon-tags">
          <span>{ability.frequency === 'passive' ? 'Pasiva' : '1 por ronda'}</span>
          {pokemon.abilityUsedRound === state.round && <span className="used">Usada</span>}
          {species.evolvesTo && evolveTarget && <span>Evoluciona a {evolveTarget.name}</span>}
        </div>
        <div className="pokemon-actions">
          {species.evolvesTo && evolveTarget && (
            <button
              type="button"
              className="mini-button"
              onClick={() => onAction({ type: 'evolvePokemon', playerId: player.id, instanceId: pokemon.instanceId })}
              disabled={Boolean(evolveError)}
              title={evolveError ?? `Evolucionar a ${evolveTarget.name}`}
            >
              Evolucionar
              {species.evolutionCost && <Cost cost={species.evolutionCost} />}
            </button>
          )}
          {!automatic && (
            <button
              type="button"
              className="mini-button"
              onClick={() => onAction({ type: 'useAbility', playerId: player.id, instanceId: pokemon.instanceId })}
              disabled={Boolean(abilityError)}
              title={abilityError ?? ability.description}
            >
              Usar habilidad
            </button>
          )}
          {automatic && <span className="automatic-tag">Automática</span>}
        </div>
      </div>
    </div>
  );
}

export function ActivePanel({
  state,
  viewerId,
  canAct,
  mode,
  onMode,
  onAction,
  onPlayCard,
  onOpenBank,
  onOpenTrade,
  onOpenTutorial,
  probe
}: {
  state: GameState;
  viewerId: number | null;
  canAct: boolean;
  mode: string;
  onMode: (mode: 'none' | 'road' | 'settlement' | 'city' | 'capture' | 'robber') => void;
  onAction: (action: GameAction) => void;
  onPlayCard: (card: DevCard) => void;
  onOpenBank: () => void;
  onOpenTrade: () => void;
  onOpenTutorial: () => void;
  probe: (action: GameAction) => string | null;
}): JSX.Element {
  const active = state.players[state.currentPlayerIndex];
  const player = (viewerId === null ? undefined : findPlayer(state, viewerId)) ?? active;
  if (!active || !player) return <aside className="active-panel" />;
  const isMyAction = canAct && viewerId === active.id;
  const canBuild = isMyAction && state.phase === 'action';
  const captureCount = captureTargets(state, player.id).length;
  const captureError = canCapture(state, player.id, captureTargets(state, player.id)[0] ?? '');
  const ratios = RESOURCES.map((resource) => ({ resource, ...tradeRatioFor(state, player.id, resource) }));

  return (
    <aside className="active-panel" aria-label="Jugador activo">
      <div className="active-heading" style={{ '--player-color': player.color } as CSSProperties}>
        <div>
          <p className="panel-kicker">{viewerId === active.id ? 'Tu turno' : 'Jugador en foco'}</p>
          <h2>{player.name}</h2>
        </div>
        <span className="turn-pill">
          Turno {state.turn} · Ronda {state.round}
        </span>
      </div>

      {viewerId === null ? (
        <div className="private-hidden">
          <strong>Información privada oculta</strong>
          <p>Pasa el dispositivo al jugador correspondiente para revelar su mano.</p>
        </div>
      ) : (
        <>
          <SectionTitle hint={`${bagTotal(player.resources)} recursos`}>Inventario</SectionTitle>
          <ResourceRow bag={player.resources} />
          <div className="ratio-row">
            {ratios.map(({ resource, ratio, viaAbility }) => (
              <span key={resource} className="ratio-chip" title={`Cambio de ${resource}`}>
                <ResourceChip resource={resource} compact />
                {ratio}:1{viaAbility ? ' *' : ''}
              </span>
            ))}
          </div>

          <SectionTitle hint={canBuild ? 'Haz clic y elige en el tablero' : 'Solo lectura'}>Construir</SectionTitle>
          <div className="build-grid">
            <button
              type="button"
              className={`build-button ${mode === 'road' ? 'selected' : ''}`}
              onClick={() => onMode(mode === 'road' ? 'none' : 'road')}
              disabled={!canBuild}
            >
              <span>Carretera</span>
              <Cost cost={BUILD_COSTS.road} />
            </button>
            <button
              type="button"
              className={`build-button ${mode === 'settlement' ? 'selected' : ''}`}
              onClick={() => onMode(mode === 'settlement' ? 'none' : 'settlement')}
              disabled={!canBuild}
            >
              <span>Poblado</span>
              <Cost cost={BUILD_COSTS.settlement} />
            </button>
            <button
              type="button"
              className={`build-button ${mode === 'city' ? 'selected' : ''}`}
              onClick={() => onMode(mode === 'city' ? 'none' : 'city')}
              disabled={!canBuild}
            >
              <span>Ciudad</span>
              <Cost cost={BUILD_COSTS.city} />
            </button>
            <button
              type="button"
              className={`build-button ${mode === 'capture' ? 'selected' : ''}`}
              onClick={() => onMode(mode === 'capture' ? 'none' : 'capture')}
              disabled={!canBuild}
              title={captureError ?? 'Captura un Pokémon junto a tu red'}
            >
              <span>Capturar ({captureCount})</span>
              <small>1 por turno · máx. 3</small>
            </button>
          </div>

          <SectionTitle hint={state.phase === 'roll' ? 'Obligatorio' : 'Acciones'}>Turno</SectionTitle>
          <div className="action-row">
            {state.phase === 'roll' && (
              <button type="button" className="pixel-button primary" disabled={!isMyAction} onClick={() => onAction({ type: 'rollDice', playerId: active.id })}>
                Lanzar dados
              </button>
            )}
            {state.phase === 'action' && (
              <>
                <button
                  type="button"
                  className="pixel-button"
                  disabled={!isMyAction}
                  onClick={() => onAction({ type: 'buyDevCard', playerId: active.id })}
                  title={state.devDeck.length === 0 ? 'No quedan cartas' : 'Comprar carta de desarrollo'}
                >
                  Comprar carta
                </button>
                <button
                  type="button"
                  className="pixel-button"
                  disabled={!isMyAction}
                  onClick={onOpenBank}
                >
                  Banco
                </button>
                <button
                  type="button"
                  className="pixel-button"
                  disabled={!isMyAction || Boolean(state.pendingTrade) || player.flags.tradeProposedThisTurn}
                  onClick={onOpenTrade}
                  title={state.pendingTrade ? 'Hay una oferta pendiente' : 'Proponer intercambio'}
                >
                  Proponer cambio
                </button>
                <button type="button" className="pixel-button end-turn" disabled={!isMyAction} onClick={() => onAction({ type: 'endTurn', playerId: active.id })}>
                  Terminar turno
                </button>
              </>
            )}
            {state.phase !== 'action' && state.phase !== 'roll' && (
              <span className="phase-note">Resuelve la fase actual para continuar.</span>
            )}
          </div>

          <SectionTitle hint={`${player.devCards.length} en mano · ${state.devDeck.length} en mazo`}>Cartas de desarrollo</SectionTitle>
          <div className="dev-list">
            {player.devCards.length === 0 && <p className="empty-note">No tienes cartas. Compra una por 1 lana + 1 trigo + 1 mineral.</p>}
            {player.devCards.map((card) => (
              <CardRow key={card.id} card={card} state={state} player={player} probe={probe} onPlayCard={onPlayCard} />
            ))}
          </div>

          <SectionTitle hint={`${player.pokemon.length}/3 activos`}>Pokémon</SectionTitle>
          <div className="pokemon-list">
            {player.pokemon.length === 0 && <p className="empty-note">Aún no has capturado Pokémon. Selecciona “Capturar” y elige un bioma junto a tu red.</p>}
            {player.pokemon.map((pokemon) => (
              <PokemonRow
                key={pokemon.instanceId}
                pokemonId={pokemon.instanceId}
                state={state}
                player={player}
                probe={probe}
                onAction={onAction}
              />
            ))}
          </div>

          <div className="panel-footer">
            <button type="button" className="text-button" onClick={onOpenTutorial}>
              Ayuda y reglas
            </button>
            <span>
              {state.awards.longestRoad === player.id ? 'Ruta Comercial +2 · ' : ''}
              {state.awards.largestArmy === player.id ? 'Ejército +2 · ' : ''}
              {player.knightsPlayed} caballeros
            </span>
          </div>
        </>
      )}
    </aside>
  );
}

export function EventLog({ state }: { state: GameState }): JSX.Element {
  const events = [...state.eventLog].reverse().slice(0, 40);
  return (
    <section className="event-log" aria-label="Historial de eventos">
      <header>
        <h3>Diario de aventura</h3>
        <span>Últimos {events.length} eventos</span>
      </header>
      <ol>
        {events.map((event) => (
          <li key={event.id} className={`event ${event.type}`}>
            <span className="event-turn">T{event.turn}</span>
            <span>{event.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}




