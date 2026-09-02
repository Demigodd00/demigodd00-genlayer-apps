"""Resume-safe, real StudioNet acceptance of the recorded StreakPact release.

Run one process at a time. This writes public demo pacts using valueless test
stakes. It does not deploy a replacement contract or fund an account.
"""

import argparse
import json
import time

from streakpact_acceptance import Acceptance, ROOT, output, timestamp

STAKE = 10**15
CRITERIA = (
    "For this StudioNet demonstration, require a wallet-authenticated attestation "
    "to the exact JSON digest. The artifact must show activity reading, completed "
    "true, and duration_minutes of at least 30 for the observed pact period."
)


class Suite:
    def __init__(self):
        self.runner = Acceptance("maker")
        self.runner.preflight()

    def write(self, key, method, args, role="maker", value=0, error=None):
        self.runner.role = role
        self.runner.client.local_account = self.runner.accounts[role]
        return self.runner.write(key, method, args, value, error)

    def check(self, key, actual, expected):
        for field, value in expected.items():
            if actual.get(field) != value:
                raise AssertionError(f"{key}: {field} is {actual.get(field)!r}, expected {value!r}")
        self.runner.record.setdefault("assertions", {})[key] = {
            "checked_at": timestamp(), "expected": expected, "observed": actual,
        }
        self.runner.save()
        output({"assertion": key, "passed": True, "expected": expected})
        return actual

    def snapshot(self, key, method, args, expected):
        # A historical assertion is not reinterpreted after later transitions.
        existing = self.runner.record.get("assertions", {}).get(key)
        if existing:
            if existing["expected"] != expected:
                raise RuntimeError("Historical assertion has different expectations")
            return existing["observed"]
        return self.check(key, self.runner.read(method, args), expected)

    def wait_until(self, unix, reason):
        while time.time() < unix:
            remaining = unix - time.time()
            output({"waiting_for": reason, "seconds_remaining": round(remaining)})
            time.sleep(min(15, remaining))

    def complete(self, phase):
        self.runner.record.setdefault("completed_phases", {})[phase] = timestamp()
        self.runner.save()
        output({"phase": phase, "passed": True})

    def proof(self, verdict="kept"):
        hosted = json.loads((ROOT / "deployments/streak_pact_v2_hosted_checks.json").read_text(encoding="utf-8"))
        fixture = hosted["fixtures"][verdict]
        if not fixture["download_verified"]:
            raise RuntimeError("Hosted evidence has not been verified")
        return fixture

    def pact(self, key, **expected):
        pact_id = self.runner.record["pacts"][key]
        value = self.runner.read("get_pact", [pact_id])
        if expected:
            self.check(key + ":" + ":".join(f"{k}={v}" for k, v in expected.items()), value, expected)
        return value

    def create(self, key, mode="SELF", lead=900, allowed_misses=1, attestor_role="maker"):
        pacts = self.runner.record.setdefault("pacts", {})
        step = "create-" + key
        existing = self.runner.record["transactions"].get(step)
        title = "Release acceptance: " + key
        args = existing["args"] if existing else [
            mode, title, CRITERIA, 3, allowed_misses, int(time.time()) + lead,
            self.runner.accounts["tester"].address,
            self.runner.accounts[attestor_role].address,
        ]
        self.write(step, "create_pact", args, value=STAKE)
        if key not in pacts:
            items = []
            offset = 0
            while True:
                page = self.runner.read("list_user_pacts", [self.runner.accounts["maker"].address, offset, 25])
                items.extend(item for item in page["items"] if item["title"] == title)
                offset += len(page["items"])
                if offset >= int(page["total"]) or not page["items"]:
                    break
            if len(items) != 1:
                raise RuntimeError(f"Cannot uniquely identify the created {key} pact")
            pacts[key] = items[0]["id"]
            self.runner.save()
        output({"pact": key, "id": pacts[key], "start_unix": args[5]})
        return pacts[key]

    def cancellations(self):
        self_id = self.create("self-cancellation", lead=1800)
        self.write("reject-nonmaker-cancellation", "cancel_before_start", [self_id], role="tester", error="only the maker can cancel")
        self.write("cancel-self", "cancel_before_start", [self_id])
        self.pact("self-cancellation", status="VOIDED")
        challenge_id = self.create("unmatched-cancellation", "CHALLENGE", lead=1800)
        self.pact("unmatched-cancellation", status="OPEN")
        self.write("cancel-unmatched-challenge", "cancel_before_start", [challenge_id])
        self.pact("unmatched-cancellation", status="VOIDED")
        self.complete("cancellations")

    def prepare_losses(self):
        challenge_id = self.create("challenge-loss", "CHALLENGE", lead=600)
        self.snapshot("challenge-open", "get_pact", [challenge_id], {"status": "OPEN"})
        self.write("reject-maker-join", "join_pact", [challenge_id], value=STAKE, error="maker cannot join own pact")
        self.write("reject-wrong-stake", "join_pact", [challenge_id], role="tester", value=STAKE * 2, error="challenger must match the stake exactly")
        self.write("join-matched-challenge", "join_pact", [challenge_id], role="tester", value=STAKE)
        self.snapshot("challenge-matched", "get_pact", [challenge_id], {
            "status": "LIVE", "taker": self.runner.accounts["tester"].address,
            "pot_atto": str(STAKE * 2),
        })
        self.write("reject-matched-cancellation", "cancel_before_start", [challenge_id], error="pact cannot be cancelled")
        self.create("self-loss", lead=120)
        self.complete("prepare_losses")

    def self_win(self):
        proof = self.proof()
        pact_id = self.create("self-win", lead=180, attestor_role="tester")
        created = self.snapshot("self-win-created", "get_pact", [pact_id], {
            "status": "LIVE", "kept_count": "0", "provenance_policy": "WALLET_VERIFIED",
            "evidence_attestor": self.runner.accounts["tester"].address,
        })
        if not self.runner.record["transactions"].get("self-win-live-proof", {}).get("transaction_hash"):
            self.wait_until(int(created["start_unix"]) + 3, "first evidence window")
            if time.time() >= int(created["start_unix"]) + 45:
                raise RuntimeError("First proof window is too close to expiry; inspect the existing pact before proceeding")
        self.write("self-win-live-proof", "submit_checkin", [
            pact_id, proof["url"], proof["digest"],
            "I independently attest that the subject completed this reading activity.",
            int(created["start_unix"]) + 1,
        ], role="tester")
        self.snapshot("self-win-live-verdict", "get_checkin", [pact_id, 0], {
            "verdict": "KEPT", "method": "SIGNED_CONTENT_EVIDENCE", "content_digest": proof["digest"],
            "attestor": self.runner.accounts["tester"].address, "provenance": "WALLET_VERIFIED",
        })
        self.write("reject-claim-before-finality", "claim", [pact_id], error="pact is not finalized")
        self.wait_until(int(created["end_unix"]) + 3, "remaining periods to expire")
        self.write("self-win-record-misses", "record_elapsed_periods", [pact_id])
        self.snapshot("self-win-expired-counts", "get_pact", [pact_id], {"kept_count": "1", "miss_count": "2"})
        self.snapshot("self-win-auto-miss", "get_checkin", [pact_id, 1], {"verdict": "MISSED", "method": "AUTO_MISS"})
        self.write("self-win-propose", "propose_settlement", [pact_id])
        provisional = self.snapshot("self-win-provisional", "get_pact", [pact_id], {"status": "PROVISIONAL_LOST"})
        appeal = [
            pact_id, 1,
            "I attest that this reading log meets the explicitly agreed criteria.",
            proof["url"], proof["digest"], int(created["start_unix"]) + 61,
        ]
        self.write("reject-unauthorized-appeal", "appeal_period", appeal, role="tester", error="only the maker can appeal a missed period")
        self.write("self-win-appeal", "appeal_period", appeal)
        appealed = self.snapshot("self-win-appeal-verdict", "get_checkin", [pact_id, 1], {
            "verdict": "KEPT", "appealed": True, "method": "SIGNED_APPEAL_EVIDENCE", "content_digest": proof["digest"],
        })
        self.check("self-win-original-and-appeal-preserved", {
            "original_verdict": appealed["original_record"]["verdict"],
            "original_method": appealed["original_record"]["method"],
            "original_digest": appealed["original_record"]["content_digest"],
            "appeal_verdict": appealed["appeal_record"]["verdict"],
            "appeal_method": appealed["appeal_record"]["method"],
            "appeal_digest": appealed["appeal_record"]["content_digest"],
            "appeal_attestor": appealed["appeal_record"]["attestor"],
            "appeal_attestation_id_length": len(appealed["appeal_record"]["attestation_id"]),
        }, {
            "original_verdict": "MISSED",
            "original_method": "AUTO_MISS",
            "original_digest": "",
            "appeal_verdict": "KEPT",
            "appeal_method": "SIGNED_APPEAL_EVIDENCE",
            "appeal_digest": proof["digest"],
            "appeal_attestor": self.runner.accounts["maker"].address,
            "appeal_attestation_id_length": 64,
        })
        self.snapshot("self-win-appeal-counts", "get_pact", [pact_id], {
            "status": "PROVISIONAL_WON", "kept_count": "2", "miss_count": "1",
            "appeal_deadline_unix": provisional["appeal_deadline_unix"],
        })
        self.write("reject-duplicate-appeal", "appeal_period", appeal, error="period appeal already used")
        self.write("reject-early-finalization", "finalize_settlement", [pact_id], error="appeal window is still open")
        self.wait_until(int(provisional["appeal_deadline_unix"]) + 3, "appeal window to close")
        self.write("self-win-finalize", "finalize_settlement", [pact_id])
        self.snapshot("self-win-finalized", "get_pact", [pact_id], {"status": "WON"})
        self.write("reject-nonwinner-claim", "claim", [pact_id], role="tester", error="only the payout recipient can claim")
        self.write("self-win-claim", "claim", [pact_id])
        self.snapshot("self-win-settled", "get_pact", [pact_id], {"status": "SETTLED"})
        self.write("reject-double-claim", "claim", [pact_id], error="pact is not finalized")
        self.complete("self_win")

    def prepare_loss_settlements(self):
        if "prepare_loss_settlements" in self.runner.record.get("completed_phases", {}):
            return
        deadlines = []
        for key in ["self-loss", "challenge-loss"]:
            pact_id = self.runner.record["pacts"][key]
            pact = self.runner.read("get_pact", [pact_id])
            self.wait_until(int(pact["end_unix"]) + 3, key + " periods to expire")
            self.write(key + "-propose", "propose_settlement", [pact_id])
            provisional = self.snapshot(key + "-provisional", "get_pact", [pact_id], {
                "status": "PROVISIONAL_LOST", "kept_count": "0", "miss_count": "3",
            })
            deadlines.append(int(provisional["appeal_deadline_unix"]))
        failed_proof = self.proof("missed")
        challenge_id = self.runner.record["pacts"]["challenge-loss"]
        challenge = self.runner.read("get_pact", [challenge_id])
        self.write("challenge-loss-evidence-review", "appeal_period", [
            challenge_id, 0, "Please evaluate this synthetic log against the agreed reading requirements.",
            failed_proof["url"], failed_proof["digest"], int(challenge["start_unix"]) + 1,
        ])
        self.snapshot("challenge-loss-reviewed-miss", "get_checkin", [challenge_id, 0], {
            "verdict": "MISSED", "method": "SIGNED_APPEAL_EVIDENCE", "appealed": True,
            "content_digest": failed_proof["digest"],
        })
        self.complete("prepare_loss_settlements")

    def settle_losses(self):
        self.prepare_loss_settlements()
        deadlines = [int(self.runner.record["assertions"][key + "-provisional"]["observed"]["appeal_deadline_unix"]) for key in ["self-loss", "challenge-loss"]]
        self.wait_until(max(deadlines) + 3, "loss-pact appeal windows to close")
        for key in ["self-loss", "challenge-loss"]:
            pact_id = self.runner.record["pacts"][key]
            self.write(key + "-finalize", "finalize_settlement", [pact_id])
            self.snapshot(key + "-finalized", "get_pact", [pact_id], {"status": "LOST"})
            self.write(key + "-reject-maker-claim", "claim", [pact_id], error="only the payout recipient can claim")
            self.write(key + "-claim", "claim", [pact_id], role="tester")
            self.snapshot(key + "-settled", "get_pact", [pact_id], {"status": "SETTLED"})
        self.complete("settle_losses")

    def prepare_challenge_win(self):
        proof = self.proof()
        pact_id = self.create("challenge-win", "CHALLENGE", lead=180)
        self.write("challenge-win-join", "join_pact", [pact_id], role="tester", value=STAKE)
        created = self.snapshot("challenge-win-matched", "get_pact", [pact_id], {"status": "LIVE", "pot_atto": str(STAKE * 2)})
        if not self.runner.record["transactions"].get("challenge-win-proof", {}).get("transaction_hash"):
            self.wait_until(int(created["start_unix"]) + 3, "challenge evidence window")
            if time.time() >= int(created["start_unix"]) + 45:
                raise RuntimeError("Challenge proof window is too close to expiry; inspect the existing pact")
        self.write("challenge-win-proof", "submit_checkin", [
            pact_id, proof["url"], proof["digest"],
            "I attest that the subject completed the challenge reading activity.",
            int(created["start_unix"]) + 1,
        ])
        self.snapshot("challenge-win-proof-verdict", "get_checkin", [pact_id, 0], {"verdict": "KEPT", "method": "SIGNED_CONTENT_EVIDENCE"})
        self.wait_until(int(created["end_unix"]) + 3, "remaining challenge periods")
        self.write("challenge-win-propose", "propose_settlement", [pact_id])
        self.snapshot("challenge-win-initial-result", "get_pact", [pact_id], {"status": "PROVISIONAL_LOST", "kept_count": "1", "miss_count": "2"})
        self.write("challenge-win-taker-appeal", "appeal_period", [
            pact_id, 0, "As the challenger, I request an independent review of this reading log against the agreed criteria.",
            proof["url"], proof["digest"], int(created["start_unix"]) + 1,
        ], role="tester")
        self.snapshot("challenge-win-taker-review", "get_checkin", [pact_id, 0], {"verdict": "KEPT", "appealed": True, "method": "SIGNED_APPEAL_EVIDENCE"})
        self.write("challenge-win-maker-appeal", "appeal_period", [
            pact_id, 1, "This synthetic log satisfies the agreed demonstration criteria for the missed period.",
            proof["url"], proof["digest"], int(created["start_unix"]) + 61,
        ])
        self.snapshot("challenge-win-provisional", "get_pact", [pact_id], {"status": "PROVISIONAL_WON", "kept_count": "2", "miss_count": "1"})
        self.complete("prepare_challenge_win")

    def finish_challenge_win(self):
        pact_id = self.runner.record["pacts"]["challenge-win"]
        provisional = self.runner.record["assertions"]["challenge-win-provisional"]["observed"]
        self.wait_until(int(provisional["appeal_deadline_unix"]) + 3, "challenge-win appeal window")
        self.write("challenge-win-finalize", "finalize_settlement", [pact_id])
        self.snapshot("challenge-win-finalized", "get_pact", [pact_id], {"status": "WON"})
        self.write("challenge-win-reject-taker-claim", "claim", [pact_id], role="tester", error="only the payout recipient can claim")
        self.write("challenge-win-claim", "claim", [pact_id])
        self.snapshot("challenge-win-settled", "get_pact", [pact_id], {"status": "SETTLED"})
        self.complete("finish_challenge_win")

    def verify_transfers(self):
        cases = [
            ("cancel-self", "maker", STAKE),
            ("cancel-unmatched-challenge", "maker", STAKE),
            ("self-win-claim", "maker", STAKE),
            ("self-loss-claim", "tester", STAKE),
            ("challenge-loss-claim", "tester", STAKE * 2),
            ("challenge-win-claim", "maker", STAKE * 2),
        ]
        for key, role, amount in cases:
            entry = self.runner.record["transactions"][key]
            if not entry.get("checked") or not entry.get("execution_succeeded"):
                raise RuntimeError("Cannot verify a transfer from an unsuccessful parent transaction")
            receipt = self.runner.rpc("eth_getTransactionByHash", [entry["transaction_hash"]])["result"]
            leaders = receipt["consensus_data"]["leader_receipt"]
            leader = leaders[0] if isinstance(leaders, list) else leaders
            emitted = leader.get("pending_transactions", [])
            expected_address = self.runner.accounts[role].address
            assert len(emitted) == 1, (key, "unexpected transfer count")
            assert emitted[0]["is_eth_send"] is True and emitted[0]["on"] == "finalized"
            assert int(emitted[0]["value"]) == amount and emitted[0]["address"].lower() == expected_address.lower()
            children = receipt.get("triggered_transactions", [])
            assert len(children) == 1, (key, "expected one native transfer")
            child = self.runner.rpc("eth_getTransactionByHash", [children[0]])["result"]
            # Native transfers have no GenVM execution. Verify credit, recipient,
            # value, parent linkage and finality, not a contract result label.
            assert child["status"] == "FINALIZED" and child["type"] == 0
            assert child["value_credited"] is True
            assert child["from_address"].lower() == self.runner.address.lower()
            assert child["to_address"].lower() == expected_address.lower()
            assert int(child["value"]) == amount and child["triggered_by"] == entry["transaction_hash"]
            self.runner.record.setdefault("transfer_checks", {})[key] = {
                "checked_at": timestamp(), "parent": entry["transaction_hash"],
                "transfer": children[0], "recipient": expected_address,
                "value_atto": str(amount), "status": child["status"], "value_credited": True,
            }
            self.runner.save()
            output({"transfer": key, "passed": True, "recipient": expected_address, "value_atto": str(amount)})
        self.runner.record["final_stats"] = self.runner.read("get_stats", [])
        self.complete("verify_transfers")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["cancellations", "prepare_losses", "self_win", "prepare_loss_settlements", "prepare_challenge_win", "settle_losses", "finish_challenge_win", "verify_transfers", "final_matrix"])
    options = parser.parse_args()
    suite = Suite()
    phases = ["prepare_loss_settlements", "prepare_challenge_win", "settle_losses", "finish_challenge_win", "verify_transfers"] if options.phase == "final_matrix" else [options.phase]
    for phase in phases:
        if phase in suite.runner.record.get("completed_phases", {}):
            output({"phase": phase, "state": "already passed"})
            continue
        getattr(suite, phase)()


if __name__ == "__main__":
    main()
