import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import {
  SAVE_FORMAT,
  SAVE_VERSION,
  createSaveEnvelope,
  deserializeState,
  hasLocalSave,
  loadFromLocalStorage,
  saveToLocalStorage,
  serializeState,
  validateSave,
  validateState
} from '../src/engine/persistence';
import { currentPlayer } from '../src/engine/state';
import { act, finishSetup, newGame } from './helpers';

function playedState() {
  let state = finishSetup(newGame({ seed: 'SAVE-1' }));
  state = act(state, { type: 'rollDice', playerId: 0 });
  return state;
}

describe('guardado y exportación', () => {
  it('serializa y restaura una partida completa', () => {
    const state = playedState();
    const text = serializeState(state);
    const loaded = deserializeState(text);
    expect(loaded.ok).toBe(true);
    expect(loaded.state).toEqual(state);
  });

  it('restaura el estado aleatorio de forma determinista', () => {
    const state = playedState();
    const loaded = deserializeState(serializeState(state));
    expect(loaded.ok).toBe(true);
    const nextOriginal = applyAction(state, { type: 'endTurn', playerId: 0 });
    const nextLoaded = applyAction(loaded.state!, { type: 'endTurn', playerId: 0 });
    expect(nextOriginal.ok).toBe(true);
    expect(nextLoaded.ok).toBe(true);
    if (nextOriginal.ok && nextLoaded.ok) {
      expect(nextLoaded.state.rngState).toBe(nextOriginal.state.rngState);
      expect(currentPlayer(nextLoaded.state).id).toBe(currentPlayer(nextOriginal.state).id);
    }
  });

  it('rechaza JSON corrupto y formatos ajenos', () => {
    expect(deserializeState('{no-json').ok).toBe(false);
    expect(deserializeState('{}').ok).toBe(false);
    const wrongFormat = validateSave({ format: 'otro', version: 1, state: {} });
    expect(wrongFormat.ok).toBe(false);
    const envelope = createSaveEnvelope(playedState());
    expect(envelope.format).toBe(SAVE_FORMAT);
    expect(envelope.version).toBe(SAVE_VERSION);
  });

  it('rechaza versiones incompatibles sin lanzar excepciones', () => {
    const state = playedState();
    const envelope = { ...createSaveEnvelope(state), version: 99 };
    const result = validateSave(envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Versión');
  });

  it('rechaza recursos negativos, cartas duplicadas y construcciones imposibles', () => {
    const state = playedState();
    const negative = structuredClone(state);
    negative.players[0]!.resources.wood = -3;
    expect(validateState(negative).ok).toBe(false);

    const duplicated = structuredClone(state);
    duplicated.players[0]!.devCards.push(
      { id: 'dup', type: 'knight', boughtOnTurn: 1, played: false },
      { id: 'dup', type: 'knight', boughtOnTurn: 1, played: false }
    );
    expect(validateState(duplicated).ok).toBe(false);

    const crossDuplicate = structuredClone(state);
    crossDuplicate.players[0]!.devCards.push({ id: 'same-card', type: 'knight', boughtOnTurn: 1, played: false });
    crossDuplicate.players[1]!.devCards.push({ id: 'same-card', type: 'knight', boughtOnTurn: 1, played: false });
    expect(validateState(crossDuplicate).ok).toBe(false);

    const overlapping = structuredClone(state);
    overlapping.players[1]!.settlements.push(overlapping.players[0]!.settlements[0]!);
    expect(validateState(overlapping).ok).toBe(false);

    const tooMany = structuredClone(state);
    tooMany.players[0]!.pokemon = [1, 2, 3, 4].map((i) => ({
      instanceId: `x${i}`,
      speciesId: 1,
      capturedOnTurn: 1,
      abilityUsedRound: 0
    }));
    expect(validateState(tooMany).ok).toBe(false);
  });

  it('rechaza un tablero manipulado', () => {
    const state = playedState();
    const bad = structuredClone(state);
    bad.board.hexes[0]!.number = 99;
    expect(validateState(bad).ok).toBe(false);
  });

  it('no modifica el estado actual al importar un archivo inválido', () => {
    const state = playedState();
    const before = JSON.stringify(state);
    const result = deserializeState(JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, state: { schemaVersion: 1 } }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('gestiona la ausencia de almacenamiento local sin romper la partida', () => {
    expect(typeof globalThis.localStorage).toBe('undefined');
    expect(hasLocalSave()).toBe(false);
    expect(loadFromLocalStorage().ok).toBe(false);
    expect(saveToLocalStorage(playedState()).ok).toBe(false);
  });
});
