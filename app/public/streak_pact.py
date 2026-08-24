# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json
import re
import hashlib
from datetime import datetime, timezone

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

MIN_PERIODS = 3
MAX_PERIODS = 90
PERIOD_SECS_MIN = 60
PERIOD_SECS_MAX = 30 * 24 * 60 * 60
JOIN_LEAD_SECS = 60
MIN_STAKE_ATTO = 10 ** 15
MAX_COMMITMENT_CHARS = 400
MAX_NOTE_CHARS = 300
MIN_NOTE_CHARS = 20
MAX_PAGE_CHARS = 6000
MAX_REASON_CHARS = 240
FEE_BPS_CAP = 1000

VERDICT_KEPT = "KEPT"
VERDICT_MISSED = "MISSED"

KEPT_ALIASES = ("KEPT", "DONE", "YES", "TRUE", "SUCCESS", "PASS", "COMPLETED")
MISSED_ALIASES = (
    "MISSED",
    "NO",
    "FALSE",
    "FAIL",
    "FAILED",
    "SKIPPED",
    "SKIP",
)


def _now_unix() -> int:
    return int(datetime.fromisoformat(gl.message_raw["datetime"]).timestamp())


def _to_iso(unix: int) -> str:
    return datetime.fromtimestamp(unix, tz=timezone.utc).isoformat()


def _extract_json(text: str) -> dict:
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        raise gl.vm.UserError(f"{ERROR_LLM} no JSON object found in response")
    cleaned = text[first : last + 1]
    cleaned = re.sub(r",(?!\s*?[\{\[\"\'\w])", "", cleaned)
    try:
        return json.loads(cleaned)
    except (ValueError, TypeError):
        raise gl.vm.UserError(f"{ERROR_LLM} malformed JSON in response")


def _parse_verdict(raw) -> dict:
    if isinstance(raw, str):
        raw = _extract_json(raw)
    if not isinstance(raw, dict):
        raise gl.vm.UserError(f"{ERROR_LLM} verdict is not an object: {type(raw)}")

    verdict_raw = raw.get("verdict")
    if verdict_raw is None:
        for alt in ("result", "status", "outcome", "kept"):
            if alt in raw:
                verdict_raw = raw[alt]
                break
    if verdict_raw is None:
        raise gl.vm.UserError(f"{ERROR_LLM} missing 'verdict'. Keys: {list(raw.keys())}")

    verdict = str(verdict_raw).strip().upper()
    if verdict in KEPT_ALIASES:
        verdict = VERDICT_KEPT
    elif verdict in MISSED_ALIASES:
        verdict = VERDICT_MISSED
    else:
        raise gl.vm.UserError(f"{ERROR_LLM} unrecognized verdict: {verdict}")

    reason_raw = raw.get("reason")
    if reason_raw is None:
        for alt in ("explanation", "rationale", "justification"):
            if alt in raw:
                reason_raw = raw[alt]
                break
    reason = str(reason_raw)[:MAX_REASON_CHARS] if reason_raw is not None else ""

    return {"verdict": verdict, "reason": reason}


def _handle_leader_error(leaders_res, leader_fn) -> bool:
    leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
    try:
        leader_fn()
        return False
    except gl.vm.UserError as e:
        validator_msg = e.message if hasattr(e, "message") else str(e)
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if (
            validator_msg.startswith(ERROR_TRANSIENT)
            and leader_msg.startswith(ERROR_TRANSIENT)
        ):
            return True
        return False
    except Exception:
        return False


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


@allow_storage
@dataclass
class CheckIn:
    period: u256
    verdict: str
    method: str
    note: str
    evidence_url: str
    content_digest: str
    reason: str
    judged_at_iso: str


@allow_storage
@dataclass
class Pact:
    id: str
    maker: Address
    taker: Address
    commitment: str
    periods_total: u256
    allowed_misses: u256
    stake_atto: u256
    start_unix: u256
    end_unix: u256
    created_at_iso: str
    status: str
    kept_count: u256
    miss_count: u256


