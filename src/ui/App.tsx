import { useEffect, useState } from 'react';
import type { GameState } from '../engine/types';
import { GameScreen } from './GameScreen';
import { MainMenu } from './MainMenu';

interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
}

export function App(): JSX.Element {
  const [game, setGame] = useState<GameState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function notify(message: string, tone: ToastState['tone'] = 'info'): void {
    setToast({ id: Date.now(), message, tone });
  }

  useEffect(() => {
    document.title = game ? `${game.gameName} · PokéCatán` : 'PokéCatán Web';
  }, [game]);

  return (
    <>
      {game ? (
        <GameScreen state={game} setState={setGame} onExit={() => setGame(null)} notify={notify} />
      ) : (
        <MainMenu onStart={setGame} onError={(message) => notify(message, 'error')} />
      )}
      {toast && (
        <div className={`toast ${toast.tone}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </>
  );
}
