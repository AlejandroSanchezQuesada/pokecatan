import { useRef, useState } from 'react';
import { DIFFICULTY_LABEL } from '../engine/data';
import { deserializeState, hasLocalSave, loadFromLocalStorage } from '../engine/persistence';
import { createGame, makeDefaultSeed } from '../engine/state';
import type { Difficulty, GameMode, GameState, NewGameOptions } from '../engine/types';
import { Modal } from './components';
import { TutorialContent } from './Tutorial';
import {
  playSound,
  setSoundEnabled,
  setSoundVolume,
  soundEnabled,
  soundVolume
} from './sound';

interface MainMenuProps {
  onStart: (state: GameState) => void;
  onError: (message: string) => void;
}

export function MainMenu({ onStart, onError }: MainMenuProps): JSX.Element {
  const [mode, setMode] = useState<GameMode>('solo');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [humanPlayers, setHumanPlayers] = useState(2);
  const [playerName, setPlayerName] = useState('Ash');
  const [gameName, setGameName] = useState('Aventura en Kanto');
  const [seed, setSeed] = useState(makeDefaultSeed());
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [audioOn, setAudioOn] = useState(soundEnabled());
  const [audioVolume, setAudioVolume] = useState(soundVolume());
  const [saveAvailable, setSaveAvailable] = useState(() => hasLocalSave());
  const importRef = useRef<HTMLInputElement>(null);

  function start(): void {
    const options: NewGameOptions = {
      mode,
      difficulty,
      humanPlayers: mode === 'solo' ? 1 : humanPlayers,
      playerName,
      gameName,
      seed
    };
    onStart(createGame(options));
  }

  function resume(): void {
    const result = loadFromLocalStorage();
    if (result.ok && result.state) {
      setSaveAvailable(false);
      onStart(result.state);
    } else {
      setSaveAvailable(false);
      onError(result.error ?? 'No se pudo recuperar la partida guardada.');
    }
  }

  async function importFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const result = deserializeState(text);
      if (result.ok && result.state) {
        onStart(result.state);
      } else {
        onError(result.error ?? 'El archivo no contiene una partida válida.');
      }
    } catch {
      onError('No se pudo leer el archivo seleccionado.');
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

  return (
    <main className="menu-screen">
      <div className="menu-pixels" aria-hidden="true" />
      <header className="hero">
        <p className="eyebrow">Juego de estrategia fan no oficial</p>
        <h1>
          POKÉ<span>CATÁN</span>
        </h1>
        <p className="hero-subtitle">
          Construye poblados, comercia recursos, explora biomas y captura Pokémon. Una partida de tablero clásica con
          una capa de colección y habilidades tácticas.
        </p>
      </header>

      <section className="menu-card" aria-labelledby="new-game-title">
        <div className="menu-card-heading">
          <div>
            <p className="panel-kicker">Configuración</p>
            <h2 id="new-game-title">Nueva partida</h2>
          </div>
          <span className="seed-badge">Semilla: {seed}</span>
        </div>

        <div className="mode-choice" role="radiogroup" aria-label="Modo de partida">
          <button
            type="button"
            className={`mode-option ${mode === 'solo' ? 'selected' : ''}`}
            onClick={() => {
              setMode('solo');
              playSound('click');
            }}
            role="radio"
            aria-checked={mode === 'solo'}
          >
            <strong>Individual</strong>
            <span>Tú contra tres rivales de IA.</span>
          </button>
          <button
            type="button"
            className={`mode-option ${mode === 'local' ? 'selected' : ''}`}
            onClick={() => {
              setMode('local');
              playSound('click');
            }}
            role="radio"
            aria-checked={mode === 'local'}
          >
            <strong>Multijugador local</strong>
            <span>2-4 jugadores en el mismo dispositivo; las plazas libres se completan con IA.</span>
          </button>
        </div>

        <div className="form-grid">
          <label>
            Tu nombre
            <input value={playerName} maxLength={20} onChange={(event) => setPlayerName(event.target.value)} />
          </label>
          <label>
            Nombre de la partida
            <input value={gameName} maxLength={40} onChange={(event) => setGameName(event.target.value)} />
          </label>
          <label>
            Dificultad de la IA
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((value) => (
                <option key={value} value={value}>
                  {DIFFICULTY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          {mode === 'local' ? (
            <label>
              Jugadores humanos
              <select value={humanPlayers} onChange={(event) => setHumanPlayers(Number(event.target.value))}>
                <option value={2}>2 humanos + 2 IA</option>
                <option value={3}>3 humanos + 1 IA</option>
                <option value={4}>4 humanos</option>
              </select>
            </label>
          ) : (
            <div className="form-note">
              <span>Formato</span>
              <strong>1 humano + 3 IA</strong>
            </div>
          )}
          <label className="seed-field">
            Semilla reproducible
            <span className="inline-field">
              <input value={seed} maxLength={32} onChange={(event) => setSeed(event.target.value.toUpperCase())} />
              <button type="button" className="pixel-button secondary" onClick={() => setSeed(makeDefaultSeed())}>
                Nueva
              </button>
            </span>
          </label>
        </div>

        <div className="menu-actions">
          <button type="button" className="pixel-button primary large" onClick={start}>
            Comenzar partida
          </button>
          <button
            type="button"
            className="pixel-button"
            onClick={resume}
            disabled={!saveAvailable}
            title={saveAvailable ? 'Reanudar el autoguardado' : 'No hay autoguardado disponible'}
          >
            Reanudar
          </button>
          <button type="button" className="pixel-button" onClick={() => setTutorialOpen(true)}>
            Cómo jugar
          </button>
          <button type="button" className="pixel-button" onClick={() => importRef.current?.click()}>
            Importar JSON
          </button>
          <input
            ref={importRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = '';
            }}
          />
        </div>

        <div className="audio-settings">
          <button type="button" className={`toggle ${audioOn ? 'on' : ''}`} onClick={toggleSound} aria-pressed={audioOn}>
            {audioOn ? 'Sonido activado' : 'Sonido desactivado'}
          </button>
          <label>
            Volumen
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioVolume}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="menu-info-grid">
        <article>
          <h3>Qué incluye</h3>
          <p>19 hexágonos, 9 puertos, 4 jugadores, comercio, cartas, ladrón, Ruta Comercial y Ejército.</p>
        </article>
        <article>
          <h3>Pokémon</h3>
          <p>35 especies, captura por bioma, evoluciones y 10 habilidades con límites por ronda.</p>
        </article>
        <article>
          <h3>Sin conexión</h3>
          <p>Los retratos se sirven localmente. El juego no necesita servidor ni red después de cargar la página.</p>
        </article>
      </section>

      <footer className="menu-footer">
        <span>Proyecto no oficial, sin afiliación con Nintendo, The Pokémon Company ni los titulares de Catán.</span>
        <span>Retratos: PMDCollab/SpriteCollab, CC BY-NC 4.0.</span>
      </footer>

      {tutorialOpen && (
        <Modal title="Cómo jugar" onClose={() => setTutorialOpen(false)} wide>
          <TutorialContent />
        </Modal>
      )}
    </main>
  );
}
