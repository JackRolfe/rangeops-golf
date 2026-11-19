import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { GAME_MODES, GAME_NAMES } from '../domain/games';
import type { GameMode } from '../domain/types';
import { AppShell } from '../components/AppShell';
import { PageHeader } from '../components/PageHeader';

const CLUBS = [
  'Driver',
  '3 wood',
  '5 wood',
  'Hybrid',
  '4 iron',
  '5 iron',
  '6 iron',
  '7 iron',
  '8 iron',
  '9 iron',
  'Pitching wedge',
  'Gap wedge',
  'Sand wedge',
  'Lob wedge',
];

interface SessionSetupScreenProps {
  lastClub: string | null;
  initialMode: GameMode;
  busy: boolean;
  onBack: () => void;
  onContinue: (club: string, note: string, mode: GameMode) => void;
}

export function SessionSetupScreen({ lastClub, initialMode, busy, onBack, onContinue }: SessionSetupScreenProps) {
  const [club, setClub] = useState(lastClub && CLUBS.includes(lastClub) ? lastClub : '7 iron');
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [note, setNote] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onContinue(club, note.trim(), mode);
  }

  return (
    <AppShell>
      <PageHeader title={GAME_NAMES[mode]} onBack={onBack} />
      <div className="screen-scroll setup-screen">
        <div className="setup-screen__intro">
          <h2>What are you hitting?</h2>
          <p>Choose a club now. You can add an optional note for context later.</p>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <fieldset className="game-choice">
            <legend>Game</legend>
            {GAME_MODES.map((option) => (
              <label key={option} className={option === mode ? 'is-selected' : undefined}>
                <input type="radio" name="game" value={option} checked={option === mode} onChange={() => setMode(option)} />
                {GAME_NAMES[option]}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="club">Club</label>
            <select id="club" value={club} onChange={(event) => setClub(event.target.value)}>
              {CLUBS.map((clubName) => <option key={clubName}>{clubName}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="session-note">Note <span className="field-optional">Optional</span></label>
            <textarea
              id="session-note"
              value={note}
              maxLength={240}
              placeholder="Wind, drill, or swing thought"
              onChange={(event) => setNote(event.target.value)}
            />
            <small>{note.length}/240</small>
          </div>
          <button className="button button--primary button--full" type="submit" disabled={busy}>
            {busy ? 'Opening map…' : 'Set target'} <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </div>
    </AppShell>
  );
}
