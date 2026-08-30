'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, Award, BookOpenText, Box, Check, ChevronRight,
  CircleDollarSign, Code2, ExternalLink, FileCheck2, Fingerprint,
  Gavel, LoaderCircle, Play, Plus, RefreshCw, Scale, ShieldCheck, Trophy, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  appealSubmission, cancelHackathon, connectWallet, CONTRACT_ADDRESS, createHackathon,
  deposit, evaluateSubmission, EXPLORER_URL, expireUnresolvedSubmission, finalizeHackathon, getBuilderProfile,
  getEvidence, getHackathon, getStats, listHackathons, listSubmissions, resolveAppeal,
  submitProject, watchWallet, withdraw,
  type TxProgress, type WalletSession,
} from '@/lib/contract';
import {
  dateTime, formatGen, friendlyError, parseGen, sameAddress, shortAddress,
  type BuilderProfile, type Evidence, type Hackathon, type HackathonSummary,
  type ProtocolStats, type Submission,
} from '@/lib/protocol';

type Panel = 'none' | 'create' | 'fund' | 'submit' | 'appeal';
type FormSubmit = { preventDefault(): void; currentTarget: HTMLFormElement };
const idleProgress: TxProgress = { state: 'idle', label: '' };
const blankStats: ProtocolStats = {
  total_hackathons: '0', total_submissions: '0', total_evaluated: '0', total_finalized: '0',
  total_no_winner: '0', total_credentials: '0', total_appeals: '0',
  total_prize_awarded_atto: '0', total_prize_refunded_atto: '0',
};

function statusTone(status: string): string {
  if (['FINALIZED', 'WINNER', 'ELIGIBLE', 'JUDGED'].includes(status)) return 'positive';
  if (['INELIGIBLE', 'CANCELLED'].includes(status)) return 'negative';
  if (['INCONCLUSIVE', 'APPEAL_PENDING', 'READY_FOR_JUDGING', 'JUDGING'].includes(status)) return 'warning';
  return 'neutral';
}

