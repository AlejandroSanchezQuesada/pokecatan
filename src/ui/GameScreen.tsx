import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction
} from 'react';
import { pendingAITradeResponder, runAITurn } from '../ai';
import { applyAction } from '../engine/actions';
import { DIFFICULTY_LABEL, PLAYER_COLORS, getSpecies } from '../engine/data';
import { canCapture, captureTargets } from '../engine/pokemon';
import {
  deserializeState,
  downloadFileName,
  saveToLocalStorage,
  serializeState
} from '../engine/persistence';
import { bagTotal, emptyBag, findPlayer, publicScore, visibleScore } from '../engine/state';
import type { DevCard, GameAction, GameState, PlayerState, ResourceBag } from '../engine/types';
import { BoardView, type InteractionMode } from './BoardView';
import { Die, Modal, ResourceRow, SectionTitle, Sprite } from './components';
import {
  BankDialog,
  DevDialog,
  DiscardDialog,
  GateScreen,
  HexDialog,
  PauseDialog,
  RobberDialog,
  TradeDialog,
  VictoryDialog
} from './Dialogs';
import { ActivePanel, EventLog, PlayerList } from './Panels';
import { TutorialContent } from './Tutorial';
import {
  playSound,
  setSoundEnabled,
  setSoundVolume,
  soundEnabled,
  soundVolume
} from './sound';

interface GameScreenProps {
  state: GameState;
  setState: Dispatch<SetStateAction<GameState | null>>;
  onExit: () => void;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}

function eligibleStealTargets(state: GameState, playerId: number, hexId: string): PlayerState[] {
  const hex = state.board.hexes.find((entry) => entry.id === hexId);
  if (!hex) return [];
  return state.players.filter((player) => {
    if (player.id === playerId || bagTotal(player.resources) === 0) return false;
    return [...player.settlements, ...player.cities].some((vertexId) => hex.vertexIds.includes(vertexId));
  });
}

function phaseLabel(state: GameState): string {
  switch (state.phase) {
    case 'setup':
      return state.setup.awaiting === 'settlement' ? 'Colocación: poblado' : 'Colocación: carretera';
    case 'roll':
      return 'Tirada de dados';
    case 'discard':
      return 'Descartes por 7';
    case 'robber':
      return 'Mover ladrón';
    case 'action':
      return 'Acciones';
    case 'ended':
      return 'Partida finalizada';
  }
}

