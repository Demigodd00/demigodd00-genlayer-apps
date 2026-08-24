# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json
import re
from datetime import datetime, timezone

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

APPEAL_WINDOW_SECS = 3 * 24 * 60 * 60
MIN_LEAD_TIME_SECS = 60
MAX_PAGE_CHARS = 6000
MAX_REASON_CHARS = 300
MAX_QUESTION_CHARS = 500
MAX_SIDE_CHARS = 80
MAX_STATEMENT_CHARS = 800
FEE_BPS_CAP = 1000


def _now_unix() -> int:
    return int(datetime.fromisoformat(gl.message_raw["datetime"]).timestamp())


def _to_iso(unix: int) -> str:
    return datetime.fromtimestamp(unix, tz=timezone.utc).isoformat()


def _quantize_confidence(conf: int) -> int:
    clamped = max(0, min(100, conf))
    return (clamped // 10) * 10


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


def _coerce_int(raw) -> int:
    try:
        return int(round(float(str(raw).strip())))
    except (ValueError, TypeError):
        raise gl.vm.UserError(f"{ERROR_LLM} non-numeric value: {raw}")


def _parse_verdict(raw) -> dict:
    if isinstance(raw, str):
        raw = _extract_json(raw)
    if not isinstance(raw, dict):
        raise gl.vm.UserError(f"{ERROR_LLM} verdict is not an object: {type(raw)}")

    outcome_raw = raw.get("outcome")
    if outcome_raw is None:
        for alt in ("result", "winner", "decision", "verdict"):
            if alt in raw:
                outcome_raw = raw[alt]
                break
    if outcome_raw is None:
        raise gl.vm.UserError(f"{ERROR_LLM} missing 'outcome'. Keys: {list(raw.keys())}")

    outcome = str(outcome_raw).strip().upper()
    if outcome in ("A", "SIDE_A", "CREATOR", "MAKER", "FIRST"):
        outcome = "CREATOR"
    elif outcome in ("B", "SIDE_B", "TAKER", "CHALLENGER", "SECOND"):
        outcome = "TAKER"
    elif outcome in (
        "VOID",
        "UNDETERMINED",
        "INDETERMINATE",
        "REFUND",
        "CANCELLED",
        "CANCELED",
        "NONE",
        "UNKNOWN",
    ):
        outcome = "VOID"
    else:
        raise gl.vm.UserError(f"{ERROR_LLM} unrecognized outcome: {outcome}")

    conf_raw = raw.get("confidence")
    if conf_raw is None:
        for alt in ("certainty", "score", "confidence_pct"):
            if alt in raw:
                conf_raw = raw[alt]
                break
    if conf_raw is None:
        raise gl.vm.UserError(f"{ERROR_LLM} missing 'confidence'")
    confidence = _coerce_int(conf_raw)

    reason_raw = raw.get("reason")
    if reason_raw is None:
        for alt in ("explanation", "rationale", "justification"):
            if alt in raw:
                reason_raw = raw[alt]
                break
    reason = str(reason_raw)[:MAX_REASON_CHARS] if reason_raw is not None else ""

    return {"outcome": outcome, "confidence": confidence, "reason": reason}


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
class Wager:
    id: str
    question: str
    source_url: str
    creator: Address
    creator_side: str
    taker: Address
    taker_side: str
    stake_atto: u256
    deadline_unix: u256
    created_at_iso: str
    status: str
    winner: Address
    outcome_label: str
    confidence_bucket: u256
    verdict_reason: str
    resolved_at_unix: u256
    resolved_at_iso: str
    appealed: bool
    appealer: Address
    appeal_statement: str
    pot_bonus_atto: u256


class MicroWagers(gl.Contract):
    treasury: Address
    fee_bps: u256
    next_id: u256
    total_created: u256
    total_settled: u256
    wagers: TreeMap[str, Wager]
    wager_ids: DynArray[str]

    def __init__(self, fee_bps: u256 = u256(0)):
        self.treasury = gl.message.sender_address
        self.fee_bps = u256(min(int(fee_bps), FEE_BPS_CAP))
        self.next_id = u256(1)
        self.total_created = u256(0)
        self.total_settled = u256(0)

    @gl.public.write.payable
    def create_wager(
        self,
        question: str,
        creator_side: str,
        taker_side: str,
        source_url: str,
        deadline_unix: u256,
    ) -> str:
        stake = gl.message.value
        if stake == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} stake must be greater than zero")
        if len(question.strip()) == 0 or len(question) > MAX_QUESTION_CHARS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} question must be 1..{MAX_QUESTION_CHARS} chars")
        if len(creator_side.strip()) == 0 or len(creator_side) > MAX_SIDE_CHARS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} creator_side must be 1..{MAX_SIDE_CHARS} chars")
        if len(taker_side.strip()) == 0 or len(taker_side) > MAX_SIDE_CHARS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} taker_side must be 1..{MAX_SIDE_CHARS} chars")
        if creator_side.strip().lower() == taker_side.strip().lower():
            raise gl.vm.UserError(f"{ERROR_EXPECTED} sides must be different positions")
        if deadline_unix <= u256(_now_unix() + MIN_LEAD_TIME_SECS):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} deadline must be at least {MIN_LEAD_TIME_SECS}s in the future")

        wid = "w-" + str(int(self.next_id))
        self.next_id = u256(int(self.next_id) + 1)

        self.wagers[wid] = Wager(
            id=wid,
            question=question.strip(),
            source_url=source_url.strip(),
            creator=gl.message.sender_address,
            creator_side=creator_side.strip(),
            taker=gl.message.sender_address,
            taker_side=taker_side.strip(),
            stake_atto=stake,
            deadline_unix=deadline_unix,
            created_at_iso=_to_iso(_now_unix()),
            status="OPEN",
            winner=gl.message.sender_address,
            outcome_label="",
            confidence_bucket=u256(0),
            verdict_reason="",
            resolved_at_unix=u256(0),
            resolved_at_iso="",
            appealed=False,
            appealer=gl.message.sender_address,
            appeal_statement="",
            pot_bonus_atto=u256(0),
        )
        self.wager_ids.append(wid)
        self.total_created = u256(int(self.total_created) + 1)
        return wid

    @gl.public.write.payable
    def accept_wager(self, wager_id: str) -> None:
        w = self._get_wager(wager_id)
        if w.status != "OPEN":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} wager is not open for acceptance")
        if gl.message.sender_address == w.creator:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} creator cannot accept own wager")
        if gl.message.value != w.stake_atto:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} must stake exactly {str(int(w.stake_atto))} atto")

        w.taker = gl.message.sender_address
        w.status = "LIVE"
        self.wagers[wager_id] = w

    @gl.public.write
    def cancel_wager(self, wager_id: str) -> None:
        w = self._get_wager(wager_id)
        if gl.message.sender_address != w.creator:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the creator can cancel")
        if w.status != "OPEN":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only open wagers can be cancelled")

        w.status = "VOIDED"
        self.wagers[wager_id] = w
        _Recipient(w.creator).emit_transfer(value=w.stake_atto)

    def _adjudicate(self, question: str, source_url: str, side_a: str, side_b: str, deadline_iso: str, challenger_statement: str, prior_reason: str) -> dict:
        def leader_fn() -> dict:
            page = ""
            if source_url != "":
                res = gl.nondet.web.get(source_url)
                if res.status >= 500:
                    raise gl.vm.UserError(f"{ERROR_TRANSIENT} source temporarily unavailable ({res.status})")
                if res.status >= 400:
                    raise gl.vm.UserError(f"{ERROR_EXTERNAL} source rejected the request ({res.status})")
                page = res.body.decode("utf-8", errors="replace")[:MAX_PAGE_CHARS]

            evidence_block = ""
            if page != "":
                evidence_block = f"\nEVIDENCE FROM SOURCE ({source_url}):\n{page}\n"
            if prior_reason != "":
                evidence_block += f"\nPRIOR VERDICT REASONING: {prior_reason}\n"
            if challenger_statement != "":
                evidence_block += f"\nCHALLENGER STATEMENT: {challenger_statement}\n"

            prompt = f"""You are an impartial adjudicator resolving a peer-to-peer wager.

WAGER QUESTION / RESOLUTION CRITERIA:
{question}

SIDE A (creator) claims: {side_a}
SIDE B (taker) claims: {side_b}
The wager became decidable at: {deadline_iso}
{evidence_block}
Decide which side reality supports based ONLY on the evidence above (and well-established public facts if no source was given). If the matter is genuinely not yet determined or cannot be judged fairly, choose VOID.

Return STRICT JSON with exactly these keys:
{{"outcome": "A" | "B" | "VOID", "confidence": <integer 0-100>, "reason": "<= {MAX_REASON_CHARS} chars"}}"""
            analysis = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = _parse_verdict(analysis)
            return {
                "outcome": parsed["outcome"],
                "bucket": _quantize_confidence(parsed["confidence"]),
                "reason": parsed["reason"],
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            validator_result = leader_fn()
            if leaders_res.calldata["outcome"] != validator_result["outcome"]:
                return False
            if abs(int(leaders_res.calldata["bucket"]) - int(validator_result["bucket"])) > 10:
                return False
            return True

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    @gl.public.write
    def resolve_wager(self, wager_id: str) -> None:
        w = self._get_wager(wager_id)
        if w.status != "LIVE":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} wager is not live")
        if _now_unix() < int(w.deadline_unix):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} wager is not yet decidable")

        verdict = self._adjudicate(
            question=w.question,
            source_url=w.source_url,
            side_a=w.creator_side,
            side_b=w.taker_side,
            deadline_iso=_to_iso(int(w.deadline_unix)),
            challenger_statement="",
            prior_reason="",
        )

        self._apply_verdict(w, wager_id, verdict)

    def _apply_verdict(self, w: Wager, wager_id: str, verdict: dict) -> None:
        now_iso = _to_iso(_now_unix())
        w.resolved_at_unix = u256(_now_unix())
        w.resolved_at_iso = now_iso
        w.confidence_bucket = u256(verdict["bucket"])
        w.verdict_reason = verdict["reason"]

        if verdict["outcome"] == "CREATOR":
            w.winner = w.creator
            w.outcome_label = w.creator_side
            w.status = "RESOLVED"
        elif verdict["outcome"] == "TAKER":
            w.winner = w.taker
            w.outcome_label = w.taker_side
            w.status = "RESOLVED"
        else:
            w.status = "VOIDED"
            w.outcome_label = ""
            _Recipient(w.creator).emit_transfer(value=w.stake_atto)
            _Recipient(w.taker).emit_transfer(value=w.stake_atto)

        self.wagers[wager_id] = w

    @gl.public.write.payable
    def appeal_wager(self, wager_id: str, statement: str) -> None:
        w = self._get_wager(wager_id)
        if w.status != "RESOLVED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only resolved wagers can be appealed")
        if w.appealed:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} appeal right already used")
        if _now_unix() > int(w.resolved_at_unix) + APPEAL_WINDOW_SECS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} appeal window closed")
        if gl.message.sender_address == w.winner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} the winner cannot appeal")
        if gl.message.value != w.stake_atto:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} appeal bond must equal the stake ({str(int(w.stake_atto))} atto)")
        if len(statement.strip()) == 0 or len(statement) > MAX_STATEMENT_CHARS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} statement must be 1..{MAX_STATEMENT_CHARS} chars")

        w.appealed = True
        w.appealer = gl.message.sender_address
        w.appeal_statement = statement.strip()

        verdict = self._adjudicate(
            question=w.question,
            source_url=w.source_url,
            side_a=w.creator_side,
            side_b=w.taker_side,
            deadline_iso=_to_iso(int(w.deadline_unix)),
            challenger_statement=w.appeal_statement,
            prior_reason=w.verdict_reason,
        )

        upheld = (
            (verdict["outcome"] == "CREATOR" and w.winner == w.creator)
            or (verdict["outcome"] == "TAKER" and w.winner == w.taker)
        )
        if upheld:
            w.pot_bonus_atto = u256(int(w.pot_bonus_atto) + int(w.stake_atto))
            w.verdict_reason = "[APPEAL UPHELD] " + verdict["reason"]
        else:
            _Recipient(gl.message.sender_address).emit_transfer(value=gl.message.value)
            if verdict["outcome"] == "VOID":
                w.status = "VOIDED"
                w.outcome_label = ""
                _Recipient(w.creator).emit_transfer(value=w.stake_atto)
                _Recipient(w.taker).emit_transfer(value=w.stake_atto)
            else:
                self._apply_verdict(w, wager_id, verdict)
                w.verdict_reason = "[OVERTURNED ON APPEAL] " + verdict["reason"]

        self.wagers[wager_id] = w

    @gl.public.write
    def claim(self, wager_id: str) -> None:
        w = self._get_wager(wager_id)
        if w.status != "RESOLVED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} nothing to claim")

        pot = int(w.stake_atto) * 2 + int(w.pot_bonus_atto)
        fee = (pot * int(self.fee_bps)) // 10000
        payout = pot - fee

        if gl.message.sender_address != w.winner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the winner can claim")

        w.status = "SETTLED"
        self.wagers[wager_id] = w
        self.total_settled = u256(int(self.total_settled) + 1)

        _Recipient(w.winner).emit_transfer(value=u256(payout))
        if fee > 0:
            _Recipient(self.treasury).emit_transfer(value=u256(fee))

    def _get_wager(self, wager_id: str) -> Wager:
        if wager_id not in self.wagers:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} wager not found: {wager_id}")
        return self.wagers[wager_id]

    @gl.public.view
    def get_wager(self, wager_id: str) -> dict:
        w = self._get_wager(wager_id)
        return {
            "id": w.id,
            "question": w.question,
            "source_url": w.source_url,
            "creator": str(w.creator),
            "creator_side": w.creator_side,
            "taker": str(w.taker),
            "taker_side": w.taker_side,
            "stake_atto": str(int(w.stake_atto)),
            "deadline_unix": str(int(w.deadline_unix)),
            "created_at_iso": w.created_at_iso,
            "status": w.status,
            "winner": str(w.winner),
            "outcome_label": w.outcome_label,
            "confidence_bucket": str(int(w.confidence_bucket)),
            "verdict_reason": w.verdict_reason,
            "resolved_at_iso": w.resolved_at_iso,
            "appealed": w.appealed,
            "appeal_statement": w.appeal_statement,
            "pot_bonus_atto": str(int(w.pot_bonus_atto)),
            "pot_atto": str(int(w.stake_atto) * 2 + int(w.pot_bonus_atto)),
        }

    @gl.public.view
    def list_wagers(self, offset: u256, count: u256) -> dict:
        total = len(self.wager_ids)
        start = int(offset)
        end = min(start + int(count), total)
        items = []
        i = start
        while i < end:
            wid = self.wager_ids[i]
            w = self.wagers[wid]
            items.append(
                {
                    "id": w.id,
                    "status": w.status,
                    "question": w.question[:120],
                    "creator_side": w.creator_side,
                    "taker_side": w.taker_side,
                    "stake_atto": str(int(w.stake_atto)),
                    "outcome_label": w.outcome_label,
                    "appealed": w.appealed,
                }
            )
            i += 1
        return {"total": str(total), "items": items}

    @gl.public.view
    def get_stats(self) -> dict:
        return {
            "total_created": str(int(self.total_created)),
            "total_settled": str(int(self.total_settled)),
            "fee_bps": str(int(self.fee_bps)),
            "treasury": str(self.treasury),
        }
