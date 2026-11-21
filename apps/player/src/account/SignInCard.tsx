import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { apiErrorMessage, useAccount } from './AccountContext';

interface SignInCardProps {
  /** Why signing in is needed here. */
  reason: string;
}

/** Email-link sign-in. In demo mode the link is offered on screen, since nothing is emailed. */
export function SignInCard({ reason }: SignInCardProps) {
  const { api, requestLink, verifyLink } = useAccount();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const { demoLink: link } = await requestLink(email);
      setSentTo(email.trim());
      setDemoLink(link ?? null);
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openDemoLink() {
    if (!demoLink) return;
    setBusy(true);
    setProblem(null);
    try {
      await verifyLink(new URL(demoLink).searchParams.get('token') ?? '');
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sign-in-card" aria-labelledby="sign-in-title">
      <h2 id="sign-in-title">Sign in</h2>
      <p className="supporting-copy">{reason}</p>
      {sentTo ? (
        <div className="sign-in-card__sent" role="status">
          <Mail aria-hidden="true" />
          <p>
            We’ve sent a sign-in link to <strong>{sentTo}</strong>. Open it on this phone to finish signing in.
          </p>
          {demoLink ? (
            <button className="button button--primary button--full" type="button" disabled={busy} onClick={() => void openDemoLink()}>
              Open the sign-in link
            </button>
          ) : null}
          <button className="text-button" type="button" onClick={() => { setSentTo(null); setDemoLink(null); }}>
            Use another email
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={(event) => void send(event)}>
          <div className="field">
            <label htmlFor="sign-in-email">Email</label>
            <input
              id="sign-in-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button className="button button--primary button--full" type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
      {api.mode === 'demo' ? <p className="demo-note">Demo mode: no email is sent, nothing is booked or charged.</p> : null}
      {problem ? <p className="notice" role="alert">{problem}</p> : null}
    </section>
  );
}
