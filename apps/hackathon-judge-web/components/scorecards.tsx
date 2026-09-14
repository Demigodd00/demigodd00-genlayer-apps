'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { formatScore, type Criterion, type ScorecardHistory } from '@/lib/protocol';

export function RubricEditor({ value, onChange, disabled }: { value: Criterion[]; onChange: (value: Criterion[]) => void; disabled: boolean }) {
  const total = value.reduce((sum, criterion) => sum + criterion.weight, 0);
  const update = (index: number, patch: Partial<Criterion>) => onChange(value.map((row, current) => current === index ? { ...row, ...patch } : row));
  const add = () => {
    let index = 1;
    while (value.some((row) => row.id === `criterion_${index}`)) index += 1;
    onChange([...value, { id: `criterion_${index}`, name: '', description: '', weight: 10 }]);
  };
  return <fieldset className="rubric-editor" disabled={disabled}>
    <legend>Weighted scoring criteria</legend>
    <p>Choose 2–4 criteria. Names, descriptions and weights are locked when you create the event.</p>
    {value.map((criterion, index) => <div className="rubric-editor-row" key={criterion.id}>
      <label>Name<input aria-label={`Criterion ${index + 1} name`} value={criterion.name} required minLength={3} maxLength={60} onChange={(e) => update(index, { name: e.target.value })} /></label>
      <label>Weight (%)<input aria-label={`Criterion ${index + 1} weight`} value={Number.isFinite(criterion.weight) ? criterion.weight : ''} type="number" min={1} max={99} step={1} required onChange={(e) => update(index, { weight: e.target.valueAsNumber })} /></label>
      <label className="criterion-description">What should the jury assess?<textarea aria-label={`Criterion ${index + 1} description`} value={criterion.description} required minLength={20} maxLength={1000} onChange={(e) => update(index, { description: e.target.value })} /></label>
      <Button type="button" variant="outline" disabled={disabled || value.length <= 2} onClick={() => onChange(value.filter((_, current) => current !== index))}>Remove {criterion.name || 'criterion'}</Button>
    </div>)}
    <div className="rubric-editor-footer"><output aria-live="polite" data-valid={total === 100}>Total weight: {Number.isFinite(total) ? total : '—'}% / 100%</output><Button type="button" variant="outline" disabled={disabled || value.length >= 4} onClick={add}>Add criterion</Button></div>
  </fieldset>;
}

export function ScorecardPanel({ project, history, onClose }: { project: string; history: ScorecardHistory; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView?.({ behavior: 'instant', block: 'start' });
  }, [project, history.current_digest]);
  const original = history.original?.decision;
  const current = history.current?.decision;
  const target = history.criteria.find((criterion) => criterion.id === history.appeal_target)?.name || history.appeal_target;
  return <section ref={panel} tabIndex={-1} className="scorecard-panel" aria-label={`Scorecard for ${project}`}>
    <header><div><span>On-chain judgment history</span><h2>{project}</h2></div><button type="button" onClick={onClose} aria-label="Close scorecard"><X /></button></header>
    <div className="scorecard-totals">
      <div><span>Original total</span><strong>{original ? formatScore(original.score_total_bps) : '—'} / 100</strong><small>Initial ranking: {history.original_rank || 'not eligible'}</small></div>
      <div><span>Effective total</span><strong>{formatScore(history.effective_total_bps)} / 100</strong><small>Current ranking: {history.current_rank || 'not eligible'} · {history.effective_status.replaceAll('_', ' ')}</small></div>
    </div>
    {history.appeal_target && <p className="scorecard-appeal"><b>Appeal: {target}</b> · {history.appeal_resolved ? 'resolved' : 'pending'}<br />{history.appeal_statement}</p>}
    {history.judgment_timed_out && <output className="scorecard-timeout">Judgment timed out. The effective result is inconclusive with zero points. Any scorecard below is historical, not a new jury decision.</output>}
    {history.criteria.map((criterion) => {
      const before = original?.criteria.find((row) => row.id === criterion.id);
      const after = current?.criteria.find((row) => row.id === criterion.id);
      return <article className="criterion-card" key={criterion.id}>
        <header><h3>{criterion.name} <span>{criterion.weight}%</span></h3><div>Original <b>{before?.score_band ?? '—'}</b> → Latest <b>{after?.score_band ?? '—'}</b></div></header>
        <p>{criterion.description}</p>
        {after && <><p><b>Jury rationale:</b> {after.reason}</p><p className="criterion-contribution">Weighted contribution: {formatScore(after.score_band * criterion.weight)} points</p></>}
        {after?.refs.map((ref, index) => <details key={`${ref.source}-${ref.start}-${ref.end}-${index}`} className="citation"><summary>{ref.source === 'appeal' ? 'Appeal evidence' : 'Original evidence'} · lines {ref.start}–{ref.end}</summary><pre>{ref.excerpt}</pre></details>)}
        {after && !after.refs.length && <small>No evidence range cited for this criterion.</small>}
        {history.current?.phase === 'appeal' && before && <details className="original-criterion"><summary>Original rationale and references</summary><p>{before.reason}</p>{before.refs.map((ref, index) => <div key={index}><b>{ref.source} · lines {ref.start}–{ref.end}</b><pre>{ref.excerpt}</pre></div>)}</details>}
      </article>;
    })}
    <p className="scorecard-scope">Citation locations and excerpts are checked against frozen evidence. They do not prove that a claim or AI judgment is correct. Reason wording and citation choices may differ between validators.</p>
    <details className="scorecard-records"><summary>Inspect immutable records and digests</summary><p>Rubric: <code>{history.rubric_digest}</code></p><p>Original: <code>{history.original_digest || 'not yet judged'}</code></p><p>Latest: <code>{history.current_digest || 'not yet judged'}</code></p><pre>{JSON.stringify({ original: history.original, current: history.current }, null, 2)}</pre></details>
  </section>;
}
