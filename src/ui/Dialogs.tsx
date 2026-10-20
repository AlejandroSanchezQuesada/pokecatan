import { useRef, useState, type CSSProperties } from 'react';
import { ABILITIES, BUILD_COSTS, DEV_CARD_INFO, DICE_PIPS, RESOURCE_INFO, TERRAIN_INFO, getSpecies } from '../engine/data';
import { bagTotal, canAfford, emptyBag, findPlayer, scorePlayer, tradeRatioFor } from '../engine/state';
import type {
  DevCard,
  DevCardType,
  GameAction,
  GameState,
  Hex,
  PendingTrade,
  PlayerState,
  Resource,
  ResourceBag
} from '../engine/types';
import { RESOURCES } from '../engine/types';
import { Cost, Modal, ResourceChip, ResourceRow, SectionTitle, Sprite } from './components';

export function Stepper({
  resource,
  value,
  max,
  onChange,
  disabled = false
}: {
  resource: Resource;
  value: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="stepper" style={{ '--resource-color': RESOURCE_INFO[resource].color } as CSSProperties}>
      <ResourceChip resource={resource} compact />
      <span className="stepper-name">{RESOURCE_INFO[resource].name}</span>
      <button type="button" className="step-button" onClick={() => onChange(Math.max(0, value - 1))} disabled={disabled || value <= 0} aria-label={`Quitar ${RESOURCE_INFO[resource].name}`}>
        -
      </button>
      <span className="step-value">{value}</span>
      <button type="button" className="step-button" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label={`Añadir ${RESOURCE_INFO[resource].name}`}>
        +
      </button>
    </div>
  );
}

function BagEditor({
  bag,
  maxBag,
  onChange,
  disabled = false
}: {
  bag: ResourceBag;
  maxBag: ResourceBag;
  onChange: (next: ResourceBag) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="bag-editor">
      {RESOURCES.map((resource) => (
        <Stepper
          key={resource}
          resource={resource}
          value={bag[resource]}
          max={maxBag[resource]}
          disabled={disabled}
          onChange={(next) => onChange({ ...bag, [resource]: next })}
        />
      ))}
    </div>
  );
}

