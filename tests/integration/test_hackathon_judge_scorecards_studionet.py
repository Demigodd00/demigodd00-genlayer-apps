"""Independent readback of real v3 transactions, source, scorecards and settlement.

No credentials, funding, write transactions or LLM mocks are used by this test.
Run the three seed_hackathon_judge_scorecards.py phases first.
"""
import base64
import hashlib
import json
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

import pytest
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = Path(__file__).resolve().parents[2]
_spec = spec_from_file_location('hackathon_judge_rpc', ROOT / 'scripts/hackathon_judge_rpc.py')
_rpc = module_from_spec(_spec)
_spec.loader.exec_module(_rpc)


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


@pytest.mark.slow
def test_live_v3_scorecard_history_provenance_and_settlement():
    deployment = json.loads((ROOT / 'deployments/hackathon_judge_scorecards_studionet.json').read_text())
    demo = json.loads((ROOT / 'deployments/hackathon_judge_scorecards_v3_0_1_demo.json').read_text(encoding='utf-8'))
    assert demo.get('completed_at'), 'Complete the real acceptance run before checking the milestone'
    assert deployment['version'] == demo['contract_version'] == '3.0.1'
    address = deployment['address']
    assert demo['contract'].lower() == address.lower()
    client = create_client(chain=studionet, account=Account.create())  # read-only sender context

    def read(method, args):
        return _rpc.read_studionet_view(client, address, method, args)

    def receipt(tx):
        return client.wait_for_transaction_receipt(tx, status=TransactionStatus.FINALIZED,
                                                   interval=5000, retries=20, full_transaction=True)

    assert tx_execution_succeeded(receipt(deployment['transaction_hash']))
    code = client.provider.make_request(method='gen_getContractCode', params=[address])['result']
    source = base64.b64decode(code).decode().replace('\r\n', '\n')
    assert digest(source) == deployment['source_sha256']
    assert source == (ROOT / 'contracts/hackathon_judge_scorecards.py').read_text(encoding='utf-8').replace('\r\n', '\n')
    config = read('get_config', [])
    assert config['version'] == '3.0.1' and config['score_total_scale'] == '10000'
    for step, tx in demo['transactions'].items():
        actual = receipt(tx['transaction_hash'])
        if tx['expected_error']:
            assert not tx_execution_succeeded(actual), step
            assert tx['expected_error'] in json.dumps(actual, default=str), step
        else:
            assert tx_execution_succeeded(actual), step
    for failed in demo.get('failed_attempts', []):
        actual = receipt(failed['transaction_hash'])
        assert not tx_execution_succeeded(actual)
        assert actual['result_name'] == failed['result_name'] == 'MAJORITY_DISAGREE'
    assert demo['wrong_wallet_submission_count_after'] == '0'
    assert demo['premature_settlement_prize_released'] is False
    event_id = demo['hackathon_id']
    event = read('get_hackathon', [event_id])
    assert event['status'] == 'FINALIZED' and event['prize_released'] is True
    assert event['criteria'] == demo['criteria']
    assert digest(canonical(event['criteria'])) == event['rubric_digest']
    assert int(event['common_appeal_deadline_unix']) > int(event['submission_deadline_unix'])
    assert read('get_credit', [event['winner']]) == '0'
    entries = read('list_submissions', [event_id, 0, 25])['items']
    assert len(entries) == 2
    histories = []
    for index, entry in enumerate(entries):
        history = read('get_scorecard_history', [event_id, index])
        histories.append(history)
        assert history == demo['final_histories'][index]
        assert history['original'] == demo['initial_histories'][index]['original']
        assert history['original_digest'] == demo['initial_histories'][index]['original_digest']
        evidence = read('get_submission_evidence', [event_id, index])
        snapshots = {'original': evidence['evidence_snapshot'], 'appeal': evidence['appeal_evidence_snapshot']}
        for prefix in ('', 'appeal_'):
            if prefix and not evidence['appeal_evidence_snapshot']:
                continue
            provenance_text = evidence[prefix + 'provenance_record']
            provenance = json.loads(provenance_text)
            snapshot = evidence[prefix + 'evidence_snapshot']
            assert digest(snapshot) == evidence[prefix + 'evidence_digest']
            assert provenance['entrant'] == entry['entrant'].lower()
            assert provenance['contract'] == address.lower() and provenance['hackathon_id'] == event_id
            assert provenance['challenge'] in snapshot.splitlines()
            assert provenance['parent_package_digest'] == (entry['evidence_package_digest'] if prefix else '')
            package_key = 'appeal_package_digest' if prefix else 'evidence_package_digest'
            assert digest(canonical({'provenance': provenance_text, 'snapshot_digest': digest(snapshot)})) == entry[package_key]
        for phase in ('original', 'current'):
            card = history[phase]
            assert digest(canonical(card)) == history[phase + '_digest']
            assert card['rubric_digest'] == event['rubric_digest']
            assert card['entrant'] == entry['entrant'].lower() and card['contract'] == address.lower()
            assert card['original_package_digest'] == entry['evidence_package_digest']
            rows = card['decision']['criteria']
            assert [row['id'] for row in rows] == [criterion['id'] for criterion in event['criteria']]
            total = sum(row['score_band'] * criterion['weight'] for row, criterion in zip(rows, event['criteria']))
            assert total == card['decision']['score_total_bps']
            for row in rows:
                assert row['score_band'] in (0, 20, 40, 60, 80, 100)
                assert row['refs'] or row['score_band'] == 0
                for ref in row['refs']:
                    lines = snapshots[ref['source']].splitlines()
                    assert 1 <= ref['start'] <= ref['end'] <= len(lines)
                    assert ref['end'] - ref['start'] < 5
                    assert '\n'.join(lines[ref['start'] - 1:ref['end']]) == ref['excerpt']
        assert entry['appeal_deadline_unix'] == event['common_appeal_deadline_unix']
    appealed = histories[1]
    assert appealed['appeal_target'] == 'reproducibility' and appealed['appeal_resolved'] is True
    assert appealed['current']['parent_scorecard_digest'] == appealed['original_digest']
    assert appealed['current']['appeal_package_digest'] == entries[1]['appeal_package_digest']
    assert appealed['current']['appeal_statement_digest'] == digest(appealed['appeal_statement'])
    for before, after in zip(appealed['original']['decision']['criteria'], appealed['current']['decision']['criteria']):
        if before['id'] != appealed['appeal_target']:
            assert before == after
    eligible = [entry for entry in entries if entry['eligibility'] == 'ELIGIBLE' and int(entry['score_total_bps']) >= int(event['min_winning_score']) * 100]
    expected = sorted(eligible, key=lambda entry: (-int(entry['score_total_bps']), int(entry['index'])))[0]
    assert event['winner'].lower() == expected['entrant'].lower()
