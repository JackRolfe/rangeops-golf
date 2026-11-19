import { LogIn, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { requestLink, signIn, type StaffSession } from '../api/http/session';
import { Errors } from './Status';

/** Staff sign in with the API's email link. Locally the link is printed in the API's log. */
export function SignIn({ baseUrl, preferredRange, onSignedIn }: { baseUrl: string; preferredRange?: string; onSignedIn: (session: StaffSession) => void }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setBusy(false);
    }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await requestLink(baseUrl, email);
      setSentTo(email.trim());
    });
  };

  const verify = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => onSignedIn(await signIn(baseUrl, link, preferredRange)));
  };

  return (
    <main className="sign-in">
      <section className="panel sign-in__panel" aria-labelledby="sign-in-heading">
        <span className="brand sign-in__brand">
          <i aria-hidden="true" />
          RangeOps
        </span>
        <h1 id="sign-in-heading">Staff sign-in</h1>
        <p className="empty">Range console, connected to {baseUrl}</p>
        <Errors errors={errors} />
        <form className="stack-sm" onSubmit={send}>
          <label className="field">
            <span>Staff email</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@rangeops.test" />
          </label>
          <div>
            <button className="button" type="submit" disabled={busy || !email.trim()}>
              <Mail size={16} aria-hidden="true" /> Send sign-in link
            </button>
          </div>
        </form>
        {sentTo && (
          <form className="stack-sm" onSubmit={verify}>
            <p className="notice" role="status">
              A link is on its way to {sentTo}. Running locally, the API prints it in its log instead of emailing it.
            </p>
            <label className="field">
              <span>Paste the link, or its token</span>
              <input className="input" autoComplete="off" spellCheck={false} required value={link} onChange={(e) => setLink(e.target.value)} />
            </label>
            <div>
              <button className="button" type="submit" disabled={busy || !link.trim()}>
                <LogIn size={16} aria-hidden="true" /> Sign in
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
