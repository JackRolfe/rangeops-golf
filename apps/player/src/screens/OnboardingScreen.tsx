import { useState, type FormEvent } from 'react';
import { ImagePlus, LockKeyhole } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Brand } from '../components/Brand';

interface OnboardingScreenProps {
  busy: boolean;
  error: string | null;
  onSubmit: (name: string, file: File) => Promise<void>;
}

export function OnboardingScreen({ busy, error, onSubmit }: OnboardingScreenProps) {
  const [name, setName] = useState('My Range');
  const [file, setFile] = useState<File | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    await onSubmit(name.trim(), file);
  }

  return (
    <AppShell className="onboarding-screen">
      <header className="onboarding-screen__brand">
        <Brand />
      </header>
      <div className="onboarding-screen__content">
        <div className="onboarding-screen__intro">
          <div className="onboarding-screen__mark" aria-hidden="true">
            <span />
          </div>
          <h1>Set up your range.</h1>
          <p>Add an aerial image once, then mark every shot directly on the map.</p>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="range-name">Range name</label>
            <input
              id="range-name"
              value={name}
              maxLength={60}
              autoComplete="off"
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="range-image">Aerial range image</label>
            <label className={`upload-field ${file ? 'has-file' : ''}`} htmlFor="range-image">
              <ImagePlus aria-hidden="true" />
              <span>
                <strong>{file ? file.name : 'Choose an image'}</strong>
                <small>JPEG, PNG or WebP · up to 20 MB</small>
              </span>
              <input
                className="sr-only"
                id="range-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {error ? <p className="notice" role="alert">{error}</p> : null}

          <button className="button button--primary button--full" type="submit" disabled={!file || !name.trim() || busy}>
            {busy ? 'Saving range…' : 'Continue'}
          </button>
        </form>

        <p className="onboarding-screen__privacy">
          <LockKeyhole aria-hidden="true" />
          Your image and practice history stay in this browser.
        </p>
      </div>
    </AppShell>
  );
}
