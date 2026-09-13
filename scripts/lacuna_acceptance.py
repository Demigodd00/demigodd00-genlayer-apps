"""Real LLM consensus and native payouts, not mocked findings. Resume-safe."""
import hashlib
import json
import time

from lacuna_runtime import Runtime, DEPLOYMENT, now, emit

RULE = "Approve applicants only if both independent pilot reviews finished before June 15 of the same year."
DOCUMENT = "Both independent pilot reviews for the applicant finished in June of that year."
A = "Both reviews finished on June 10 of that same year."
B = "Both reviews finished on June 20 of that same year."
BOUNTY = 10**15
STAKE = BOUNTY // 10


def main():
    runtime = Runtime("lacuna_acceptance_011.json")
    deployment = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
    if runtime.address and runtime.address.lower() != deployment["address"].lower():
        raise RuntimeError("Acceptance journal belongs to another deployment")
    runtime.address = deployment["address"]
    runtime.record.update(contract=runtime.address, source_sha256=runtime.verify_source())
    runtime.save()
    # The SDK uses gasless execution, but deposits below are actual native test GEN.
    challenger = runtime.accounts["challenger"].address
    runtime.fund_challenger()
    for key, profile, expected, document in (
        ("abstention", "STANDARD", "NO_FINDING", DOCUMENT),
        ("seeded-control", "SEEDED_PERMISSIVE", "CONFIRMED_FINDING", DOCUMENT),
        ("contradiction", "SEEDED_PERMISSIVE", "INVALID_ATTEMPT", "Both independent pilot reviews for the applicant finished on June 20 of that year."),
    ):
        prior = runtime.record["transactions"].get("create-" + key)
        args = prior["args"] if prior else ["Acceptance: " + key, RULE, profile, int(time.time()) + 2100]
        created = runtime.write("create-" + key, "create_campaign", args, value=BOUNTY)
        runtime.follow(created, key + "/rule")
        campaigns = runtime.read("list_campaigns", [0, 20])["items"]
        matches = [c for c in campaigns if c["title"] == args[0] and c["sponsor"].lower() == runtime.accounts["sponsor"].address.lower()]
        if len(matches) != 1:
            raise RuntimeError("Campaign identification ambiguous")
        cid = matches[0]["id"]
        campaign = runtime.read("get_campaign", [cid])
        if campaign["rule_review"]["admissible"] is not True:
            raise RuntimeError("Fixture policy was not admitted")
        salt = hashlib.sha256(("lacuna-public-acceptance-fixture-v1/" + key).encode()).hexdigest()
        # Public deterministic salt is for published test fixtures only. UI uses random 32-byte salts.
        payload = ["lacuna-v1", "61999", runtime.address.lower(), cid, challenger.lower(), document, A, B, salt]
        digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        runtime.write("commit-" + key, "commit_attempt", [cid, digest], value=STAKE, role="challenger")
        attempts = runtime.read("list_attempts", [cid])
        if len(attempts) != 1:
            raise RuntimeError("Attempt identification ambiguous")
        aid = attempts[0]["id"]
        revealed = runtime.write("reveal-" + key, "reveal_attempt", [aid, document, A, B, salt], role="challenger")
        child = revealed
        for stage in ("target", "referee-one", "referee-two"):
            child = runtime.follow(child, key + "/" + stage)
        result = runtime.read("get_attempt", [aid])
        runtime.record.setdefault("cases", {})[key] = {"campaign_id": cid, "attempt_id": aid, "expected": expected, "observed": result, "checked_at": now()}
        runtime.save()
        if result["status"] != expected:
            raise RuntimeError(f"{key}: expected {expected}, observed {result['status']}; this is not a successful test")
        runtime.payout("withdraw-" + key, result["allocation_recipient"], int(result["allocation_atto"]))
        emit({"case": key, "passed": True, "status": result["status"], "attempt": aid})
    stats = runtime.read("get_stats")
    if not stats["accounting_balanced"] or stats["genuine_findings"] != "0" or stats["control_findings"] != "1":
        raise RuntimeError("Accounting or control-discovery separation failed")
    runtime.record.update(completed_at=now(), status="PASS", final_stats=stats)
    runtime.save()
    emit({"acceptance": "PASS", "contract": runtime.address, "stats": stats})


if __name__ == "__main__":
    main()
