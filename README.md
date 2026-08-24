# StreakPact

Staked accountability pacts, enforced by an AI jury on GenLayer.

Two parties stake on a personal commitment ("gym every day", "write 500 words"). The maker checks in daily with evidence; GenLayer validators fetch the evidence on-chain and an LLM jury reaches consensus on exactly one tiny field — `KEPT` or `MISSED`. Finish within your miss allowance and you take both stakes. Fail, and everything forfeits to the counterparty. No disputes, no appeals — just daily verdicts.

## How it works

```
maker ── create_pact(commitment, days, allowed_misses, start) + stake ──┐
taker ── join_pact(pid) + matching stake ────────────────────────────────┤ LIVE
                                                                          │
each day (window = start + day*period_secs):                              │
  maker ── check_in(pid, note, evidence_url) ──► validators fetch URL ──► AI jury
                                                  sha256 snapshot stored   │ consensus ONLY on KEPT|MISSED
                                                                           │
anyone ── record_miss(pid)          window closed empty → deterministic miss
anyone ── force_settle(pid)         misses exceeded / all days judged / ended
winner ── claim(pid)                pot = 2× stake − fee
```

- **Consensus surface is minimal**: validators re-run the same prompt and must agree only on `KEPT` vs `MISSED` (`gl.vm.run_nondet_unsafe`). Reasons are stored but never voted on.
- **Evidence snapshots**: each fetched body's sha256 is stored per check-in — anyone can re-fetch later and verify what the jury saw.
- **Anti-stall by design**: skipping a day is a permissionless `record_miss`; a dead pact is always settleable once misses exceed allowance or time runs out.
- **Cadence is configurable at deploy**: `period_secs` from 60s (demos) to 30 days.

## Responsibility boundary

| Layer | Owns |
|---|---|
| Frontend (`app/`) | UX, countdowns, streak grids, non-authoritative previews, evidence re-fetch for display |
| Contract (`contracts/streak_pact.py`) | stakes, escrow, windows, check-in state machine, AI jury verdicts, settlement |
| External URLs | raw evidence — never trusted unless validators can re-fetch it |

## Repository layout

```
contracts/streak_pact.py            the intelligent contract
tests/direct/                       fast in-memory tests (no server)
tests/integration/                  end-to-end tests against studionet
scripts/deploy_streak_pact.py       deployment script → deployments/
app/                                Next.js dApp (wizard, dashboard, verifier)
deployments/                        deployed contract addresses per network
```

## Quickstart

Requires Python 3.12 with `pip install genlayer-test genvm-linter pytest`.

```bash
# lint
genvm-lint check contracts/streak_pact.py

# fast tests (~3s, no network)
python -m pytest tests/direct -v

# end-to-end on hosted studio (studionet is gasless)
python -m pytest tests/integration -v        # takes ~10 min total

# deploy (daily cadence, no fee)
python scripts/deploy_streak_pact.py 0 86400
```

Network selection lives in `gltest.config.yaml` (`default: studionet`).

## Contract API

Write: `create_pact(commitment, periods_total, allowed_misses, start_unix)` *(payable)* ·
`join_pact(pact_id)` *(payable)* · `cancel_pact(pact_id)` · `check_in(pact_id, note, evidence_url)` ·
`record_miss(pact_id)` · `force_settle(pact_id)` · `claim(pact_id)`

View: `get_pact` · `get_checkin` · `list_checkins(pact_id, offset, count)` · `list_pacts(offset, count)` · `get_stats()`

Rules enforced on-chain: stake ≥ 0.001 GEN, 3–90 periods, `allowed_misses ≤ periods/3`, sequential daily windows, maker-only check-ins, winner-only claims.

## dApp

```bash
cd app
npm install
npm run dev
```

Features: deploy wizard (fee + cadence presets), pact wizard, join flow,
check-in screen with live window countdown, streak dashboard
(KEPT/MISSED/AUTO_MISS grid + settle/claim actions), and an evidence
verifier that recomputes sha256 of any evidence URL and compares it to the
digest snapshotted on-chain.

## Status

- Lint: clean (pinned runner `py-genlayer:1jb45aa8ynh…`)
- Direct tests: 25/25
- Studionet E2E: full-streak win ✓ · forfeit path ✓ · cancel refund ✓
- Live instance: see `deployments/streak_pact_studionet.json`
