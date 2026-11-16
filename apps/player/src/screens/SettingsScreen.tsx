import { useEffect, useState, type FormEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { RangeMap } from '../domain/types';
import { AppShell } from '../components/AppShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';

interface SettingsScreenProps {
  range: RangeMap;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onRename: (name: string) => Promise<void>;
  onReplaceImage: (file: File) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

export function SettingsScreen({
  range,
  busy,
  error,
  onBack,
  onRename,
  onReplaceImage,
  onDeleteAll,
}: SettingsScreenProps) {
  const [name, setName] = useState(range.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setName(range.name), [range.name]);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && name.trim() !== range.name) await onRename(name.trim());
  }

  return (
    <AppShell>
      <PageHeader title="Settings" onBack={onBack} />
      <div className="screen-scroll settings-screen">
        <section>
          <h2 className="section-heading">Range</h2>
          <form className="form-stack" onSubmit={handleRename}>
            <div className="field">
              <label htmlFor="settings-range-name">Range name</label>
              <input
                id="settings-range-name"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <button className="button button--secondary" type="submit" disabled={busy || !name.trim() || name.trim() === range.name}>
              Save name
            </button>
          </form>
        </section>

        <section>
          <h2 className="section-heading">Range image</h2>
          <p className="supporting-copy">
            Replacing the image starts a new map revision. Completed sessions keep their original image and shot positions.
          </p>
          <label className="button button--quiet button--full settings-screen__upload" htmlFor="replacement-image">
            <ImagePlus aria-hidden="true" /> Replace image
            <input
              className="sr-only"
              id="replacement-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onReplaceImage(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </section>

        {error ? <p className="notice" role="alert">{error}</p> : null}

        <section className="settings-screen__danger">
          <h2 className="section-heading">Local data</h2>
          <p className="supporting-copy">
            RangeOps does not use an account or cloud backup. Clearing this browser’s data also removes your history.
          </p>
          <button className="button button--danger button--full" type="button" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" /> Delete all data
          </button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete all RangeOps data?"
        confirmLabel="Delete everything"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void onDeleteAll();
        }}
      >
        This permanently removes the range image, drafts, and every completed session from this browser.
      </ConfirmDialog>
    </AppShell>
  );
}