export function TradeDialog({
  state,
  playerId,
  counterOf,
  onClose,
  onAction
}: {
  state: GameState;
  playerId: number;
  counterOf?: PendingTrade;
  onClose: () => void;
  onAction: (action: GameAction) => boolean;
}): JSX.Element {
  const player = findPlayer(state, playerId);
  const [toPlayerId, setToPlayerId] = useState<number | 'all'>('all');
  const [give, setGive] = useState<ResourceBag>(() => (counterOf ? { ...counterOf.receive } : emptyBag()));
  const [receive, setReceive] = useState<ResourceBag>(() => (counterOf ? { ...counterOf.give } : emptyBag()));
  if (!player) return <></>;
  const giveTotal = bagTotal(give);
  const receiveTotal = bagTotal(receive);
  const valid = giveTotal > 0 && receiveTotal > 0 && canAfford(player.resources, give);

  function submit(): void {
    if (!valid) return;
    const action: GameAction = counterOf
      ? { type: 'counterTrade', playerId, give, receive }
      : { type: 'proposeTrade', playerId, toPlayerId, give, receive };
    if (onAction(action)) onClose();
  }

  return (
    <Modal title={counterOf ? 'Contraoferta' : 'Proponer intercambio'} onClose={onClose}>
      <p className="dialog-lead">
        {counterOf
          ? `Respondes a ${findPlayer(state, counterOf.fromPlayerId)?.name ?? 'la oferta anterior'} con estas condiciones.`
          : 'Elige qué entregas y qué pides. La otra parte verá la oferta y podrá aceptar, rechazar o contraofertar.'}
      </p>
      {!counterOf && (
        <label className="dialog-field">
          Destinatario
          <select value={toPlayerId} onChange={(event) => setToPlayerId(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
            <option value="all">Todos los rivales</option>
            {state.players.filter((entry) => entry.id !== playerId).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="trade-columns">
        <section>
          <SectionTitle hint={`${giveTotal} recurso(s)`}>Tú entregas</SectionTitle>
          <ResourceRow bag={player.resources} compact />
          <BagEditor bag={give} maxBag={player.resources} onChange={setGive} />
        </section>
        <section>
          <SectionTitle hint={`${receiveTotal} recurso(s)`}>Tú recibes</SectionTitle>
          <BagEditor bag={receive} maxBag={{ wood: 9, clay: 9, wool: 9, wheat: 9, ore: 9 }} onChange={setReceive} />
          <p className="dialog-note">La otra parte debe poseer estos recursos para aceptar.</p>
        </section>
      </div>
      <footer className="dialog-actions">
        <button type="button" className="pixel-button" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="pixel-button primary" onClick={submit} disabled={!valid}>
          {counterOf ? 'Enviar contraoferta' : 'Enviar oferta'}
        </button>
      </footer>
    </Modal>
  );
}

export function BankDialog({
  state,
  playerId,
  onClose,
  onAction
}: {
  state: GameState;
  playerId: number;
  onClose: () => void;
  onAction: (action: GameAction) => boolean;
}): JSX.Element {
  const player = findPlayer(state, playerId);
  const [give, setGive] = useState<Resource>('wood');
  const [receive, setReceive] = useState<Resource>('clay');
  if (!player) return <></>;
  const ratio = tradeRatioFor(state, playerId, give);
  const enough = player.resources[give] >= ratio.ratio;
  const bankHas = state.bank[receive] > 0;
  const valid = give !== receive && enough && bankHas;

  function submit(): void {
    if (onAction({ type: 'bankTrade', playerId, give, receive })) onClose();
  }

  return (
    <Modal title="Comercio con el banco" onClose={onClose}>
      <p className="dialog-lead">
        Cambia recursos con el banco. Los puertos y la habilidad Viento comercial mejoran el tipo de cambio.
      </p>
      <div className="trade-columns">
        <section>
          <SectionTitle hint={`Tienes ${player.resources[give]}`}>Entregas</SectionTitle>
          <div className="resource-picker">
            {RESOURCES.map((resource) => (
              <button
                key={resource}
                type="button"
                className={`picker-option ${give === resource ? 'selected' : ''}`}
                onClick={() => setGive(resource)}
              >
                <ResourceChip resource={resource} count={player.resources[resource]} compact />
                <span>{tradeRatioFor(state, playerId, resource).ratio}:1</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle hint={`Banco: ${state.bank[receive]}`}>Recibes</SectionTitle>
          <div className="resource-picker">
            {RESOURCES.map((resource) => (
              <button
                key={resource}
                type="button"
                className={`picker-option ${receive === resource ? 'selected' : ''}`}
                onClick={() => setReceive(resource)}
                disabled={resource === give}
              >
                <ResourceChip resource={resource} count={state.bank[resource]} compact />
                <span>1 unidad</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <p className={`trade-summary ${valid ? '' : 'invalid'}`}>
        Entregas <strong>{ratio.ratio}</strong> {RESOURCE_INFO[give].name.toLowerCase()} y recibes <strong>1</strong>{' '}
        {RESOURCE_INFO[receive].name.toLowerCase()}.
        {ratio.viaAbility && ' Se usará la habilidad Viento comercial.'}
        {!enough && ` Necesitas ${ratio.ratio} y tienes ${player.resources[give]}.`}
        {!bankHas && ' El banco no tiene ese recurso.'}
      </p>
      <footer className="dialog-actions">
        <button type="button" className="pixel-button" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="pixel-button primary" onClick={submit} disabled={!valid}>
          Confirmar cambio
        </button>
      </footer>
    </Modal>
  );
}

export function DevDialog({
  state,
  playerId,
  card,
  onClose,
  onAction
}: {
  state: GameState;
  playerId: number;
  card: DevCard;
  onClose: () => void;
  onAction: (action: GameAction) => boolean;
}): JSX.Element {
  const info = DEV_CARD_INFO[card.type];
  const [first, setFirst] = useState<Resource>('wood');
  const [second, setSecond] = useState<Resource>('clay');
  const two = card.type === 'yearOfPlenty';
  const valid =
    card.type === 'monopoly'
      ? true
      : two
        ? state.bank[first] > 0 && state.bank[second] > 0
        : state.bank[first] > 0;

  function submit(): void {
    const params =
      card.type === 'yearOfPlenty'
        ? { resources: [first, second] }
        : card.type === 'monopoly' || card.type === 'berry'
          ? { resource: first }
          : undefined;
    if (onAction({ type: 'playDevCard', playerId, cardId: card.id, params })) onClose();
  }

  return (
    <Modal title={info.name} onClose={onClose}>
      <p className="dialog-lead">{info.description}</p>
      {(card.type === 'yearOfPlenty' || card.type === 'monopoly' || card.type === 'berry') && (
        <div className="dev-params">
          <label className="dialog-field">
            {two ? 'Primer recurso' : 'Recurso'}
            <select value={first} onChange={(event) => setFirst(event.target.value as Resource)}>
              {RESOURCES.map((resource) => (
                <option key={resource} value={resource} disabled={state.bank[resource] <= 0}>
                  {RESOURCE_INFO[resource].name} ({state.bank[resource]} en banco)
                </option>
              ))}
            </select>
          </label>
          {two && (
            <label className="dialog-field">
              Segundo recurso
              <select value={second} onChange={(event) => setSecond(event.target.value as Resource)}>
                {RESOURCES.map((resource) => (
                  <option key={resource} value={resource} disabled={state.bank[resource] <= 0}>
                    {RESOURCE_INFO[resource].name} ({state.bank[resource]} en banco)
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <footer className="dialog-actions">
        <button type="button" className="pixel-button" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="pixel-button primary" onClick={submit} disabled={!valid}>
          Jugar carta
        </button>
      </footer>
    </Modal>
  );
}

export function DiscardDialog({
  player,
  required,
  bag,
  onChange,
  onConfirm
}: {
  player: PlayerState;
  required: number;
  bag: ResourceBag;
  onChange: (bag: ResourceBag) => void;
  onConfirm: () => void;
}): JSX.Element {
  const total = bagTotal(bag);
  return (
    <Modal title={`Descarte de ${player.name}`} dismissible={false}>
      <p className="dialog-lead">
        Has obtenido un 7 con <strong>{bagTotal(player.resources)} recursos</strong>. Debes descartar exactamente{' '}
        <strong>{required}</strong> y quedarte con {bagTotal(player.resources) - required}.
      </p>
      <ResourceRow bag={player.resources} />
      <BagEditor bag={bag} maxBag={player.resources} onChange={onChange} />
      <p className={`trade-summary ${total === required ? '' : 'invalid'}`}>
        Seleccionados: {total} / {required}
      </p>
      <footer className="dialog-actions">
        <button type="button" className="pixel-button primary" onClick={onConfirm} disabled={total !== required}>
          Confirmar descarte
        </button>
      </footer>
    </Modal>
  );
}

export function HexDialog({
  state,
  hex,
  onClose
}: {
  state: GameState;
  hex: Hex | null;
  onClose: () => void;
}): JSX.Element | null {
  if (!hex) return null;
  const terrain = TERRAIN_INFO[hex.terrain];
  const species = hex.wildPokemonId ? getSpecies(hex.wildPokemonId) : null;
  const ability = species ? ABILITIES[species.abilityId] : null;
  const owners = state.players.filter((player) =>
    [...player.settlements, ...player.cities].some((vertexId) => hex.vertexIds.includes(vertexId))
  );
  return (
    <Modal title={`${terrain.name} · ${hex.id}`} onClose={onClose}>
      <div className="hex-dialog">
        <div className="hex-dialog-terrain" style={{ background: terrain.color }}>
          <span>{hex.number ? `Ficha ${hex.number}` : 'Sin producción'}</span>
          <span>{hex.number ? `${DICE_PIPS[hex.number] ?? 0}/36 de probabilidad` : 'Desierto'}</span>
          {state.robberHexId === hex.id && <strong>Ladrón presente</strong>}
        </div>
        {state.robberHexId === hex.id && <p className="dialog-note">Este hexágono no produce recursos mientras el ladrón esté aquí.</p>}
        {species && ability && (
          <div className="species-detail">
            <Sprite speciesId={species.id} size={96} />
            <div>
              <h3>{species.name}</h3>
              <p>{species.types.join(' / ')}</p>
              <p>
                <b>{ability.name}</b>: {ability.description}
              </p>
              <p>
                Coste de captura: <Cost cost={species.captureCost} />
              </p>
              {species.evolvesTo && <p>Evoluciona a {getSpecies(species.evolvesTo).name}.</p>}
            </div>
          </div>
        )}
        {!species && <p className="empty-note">No queda ningún Pokémon salvaje en este hexágono.</p>}
        <p className="dialog-note">
          {owners.length > 0
            ? `Construcciones adyacentes: ${owners.map((owner) => owner.name).join(', ')}.`
            : 'No hay construcciones adyacentes.'}
        </p>
      </div>
    </Modal>
  );
}

export function RobberDialog({
  state,
  hexId,
  targets,
  onClose,
  onChoose
}: {
  state: GameState;
  hexId: string;
  targets: number[];
  onClose: () => void;
  onChoose: (targetId: number) => void;
}): JSX.Element {
  const players = targets.map((id) => findPlayer(state, id)).filter((player): player is PlayerState => Boolean(player));
  return (
    <Modal title="Elige a quién robar" onClose={onClose}>
      <p className="dialog-lead">El ladrón se mueve a {hexId}. Hay varias construcciones rivales adyacentes.</p>
      <div className="robber-targets">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            className="robber-target"
            style={{ '--player-color': player.color } as CSSProperties}
            onClick={() => onChoose(player.id)}
          >
            <span className="player-dot" />
            <strong>{player.name}</strong>
            <span>{bagTotal(player.resources)} recursos en mano</span>
          </button>
        ))}
      </div>
      <p className="dialog-note">Se robará una carta de recurso aleatoria.</p>
    </Modal>
  );
}

export function GateScreen({
  player,
  reason,
  onReveal
}: {
  player: PlayerState;
  reason: string;
  onReveal: () => void;
}): JSX.Element {
  return (
    <div className="gate-screen" role="dialog" aria-modal="true" aria-label={`Privacidad de ${player.name}`}>
      <div className="gate-card" style={{ '--player-color': player.color } as CSSProperties}>
        <span className="gate-icon">?</span>
        <p className="panel-kicker">Multijugador local</p>
        <h2>Pasa el dispositivo a {player.name}</h2>
        <p>{reason}</p>
        <p className="dialog-note">La mano y las cartas privadas permanecen ocultas hasta que confirmes.</p>
        <button type="button" className="pixel-button primary large" onClick={onReveal}>
          Soy {player.name}, mostrar mi turno
        </button>
      </div>
    </div>
  );
}

export function VictoryDialog({
  state,
  onClose,
  onExit
}: {
  state: GameState;
  onClose: () => void;
  onExit: () => void;
}): JSX.Element {
  const winner = state.winnerId === null ? null : findPlayer(state, state.winnerId);
  const ranking = [...state.players].sort((a, b) => scorePlayer(state, b.id, true) - scorePlayer(state, a.id, true));
  return (
    <Modal title="¡Partida terminada!" wide className="victory-modal">
      <div className="victory-burst" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} style={{ '--i': index } as CSSProperties} />
        ))}
      </div>
      <p className="victory-winner">{winner ? `${winner.name} alcanza 10 puntos de victoria` : 'Partida finalizada'}</p>
      <div className="ranking">
        {ranking.map((player, index) => (
          <div key={player.id} className="ranking-row" style={{ '--player-color': player.color } as CSSProperties}>
            <span className="ranking-position">#{index + 1}</span>
            <span className="player-dot" />
            <strong>{player.name}</strong>
            <span>{player.settlements.length} poblados</span>
            <span>{player.cities.length} ciudades</span>
            <span>{player.pokemon.length} Pokémon</span>
            <span className="ranking-score">{scorePlayer(state, player.id, true)} PV</span>
          </div>
        ))}
      </div>
      <div className="victory-stats">
        <span>{state.stats.turnsPlayed} turnos jugados</span>
        <span>{state.stats.rolls} tiradas</span>
        <span>{state.stats.captures} capturas</span>
        <span>{state.stats.evolutions} evoluciones</span>
        <span>{state.stats.devCardsPlayed} cartas jugadas</span>
        <span>Semilla {state.seed}</span>
      </div>
      <div className="victory-actions">
        <button type="button" className="pixel-button" onClick={onClose}>
          Ver el tablero
        </button>
        <button type="button" className="pixel-button primary" onClick={onExit}>
          Volver al menú
        </button>
      </div>
    </Modal>
  );
}

export function PauseDialog({
  state,
  onClose,
  onExit,
  onSave,
  onExport,
  onImport,
  onTutorial,
  onHideHand,
  soundOn,
  volume,
  onToggleSound,
  onChangeVolume,
  saveLabel
}: {
  state: GameState;
  onClose: () => void;
  onExit: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onTutorial: () => void;
  onHideHand: () => void;
  soundOn: boolean;
  volume: number;
  onToggleSound: () => void;
  onChangeVolume: (next: number) => void;
  saveLabel: string;
}): JSX.Element {
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <Modal title="Pausa y opciones" onClose={onClose}>
      <div className="pause-summary">
        <span>{state.gameName}</span>
        <span>Semilla {state.seed}</span>
        <span>{saveLabel}</span>
      </div>
      <div className="pause-grid">
        <button type="button" className="pixel-button" onClick={onSave}>
          Guardar ahora
        </button>
        <button type="button" className="pixel-button" onClick={onExport}>
          Exportar JSON
        </button>
        <button type="button" className="pixel-button" onClick={() => importRef.current?.click()}>
          Importar JSON
        </button>
        <button type="button" className="pixel-button" onClick={onTutorial}>
          Reglas y ayuda
        </button>
        <input
          ref={importRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.target.value = '';
          }}
        />
      </div>
      <SectionTitle>Preferencias</SectionTitle>
      <div className="audio-settings">
        <button type="button" className={`toggle ${soundOn ? 'on' : ''}`} onClick={onToggleSound} aria-pressed={soundOn}>
          {soundOn ? 'Sonido activado' : 'Sonido desactivado'}
        </button>
        <label>
          Volumen
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => onChangeVolume(Number(event.target.value))} />
        </label>
      </div>
      {state.mode === 'local' && (
        <button type="button" className="pixel-button" onClick={onHideHand}>
          Ocultar mi mano y pasar el dispositivo
        </button>
      )}
      <div className="pause-danger">
        <button type="button" className="pixel-button danger" onClick={onExit}>
          Salir al menú principal
        </button>
        <p>El autoguardado permanece disponible en el menú principal.</p>
      </div>
    </Modal>
  );
}

export function CardPicker({
  state,
  player,
  onSelect
}: {
  state: GameState;
  player: PlayerState;
  onSelect: (card: DevCard) => void;
}): JSX.Element {
  return (
    <div className="dev-list">
      {player.devCards.map((card) => (
        <button key={card.id} type="button" className="dev-card" onClick={() => onSelect(card)}>
          <span className="dev-card-name">{DEV_CARD_INFO[card.type].name}</span>
          <span className="dev-card-description">{DEV_CARD_INFO[card.type].description}</span>
        </button>
      ))}
      {player.devCards.length === 0 && <p className="empty-note">No tienes cartas.</p>}
      <p className="dialog-note">Mazo restante: {state.devDeck.length}. Carta nueva: 1 lana + 1 trigo + 1 mineral.</p>
      <Cost cost={BUILD_COSTS.dev} />
    </div>
  );
}
