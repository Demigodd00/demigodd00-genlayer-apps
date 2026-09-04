// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const address = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const stats = {
  total_hackathons: '26', total_submissions: '1', total_evaluated: '1', total_finalized: '0',
  total_no_winner: '0', total_credentials: '0', total_appeals: '0',
  total_prize_awarded_atto: '0', total_prize_refunded_atto: '0',
};
const summary = (id: string, name: string) => ({
  id, organizer: other, name, award_title: 'Award', status: 'JUDGING', submission_deadline_unix: '1',
  submission_count: id === 'hj-A' ? '1' : '0', evaluated_count: id === 'hj-A' ? '1' : '0',
  prize_atto: '0', has_winner: false,
});
const event = (id: string, name: string) => ({
  ...summary(id, name), rulebook: 'A sufficiently detailed rulebook for testing this jury room.',
  rubric: 'A sufficiently detailed scoring rubric for testing this room.', created_at_iso: '',
  phase: 'JUDGING', max_submissions: '3', min_winning_score: '60', appeal_window_secs: '3600',
  prize_released: false, remaining_slots: '2', winner_index: '', winner: '' as const,
  winner_project: '', finalized_at_iso: '', accepting_submissions: false,
  appeal_blocked: id === 'hj-A', finalizable: false,
});
const appealable = {
  index: '0', hackathon_id: 'hj-A', entrant: address, project_name: 'Project A',
  evidence_url: 'https://example.com/a', evidence_digest: 'a'.repeat(64), summary: 'A complete test submission.',
  submitted_at_iso: '2026-09-01T00:00:00Z', status: 'INCONCLUSIVE', eligibility: 'INCONCLUSIVE',
  score_band: '0', confidence_bucket: '80', reasoning: 'More evidence is required.', evaluated_at_iso: '',
  is_winner: false, appeal_count: '0', appeal_statement: '', appeal_evidence_url: '',
  appeal_evidence_digest: '', appeal_deadline_unix: '9999999999', appeal_resolved: false,
  original_eligibility: 'INCONCLUSIVE', original_score_band: '0', appealable: true,
  appeal_resolvable: false, resolution_deadline_unix: '0', expirable: false,
};

let releaseDeposit: (() => void) | undefined;
const contract = vi.hoisted(() => ({
  listHackathons: vi.fn(), getStats: vi.fn(), getHackathon: vi.fn(), listSubmissions: vi.fn(),
  getBuilderProfile: vi.fn(), connectWallet: vi.fn(), watchWallet: vi.fn(), deposit: vi.fn(),
  withdraw: vi.fn(), createHackathon: vi.fn(), cancelHackathon: vi.fn(), submitProject: vi.fn(),
  evaluateSubmission: vi.fn(), appealSubmission: vi.fn(), resolveAppeal: vi.fn(),
  expireUnresolvedSubmission: vi.fn(), finalizeHackathon: vi.fn(), getEvidence: vi.fn(),
  CONTRACT_ADDRESS: '0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6',
  EXPLORER_URL: 'https://explorer-studio.genlayer.com/address/0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6',
}));

vi.mock('@/lib/contract', () => contract);
import { JudgeApp } from '@/components/judge-app';

beforeEach(() => {
  vi.clearAllMocks();
  releaseDeposit = undefined;
  contract.listHackathons.mockImplementation(async (offset = 0) => offset === 0
    ? { total: '26', items: [summary('hj-A', 'Room A'), summary('hj-B', 'Room B')] }
    : { total: '26', items: [summary('hj-Z', 'Room Z')] });
  contract.getStats.mockResolvedValue(stats);
  contract.getHackathon.mockImplementation(async (id: string) => event(id, id === 'hj-A' ? 'Room A' : 'Room B'));
  contract.listSubmissions.mockImplementation(async (id: string) => ({ total: id === 'hj-A' ? '1' : '0', items: id === 'hj-A' ? [appealable] : [] }));
  contract.connectWallet.mockResolvedValue({ address, client: {}, provider: {} });
  contract.watchWallet.mockReturnValue(() => {});
  contract.getBuilderProfile.mockResolvedValue({ address, entries: '1', judged_entries: '1', wins: '0', available_credit_atto: '0' });
});

afterEach(cleanup);

describe('room and transaction safety', () => {
  it('closes a pending appeal when the selected room changes', async () => {
    const user = userEvent.setup();
    render(<JudgeApp />);
    await screen.findByRole('heading', { name: 'Room A' });
    await user.click(screen.getByRole('button', { name: /Connect wallet/i }));
    await user.click(await screen.findByRole('button', { name: 'Appeal' }));
    expect(screen.getByRole('heading', { name: 'Appeal the decision' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Room B/ }));
    await screen.findByRole('heading', { name: 'Room B' });
    expect(screen.queryByRole('heading', { name: 'Appeal the decision' })).toBeNull();
    expect(contract.appealSubmission).not.toHaveBeenCalled();
  });

  it('keeps the transaction lock active until finalization finishes', async () => {
    const user = userEvent.setup();
    contract.deposit.mockImplementation((_session, _amount, progress) => {
      progress({ state: 'finalizing', label: 'Validators are finalizing the result', hash: '0x1234' });
      return new Promise<string>((resolve) => {
        releaseDeposit = () => {
          progress({ state: 'confirmed', label: 'Finalized on StudioNet', hash: '0x1234' });
          resolve('0x1234');
        };
      });
    });
    render(<JudgeApp />);
    await screen.findByRole('heading', { name: 'Room A' });
    await user.click(screen.getByRole('button', { name: /Connect wallet/i }));
    await user.click(screen.getByRole('button', { name: /GEN balance/i }));
    await user.click(screen.getByRole('button', { name: 'Deposit GEN' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Dismiss' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Deposit GEN' }).disabled).toBe(true);
    releaseDeposit?.();
    await waitFor(() => expect(screen.queryByText('Validators are finalizing the result')).toBeNull());
  });

  it('shows invalid deposit values without starting a transaction', async () => {
    render(<JudgeApp />);
    await screen.findByRole('heading', { name: 'Room A' });
    fireEvent.click(screen.getByRole('button', { name: /Connect wallet/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /GEN balance/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /GEN balance/i }));
    fireEvent.change(screen.getByLabelText('Deposit amount'), { target: { value: 'abc' } });
    fireEvent.submit(screen.getByLabelText('Deposit amount').closest('form')!);
    expect(await screen.findByText('Enter a valid GEN amount with up to 18 decimals.')).toBeTruthy();
    expect(contract.deposit).not.toHaveBeenCalled();
  });

  it('loads additional room pages', async () => {
    const user = userEvent.setup();
    render(<JudgeApp />);
    await screen.findByRole('heading', { name: 'Room A' });
    await user.click(screen.getByRole('button', { name: 'Load more rooms' }));
    expect(await screen.findByRole('button', { name: /Room Z/ })).toBeTruthy();
  });
});
