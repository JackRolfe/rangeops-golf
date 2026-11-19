import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Joystick } from 'lucide-react';
import { apiErrorMessage, useAccount } from '../account/AccountContext';
import { SignInCard } from '../account/SignInCard';
import { ApiError } from '../api/PlayerApi';
import type { CheckIn } from '../api/types';
import { formatBookingTime } from '../book/format';
import type { TabId } from '../components/TabBar';
import { parseLink } from '../routes';
import { TabScreen } from '../screens/TabScreen';
import { clearPendingCheckIn } from './pendingCheckIn';

interface CheckInScreenProps {
  code: string;
  onTab: (tab: TabId) => void;
  onDrive: (hireKey: Uint8Array) => void;
}

/** Opened from a bay's QR code: checks the player in to their booking there. */
export function CheckInScreen({ code, onTab, onDrive }: CheckInScreenProps) {
  const { api, session } = useAccount();
  const [result, setResult] = useState<CheckIn | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (!session || tried.current === session.sessionToken) return;
    tried.current = session.sessionToken;
    setBusy(true);
    setProblem(null);
    api
      .checkIn(code)
      .then((checkIn) => {
        clearPendingCheckIn();
        setResult(checkIn);
      })
      .catch((error: unknown) => {
        // A wrong code won't come right; a booking that hasn't started might, so keep that one.
        if (error instanceof ApiError && error.code === 'unknown_code') clearPendingCheckIn();
        setProblem(apiErrorMessage(error));
      })
      .finally(() => setBusy(false));
  }, [api, code, session]);

  const hireKey = result?.hireLink ? (() => {
    const url = new URL(result.hireLink);
    const link = parseLink(url.pathname, url.search, '/');
    return link.kind === 'drive' ? link.hireKey : null;
  })() : null;

  return (
    <TabScreen tab="book" title="Check in" onTab={onTab}>
      {!session ? <SignInCard reason="Sign in to check in at this bay. You’ll be checked in as soon as you’re signed in." /> : null}
      {busy ? <p className="supporting-copy">Checking you in…</p> : null}
      {result ? (
        <section className="booking-confirmed" role="status" aria-labelledby="checked-in-title">
          <CircleCheck aria-hidden="true" />
          <h2 id="checked-in-title">You’re checked in at {result.bay.name}</h2>
          <p>{formatBookingTime(result.booking.startsAt, result.booking.endsAt, result.booking.range.timeZone)}. Have fun!</p>
          {hireKey && result.booking.hire ? (
            <button className="button button--primary button--full" type="button" onClick={() => onDrive(hireKey)}>
              <Joystick aria-hidden="true" /> Drive {result.booking.hire.robot.name}
            </button>
          ) : null}
        </section>
      ) : null}
      {problem ? (
        <div className="notice" role="alert">
          <p>{problem}</p>
          <button className="text-button" type="button" onClick={() => onTab('book')}>Go to Book</button>
        </div>
      ) : null}
    </TabScreen>
  );
}
