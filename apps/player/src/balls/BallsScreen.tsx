import { useCallback, useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { apiErrorMessage, useAccount } from '../account/AccountContext';
import { SignInCard } from '../account/SignInCard';
import { TEST_CARD, type BucketCode, type BucketProduct, type PassProduct, type Range, type Wallet } from '../api/types';
import { useRange } from '../api/useRange';
import type { TabId } from '../components/TabBar';
import { formatMoney } from '../domain/money';
import { TabScreen } from '../screens/TabScreen';

interface BallsScreenProps {
  onTab: (tab: TabId) => void;
  /** The fake provider's test card; tests pass the declining one. */
  paymentMethod?: string;
}

const EMPTY_WALLET: Wallet = { passes: [], ballCredit: [], bucketCodes: [] };

function formatDay(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(instant));
}

export function BallsScreen({ onTab, paymentMethod = TEST_CARD }: BallsScreenProps) {
  const { api, session } = useAccount();
  const { ranges, range, error: rangeError, chooseRange } = useRange();
  const [wallet, setWallet] = useState<Wallet>(EMPTY_WALLET);
  const [chosen, setChosen] = useState<BucketProduct | null>(null);
  const [latest, setLatest] = useState<BucketCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!session) {
      setWallet(EMPTY_WALLET);
      return;
    }
    try {
      setWallet(await api.getWallet());
    } catch {
      setWallet(EMPTY_WALLET);
    }
  }, [api, session]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const credit = range ? wallet.ballCredit.find((item) => item.range.id === range.id)?.balls ?? 0 : 0;
  const passes = range ? wallet.passes.filter((pass) => pass.range.id === range.id) : [];
  const codes = range ? wallet.bucketCodes.filter((code) => code.rangeId === range.id) : [];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await action();
      await loadWallet();
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function buyBucket(range: Range, product: BucketProduct, withCredit: boolean) {
    void run(async () => {
      const purchase = await api.buyBucket({
        rangeId: range.id,
        bucketProductId: product.id,
        payWith: withCredit ? { method: 'ball_credit' } : { method: 'card', paymentMethod },
      });
      setLatest(purchase.bucketCode);
      setChosen(null);
    });
  }

  function buyPass(range: Range, product: PassProduct) {
    void run(async () => {
      const purchase = await api.buyPass({ rangeId: range.id, passProductId: product.id, paymentMethod });
      setNotice(
        purchase.pass
          ? `${purchase.pass.name}: ${purchase.pass.discountPercent}% off bays and buckets until ${formatDay(purchase.pass.validTo, range.timeZone)}.`
          : `You now have ${purchase.ballCredit} balls of credit.`,
      );
    });
  }

  return (
    <TabScreen tab="balls" title="Balls" onTab={onTab}>
      {api.mode === 'demo' ? <p className="demo-note">Demo mode: nothing is bought or charged.</p> : null}
      {ranges.length > 1 && range ? (
        <label className="field range-picker">
          <span>Range</span>
          <select value={range.id} onChange={(event) => chooseRange(event.target.value)}>
            {ranges.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
      {rangeError ? <p className="notice" role="alert">{rangeError}</p> : null}

      {latest ? (
        <section className="bucket-code" aria-labelledby="code-title">
          <h2 id="code-title">Your {latest.bucket.name.toLowerCase()}</h2>
          <p className="bucket-code__code" aria-label={`Bucket code ${latest.code}`}>{latest.code}</p>
          <p>Show this code at the counter for {latest.bucket.balls} balls.</p>
          <button className="text-button" type="button" onClick={() => setLatest(null)}>Done</button>
        </section>
      ) : null}

      {range ? (
        <section className="shop" aria-labelledby="buckets-title">
          <h2 id="buckets-title" className="section-heading">Buy a bucket</h2>
          {session && credit > 0 ? <p className="supporting-copy">You have {credit} balls of credit here.</p> : null}
          <ul className="product-list">
            {range.bucketProducts
              .filter((product) => product.active)
              .map((product) => (
                <li key={product.id} className="product-row">
                  <span>
                    <strong>{product.name}</strong>
                    <small>{product.balls} balls</small>
                  </span>
                  <b>{formatMoney(product.priceCents, range.currency)}</b>
                  <button
                    className="button button--secondary"
                    type="button"
                    aria-pressed={chosen?.id === product.id}
                    disabled={busy}
                    onClick={() => setChosen(chosen?.id === product.id ? null : product)}
                  >
                    Buy
                  </button>
                </li>
              ))}
          </ul>
          {chosen ? (
            session ? (
              <div className="pay-box">
                <p>
                  <span>{chosen.name}, {chosen.balls} balls</span>
                  <strong>{formatMoney(chosen.priceCents, range.currency)}</strong>
                </p>
                <small>A pass discount comes off when you pay by card. Test card: no money moves.</small>
                <button className="button button--primary button--full" type="button" disabled={busy} onClick={() => buyBucket(range, chosen, false)}>
                  Pay {formatMoney(chosen.priceCents, range.currency)}
                </button>
                <button
                  className="button button--secondary button--full"
                  type="button"
                  disabled={busy || credit < chosen.balls}
                  onClick={() => buyBucket(range, chosen, true)}
                >
                  {credit < chosen.balls ? `Not enough ball credit (${credit})` : `Use ${chosen.balls} balls of credit`}
                </button>
              </div>
            ) : (
              <SignInCard reason="Sign in to buy balls. You’ll come straight back here." />
            )
          ) : null}
        </section>
      ) : null}

      {problem ? <p className="notice" role="alert">{problem}</p> : null}
      {notice ? <p className="success-note" role="status">{notice}</p> : null}

      {range && session ? (
        <section className="wallet" aria-labelledby="wallet-title">
          <h2 id="wallet-title" className="section-heading">Your balls and passes</h2>
          <ul className="product-list">
            <li className="product-row">
              <span>
                <strong>Ball credit</strong>
                <small>Spend it on any bucket here. It doesn’t run out.</small>
              </span>
              <b data-testid="ball-credit">{credit} balls</b>
            </li>
            {passes.map((pass) => (
              <li key={pass.id} className="product-row">
                <span>
                  <strong>{pass.name}</strong>
                  <small>{pass.discountPercent}% off bays and buckets until {formatDay(pass.validTo, range.timeZone)}</small>
                </span>
              </li>
            ))}
            {codes.map((code) => (
              <li key={code.id} className="product-row">
                <Ticket aria-hidden="true" />
                <span>
                  <strong className="code-text">{code.code}</strong>
                  <small>{code.bucket.name}, {code.bucket.balls} balls, not yet collected</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {range ? (
        <section className="shop" aria-labelledby="passes-title">
          <h2 id="passes-title" className="section-heading">Passes and ball credit</h2>
          <ul className="product-list">
            {range.passProducts
              .filter((product) => product.active)
              .map((product) => (
                <li key={product.id} className="product-row">
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.kind === 'monthly_pass'
                        ? `${product.discountPercent}% off bays and buckets for ${product.days} days`
                        : `${product.balls} balls to spend on buckets here`}
                    </small>
                  </span>
                  <b>{formatMoney(product.priceCents, range.currency)}</b>
                  {session ? (
                    <button className="button button--secondary" type="button" disabled={busy} onClick={() => buyPass(range, product)}>
                      Buy
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
          {!session && !chosen ? <SignInCard reason="Sign in to buy balls, passes and ball credit." /> : null}
        </section>
      ) : null}
    </TabScreen>
  );
}