function Status({ value }: { value: string }) {
  return <span className="status" data-tone={statusTone(value)}>{value.replaceAll('_', ' ')}</span>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function deadlineDefault(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

export function JudgeApp() {
  const [events, setEvents] = useState<HackathonSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<ProtocolStats>(blankStats);
  const [profile, setProfile] = useState<BuilderProfile | null>(null);
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [progress, setProgress] = useState<TxProgress>(idleProgress);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [appealTarget, setAppealTarget] = useState<Submission | null>(null);
  const [evidence, setEvidence] = useState<{ project: string; value: Evidence } | null>(null);

  const refreshList = useCallback(async () => {
    const [eventPage, protocolStats] = await Promise.all([listHackathons(), getStats()]);
    setEvents(eventPage.items);
    setStats(protocolStats);
    setSelectedId((current) => current || eventPage.items[0]?.id || '');
  }, []);

  const refreshSelected = useCallback(async (id: string) => {
    if (!id) { setHackathon(null); setSubmissions([]); return; }
    const [event, entries] = await Promise.all([getHackathon(id), listSubmissions(id)]);
    setHackathon(event);
    setSubmissions(entries.items);
  }, []);

  const refreshProfile = useCallback(async (session: WalletSession | null) => {
    setProfile(session ? await getBuilderProfile(session.address) : null);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProtocol() {
      try {
        const [eventPage, protocolStats] = await Promise.all([listHackathons(), getStats()]);
        if (!active) return;
        setEvents(eventPage.items);
        setStats(protocolStats);
        setSelectedId(eventPage.items[0]?.id || '');
      } catch (cause) {
        if (active) setError(friendlyError(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProtocol();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    async function loadDocket() {
      try {
        const [event, entries] = await Promise.all([getHackathon(selectedId), listSubmissions(selectedId)]);
        if (!active) return;
        setHackathon(event);
        setSubmissions(entries.items);
      } catch (cause) {
        if (active) setError(friendlyError(cause));
      }
    }
    void loadDocket();
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!wallet) return;
    return watchWallet(wallet, (message) => { setWallet(null); setProfile(null); setError(message); });
  }, [wallet]);

  const busy = ['checking', 'signing', 'submitted', 'finalizing'].includes(progress.state);
  const organizer = Boolean(wallet && hackathon && sameAddress(wallet.address, hackathon.organizer));

  const runTx = async (work: (session: WalletSession, report: (value: TxProgress) => void) => Promise<string>) => {
    if (!wallet) { setError('Connect a StudioNet wallet first.'); return; }
    setError('');
    setProgress({ state: 'checking', label: 'Preparing action' });
    try {
      await work(wallet, setProgress);
      await refreshList();
      await refreshSelected(selectedId);
      await refreshProfile(wallet);
      setPanel('none');
      setAppealTarget(null);
    } catch (cause) { setError(friendlyError(cause)); }
  };

  const connect = async () => {
    setError('');
    try {
      const session = await connectWallet();
      setWallet(session);
      await refreshProfile(session);
    } catch (cause) { setError(friendlyError(cause)); }
  };

  const handleCreate = async (event: FormSubmit) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const prize = parseGen(formValue(data, 'prize') || '0');
    const deadline = Math.floor(new Date(formValue(data, 'deadline')).getTime() / 1000);
    await runTx((session, report) => createHackathon(session, {
      name: formValue(data, 'name'), awardTitle: formValue(data, 'award'),
      rulebook: formValue(data, 'rulebook'), rubric: formValue(data, 'rubric'),
      deadlineUnix: String(deadline), maxSubmissions: formValue(data, 'capacity'),
      minWinningScore: formValue(data, 'minimum'), appealWindowSecs: String(Number(formValue(data, 'appealMinutes')) * 60),
      prizeAtto: String(prize),
    }, report));
  };

  const handleFund = async (event: FormSubmit) => {
    event.preventDefault();
    const amount = parseGen(formValue(new FormData(event.currentTarget), 'amount'));
    await runTx((session, report) => deposit(session, amount, report));
  };

  const handleSubmit = async (event: FormSubmit) => {
    event.preventDefault();
    if (!hackathon) return;
    const data = new FormData(event.currentTarget);
    await runTx((session, report) => submitProject(session, hackathon.id, formValue(data, 'project'), formValue(data, 'url'), formValue(data, 'summary'), report));
  };

  const handleAppeal = async (event: FormSubmit) => {
    event.preventDefault();
    if (!hackathon || !appealTarget) return;
    const data = new FormData(event.currentTarget);
    await runTx((session, report) => appealSubmission(session, hackathon.id, appealTarget.index, formValue(data, 'statement'), formValue(data, 'url'), report));
  };

  const showEvidence = async (submission: Submission) => {
    if (!hackathon) return;
    setError('');
    try { setEvidence({ project: submission.project_name, value: await getEvidence(hackathon.id, submission.index) }); }
    catch (cause) { setError(friendlyError(cause)); }
  };

  const verdictReady = hackathon?.phase === 'READY_FOR_JUDGING' || hackathon?.status === 'JUDGING';
  const walletCredit = profile?.available_credit_atto ?? '0';
  const activeDescription = useMemo(() => {
    if (!hackathon) return 'The v2.1 steward is live. Create the first public judging event.';
    if (hackathon.accepting_submissions) return `${hackathon.remaining_slots} submission slot${hackathon.remaining_slots === '1' ? '' : 's'} still open.`;
    if (hackathon.finalizable) return 'Every decision is in. Anyone can finalize the winner.';
    if (hackathon.appeal_blocked) return 'Finalization is paused while appeal rights are active.';
    return `${hackathon.evaluated_count} of ${hackathon.submission_count} entries judged.`;
  }, [hackathon]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><Scale /></div>
          <div><strong>Hackathon Judge</strong><span>GenLayer-native jury protocol</span></div>
        </div>
        <div className="network-lock"><span /> StudioNet · v2.1</div>
        <div className="top-actions">
          <a className="icon-link" href="/hackathon-judge-demo.mp4" target="_blank" rel="noreferrer" aria-label="Watch demo video"><Play /></a>
          <a className="icon-link" href={EXPLORER_URL} target="_blank" rel="noreferrer" aria-label="View contract in explorer"><ExternalLink /></a>
          <Button className="wallet-button" onClick={connect} disabled={busy}>
            <Wallet /> {wallet ? shortAddress(wallet.address) : 'Connect wallet'}
          </Button>
        </div>
      </header>

      {(error || progress.state !== 'idle') && (
        <output className={`notice ${error || progress.state === 'failed' ? 'notice-error' : ''}`}>
          {busy ? <LoaderCircle className="spin" /> : progress.state === 'confirmed' ? <Check /> : <ShieldCheck />}
          <span>{error || progress.label}</span>
          {progress.hash && <code>{progress.hash.slice(0, 12)}…</code>}
          <button onClick={() => { setError(''); setProgress(idleProgress); }} aria-label="Dismiss"><X /></button>
        </output>
      )}

      <section className="workspace">
        <aside className="event-rail">
          <div className="rail-heading"><span>Judging rooms</span><button onClick={() => { setPanel('create'); setError(''); }} aria-label="Create hackathon"><Plus /></button></div>
          <button className="create-event" onClick={() => setPanel('create')}><Plus /> New hackathon</button>
          <div className="event-list">
            {loading && <div className="loading-row"><LoaderCircle className="spin" /> Loading StudioNet</div>}
            {!loading && events.length === 0 && <div className="rail-empty">No rooms yet.<br />Open the first docket.</div>}
            {events.map((item) => (
              <button key={item.id} className="event-item" data-active={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
                <span className="event-index">{item.id.replace('hj-', '#')}</span>
                <span><strong>{item.name}</strong><small>{item.submission_count} entries · {formatGen(item.prize_atto)} GEN</small></span>
                <ChevronRight />
              </button>
            ))}
          </div>
          <div className="rail-ledger">
            <span>Protocol ledger</span>
            <div><strong>{stats.total_submissions}</strong><small>evidence records</small></div>
            <div><strong>{stats.total_credentials}</strong><small>credentials issued</small></div>
            <div><strong>{formatGen(stats.total_prize_awarded_atto)}</strong><small>GEN awarded</small></div>
          </div>
        </aside>

        <section className="docket">
          <div className="docket-header">
            <div>
              <div className="eyebrow"><Gavel /> Public docket {hackathon?.id ?? '—'}</div>
              <h1>{hackathon?.name ?? 'Human rules. Machine-enforced process.'}</h1>
              <p>{activeDescription}</p>
            </div>
            <div className="docket-actions">
              <Button variant="outline" onClick={() => { void Promise.all([refreshList(), selectedId ? refreshSelected(selectedId) : Promise.resolve()]).catch((cause) => setError(friendlyError(cause))); }}><RefreshCw /> Refresh</Button>
              {hackathon?.accepting_submissions && <Button onClick={() => setPanel('submit')}><ArrowUpRight /> Submit project</Button>}
            </div>
          </div>

          <div className="process-strip">
            {[
              ['01', 'Capture', 'Validators render evidence'],
              ['02', 'Judge', 'Agree on decision fields'],
              ['03', 'Appeal', 'One review right'],
              ['04', 'Settle', 'Prize + credential'],
            ].map(([number, title, copy], index) => <div key={number} data-active={index === 0 || Boolean(hackathon)}><b>{number}</b><span><strong>{title}</strong><small>{copy}</small></span></div>)}
          </div>

          {panel !== 'none' && (
            <ActionPanel title={panel === 'create' ? 'Open a judging room' : panel === 'fund' ? 'Prize balance' : panel === 'submit' ? 'Enter this hackathon' : 'Appeal the decision'} onClose={() => { setPanel('none'); setAppealTarget(null); }}>
              {panel === 'create' && <form className="action-form wide" onSubmit={handleCreate}>
                <Field label="Hackathon name"><input name="name" required minLength={3} maxLength={80} placeholder="Open Intelligence Build Week" /></Field>
                <Field label="Award"><input name="award" required minLength={3} maxLength={80} placeholder="Best verifiable agent" /></Field>
                <Field label="Rulebook" hint="Plain English is the source of truth."><textarea name="rulebook" required minLength={30} maxLength={4000} placeholder="Projects must be newly built, publicly reviewable, and demonstrate…" /></Field>
                <Field label="Scoring rubric"><textarea name="rubric" required minLength={30} maxLength={2000} placeholder="Impact 30%, execution 30%, originality 20%, evidence 20%…" /></Field>
                <Field label="Submission deadline"><input name="deadline" type="datetime-local" defaultValue={deadlineDefault()} required /></Field>
                <Field label="Capacity"><input name="capacity" type="number" min="1" max="8" defaultValue="3" required /></Field>
                <Field label="Winning threshold"><select name="minimum" defaultValue="60"><option>20</option><option>40</option><option>60</option><option>80</option><option>100</option></select></Field>
                <Field label="Appeal window (minutes)"><input name="appealMinutes" type="number" min="1" max="10080" defaultValue="60" required /></Field>
                <Field label="Escrowed prize (GEN)" hint={`Available: ${formatGen(walletCredit)} GEN`}><input name="prize" inputMode="decimal" defaultValue="0" /></Field>
                <div className="form-submit"><Button type="button" variant="outline" onClick={() => setPanel('fund')}><CircleDollarSign /> Fund balance</Button><Button type="submit" disabled={busy}><Gavel /> Create on-chain</Button></div>
              </form>}
              {panel === 'fund' && <div className="fund-grid">
                <div><small>Withdrawable app balance</small><strong>{formatGen(walletCredit)} GEN</strong><p>Deposits become reusable protocol credit. A prize is locked only when you create a hackathon.</p></div>
                <form className="action-form" onSubmit={handleFund}><Field label="Deposit amount"><input name="amount" inputMode="decimal" defaultValue="0.001" required /></Field><Button type="submit" disabled={busy}><CircleDollarSign /> Deposit GEN</Button></form>
                <Button variant="outline" disabled={busy || walletCredit === '0'} onClick={() => runTx((session, report) => withdraw(session, report))}>Withdraw available balance</Button>
              </div>}
              {panel === 'submit' && hackathon && <form className="action-form" onSubmit={handleSubmit}>
                <Field label="Project name"><input name="project" required minLength={3} maxLength={80} /></Field>
                <Field label="Public evidence URL" hint="Captured once by validators; future page edits cannot change this submission."><input name="url" type="url" required placeholder="https://your-project.example/demo" /></Field>
                <Field label="Entrant summary"><textarea name="summary" required minLength={20} maxLength={800} placeholder="What the project does and what the evidence demonstrates…" /></Field>
                <Button type="submit" disabled={busy}><Fingerprint /> Capture evidence + submit</Button>
              </form>}
              {panel === 'appeal' && appealTarget && <form className="action-form" onSubmit={handleAppeal}>
                <div className="appeal-context"><Status value={appealTarget.eligibility} /><strong>{appealTarget.project_name}</strong><p>{appealTarget.reasoning}</p></div>
                <Field label="Appeal statement"><textarea name="statement" required minLength={30} maxLength={1000} placeholder="Explain the specific decision error using the rulebook and saved evidence…" /></Field>
                <Field label="New evidence URL (optional)" hint="If supplied, validators capture a second immutable snapshot."><input name="url" type="url" /></Field>
                <Button type="submit" disabled={busy}><Scale /> File one appeal</Button>
              </form>}
            </ActionPanel>
          )}

          {!hackathon ? <EmptyDocket onCreate={() => setPanel('create')} /> : <>
            <div className="rule-grid">
              <article className="rule-card"><div><BookOpenText /><span>Rulebook</span></div><p>{hackathon.rulebook}</p></article>
              <article className="rule-card"><div><FileCheck2 /><span>Rubric</span></div><p>{hackathon.rubric}</p></article>
            </div>

            <div className="section-title"><div><h2>Submission docket</h2><span>{submissions.length} / {hackathon.max_submissions} entries</span></div><Status value={hackathon.phase} /></div>
            <div className="submission-list">
              {submissions.length === 0 && <div className="submission-empty"><FileCheck2 /><strong>Waiting for evidence</strong><span>Each entrant gets one submission. Validators save the rendered page before judging begins.</span></div>}
              {submissions.map((item) => (
                <article className="submission" key={item.index} data-winner={item.is_winner}>
                  <div className="submission-rank">{item.is_winner ? <Trophy /> : String(Number(item.index) + 1).padStart(2, '0')}</div>
                  <div className="submission-body">
                    <div className="submission-head"><div><h3>{item.project_name}</h3><span>{shortAddress(item.entrant)} · {new Date(item.submitted_at_iso).toLocaleDateString()}</span></div><Status value={item.status} /></div>
                    <p>{item.summary}</p>
                    <div className="evidence-line"><Fingerprint /><code>sha256:{item.evidence_digest.slice(0, 16)}…</code><button onClick={() => showEvidence(item)}>Inspect snapshot</button><a href={item.evidence_url} target="_blank" rel="noreferrer">Source <ExternalLink /></a></div>
                    {item.reasoning && <blockquote><b>Representative rationale · wording not compared</b>{item.reasoning}</blockquote>}
                    <div className="submission-footer">
                      <div><span>Eligibility <b>{item.eligibility || 'Pending'}</b></span><span>Score <b>{item.score_band || '0'} / 100</b></span><span>Confidence <b>{item.confidence_bucket || '0'}%</b></span></div>
                      <div className="row-actions">
                        {verdictReady && item.status === 'SUBMITTED' && <Button size="sm" onClick={() => runTx((session, report) => evaluateSubmission(session, hackathon.id, item.index, report))} disabled={busy}><Gavel /> Judge</Button>}
                        {item.appealable && wallet && sameAddress(wallet.address, item.entrant) && <Button size="sm" variant="outline" onClick={() => { setAppealTarget(item); setPanel('appeal'); }}>Appeal</Button>}
                        {item.appeal_resolvable && <Button size="sm" onClick={() => runTx((session, report) => resolveAppeal(session, hackathon.id, item.index, report))} disabled={busy}>Resolve appeal</Button>}
                        {item.expirable && <Button size="sm" variant="outline" onClick={() => runTx((session, report) => expireUnresolvedSubmission(session, hackathon.id, item.index, report))} disabled={busy}>Mark timed out</Button>}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>}
        </section>

        <aside className="jury-console">
          <div className="console-heading"><span>Jury console</span><Status value={hackathon?.phase ?? 'LIVE'} /></div>
          <div className="verdict-orbit"><div><Gavel /><strong>{hackathon ? `${hackathon.evaluated_count}/${hackathon.submission_count}` : stats.total_evaluated}</strong><span>decisions</span></div></div>
          <div className="decision-spec">
            <h3>Consensus boundary</h3>
            <div><Check /><span><b>Exact</b> eligibility</span></div>
            <div><Check /><span><b>Exact</b> 20-point score band</span></div>
            <div><Check /><span><b>±20</b> confidence tolerance</span></div>
            <div className="muted-check"><X /><span>Reason wording exempt</span></div>
          </div>
          {hackathon && <div className="event-facts">
            <div><span>Prize escrow</span><b>{formatGen(hackathon.prize_atto)} GEN</b></div>
            <div><span>Deadline</span><b>{dateTime(hackathon.submission_deadline_unix)}</b></div>
            <div><span>Win threshold</span><b>{hackathon.min_winning_score} / 100</b></div>
            <div><span>Appeal window</span><b>{Math.round(Number(hackathon.appeal_window_secs) / 60)} min</b></div>
            <div><span>Judgment fallback</span><b>24h timeout</b></div>
          </div>}
          {profile && <div className="builder-card">
            <div><Award /><span>Builder licence</span></div>
            <code>{shortAddress(profile.address)}</code>
            <section><span><b>{profile.entries}</b> entries</span><span><b>{profile.judged_entries}</b> judged</span><span><b>{profile.wins}</b> wins</span></section>
          </div>}
          <div className="console-actions">
            {wallet && <Button variant="outline" onClick={() => setPanel('fund')}><CircleDollarSign /> {formatGen(walletCredit)} GEN balance</Button>}
            {hackathon?.finalizable && <Button onClick={() => runTx((session, report) => finalizeHackathon(session, hackathon.id, report))} disabled={busy}><Award /> Finalize winner</Button>}
            {organizer && hackathon?.status === 'OPEN' && hackathon.submission_count === '0' && <Button variant="destructive" onClick={() => runTx((session, report) => cancelHackathon(session, hackathon.id, report))} disabled={busy}>Cancel + refund</Button>}
          </div>
          <div className="contract-stamp"><Box /><div><span>Intelligent contract</span><code>{shortAddress(CONTRACT_ADDRESS)}</code></div><a href={EXPLORER_URL} target="_blank" rel="noreferrer"><ExternalLink /></a></div>
        </aside>
      </section>

      {evidence && <div className="modal-backdrop"><button className="modal-dismiss" onClick={() => setEvidence(null)} aria-label="Close evidence dialog" /><dialog className="evidence-modal" open aria-label="Saved evidence">
        <header><div><span>Immutable render snapshot</span><h2>{evidence.project}</h2></div><button onClick={() => setEvidence(null)} aria-label="Close"><X /></button></header>
        <div className="digest-box"><Fingerprint /><code>{evidence.value.evidence_digest}</code></div>
        <pre>{evidence.value.evidence_snapshot}</pre>
        {evidence.value.appeal_evidence_snapshot && <><h3>Appeal evidence</h3><div className="digest-box"><Fingerprint /><code>{evidence.value.appeal_evidence_digest}</code></div><pre>{evidence.value.appeal_evidence_snapshot}</pre></>}
      </dialog></div>}
    </main>
  );
}

function ActionPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <section className="action-panel"><header><div><Code2 /><h2>{title}</h2></div><button onClick={onClose} aria-label="Close panel"><X /></button></header>{children}</section>;
}

function EmptyDocket({ onCreate }: { onCreate: () => void }) {
  return <section className="empty-docket">
    <div className="empty-symbol"><Gavel /></div><span>Contract deployed · docket empty</span>
    <h2>Turn a prose rubric into a consensus-safe decision.</h2>
    <p>Evidence is rendered from the public web and frozen on-chain. Validators can disagree on their prose, but must converge on the fields that move money and issue credentials.</p>
    <Button onClick={onCreate}><Plus /> Create the first hackathon</Button>
    <div className="empty-principles"><div><Fingerprint /><b>Immutable evidence</b></div><div><Scale /><b>One appeal</b></div><div><Trophy /><b>Escrowed prize</b></div></div>
  </section>;
}
