"""Exercise the public StreakPact deployment without loading server secrets.

The fixtures phase publishes two tiny, explicitly synthetic public JSON files.
The protection phase sends invalid bodies, so no extra files are published.
"""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / "deployments/streak_pact_v2_hosted_checks.json"
ORIGIN = "https://streakpact-zeta.vercel.app"


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["fixtures", "protection"])
    options = parser.parse_args()
    record = json.loads(RECORD.read_text(encoding="utf-8")) if RECORD.exists() else {"origin": ORIGIN}
    if record["origin"] != ORIGIN:
        raise RuntimeError("Hosted record has a different production origin")
    session = requests.Session()

    def save():
        record["updated_at"] = now()
        temp = RECORD.with_suffix(".json.tmp")
        temp.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        temp.replace(RECORD)

    health = session.get(ORIGIN + "/api/health", timeout=(10, 45))
    health.raise_for_status()
    health_data = health.json()
    assert all(health_data.get(key) is True for key in [
        "contractConfigured", "evidencePublishingConfigured", "originProtectionConfigured", "readyForStudioNetTesting",
    ]), health_data
    record["health"] = {"checked_at": now(), "status": health.status_code, "body": health_data}
    save()
    print(json.dumps({"health": health_data}), flush=True)
    if options.phase == "fixtures":
        for verdict, completed, duration in [("kept", True, 35), ("missed", False, 5)]:
            fixtures = record.setdefault("fixtures", {})
            content = {
                "activity": "reading", "completed": completed, "duration_minutes": duration,
                "purpose": "Synthetic StudioNet acceptance fixture; no personal data or real-world claim.",
            }
            raw = (json.dumps(content, sort_keys=True, separators=(",", ":")) + "\n").encode()
            expected = hashlib.sha256(raw).hexdigest()
            if verdict not in fixtures:
                result = session.post(
                    ORIGIN + "/api/evidence", headers={"Origin": ORIGIN},
                    files={"file": ("synthetic-reading-log.json", raw, "application/json")}, timeout=(10, 100),
                )
                if result.status_code != 201:
                    raise RuntimeError(f"Hosted upload failed: HTTP {result.status_code}: {result.text[:250]}")
                fixtures[verdict] = {
                    **result.json(), "content": content, "uploaded_at": now(),
                    "upload_status": result.status_code, "download_verified": False,
                }
                save()
            data = fixtures[verdict]
            assert data["digest"] == expected and data["size"] == len(raw), data
            # Recheck existing uploads too, including an interrupted first download.
            # Do not republish immutable public files just to resume verification.
            data["download_verified"] = False
            save()
            fetched = session.get(data["url"], timeout=(10, 100))
            fetched.raise_for_status()
            assert fetched.content == raw and hashlib.sha256(fetched.content).hexdigest() == expected
            fixtures[verdict].update({"download_status": fetched.status_code, "download_verified": True, "verified_at": now()})
            save()
            print(json.dumps({"fixture": verdict, "cid": data["cid"], "digest": expected, "download_verified": True}), flush=True)
    else:
        protections = {}
        for label, headers in [
            ("foreign_origin", {"Origin": "https://example.invalid"}), ("missing_origin", {}),
        ]:
            result = session.post(ORIGIN + "/api/evidence", headers=headers, data=b"", timeout=(10, 30))
            assert result.status_code == 403, f"{label}: HTTP {result.status_code}"
            protections[label] = {"status": result.status_code, "checked_at": now()}
        attempts = []
        for _ in range(7):
            result = session.post(ORIGIN + "/api/evidence", headers={"Origin": ORIGIN}, data=b"", timeout=(10, 30))
            attempts.append({
                "status": result.status_code,
                "vercel_error": result.headers.get("x-vercel-error"),
                "vercel_mitigated": result.headers.get("x-vercel-mitigated"),
                "content_type": result.headers.get("content-type"),
                "body_excerpt": result.text[:220],
            })
        protections["rate_limit"] = {"checked_at": now(), "attempts": attempts}
        record["protection"] = protections
        save()
        assert any(item["status"] == 429 and item["vercel_mitigated"] == "deny" for item in attempts), "No Vercel edge rate-limit rejection observed"
        print(json.dumps({"protection": protections}), flush=True)


if __name__ == "__main__":
    main()