class StreakPact(gl.Contract):
    treasury: Address
    fee_bps: u256
    period_secs: u256
    next_id: u256
    total_created: u256
    total_settled: u256
    total_kept: u256
    total_missed: u256
    pacts: TreeMap[str, Pact]
    pact_ids: DynArray[str]
    checkins: TreeMap[str, CheckIn]

    def __init__(self, fee_bps: u256 = u256(0), period_secs: u256 = u256(86400)):
        self.treasury = gl.message.sender_address
        self.fee_bps = u256(min(int(fee_bps), FEE_BPS_CAP))
        self.period_secs = u256(
            max(PERIOD_SECS_MIN, min(int(period_secs), PERIOD_SECS_MAX))
        )
        self.next_id = u256(1)
        self.total_created = u256(0)
        self.total_settled = u256(0)
        self.total_kept = u256(0)
        self.total_missed = u256(0)

    @gl.public.write.payable
    def create_pact(
        self,
        commitment: str,
        periods_total: u256,
        allowed_misses: u256,
        start_unix: u256,
    ) -> str:
        stake = gl.message.value
        if stake == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} stake must be greater than zero")
        if stake < u256(MIN_STAKE_ATTO):
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} stake below minimum of {MIN_STAKE_ATTO} atto"
            )
        commitment = commitment.strip()
        if len(commitment) == 0 or len(commitment) > MAX_COMMITMENT_CHARS:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} commitment must be 1..{MAX_COMMITMENT_CHARS} chars"
            )
        n_periods = int(periods_total)
        if n_periods < MIN_PERIODS or n_periods > MAX_PERIODS:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} periods must be between "
                f"{MIN_PERIODS} and {MAX_PERIODS}"
            )
        n_misses = int(allowed_misses)
        if n_misses < 0 or n_misses > n_periods // 3:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} allowed_misses must be at most one third of the periods"
            )
        if int(start_unix) < _now_unix() + JOIN_LEAD_SECS:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} start must be at least {JOIN_LEAD_SECS}s in the future"
            )

        pid = "p-" + str(int(self.next_id))
        self.next_id = u256(int(self.next_id) + 1)

        start = int(start_unix)
        self.pacts[pid] = Pact(
            id=pid,
            maker=gl.message.sender_address,
            taker=gl.message.sender_address,
            commitment=commitment,
            periods_total=u256(n_periods),
            allowed_misses=u256(n_misses),
            stake_atto=stake,
            start_unix=u256(start),
            end_unix=u256(start + n_periods * int(self.period_secs)),
            created_at_iso=_to_iso(_now_unix()),
            status="OPEN",
            kept_count=u256(0),
            miss_count=u256(0),
        )
        self.pact_ids.append(pid)
        self.total_created = u256(int(self.total_created) + 1)
        return pid

    @gl.public.write.payable
    def join_pact(self, pact_id: str) -> None:
        p = self._get_pact(pact_id)
        if p.status != "OPEN":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} pact is not open for joining")
        if _now_unix() >= int(p.start_unix):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} pact has already started")
        if gl.message.sender_address == p.maker:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} maker cannot join own pact")
        if gl.message.value != p.stake_atto:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} must stake exactly {str(int(p.stake_atto))} atto"
            )

        p.taker = gl.message.sender_address
        p.status = "LIVE"
        self.pacts[pact_id] = p

    @gl.public.write
    def cancel_pact(self, pact_id: str) -> None:
        p = self._get_pact(pact_id)
        if gl.message.sender_address != p.maker:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the maker can cancel")
        if p.status != "OPEN":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only open pacts can be cancelled")

        p.status = "VOIDED"
        self.pacts[pact_id] = p
        _Recipient(p.maker).emit_transfer(value=p.stake_atto)

    @gl.public.write
    def check_in(self, pact_id: str, note: str, evidence_url: str) -> None:
        p = self._get_pact(pact_id)
        if p.status != "LIVE":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} pact is not live")
        if gl.message.sender_address != p.maker:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the maker can check in")

        period_idx = int(p.kept_count) + int(p.miss_count)
        if period_idx >= int(p.periods_total):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} all periods already judged")

        win_start = int(p.start_unix) + period_idx * int(self.period_secs)
        win_end = win_start + int(self.period_secs)
        now = _now_unix()
        if now < win_start:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} check-in window for day {period_idx} is not open yet"
            )
        if now >= win_end:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} check-in window closed for day {period_idx}; call record_miss"
            )

        url = evidence_url.strip()
        note = note.strip()[:MAX_NOTE_CHARS]
        if url == "" and len(note) < MIN_NOTE_CHARS:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} evidence required: a note of at least "
                f"{MIN_NOTE_CHARS} chars or an evidence url"
            )

        outcome = self._adjudicate_checkin(
            commitment=p.commitment,
            day_index=period_idx,
            days_total=int(p.periods_total),
            window_iso=_to_iso(win_start),
            note=note,
            evidence_url=url,
        )

        record = CheckIn(
            period=u256(period_idx),
            verdict=outcome["verdict"],
            method=("EVIDENCE" if url != "" else "NOTE"),
            note=note,
            evidence_url=url,
            content_digest=outcome["digest"],
            reason=outcome["reason"],
            judged_at_iso=_to_iso(now),
        )
        self.checkins[pact_id + ":" + str(period_idx)] = record
        if outcome["verdict"] == VERDICT_KEPT:
            p.kept_count = u256(int(p.kept_count) + 1)
            self.total_kept = u256(int(self.total_kept) + 1)
        else:
            p.miss_count = u256(int(p.miss_count) + 1)
            self.total_missed = u256(int(self.total_missed) + 1)
        self.pacts[pact_id] = p

    @gl.public.write
    def record_miss(self, pact_id: str) -> None:
        p = self._get_pact(pact_id)
        if p.status != "LIVE":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} pact is not live")

        period_idx = int(p.kept_count) + int(p.miss_count)
        if period_idx >= int(p.periods_total):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} all periods already judged")

        win_end = int(p.start_unix) + (period_idx + 1) * int(self.period_secs)
        now = _now_unix()
        if now < win_end:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} check-in window for day {period_idx} is still open"
            )

        record = CheckIn(
            period=u256(period_idx),
            verdict=VERDICT_MISSED,
            method="AUTO_MISS",
            note="",
            evidence_url="",
            content_digest="",
            reason="window expired without a check-in",
            judged_at_iso=_to_iso(now),
        )
        self.checkins[pact_id + ":" + str(period_idx)] = record
        p.miss_count = u256(int(p.miss_count) + 1)
        self.total_missed = u256(int(self.total_missed) + 1)
        self.pacts[pact_id] = p

    @gl.public.write
    def force_settle(self, pact_id: str) -> None:
        p = self._get_pact(pact_id)
        if p.status != "LIVE":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} pact is not live")

        judged = int(p.kept_count) + int(p.miss_count)
        settleable = (
            int(p.miss_count) > int(p.allowed_misses)
            or judged >= int(p.periods_total)
            or _now_unix() >= int(p.end_unix)
        )
        if not settleable:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} pact is not yet settleable")

        if int(p.miss_count) <= int(p.allowed_misses):
            p.status = "WON"
        else:
            p.status = "LOST"
        self.pacts[pact_id] = p

    @gl.public.write
    def claim(self, pact_id: str) -> None:
        p = self._get_pact(pact_id)
        if p.status != "WON" and p.status != "LOST":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} nothing to claim")

        winner = p.maker if p.status == "WON" else p.taker
        if gl.message.sender_address != winner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the winner can claim")

        pot = int(p.stake_atto) * 2
        fee = (pot * int(self.fee_bps)) // 10000
        payout = pot - fee

        p.status = "SETTLED"
        self.pacts[pact_id] = p
        self.total_settled = u256(int(self.total_settled) + 1)

        _Recipient(winner).emit_transfer(value=u256(payout))
        if fee > 0:
            _Recipient(self.treasury).emit_transfer(value=u256(fee))

    def _adjudicate_checkin(
        self, commitment: str, day_index: int, days_total: int, window_iso: str, note: str, evidence_url: str
    ) -> dict:
        def leader_fn() -> dict:
            digest_hex = ""
            page = ""
            if evidence_url != "":
                res = gl.nondet.web.get(evidence_url)
                if res.status >= 500:
                    raise gl.vm.UserError(
                        f"{ERROR_TRANSIENT} evidence temporarily unavailable ({res.status})"
                    )
                if res.status >= 400:
                    raise gl.vm.UserError(
                        f"{ERROR_EXTERNAL} evidence rejected the request ({res.status})"
                    )
                body = res.body
                try:
                    digest_hex = hashlib.sha256(body).hexdigest()
                except Exception:
                    digest_hex = ""
                page = body.decode("utf-8", errors="replace")[:MAX_PAGE_CHARS]

            evidence_block = ""
            if page != "":
                evidence_block = (
                    f"\nFETCHED EVIDENCE CONTENT ({evidence_url}):\n{page}\n"
                )
            if note != "":
                evidence_block += f"\nMAKER'S CHECK-IN NOTE:\n{note}\n"

            prompt = f"""You are verifying a daily accountability check-in for a staked streak pact between two parties.

COMMITMENT THE MAKER STAKED ON:
{commitment}

CHECK-IN: day {day_index + 1} of {days_total} (window starting {window_iso})
{evidence_block}
Decide whether this check-in plausibly demonstrates that the maker fulfilled the commitment for this specific day, judging ONLY against the commitment text above. Be reasonably strict: vague claims without substance count as missed unless the commitment is inherently self-evidenced by the note itself.

Return STRICT JSON with exactly these keys:
{{"verdict": "KEPT" | "MISSED", "confidence": <integer 0-100>, "reason": "<= {MAX_REASON_CHARS} chars"}}"""

            analysis = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = _parse_verdict(analysis)
            return {
                "verdict": parsed["verdict"],
                "reason": parsed["reason"],
                "digest": digest_hex,
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            validator_result = leader_fn()
            return (
                leaders_res.calldata["verdict"] == validator_result["verdict"]
            )

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    def _get_pact(self, pact_id: str) -> Pact:
        if pact_id not in self.pacts:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} pact not found: {pact_id}")
        return self.pacts[pact_id]

    @gl.public.view
    def get_pact(self, pact_id: str) -> dict:
        p = self._get_pact(pact_id)
        judged = int(p.kept_count) + int(p.miss_count)
        now = _now_unix()
        next_start = int(p.start_unix) + judged * int(self.period_secs)
        next_end = next_start + int(self.period_secs)
        return {
            "id": p.id,
            "maker": str(p.maker),
            "taker": str(p.taker),
            "commitment": p.commitment,
            "periods_total": str(int(p.periods_total)),
            "allowed_misses": str(int(p.allowed_misses)),
            "stake_atto": str(int(p.stake_atto)),
            "pot_atto": str(int(p.stake_atto) * 2),
            "start_unix": str(int(p.start_unix)),
            "end_unix": str(int(p.end_unix)),
            "created_at_iso": p.created_at_iso,
            "status": p.status,
            "kept_count": str(int(p.kept_count)),
            "miss_count": str(int(p.miss_count)),
            "next_period": str(judged),
            "next_window_open": str(next_start),
            "next_window_close": str(next_end),
            "window_open_now": str(now >= next_start and now < next_end and judged < int(p.periods_total)),
            "settleable": str(
                int(p.miss_count) > int(p.allowed_misses)
                or judged >= int(p.periods_total)
                or now >= int(p.end_unix)
            ),
        }

    @gl.public.view
    def get_checkin(self, pact_id: str, period: u256) -> dict:
        key = pact_id + ":" + str(int(period))
        if key not in self.checkins:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no check-in recorded for that day")
        c = self.checkins[key]
        return {
            "period": str(int(c.period)),
            "verdict": c.verdict,
            "method": c.method,
            "note": c.note,
            "evidence_url": c.evidence_url,
            "content_digest": c.content_digest,
            "reason": c.reason,
            "judged_at_iso": c.judged_at_iso,
        }

    @gl.public.view
    def list_checkins(self, pact_id: str, offset: u256, count: u256) -> dict:
        p = self._get_pact(pact_id)
        total = int(p.kept_count) + int(p.miss_count)
        start = int(offset)
        end = min(start + int(count), total)
        items = []
        i = start
        while i < end:
            c = self.checkins[pact_id + ":" + str(i)]
            items.append(
                {
                    "period": str(int(c.period)),
                    "verdict": c.verdict,
                    "method": c.method,
                    "note": c.note[:120],
                    "evidence_url": c.evidence_url,
                    "content_digest": c.content_digest,
                    "reason": c.reason[:160],
                    "judged_at_iso": c.judged_at_iso,
                }
            )
            i += 1
        return {"total": str(total), "items": items}

    @gl.public.view
    def list_pacts(self, offset: u256, count: u256) -> dict:
        total = len(self.pact_ids)
        start = int(offset)
        end = min(start + int(count), total)
        items = []
        i = start
        while i < end:
            pid = self.pact_ids[i]
            p = self.pacts[pid]
            items.append(
                {
                    "id": p.id,
                    "status": p.status,
                    "commitment": p.commitment[:120],
                    "periods_total": str(int(p.periods_total)),
                    "kept_count": str(int(p.kept_count)),
                    "miss_count": str(int(p.miss_count)),
                    "stake_atto": str(int(p.stake_atto)),
                }
            )
            i += 1
        return {"total": str(total), "items": items}

    @gl.public.view
    def get_stats(self) -> dict:
        return {
            "total_created": str(int(self.total_created)),
            "total_settled": str(int(self.total_settled)),
            "total_kept": str(int(self.total_kept)),
            "total_missed": str(int(self.total_missed)),
            "fee_bps": str(int(self.fee_bps)),
            "period_secs": str(int(self.period_secs)),
            "treasury": str(self.treasury),
        }