export function GameScreen({ state, setState, onExit, notify }: GameScreenProps): JSX.Element {
  const [mode, setMode] = useState<InteractionMode>('none');
  const [rolling, setRolling] = useState(false);
  const [unlockedKey, setUnlockedKey] = useState<string | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState<{ counterOf?: GameState['pendingTrade'] } | null>(null);
  const [devCard, setDevCard] = useState<DevCard | null>(null);
  const [hexInfoId, setHexInfoId] = useState<string | null>(null);
  const [robberChoice, setRobberChoice] = useState<{ hexId: string; targets: number[] } | null>(null);
  const [inspectPlayerId, setInspectPlayerId] = useState<number | null>(null);
  const [discardBag, setDiscardBag] = useState<ResourceBag>(() => emptyBag());
  const [saveLabel, setSaveLabel] = useState('Autoguardado pendiente');
  const [audioOn, setAudioOn] = useState(soundEnabled());
  const [audioVolume, setAudioVolume] = useState(soundVolume());
  const rollTimer = useRef<number | undefined>(undefined);

  const activePlayer = state.players[state.currentPlayerIndex] ?? state.players[0]!;
  const pendingHumanDiscardId =
    Object.keys(state.discardsRequired)
      .map(Number)
      .find((id) => findPlayer(state, id)?.isAI === false) ?? null;

  const tradeHumanRecipient = (() => {
    const trade = state.pendingTrade;
    if (!trade) return null;
    const recipients =
      trade.toPlayerId === 'all'
        ? state.players.filter((player) => player.id !== trade.fromPlayerId)
        : [findPlayer(state, trade.toPlayerId)].filter((player): player is PlayerState => Boolean(player));
    return (
      recipients.find(
        (player) => !player.isAI && !trade.rejectedBy.includes(player.id) && player.id !== trade.fromPlayerId
      ) ?? null
    );
  })();

  const attentionPlayerId =
    pendingHumanDiscardId ?? tradeHumanRecipient?.id ?? (activePlayer.isAI ? null : activePlayer.id);
  const gateKey = `${state.turn}:${attentionPlayerId ?? 'none'}:${state.pendingTrade?.id ?? ''}`;
  const needsGate =
    state.mode === 'local' && attentionPlayerId !== null && state.phase !== 'ended' && unlockedKey !== gateKey;
  const viewerId =
    state.mode === 'solo' ? (activePlayer.isAI ? null : activePlayer.id) : needsGate ? null : attentionPlayerId;
  const canAct =
    !activePlayer.isAI &&
    !needsGate &&
    pendingHumanDiscardId === null &&
    state.phase !== 'ended' &&
    viewerId === activePlayer.id;

  const interactionMode: InteractionMode =
    state.phase === 'setup'
      ? state.setup.awaiting === 'settlement'
        ? 'settlement'
        : 'road'
      : state.phase === 'robber'
        ? 'robber'
        : mode;

  const canInteract = canAct && (state.phase === 'setup' || state.phase === 'action' || state.phase === 'robber');

  const candidates = useMemo(() => {
    const vertices = new Set<string>();
    const edges = new Set<string>();
    const hexes = new Set<string>();
    if (!canInteract) return { vertices, edges, hexes };
    const playerId = interactionMode === 'robber' ? state.pendingRobber?.playerId ?? activePlayer.id : activePlayer.id;
    const legal = (action: GameAction): boolean => applyAction(state, action).ok;
    if (interactionMode === 'settlement') {
      for (const vertex of state.board.vertices) {
        const action: GameAction =
          state.phase === 'setup'
            ? { type: 'setupSettlement', playerId, vertexId: vertex.id }
            : { type: 'buildSettlement', playerId, vertexId: vertex.id };
        if (legal(action)) vertices.add(vertex.id);
      }
    } else if (interactionMode === 'city') {
      for (const vertexId of activePlayer.settlements) {
        if (legal({ type: 'buildCity', playerId, vertexId })) vertices.add(vertexId);
      }
    } else if (interactionMode === 'road') {
      for (const edge of state.board.edges) {
        const action: GameAction =
          state.phase === 'setup'
            ? { type: 'setupRoad', playerId, edgeId: edge.id }
            : { type: 'buildRoad', playerId, edgeId: edge.id };
        if (legal(action)) edges.add(edge.id);
      }
    } else if (interactionMode === 'capture') {
      for (const hexId of captureTargets(state, playerId)) {
        if (canCapture(state, playerId, hexId) === null) hexes.add(hexId);
      }
    } else if (interactionMode === 'robber') {
      for (const hex of state.board.hexes) if (hex.id !== state.robberHexId) hexes.add(hex.id);
    }
    return { vertices, edges, hexes };
  }, [activePlayer, canInteract, interactionMode, state]);

  useEffect(() => {
    setMode('none');
  }, [state.currentPlayerIndex, state.phase, state.turn]);

  useEffect(() => {
    setDiscardBag(emptyBag());
  }, [pendingHumanDiscardId, state.turn]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const result = saveToLocalStorage(state);
      setSaveLabel(
        result.ok ? `Guardado ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Autoguardado no disponible'
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    return () => {
      if (rollTimer.current !== undefined) window.clearTimeout(rollTimer.current);
    };
  }, []);

  const aiCanProgress =
    state.phase !== 'ended' &&
    ((state.phase === 'discard' &&
      Object.keys(state.discardsRequired).some((id) => findPlayer(state, Number(id))?.isAI)) ||
      (state.pendingTrade ? pendingAITradeResponder(state) !== null : activePlayer.isAI));

  useEffect(() => {
    if (!aiCanProgress) return;
    const timer = window.setTimeout(() => {
      const result = runAITurn(state, 240);
      if (result.error) {
        notify(`La IA encontró un problema: ${result.error}`, 'error');
        return;
      }
      if (result.actions.length === 0) return;
      setState(result.state);
      if (result.actions.some((action) => action.type === 'rollDice')) playSound('dice');
      else if (result.actions.some((action) => action.type === 'endTurn')) playSound('click');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [aiCanProgress, notify, setState, state]);

  function playEvents(events: GameState['eventLog']): void {
    if (events.some((event) => event.type === 'victory')) {
      playSound('victory');
      return;
    }
    if (events.some((event) => event.type === 'dice')) {
      playSound('dice');
      return;
    }
    if (events.some((event) => event.type === 'pokemon')) {
      playSound('capture');
      return;
    }
    if (events.some((event) => event.type === 'trade')) {
      playSound('trade');
      return;
    }
    if (events.some((event) => event.type === 'build')) {
      playSound('build');
      return;
    }
    playSound('click');
  }

  function submit(action: GameAction): boolean {
    const result = applyAction(state, action);
    if (!result.ok) {
      notify(result.error, 'error');
      playSound('error');
      return false;
    }
    setState(result.state);
    playEvents(result.events);
    if (action.type === 'rollDice') {
      setRolling(true);
      if (rollTimer.current !== undefined) window.clearTimeout(rollTimer.current);
      rollTimer.current = window.setTimeout(() => setRolling(false), 720);
    }
    if (action.type === 'endTurn') setMode('none');
    if (action.type === 'setupSettlement' && result.state.setup.awaiting === 'road') setMode('road');
    if (action.type === 'setupRoad') setMode('none');
    if (action.type === 'buildSettlement' || action.type === 'buildCity' || action.type === 'capturePokemon') setMode('none');
    if (action.type === 'playDevCard') {
      if (action.cardId && action.params) setMode('none');
      const played = findPlayer(state, action.playerId)?.devCards.find((card) => card.id === action.cardId);
      if (played?.type === 'roadBuilding') setMode('road');
      if (played?.type === 'pokeBall') setMode('capture');
    }
    setRobberChoice(null);
    setTradeOpen(null);
    setBankOpen(false);
    setDevCard(null);
    return true;
  }

  function probe(action: GameAction): string | null {
    const result = applyAction(state, action);
    return result.ok ? null : result.error;
  }

  function vertexAction(vertexId: string): void {
    if (state.phase === 'setup') {
      submit({ type: 'setupSettlement', playerId: activePlayer.id, vertexId });
      return;
    }
    if (mode === 'city') {
      submit({ type: 'buildCity', playerId: activePlayer.id, vertexId });
      return;
    }
    if (mode === 'settlement') {
      submit({ type: 'buildSettlement', playerId: activePlayer.id, vertexId });
      return;
    }
    notify('Selecciona primero una acción de construcción.', 'info');
  }

  function edgeAction(edgeId: string): void {
    if (state.phase === 'setup') {
      submit({ type: 'setupRoad', playerId: activePlayer.id, edgeId });
      return;
    }
    if (mode === 'road') {
      submit({ type: 'buildRoad', playerId: activePlayer.id, edgeId });
      return;
    }
    notify('Selecciona “Carretera” para construir en el tablero.', 'info');
  }

  function hexAction(hexId: string): void {
    if (interactionMode === 'capture') {
      submit({ type: 'capturePokemon', playerId: activePlayer.id, hexId });
      return;
    }
    if (interactionMode === 'robber') {
      const robberId = state.pendingRobber?.playerId ?? activePlayer.id;
      if (hexId === state.robberHexId) {
        notify('El ladrón debe moverse a un hexágono distinto.', 'error');
        return;
      }
      const targets = eligibleStealTargets(state, robberId, hexId);
      if (targets.length > 0) {
        setRobberChoice({ hexId, targets: targets.map((player) => player.id) });
      } else {
        submit({ type: 'moveRobber', playerId: robberId, hexId, stealFromPlayerId: null });
      }
      return;
    }
    setHexInfoId(hexId);
  }

  function playCard(card: DevCard): void {
    if (card.type === 'yearOfPlenty' || card.type === 'monopoly' || card.type === 'berry') {
      setDevCard(card);
      return;
    }
    submit({ type: 'playDevCard', playerId: activePlayer.id, cardId: card.id });
  }

  function exportSave(): void {
    const blob = new Blob([serializeState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadFileName(state);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notify('Partida exportada como JSON.', 'success');
  }

  async function importSave(file: File): Promise<void> {
    try {
      const text = await file.text();
      const result = deserializeState(text);
      if (result.ok && result.state) {
        setState(result.state);
        setPauseOpen(false);
        setMode('none');
        setVictoryDismissed(false);
        setUnlockedKey(null);
        notify('Partida importada y validada correctamente.', 'success');
      } else {
        notify(result.error ?? 'El archivo no contiene una partida válida.', 'error');
      }
    } catch {
      notify('No se pudo leer el archivo seleccionado.', 'error');
    }
  }

  function saveNow(): void {
    const result = saveToLocalStorage(state);
    if (result.ok) {
      setSaveLabel('Guardado manualmente');
      notify('Partida guardada en este navegador.', 'success');
    } else {
      notify(result.error ?? 'No se pudo guardar la partida.', 'error');
    }
  }

  function toggleSound(): void {
    const next = !audioOn;
    setAudioOn(next);
    setSoundEnabled(next);
    if (next) playSound('click');
  }

  function changeVolume(next: number): void {
    setAudioVolume(next);
    setSoundVolume(next);
  }

  const incomingTrade =
    state.pendingTrade &&
    viewerId !== null &&
    state.pendingTrade.fromPlayerId !== viewerId &&
    !state.pendingTrade.rejectedBy.includes(viewerId) &&
    (state.pendingTrade.toPlayerId === 'all' || state.pendingTrade.toPlayerId === viewerId)
      ? state.pendingTrade
      : null;
  const showIncomingTrade = Boolean(incomingTrade) && !tradeOpen;

  const discardPlayer = pendingHumanDiscardId === null ? null : findPlayer(state, pendingHumanDiscardId) ?? null;
  const discardRequired = discardPlayer ? state.discardsRequired[discardPlayer.id] ?? 0 : 0;

  const hexInfo = hexInfoId ? state.board.hexes.find((hex) => hex.id === hexInfoId) ?? null : null;
  const inspectPlayer = inspectPlayerId === null ? null : findPlayer(state, inspectPlayerId) ?? null;
  const gatePlayer = attentionPlayerId === null ? null : findPlayer(state, attentionPlayerId) ?? null;
  const isMyTurn = canAct && state.phase !== 'setup';

  function turnHint(): string {
    if (state.phase === 'ended') return 'La partida ha terminado. Consulta el resumen o vuelve al menú.';
    if (pendingHumanDiscardId !== null) return 'Un 7 obliga a descartar. Completa el descarte para continuar.';
    if (needsGate) return 'Confirma tu identidad para revelar tu turno.';
    if (state.pendingTrade) return 'Hay una oferta de intercambio pendiente de respuesta.';
    if (state.phase === 'setup') {
      return state.setup.awaiting === 'settlement'
        ? `${activePlayer.name}: coloca un poblado en un cruce resaltado.`
        : `${activePlayer.name}: conecta una carretera al poblado recién colocado.`;
    }
    if (activePlayer.isAI) return `${activePlayer.name} (IA ${DIFFICULTY_LABEL[activePlayer.difficulty]}) está pensando…`;
    if (state.phase === 'roll') return `${activePlayer.name}: lanza los dados para producir recursos.`;
    if (state.phase === 'robber') return 'Elige un hexágono para mover al ladrón.';
    if (state.phase === 'discard') return 'Los jugadores afectados están descartando recursos.';
    if (mode === 'road') return 'Elige un camino resaltado. Clic de nuevo en Carretera para cancelar.';
    if (mode === 'settlement') return 'Elige un cruce resaltado para fundar un poblado.';
    if (mode === 'city') return 'Elige uno de tus poblados para mejorarlo a ciudad.';
    if (mode === 'capture') return 'Elige un hexágono con Pokémon salvaje junto a tu red.';
    return `${activePlayer.name}: construye, comercia, captura o termina el turno.`;
  }

  if (state.phase === 'ended' && !victoryDismissed) {
    return (
      <>
        <div className="game-screen">
          <TopBar />
          <div className="game-layout">
            <PlayerList state={state} viewerId={viewerId} onSelect={setInspectPlayerId} />
            <main className="board-column">
              <p className="turn-banner">{turnHint()}</p>
              <BoardView
                state={state}
                mode="none"
                vertexCandidates={candidates.vertices}
                edgeCandidates={candidates.edges}
                hexCandidates={candidates.hexes}
                onVertex={vertexAction}
                onEdge={edgeAction}
                onHex={hexAction}
                disabled
              />
              <EventLog state={state} />
            </main>
            <ActivePanel
              state={state}
              viewerId={viewerId}
              canAct={false}
              mode={mode}
              onMode={setMode}
              onAction={submit}
              onPlayCard={playCard}
              onOpenBank={() => setBankOpen(true)}
              onOpenTrade={() => setTradeOpen({})}
              onOpenTutorial={() => setTutorialOpen(true)}
              probe={probe}
            />
          </div>
        </div>
        <VictoryDialog state={state} onClose={() => setVictoryDismissed(true)} onExit={onExit} />
      </>
    );
  }

  return (
    <div className="game-screen">
      <TopBar />
      <div className="game-layout">
        <PlayerList state={state} viewerId={viewerId} onSelect={setInspectPlayerId} />
        <main className="board-column">
          <p className="turn-banner">
            <span>{turnHint()}</span>
            {state.pendingTrade && <span className="trade-pending-pill">Oferta de {findPlayer(state, state.pendingTrade.fromPlayerId)?.name}</span>}
          </p>
          <BoardView
            state={state}
            mode={interactionMode}
            vertexCandidates={candidates.vertices}
            edgeCandidates={candidates.edges}
            hexCandidates={candidates.hexes}
            onVertex={vertexAction}
            onEdge={edgeAction}
            onHex={hexAction}
            disabled={!canInteract}
          />
          <EventLog state={state} />
        </main>
        <ActivePanel
          state={state}
          viewerId={viewerId}
          canAct={canAct}
          mode={mode}
          onMode={(next) => {
            if (!isMyTurn) {
              notify('Espera a tu turno de acciones para construir.', 'info');
              return;
            }
            setMode(next);
          }}
          onAction={submit}
          onPlayCard={playCard}
          onOpenBank={() => setBankOpen(true)}
          onOpenTrade={() => setTradeOpen({})}
          onOpenTutorial={() => setTutorialOpen(true)}
          probe={probe}
        />
      </div>

      {needsGate && gatePlayer && (
        <GateScreen
          player={gatePlayer}
          reason={
            pendingHumanDiscardId !== null
              ? 'Debes descartar recursos por la tirada de un 7.'
              : tradeHumanRecipient
                ? 'Hay una oferta de intercambio dirigida a ti.'
                : 'Es tu turno.'
          }
          onReveal={() => setUnlockedKey(gateKey)}
        />
      )}

      {showIncomingTrade && incomingTrade && !needsGate && (
        <Modal title="Oferta de intercambio" dismissible={false}>
          <p className="dialog-lead">
            <strong>{findPlayer(state, incomingTrade.fromPlayerId)?.name}</strong> propone:
          </p>
          <div className="trade-columns">
            <section>
              <SectionTitle>Recibes</SectionTitle>
              <ResourceRow bag={incomingTrade.give} />
            </section>
            <section>
              <SectionTitle>Entregas</SectionTitle>
              <ResourceRow bag={incomingTrade.receive} />
            </section>
          </div>
          <footer className="dialog-actions">
            <button type="button" className="pixel-button" onClick={() => submit({ type: 'rejectTrade', playerId: viewerId! })}>
              Rechazar
            </button>
            <button
              type="button"
              className="pixel-button"
              onClick={() => setTradeOpen({ counterOf: incomingTrade })}
            >
              Contraofertar
            </button>
            <button
              type="button"
              className="pixel-button primary"
              onClick={() => submit({ type: 'acceptTrade', playerId: viewerId! })}
            >
              Aceptar
            </button>
          </footer>
        </Modal>
      )}

      {discardPlayer && !needsGate && viewerId === discardPlayer.id && (
        <DiscardDialog
          player={discardPlayer}
          required={discardRequired}
          bag={discardBag}
          onChange={setDiscardBag}
          onConfirm={() =>
            submit({ type: 'discard', playerId: discardPlayer.id, resources: discardBag })
          }
        />
      )}

      {tradeOpen && viewerId !== null && (
        <TradeDialog
          state={state}
          playerId={viewerId}
          counterOf={tradeOpen.counterOf ?? undefined}
          onClose={() => setTradeOpen(null)}
          onAction={submit}
        />
      )}

      {bankOpen && viewerId !== null && (
        <BankDialog state={state} playerId={viewerId} onClose={() => setBankOpen(false)} onAction={submit} />
      )}

      {devCard && viewerId !== null && (
        <DevDialog
          state={state}
          playerId={viewerId}
          card={devCard}
          onClose={() => setDevCard(null)}
          onAction={submit}
        />
      )}

      {robberChoice && (
        <RobberDialog
          state={state}
          hexId={robberChoice.hexId}
          targets={robberChoice.targets}
          onClose={() => setRobberChoice(null)}
          onChoose={(targetId) =>
            submit({
              type: 'moveRobber',
              playerId: state.pendingRobber?.playerId ?? activePlayer.id,
              hexId: robberChoice.hexId,
              stealFromPlayerId: targetId
            })
          }
        />
      )}

      <HexDialog state={state} hex={hexInfo} onClose={() => setHexInfoId(null)} />

      {inspectPlayer && (
        <Modal title={inspectPlayer.name} onClose={() => setInspectPlayerId(null)}>
          <div className="player-detail" style={{ '--player-color': inspectPlayer.color } as CSSProperties}>
            <div className="player-detail-head">
              <span className="player-dot" />
              <strong>{inspectPlayer.isAI ? `IA ${DIFFICULTY_LABEL[inspectPlayer.difficulty]}` : 'Jugador humano'}</strong>
              <span>{viewerId === null ? publicScore(state, inspectPlayer.id) : visibleScore(state, viewerId, inspectPlayer.id)} PV</span>
            </div>
            <p>
              {inspectPlayer.settlements.length} poblados · {inspectPlayer.cities.length} ciudades ·{' '}
              {inspectPlayer.roads.length} carreteras · {inspectPlayer.knightsPlayed} caballeros.
            </p>
            <p>
              {bagTotal(inspectPlayer.resources)} recursos en mano · {inspectPlayer.devCards.length} cartas de desarrollo.
            </p>
            {inspectPlayer.pokemon.length > 0 && (
              <div className="player-pokemon">
                {inspectPlayer.pokemon.map((pokemon) => (
                  <span key={pokemon.instanceId} className="pokemon-mini">
                    <Sprite speciesId={pokemon.speciesId} size={40} />
                    {getSpecies(pokemon.speciesId).name}
                  </span>
                ))}
              </div>
            )}
            <p className="dialog-note">La composición exacta de la mano y las cartas ocultas no se muestran.</p>
          </div>
        </Modal>
      )}

      {pauseOpen && (
        <PauseDialog
          state={state}
          onClose={() => setPauseOpen(false)}
          onExit={onExit}
          onSave={saveNow}
          onExport={exportSave}
          onImport={(file) => void importSave(file)}
          onTutorial={() => {
            setPauseOpen(false);
            setTutorialOpen(true);
          }}
          onHideHand={() => {
            setPauseOpen(false);
            setUnlockedKey(null);
          }}
          soundOn={audioOn}
          volume={audioVolume}
          onToggleSound={toggleSound}
          onChangeVolume={changeVolume}
          saveLabel={saveLabel}
        />
      )}

      {tutorialOpen && (
        <Modal title="Cómo jugar" onClose={() => setTutorialOpen(false)} wide>
          <TutorialContent />
        </Modal>
      )}
    </div>
  );

  function TopBar(): JSX.Element {
    return (
      <header className="game-topbar">
        <button type="button" className="pixel-button compact" onClick={() => setPauseOpen(true)}>
          Menú
        </button>
        <div className="game-title">
          <span className="panel-kicker">PokéCatán</span>
          <strong>{state.gameName}</strong>
        </div>
        <div className="phase-cluster">
          <span className="phase-badge">{phaseLabel(state)}</span>
          <span className={`turn-dot ${activePlayer.isAI ? 'ai' : ''}`} style={{ background: PLAYER_COLORS[activePlayer.id] }}>
            {activePlayer.name}
          </span>
        </div>
        <div className="dice-cluster" aria-label="Última tirada">
          <Die value={state.lastDice?.[0] ?? null} rolling={rolling} />
          <Die value={state.lastDice?.[1] ?? null} rolling={rolling} />
          {state.lastDice && <span className="dice-total">{state.lastDice[0] + state.lastDice[1]}</span>}
        </div>
        <div className="topbar-meta">
          <span>{saveLabel}</span>
          <span>Semilla {state.seed}</span>
        </div>
      </header>
    );
  }
}
