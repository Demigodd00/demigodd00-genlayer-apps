"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  connect,
  confirm,
  pendingKey,
  read,
  write,
  type Progress,
  type Session,
} from "@/lib/contract";
import { discoverWalletProviders, type WalletOption } from "@/lib/wallet";
import {
  ADDRESS,
  EXPLORER,
  EXAMPLE,
  RULE,
  activeStage,
  backupKey,
  date,
  downloadBackup,
  friendly,
  gen,
  label,
  parseBackup,
  parseGen,
  prepareBackup,
  same,
  short,
  validRoute,
  type Attempt,
  type Campaign,
  type Referee,
  type RevealBackup,
  type Stats,
} from "@/lib/protocol";

type Context = {
  session: Session | null;
  busy: boolean;
  tick: number;
  refresh: () => void;
  transact: (method: string, args: unknown[], value?: bigint) => Promise<void>;
  connectWallet: () => void;
  notify: (s: string) => void;
};
const AppContext = createContext<Context>(null!);
const useApp = () => useContext(AppContext);
function useData<T>(loader: () => Promise<T>, keys: unknown[]) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const { tick } = useApp();
  useEffect(() => {
    let alive = true;
    loader()
      .then((v) => {
        if (alive) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(friendly(e));
      });
    return () => {
      alive = false;
    };
  }, [...keys, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}
function Badge({
  status,
  control = false,
}: {
  status: string;
  control?: boolean;
}) {
  return (
    <span
      className={`badge ${control ? "control" : status === "CONFIRMED_FINDING" || status === "OPEN" ? "good" : ""}`}
    >
      {control ? "Seeded control" : label(status)}
    </span>
  );
}
function ErrorBox({ message }: { message: string }) {
  const { refresh } = useApp();
  return message ? (
    <div role="alert" className="alert">
      {message}{" "}
      <button className="text-button" onClick={refresh}>
        Refresh
      </button>
    </div>
  ) : null;
}
function Wait({ error }: { error: string }) {
  return error ? (
    <ErrorBox message={error} />
  ) : (
    <p className="loading" role="status">
      Reading finalized StudioNet state…
    </p>
  );
}
function Field({
  title,
  children,
  hint,
}: {
  title: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{title}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Stat({ value, name }: { value: string; name: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{name}</span>
    </div>
  );
}
function Action({
  method,
  args,
  children,
}: {
  method: string;
  args: unknown[];
  children: ReactNode;
}) {
  const { busy, transact } = useApp();
  return (
    <button
      disabled={busy}
      onClick={() => void transact(method, args).catch(() => {})}
    >
      {children}
    </button>
  );
}

export default function App({ children }: { children: ReactNode }) {
  const path = usePathname().split("/").filter(Boolean);
  const [session, setSession] = useState<Session | null>(null),
    [choices, setChoices] = useState<WalletOption[] | null>(null);
  const [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [progress, setProgress] = useState<Progress | null>(null),
    [message, notify] = useState("");
  const lock = useRef(false);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 25000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(pendingKey);
      if (raw)
        setProgress({
          state: "uncertain",
          message: "A submitted transaction needs its final receipt checked.",
          hash: JSON.parse(raw).hash,
        });
    } catch {
      notify(
        "The local transaction record could not be read. Check your wallet activity before sending again.",
      );
    }
  }, []);
  useEffect(() => {
    if (!session) return;
    const reset = () => {
      setSession(null);
      notify("Wallet account or network changed. Reconnect to continue.");
    };
    session.provider.on?.("accountsChanged", reset);
    session.provider.on?.("chainChanged", reset);
    return () => {
      session.provider.removeListener?.("accountsChanged", reset);
      session.provider.removeListener?.("chainChanged", reset);
    };
  }, [session]);
  const connectWallet = async () => {
    try {
      const wallets = await discoverWalletProviders(window);
      setChoices(wallets);
      if (!wallets.length)
        notify(
          "No browser wallet found. Open this app in a browser with MetaMask or another Ethereum wallet.",
        );
    } catch (e) {
      notify(friendly(e));
    }
  };
  async function selectWallet(choice: WalletOption) {
    setBusy(true);
    try {
      setSession(await connect(choice));
      setChoices(null);
      notify("");
      refresh();
    } catch (e) {
      notify(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function transact(method: string, args: unknown[], value = 0n) {
    if (!session) {
      void connectWallet();
      throw new Error("Connect a wallet first.");
    }
    if (lock.current) throw new Error("Another transaction is in progress.");
    lock.current = true;
    setBusy(true);
    notify("");
    try {
      await write(session, method, args, value, setProgress);
      refresh();
    } catch (e) {
      notify(friendly(e));
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const context = {
    session,
    busy,
    tick,
    refresh,
    transact,
    connectWallet,
    notify,
  };
  const page = validRoute(path) ? path[0] || "range" : "not-found";
  return (
    <AppContext.Provider value={context}>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Lacuna home">
          <span className="mark">
            L<span>·</span>
          </span>
          LACUNA
        </Link>
        <nav aria-label="Main navigation">
          <Link className={page === "range" ? "selected" : ""} href="/">
            The range
          </Link>
          <Link className={page === "new" ? "selected" : ""} href="/new">
            New campaign
          </Link>
          <Link
            className={page === "protocol" ? "selected" : ""}
            href="/protocol"
          >
            Protocol
          </Link>
        </nav>
        <div className="wallet">
          <span className="network">● StudioNet</span>
          {session ? (
            <button
              className="secondary"
              onClick={() => setSession(null)}
              title="Disconnect wallet"
            >
              {short(session.address)} ×
            </button>
          ) : (
            <button
              className="secondary"
              onClick={() => void connectWallet()}
              disabled={busy}
            >
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main id="content">
        {message && (
          <div className="alert" role="alert">
            {message}
            <button
              className="text-button"
              aria-label="Dismiss message"
              onClick={() => notify("")}
            >
              ×
            </button>
          </div>
        )}
        {progress && (
          <div className={`transaction ${progress.state}`} role="status">
            <span>{progress.message}</span>
            {progress.hash && (
              <a
                href={`${EXPLORER}/tx/${progress.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                Transaction ↗
              </a>
            )}
            {progress.hash &&
              (progress.state === "uncertain" ||
                progress.state === "pending") &&
              !busy && (
                <button
                  className="text-button"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await confirm(progress.hash!, setProgress);
                      refresh();
                    } catch (e) {
                      setProgress((p) =>
                        p?.state === "pending"
                          ? { ...p, state: "uncertain" }
                          : p,
                      );
                      notify(friendly(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Check same transaction
                </button>
              )}
            {["confirmed", "failed"].includes(progress.state) && (
              <button className="text-button" onClick={() => setProgress(null)}>
                Dismiss
              </button>
            )}
          </div>
        )}
        {page === "range" && <Range />}
        {page === "new" && <NewCampaign />}
        {page === "protocol" && <Protocol />}
        {page === "campaign" && /^lc-\d+$/.test(path[1] || "") && (
          <CampaignPage key={path[1]} id={path[1]} />
        )}
        {page === "attempt" && /^la-\d+$/.test(path[1] || "") && (
          <AttemptPage key={path[1]} id={path[1]} />
        )}
        {children}
        {session && <Credits />}
      </main>
      <footer>
        <span>
          Lacuna by <strong>demigodd00</strong>
        </span>
        <span>Experimental · test GEN only</span>
        <a
          href={`${EXPLORER}/address/${ADDRESS}`}
          target="_blank"
          rel="noreferrer"
        >
          Intelligent Contract ↗
        </a>
      </footer>
      {choices && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
          >
            <button
              className="close"
              onClick={() => setChoices(null)}
              aria-label="Close wallet chooser"
            >
              ×
            </button>
            <p className="eyebrow">Your connection</p>
            <h2 id="wallet-title">Choose a wallet</h2>
            {choices.map((c) => (
              <button
                className="wallet-choice"
                key={c.id}
                disabled={busy}
                onClick={() => void selectWallet(c)}
              >
                {c.name}
                <span>→</span>
              </button>
            ))}
            {!choices.length && (
              <p>
                Install or enable a browser wallet, then reopen this chooser.
                Never enter a seed phrase here.
              </p>
            )}
          </section>
        </div>
      )}
    </AppContext.Provider>
  );
}

function Range() {
  const { data: stats, error } = useData(() => read<Stats>("get_stats"), []);
  const [offset, setOffset] = useState(0);
  const { data: page, error: pageError } = useData(
    () =>
      read<{ items: Campaign[]; total: string }>("list_campaigns", [
        offset,
        20,
      ]),
    [offset],
  );
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">An adversarial abstention range</p>
          <h1>
            Find the
            <br />
            <em>missing fact.</em>
          </h1>
          <p className="intro">
            Some decisions should never be made.
            <br />
            Test whether an evaluator knows when to stop.
          </p>
          <div className="actions">
            <Link className="button" href="/new">
              Fund a campaign <span>↗</span>
            </Link>
            <a className="quiet-link" href="#campaigns">
              Explore the range ↓
            </a>
          </div>
        </div>
        <div
          className="case-visual"
          aria-label="One incomplete case, two compatible completions, opposite outcomes"
        >
          <div className="visual-top">
            <span>CASE / 001</span>
            <span className="signal">EVIDENCE GAP</span>
          </div>
          <p>
            “Both reviews finished
            <br />
            sometime in June.”
          </p>
          <div className="gap-line">
            <span>?</span>
          </div>
          <div className="branches">
            <div>
              <small>BEFORE JUNE 15</small>
              <strong>Approve ↗</strong>
            </div>
            <div>
              <small>AFTER JUNE 15</small>
              <strong>Reject ↘</strong>
            </div>
          </div>
          <div className="visual-bottom">
            Without the date, a verdict is a guess.
          </div>
        </div>
      </section>
      <section className="stats" aria-label="Finalized on-chain totals">
        <Stat value={stats?.total_campaigns ?? "—"} name="Campaigns" />
        <Stat value={stats?.total_attempts ?? "—"} name="Committed attempts" />
        <Stat value={stats?.genuine_findings ?? "—"} name="Standard findings" />
        <Stat
          value={stats?.control_findings ?? "—"}
          name="Seeded-control findings"
        />
      </section>
      <ErrorBox message={error || pageError} />
      <section id="campaigns" className="campaign-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pinned rules. Public results.</p>
            <h2>The range</h2>
          </div>
          <span className="muted">Evaluated by GenLayer</span>
        </div>
        {!page && <Wait error={pageError} />}{" "}
        {page?.items.length === 0 && (
          <div className="empty">
            <h3>A clean slate.</h3>
            <p>
              Fund the first rule and invite challengers to find its evidence
              gap.
            </p>
            <Link href="/new">Create a campaign →</Link>
          </div>
        )}
        <div className="cards">
          {page?.items
            .slice()
            .reverse()
            .map((c) => (
              <Link
                href={`/campaign/${c.id}`}
                className="campaign-card"
                key={c.id}
              >
                <div className="card-top">
                  <span className="mono">{c.id}</span>
                  <Badge status={c.status} />
                </div>
                <h3>{c.title}</h3>
                <div className="card-profile">
                  {c.seeded_control ? (
                    <Badge status="" control />
                  ) : (
                    <span>Standard evaluator</span>
                  )}
                </div>
                <div className="card-bottom">
                  <div>
                    <small>BOUNTY · TEST GEN</small>
                    <strong>{gen(c.bounty_atto)}</strong>
                  </div>
                  <span className="arrow">↗</span>
                </div>
              </Link>
            ))}
        </div>
        {page && Number(page.total) > 20 && (
          <div className="actions">
            <button
              className="secondary"
              disabled={offset === 0}
              onClick={() => setOffset((o) => o - 20)}
            >
              Previous
            </button>
            <span>
              {offset + 1}–{Math.min(offset + 20, Number(page.total))} of{" "}
              {page.total}
            </span>
            <button
              className="secondary"
              disabled={offset + 20 >= Number(page.total)}
              onClick={() => setOffset((o) => o + 20)}
            >
              Next
            </button>
          </div>
        )}
      </section>
      <div className="principle-strip">
        <span className="cross">✳</span>
        <p>
          A correct “not enough evidence” is a successful defense.
          <br />
          <span>Zero findings can be an honest result.</span>
        </p>
        <Link href="/protocol">Read the protocol ↗</Link>
      </div>
    </>
  );
}

function NewCampaign() {
  const { session, busy, transact, connectWallet, notify } = useApp();
  const router = useRouter();
  const [title, setTitle] = useState(""),
    [rule, setRule] = useState(""),
    [profile, setProfile] = useState("STANDARD"),
    [bounty, setBounty] = useState("0.001"),
    [hours, setHours] = useState("2"),
    [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return connectWallet();
    try {
      const value = parseGen(bounty);
      if (value < 10n ** 15n || value > 10n ** 19n)
        throw new Error("Bounty must be 0.001–10 test GEN.");
      if (
        Array.from(rule).length < 30 ||
        Array.from(rule).length > 2400 ||
        !title.trim() ||
        !agreed
      )
        throw new Error("Complete the campaign terms first.");
      await transact(
        "create_campaign",
        [
          title,
          rule,
          profile,
          Math.floor(Date.now() / 1000) + Number(hours) * 3600,
        ],
        value,
      );
      setSubmitted(true);
      // Locate this wallet's exact immutable terms, not an assumed next ID.
      const stats = await read<Stats>("get_stats");
      const page = await read<{ items: Campaign[] }>("list_campaigns", [
        Math.max(0, Number(stats.total_campaigns) - 20),
        20,
      ]);
      const matches = page.items.filter(
        (c) =>
          c.title === title &&
          c.profile === profile &&
          same(c.sponsor, session.address),
      );
      if (matches.length === 1) router.push(`/campaign/${matches[0].id}`);
      else
        notify(
          "Campaign created. Open it from the range to follow its rule review.",
        );
    } catch (e) {
      notify(friendly(e));
    }
  }
  return (
    <section className="narrow">
      <Link className="back" href="/">
        ← The range
      </Link>
      <p className="eyebrow">Sponsor a test</p>
      <h1>
        Pin the rule.
        <br />
        <em>Put it to the test.</em>
      </h1>
      <p className="intro">
        Fund one fixed evaluator and reward the first confirmed evidence-gap
        finding.
      </p>
      <form onSubmit={submit} className="panel form">
        <Field title="Campaign name">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="June review eligibility"
            required
          />
        </Field>
        <Field
          title="Business rule"
          hint="Clear eligibility conditions. Missing facts must not count as automatic rejection."
        >
          <textarea
            rows={5}
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            minLength={30}
            maxLength={2400}
            required
            placeholder="Approve applicants only if…"
          />
        </Field>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setRule(RULE);
            if (!title) setTitle("June review eligibility");
          }}
        >
          Use the sample rule
        </button>
        <Field title="Evaluator profile">
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="STANDARD">
              Standard — must abstain on missing evidence
            </option>
            <option value="SEEDED_PERMISSIVE">
              Seeded control — deliberately assumes missing facts
            </option>
          </select>
        </Field>
        {profile === "SEEDED_PERMISSIVE" && (
          <p className="notice">
            A deliberately flawed control for testing the protocol. Its findings
            are not genuine discoveries.
          </p>
        )}
        <div className="two">
          <Field
            title="Bounty in test GEN"
            hint="Challenger stake is exactly 10% of this bounty."
          >
            <input
              inputMode="decimal"
              value={bounty}
              onChange={(e) => setBounty(e.target.value)}
              required
            />
          </Field>
          <Field title="Campaign duration">
            <select value={hours} onChange={(e) => setHours(e.target.value)}>
              <option value="1">1 hour</option>
              <option value="2">2 hours</option>
              <option value="24">1 day</option>
              <option value="72">3 days</option>
              <option value="144">6 days</option>
            </select>
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            required
          />
          <span>
            I understand: public synthetic cases only, test GEN only, no early
            cancellation, and{" "}
            <Link href="/protocol">fixed settlement rules</Link>.
          </span>
        </label>
        <button type="submit" disabled={busy || submitted}>
          {session ? "Fund campaign & pin rule" : "Connect wallet to fund"}{" "}
          <span>↗</span>
        </button>
        <small>
          GenLayer reviews the rule in a separate finalized transaction before
          challengers can enter.
        </small>
      </form>
    </section>
  );
}

function CampaignPage({ id }: { id: string }) {
  const { session } = useApp();
  const { data: c, error } = useData(
    () => read<Campaign>("get_campaign", [id]),
    [id],
  );
  const { data: attempts, error: attemptsError } = useData(
    () => read<Attempt[]>("list_attempts", [id]),
    [id],
  );
  if (!c) return <Wait error={error} />;
  return (
    <>
      <Link className="back" href="/">
        ← The range
      </Link>
      <div className="section-heading">
        <p className="eyebrow">Campaign / {id}</p>
        <Badge status={c.status} />
      </div>
      <h1 className="detail-title">{c.title}</h1>
      {c.seeded_control && (
        <p className="notice">
          <Badge status="" control /> Intentionally flawed evaluator. This
          campaign cannot count as a genuine discovery.
        </p>
      )}
      <ErrorBox message={error} />
      <section className="stats">
        <Stat value={gen(c.bounty_atto)} name="Bounty · test GEN" />
        <Stat value={gen(c.stake_atto)} name="Challenger stake" />
        <Stat value={String(c.attempt_ids.length) + " / 20"} name="Attempts" />
      </section>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <p className="eyebrow">Immutable business rule</p>
            <p className="rule">{c.rule}</p>
            <details>
              <summary>Rule receipt & reference semantics</summary>
              <p>{c.abstention_promise}</p>
              <p className="mono wrap">SHA-256: {c.rule_sha256}</p>
              <p>
                {c.rule_review?.basis ||
                  "Rule review is pending. No challenger stake can be accepted yet."}
              </p>
              {c.rule_review && (
                <small>GenLayer-recorded · {c.rule_review.recorded_at}</small>
              )}
            </details>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Case records</h2>
              <span className="mono">{attempts?.length ?? "—"}</span>
            </div>
            <ErrorBox message={attemptsError} />
            {attempts?.length === 0 && (
              <p className="muted">No attempts yet.</p>
            )}
            {attempts?.map((a) => (
              <Link className="case-row" href={`/attempt/${a.id}`} key={a.id}>
                <div>
                  <strong>{a.id}</strong>
                  <small>{short(a.challenger)}</small>
                </div>
                <Badge status={a.status} />
                <span>↗</span>
              </Link>
            ))}
          </section>
        </div>
        <aside className="panel">
          <p className="eyebrow">Campaign terms</p>
          <dl>
            <dt>Sponsor</dt>
            <dd className="mono wrap">{c.sponsor}</dd>
            <dt>Evaluator</dt>
            <dd>
              {c.seeded_control
                ? "Seeded permissive control"
                : "Standard abstention"}
            </dd>
            <dt>Original closing time</dt>
            <dd>{date(c.closes_at)}</dd>
            <dt>Unawarded bounty</dt>
            <dd>{gen(c.remaining_bounty_atto)} test GEN</dd>
          </dl>
          {c.active_attempt ? (
            <Link className="button" href={`/attempt/${c.active_attempt}`}>
              Open active attempt ↗
            </Link>
          ) : (
            c.can_commit && (
              <a className="button" href="#challenge">
                Enter the range ↓
              </a>
            )
          )}
          {c.status === "PENDING_RULE" && (
            <p className="notice">
              GenLayer is reviewing this rule. If unavailable after{" "}
              {date(c.rule_deadline)}, anyone can recover the sponsor’s bounty.
            </p>
          )}
          {c.can_expire && (
            <Action method="expire_campaign" args={[id]}>
              Close & allocate remaining bounty
            </Action>
          )}
        </aside>
      </div>
      {c.can_commit && (
        <section id="challenge">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Challenge this evaluator</p>
              <h2>One document. Two possible worlds.</h2>
            </div>
          </div>
          {same(session?.address, c.sponsor) ? (
            <div className="notice">
              You are the sponsor. Connect a different wallet to challenge this
              campaign.
            </div>
          ) : (
            <Challenge campaign={c} />
          )}
        </section>
      )}
    </>
  );
}

function Challenge({ campaign }: { campaign: Campaign }) {
  const { session, busy, transact, connectWallet, notify } = useApp();
  const [documentText, setDocument] = useState(""),
    [a, setA] = useState(""),
    [b, setB] = useState("");
  const [backup, setBackup] = useState<RevealBackup | null>(null),
    [saved, setSaved] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    setBackup(null);
    setSaved(false);
    if (session) {
      const saved = localStorage.getItem(
        backupKey(campaign.id, session.address),
      );
      if (saved)
        void parseBackup(saved, campaign.id, session.address)
          .then((value) => {
            if (alive) setBackup(value);
          })
          .catch((e) => notify(friendly(e)));
    }
    return () => {
      alive = false;
    };
  }, [session?.address, campaign.id, notify]);
  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return connectWallet();
    try {
      const key = backupKey(campaign.id, session.address);
      if (localStorage.getItem(key))
        throw new Error(
          "A reveal backup already exists for this campaign and wallet. Open your existing attempt; do not overwrite its recovery data.",
        );
      const data = await prepareBackup(
        campaign.id,
        session.address,
        documentText,
        a,
        b,
      );
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(key + ":" + data.commitment, JSON.stringify(data));
      setBackup(data);
    } catch (e) {
      notify(friendly(e));
    }
  }
  async function commit() {
    if (!backup || !saved) return;
    try {
      await transact(
        "commit_attempt",
        [campaign.id, backup.commitment],
        BigInt(campaign.stake_atto),
      );
      const c = await read<Campaign>("get_campaign", [campaign.id]);
      if (!c.active_attempt)
        throw new Error(
          "Commit finalized. Refresh the campaign to find the new attempt.",
        );
      router.push(`/attempt/${c.active_attempt}`);
    } catch (e) {
      notify(friendly(e));
    }
  }
  return (
    <div className="panel form">
      {!backup ? (
        <form onSubmit={prepare}>
          <p className="muted">
            Use invented cases, not personal or confidential information.
            Everything revealed becomes public.
          </p>
          <Field
            title="Original incomplete document"
            hint="This is the only document the target evaluator will see."
          >
            <textarea
              rows={4}
              value={documentText}
              onChange={(e) => setDocument(e.target.value)}
              minLength={10}
              maxLength={3000}
              required
            />
          </Field>
          <div className="two">
            <Field
              title="Completion A — add facts"
              hint="Original + A should fully support one verdict."
            >
              <textarea
                rows={4}
                value={a}
                onChange={(e) => setA(e.target.value)}
                minLength={5}
                maxLength={1200}
                required
              />
            </Field>
            <Field
              title="Completion B — add facts"
              hint="Original + B should support the opposite verdict."
            >
              <textarea
                rows={4}
                value={b}
                onChange={(e) => setB(e.target.value)}
                minLength={5}
                maxLength={1200}
                required
              />
            </Field>
          </div>
          <div className="actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDocument(EXAMPLE.document);
                setA(EXAMPLE.a);
                setB(EXAMPLE.b);
              }}
            >
              Use June sample
            </button>
            <button type="submit" disabled={busy}>
              Prepare commitment →
            </button>
          </div>
          <small>
            The June sample fits the sample rule only. Both completions must
            preserve every fact in the original.
          </small>
        </form>
      ) : (
        <>
          <p className="eyebrow">Review before committing</p>
          <h3>Keep your reveal backup.</h3>
          <p>
            A commitment hides the case until you reveal it. Save this file
            before you lock your stake. You have 15 minutes from commit
            inclusion to reveal.
          </p>
          <div className="two">
            <div className="snippet">
              <small>ORIGINAL</small>
              <p>{backup.document}</p>
            </div>
            <div className="snippet">
              <small>ADDITIONS</small>
              <p>A: {backup.a}</p>
              <p>B: {backup.b}</p>
            </div>
          </div>
          <p className="mono wrap">Commitment: {backup.commitment}</p>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => {
                downloadBackup(backup);
                setSaved(true);
              }}
            >
              Download reveal backup
            </button>
            <button disabled={!saved || busy} onClick={() => void commit()}>
              Commit {gen(campaign.stake_atto)} test GEN
            </button>
          </div>
          <p className="notice">
            A confirmed finding credits bounty + stake to you. No finding,
            invalid evidence, or a missed reveal credits your stake to the
            sponsor. Inconclusive evaluation returns your stake, not the bounty.
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (!session || localStorage.getItem(pendingKey))
                return notify("Resolve your pending transaction first.");
              const key = backupKey(campaign.id, session.address);
              localStorage.setItem(
                key + ":" + backup.commitment,
                JSON.stringify(backup),
              );
              localStorage.removeItem(key);
              setBackup(null);
              setSaved(false);
            }}
          >
            Start a different draft (keep this backup archived)
          </button>
        </>
      )}
    </div>
  );
}

function ReceiptCard({
  title,
  result,
}: {
  title: string;
  result: Referee | null;
}) {
  return (
    <section className="panel receipt-card">
      <p className="eyebrow">{title}</p>
      {result ? (
        <>
          <div className="outcomes">
            <span>
              A → <strong>{label(result.a_outcome)}</strong>
            </span>
            <span>
              B → <strong>{label(result.b_outcome)}</strong>
            </span>
          </div>
          <ul className="checks">
            {[
              ["A preserves original facts", result.a_compatible],
              ["B preserves original facts", result.b_compatible],
              ["Same subject", result.same_subject],
              ["Rule respected", result.policy_respected],
            ].map(([name, passed]) => (
              <li key={String(name)}>
                <span>{passed ? "✓" : "×"}</span>
                {name}
              </li>
            ))}
          </ul>
          <p>{result.basis}</p>
          <small>{result.recorded_at}</small>
        </>
      ) : (
        <p className="muted">
          No accepted record yet. Pending or failed execution is not a verdict.
        </p>
      )}
    </section>
  );
}

function AttemptPage({ id }: { id: string }) {
  const { data: a, error } = useData(
    () => read<Attempt>("get_attempt", [id]),
    [id],
  );
  const { session } = useApp();
  if (!a) return <Wait error={error} />;
  const pending = activeStage(a.status);
  return (
    <>
      <Link className="back" href={`/campaign/${a.campaign_id}`}>
        ← Campaign {a.campaign_id}
      </Link>
      <div className="section-heading">
        <p className="eyebrow">Case record / {id}</p>
        <Badge status={a.status} />
      </div>
      <h1 className="detail-title">
        {a.status === "NO_FINDING"
          ? "The evaluator held."
          : a.status === "CONFIRMED_FINDING"
            ? a.seeded_control
              ? "Control finding confirmed."
              : "An evidence gap found."
            : a.status === "INVALID_ATTEMPT"
              ? "The witness did not hold."
              : pending
                ? "The case is being tested."
                : a.status === "COMMITTED"
                  ? "Your case is committed."
                  : label(a.status) + "."}
      </h1>
      {a.seeded_control && (
        <p className="notice">
          <Badge status="" control /> This evaluator is deliberately flawed. A
          control finding is not a real-world discovery.
        </p>
      )}
      <ErrorBox message={error} />
      {a.status === "COMMITTED" && (
        <>
          {same(session?.address, a.challenger) ? (
            <Reveal attempt={a} />
          ) : (
            <div className="panel">
              <p>Waiting for the committed challenger to reveal.</p>
              <p>Reveal deadline: {date(a.reveal_deadline)}</p>
              <small>Connect {short(a.challenger)} to reveal this case.</small>
            </div>
          )}
        </>
      )}
      {pending && (
        <div className="notice">
          <strong>{label(a.status)}</strong>
          <p>
            Contract-sent transactions advance the case automatically. No
            off-chain server chooses or submits the verdict.
          </p>
          <small>
            Current stage deadline: {date(a.stage_deadline)}. Timeout recovery
            requires another transaction and network progress.
          </small>
        </div>
      )}
      {a.can_expire && (
        <div className="panel">
          <h3>Deadline reached</h3>
          <p>
            {a.status === "COMMITTED"
              ? "An unrevealed stake is allocated to the sponsor."
              : "The evaluation is inconclusive. Recover the challenger stake; the bounty stays under the original campaign terms."}
          </p>
          <Action method="expire_attempt" args={[id]}>
            Apply timeout recovery
          </Action>
        </div>
      )}
      {a.document && (
        <>
          <section className="panel">
            <p className="eyebrow">What the target saw</p>
            <p className="rule prewrap">{a.document}</p>
            <details>
              <summary>Document commitment</summary>
              <p className="mono wrap">SHA-256: {a.document_sha256}</p>
              <p className="mono wrap">Bound commitment: {a.commitment}</p>
              <small>
                Hashes identify bytes, not authorship or real-world activity.
              </small>
            </details>
          </section>
          <div className="two">
            <section className="panel">
              <p className="eyebrow">Addition A · referees only</p>
              <p className="prewrap">{a.completion_a}</p>
            </section>
            <section className="panel">
              <p className="eyebrow">Addition B · referees only</p>
              <p className="prewrap">{a.completion_b}</p>
            </section>
          </div>
        </>
      )}
      <section className="panel target-record">
        <div>
          <p className="eyebrow">01 / Target record</p>
          <h2>{a.target ? label(a.target.verdict) : "Not yet recorded"}</h2>
        </div>
        <div>
          <p>
            {a.target?.basis ||
              "The target sees only the original document and the pinned rule."}
          </p>
          <small>{a.target?.recorded_at}</small>
        </div>
      </section>
      <div className="two">
        <ReceiptCard
          title="02 / Referee · compatibility"
          result={a.referee_one}
        />
        <ReceiptCard
          title="03 / Referee · falsification"
          result={a.referee_two}
        />
      </div>
      {a.settled_at && (
        <section className="panel allocation">
          <div>
            <p className="eyebrow">Contract allocation</p>
            <h2>
              {gen(a.allocation_atto)} <small>test GEN</small>
            </h2>
            <p>{label(a.result_reason)}</p>
          </div>
          <div>
            <p className="mono wrap">{a.allocation_recipient}</p>
            <small>
              Allocated as a withdrawable credit, not proof of payment. Native
              transfer finality is checked separately.
            </small>
          </div>
        </section>
      )}
    </>
  );
}

function Reveal({ attempt }: { attempt: Attempt }) {
  const { session, busy, transact, notify } = useApp();
  const [backup, setBackup] = useState<RevealBackup | null>(null);
  const load = useCallback(
    async (text: string) => {
      if (!session) return;
      const data = await parseBackup(
        text,
        attempt.campaign_id,
        session.address,
      );
      if (data.commitment !== attempt.commitment)
        throw new Error("This backup is not the committed case.");
      setBackup(data);
      localStorage.setItem(
        backupKey(attempt.campaign_id, session.address),
        JSON.stringify(data),
      );
    },
    [session, attempt.campaign_id, attempt.commitment],
  );
  useEffect(() => {
    if (session) {
      const key = backupKey(attempt.campaign_id, session.address);
      const saved =
        localStorage.getItem(key + ":" + attempt.commitment) ||
        localStorage.getItem(key);
      if (saved) void load(saved).catch((e) => notify(friendly(e)));
    }
  }, [session, load, notify, attempt.campaign_id, attempt.commitment]);
  return (
    <section className="panel form">
      <p className="eyebrow">Reveal by {date(attempt.reveal_deadline)}</p>
      <h2>Open the committed case.</h2>
      {backup ? (
        <>
          <p className="prewrap">{backup.document}</p>
          <div className="two">
            <p>A: {backup.a}</p>
            <p>B: {backup.b}</p>
          </div>
          <div className="actions">
            <button
              disabled={
                busy || Number(attempt.reveal_deadline) * 1000 <= Date.now()
              }
              onClick={() =>
                void transact("reveal_attempt", [
                  attempt.id,
                  backup.document,
                  backup.a,
                  backup.b,
                  backup.salt,
                ]).catch(() => {})
              }
            >
              Reveal & start GenLayer evaluation
            </button>
            <button
              className="secondary"
              onClick={() => downloadBackup(backup)}
            >
              Save backup again
            </button>
          </div>
        </>
      ) : (
        <Field
          title="Restore your reveal backup"
          hint="The file must match this contract, campaign, wallet, and commitment."
        >
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file)
                try {
                  if (file.size > 40000)
                    throw new Error("Backup is too large.");
                  await load(await file.text());
                } catch (error) {
                  notify(friendly(error));
                }
            }}
          />
        </Field>
      )}
      <small>
        Keep this page open to follow all three stages. A failed stage remains
        pending until its recovery deadline.
      </small>
    </section>
  );
}

function Credits() {
  const { session } = useApp();
  const { data, error } = useData(
    () => read<string>("get_credit", [session!.address]),
    [session?.address],
  );
  return (
    <section className="credits">
      <div>
        <p className="eyebrow">Your contract credit</p>
        <strong>{data === null ? "—" : gen(data)} test GEN</strong>
        <small>
          {error ||
            "Withdrawals can only go to the wallet that owns this credit."}
        </small>
      </div>
      {data && BigInt(data) > 0n && (
        <Action method="withdraw_credit" args={[session!.address]}>
          Withdraw to my wallet ↗
        </Action>
      )}
    </section>
  );
}

function Protocol() {
  const { data: stats } = useData(() => read<Stats>("get_stats"), []);
  return (
    <section className="narrow protocol">
      <p className="eyebrow">The protocol / v0.1</p>
      <h1>
        Abstention is
        <br />
        <em>a result.</em>
      </h1>
      <p className="intro">
        Lacuna tests a narrow promise: when the evidence does not determine
        eligibility, the evaluator should say so.
      </p>
      <section className="panel">
        <h2>Where GenLayer does the work</h2>
        <ol className="steps">
          <li>
            <strong>Pin and fund.</strong>
            <p>
              The sponsor locks a rule, evaluator profile, closing time, and
              test GEN bounty. A GenLayer self-call reviews rule admissibility.
            </p>
          </li>
          <li>
            <strong>Commit and reveal.</strong>
            <p>
              A different wallet stakes 10% of the bounty and commits to an
              original case plus two additive completions. SHA-256 binds
              network, contract, campaign, wallet, text, and salt. Reveal within
              15 minutes.
            </p>
          </li>
          <li>
            <strong>Run the target.</strong>
            <p>
              The Intelligent Contract calls its LLM through GenLayer. The
              target prompt contains the original case and rule only, never the
              completions.
            </p>
          </li>
          <li>
            <strong>Cross-examine twice.</strong>
            <p>
              Two differently framed referee rounds each inspect the original
              plus both additions, without either prior answer. Each validator
              independently reruns the model task and must agree on every
              decision field.
            </p>
          </li>
          <li>
            <strong>Allocate and withdraw.</strong>
            <p>
              Matching referees must establish two compatible, opposite
              outcomes. A decisive target answer wins; correct abstention does
              not. The contract allocates escrow, and finalized native transfers
              deliver withdrawals.
            </p>
          </li>
        </ol>
      </section>
      <section className="panel">
        <h2>Fixed economics</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Stake</th>
                <th>Bounty</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Confirmed finding</td>
                <td>Challenger</td>
                <td>Challenger</td>
              </tr>
              <tr>
                <td>No finding / invalid case</td>
                <td>Sponsor</td>
                <td>Remains available</td>
              </tr>
              <tr>
                <td>Reveal missed</td>
                <td>Sponsor</td>
                <td>Remains available</td>
              </tr>
              <tr>
                <td>Inconclusive / stage timeout</td>
                <td>Challenger</td>
                <td>Remains available</td>
              </tr>
              <tr>
                <td>Campaign expires, no active attempt</td>
                <td>Already settled</td>
                <td>Sponsor</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          One active attempt per campaign; at most 20 attempts. Each model stage
          has a 15-minute recovery deadline. No early sponsor cancellation,
          protocol fees, or administrator controls.
        </p>
      </section>
      <section className="panel">
        <h2>What this does not prove</h2>
        <p>
          This is a bounded synthetic-document range, not proof of AI safety,
          real-world fact verification, or an audit of arbitrary external
          contracts. It tests Lacuna’s pinned profiles only. Rules that
          intentionally deny eligibility solely because a field is missing are
          outside this range.
        </p>
        <p>
          Two prompts do not guarantee independent model providers. Consensus
          can share model errors. The case may be adversarial, and availability
          or disagreement can leave it inconclusive. Timeouts need a submitted
          transaction and a functioning network.
        </p>
        <p>
          The seeded permissive profile deliberately assumes missing facts are
          favorable. Its findings are separated from standard findings. The
          current chain reports{" "}
          <strong>{stats?.genuine_findings ?? "—"} standard findings</strong>{" "}
          and{" "}
          <strong>
            {stats?.control_findings ?? "—"} seeded-control findings
          </strong>
          ; neither a test mock nor a pending result increments these counters.
        </p>
        <p>
          All inputs and result records are public. Do not submit private data.
          Two wallet addresses do not prove two different people.
        </p>
      </section>
      <section className="panel">
        <h2>Verify the deployment</h2>
        <p>StudioNet · chain 61999 · valueless test GEN</p>
        <a
          className="mono wrap"
          href={`${EXPLORER}/address/${ADDRESS}`}
          target="_blank"
          rel="noreferrer"
        >
          {ADDRESS} ↗
        </a>
        <p>
          Adjudication and value accounting run in this Intelligent Contract.
          The website reads finalized state and relays wallet-signed actions. It
          has no backend verdict API or LLM key.
        </p>
        <a href="/api/health" target="_blank" rel="noreferrer">
          Live contract health ↗
        </a>
      </section>
    </section>
  );
}
