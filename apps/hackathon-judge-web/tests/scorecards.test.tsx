// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RubricEditor, ScorecardPanel } from '../components/scorecards';
import { DEFAULT_CRITERIA, type ScorecardHistory } from '../lib/protocol';

afterEach(cleanup);
const original = {
  phase: 'initial' as const, evaluated_at_iso: '', rubric_digest: 'rubric', parent_scorecard_digest: '',
  original_package_digest: 'package', appeal_package_digest: '',
  decision: { eligibility: 'ELIGIBLE', confidence_bucket: 80, reason: 'Initial decision', score_total_bps: 6400,
    criteria: [{ id: 'implementation', score_band: 80, reason: 'Working build', refs: [{ source: 'original' as const, start: 1, end: 1, excerpt: 'Recorded implementation text' }] }] },
};
const history: ScorecardHistory = {
  criteria: DEFAULT_CRITERIA, rubric_digest: 'rubric', original, current: { ...original, phase: 'appeal', parent_scorecard_digest: 'first', decision: { ...original.decision, score_total_bps: 8800 } },
  original_digest: 'first', current_digest: 'second', appeal_target: 'implementation', appeal_statement: 'Please review implementation.',
  appeal_resolved: true, judgment_timed_out: false, effective_eligibility: 'ELIGIBLE', effective_total_bps: '8800', effective_status: 'JUDGED',
  effective_at_iso: '', original_rank: '2', current_rank: '1', common_appeal_deadline_unix: '9999999999',
};

describe('scorecard audit presentation', () => {
  it('shows both totals, ranks, original history and exact frozen excerpts', () => {
    render(<ScorecardPanel project="Fixture" history={history} onClose={() => {}} />);
    expect(screen.getByText('64 / 100')).toBeTruthy();
    expect(screen.getByText('88 / 100')).toBeTruthy();
    expect(screen.getByText('Initial ranking: 2')).toBeTruthy();
    expect(screen.getByText(/Current ranking: 1/)).toBeTruthy();
    expect(screen.getByText('Original rationale and references')).toBeTruthy();
    expect(screen.getAllByText('Recorded implementation text').length).toBe(2);
  });
  it('distinguishes historical scores from an effective timeout result', () => {
    render(<ScorecardPanel project="Fixture" history={{ ...history, judgment_timed_out: true, effective_total_bps: '0', effective_status: 'INCONCLUSIVE' }} onClose={() => {}} />);
    expect(screen.getByText('0 / 100')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('historical, not a new jury decision');
    expect(screen.getByText('64 / 100')).toBeTruthy();
  });
  it('keeps the four-criterion limit visible in the editor', () => {
    render(<RubricEditor value={DEFAULT_CRITERIA} onChange={() => {}} disabled={false} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add criterion' }).disabled).toBe(true);
    expect(screen.getByText('Total weight: 100% / 100%')).toBeTruthy();
  });
});
