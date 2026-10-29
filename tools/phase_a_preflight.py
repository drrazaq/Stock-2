"""Pure preflight rules for the proposed one-day wrapper, not an activation tool."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

SOURCE = "7dd702d5d2ed3578f7558bc4f7fcc211f3619669"
SESSION_DAY = "2026-10-30"
RUN_TITLE = "Phase A 2026-10-30 / 7dd702d"


def check_session(manifest, history, now, run_id, attempt):
    if str(attempt) != "1":
        raise ValueError("RERUN_NOT_AUTHORIZED")
    if not isinstance(manifest, dict) or manifest.get("mode") != "RESEARCH_ONLY" or manifest.get("sourceSha") != SOURCE or manifest.get("sessionDay") != SESSION_DAY:
        raise ValueError("SESSION_SCOPE_MISMATCH")
    for field, expected in [("maxCycles", 330), ("maxRequests", 420), ("maxCompressedBytes", 67108864)]:
        if type(manifest.get(field)) is not int or manifest[field] != expected:
            raise ValueError("SESSION_BUDGET_MISMATCH")
    approved = datetime.fromisoformat(manifest["approvedAt"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(manifest["expiresAt"].replace("Z", "+00:00"))
    if approved.tzinfo is None or expires.tzinfo is None or now.tzinfo is None:
        raise ValueError("TIMEZONE_REQUIRED")
    expected_expiry = datetime(2026, 10, 30, 13, 35, tzinfo=timezone.utc)
    if not approved <= now < expires or (expires - approved).total_seconds() > 86400 or expires != expected_expiry:
        raise ValueError("APPROVAL_WINDOW_INVALID")
    local = now.astimezone(ZoneInfo("America/New_York"))
    if local.date().isoformat() != SESSION_DAY or not 235 <= local.hour * 60 + local.minute <= 240:
        raise ValueError("OUTSIDE_APPROVED_START_WINDOW")
    if not isinstance(history, dict) or type(history.get("total_count")) is not int or not 1 <= history["total_count"] <= 100 or not isinstance(history.get("workflow_runs"), list) or len(history["workflow_runs"]) != history["total_count"]:
        raise ValueError("RUN_HISTORY_NOT_EXHAUSTIVE")
    matches = [r for r in history["workflow_runs"] if isinstance(r, dict) and r.get("display_title") == RUN_TITLE]
    if not matches or any(type(r.get("id")) is not int or r["id"] <= 0 for r in matches):
        raise ValueError("RUN_IDENTITY_UNVERIFIED")
    first = min(matches, key=lambda r: r["id"])
    if first["id"] != int(run_id) or first.get("run_attempt") != 1:
        raise ValueError("SESSION_ALREADY_ATTEMPTED")
    return {"sessionDay": SESSION_DAY, "sourceSha": SOURCE, "runId": int(run_id), "attempt": 1, "status": "WRAPPER_SCOPE_VERIFIED"}


def evaluate_collection(summary, cycles):
    """Fails the validation job on incomplete coverage; never approves a strategy."""
    problems = []
    if summary.get("sourceSha") != SOURCE or summary.get("executionWindowComplete") is not True or summary.get("uniqueMinutes") != 330 or summary.get("cycles") != 330 or len(cycles) != 330:
        problems.append("INCOMPLETE_EXECUTION_WINDOW")
    if type(summary.get("requests")) is not int or not 0 <= summary["requests"] <= 420 or type(summary.get("bytes")) is not int or not 0 <= summary["bytes"] <= 67108864:
        problems.append("BUDGET_EVIDENCE_INVALID")
    minutes, latencies, observed, usable = set(), [], 0, 0
    for row in cycles:
        if row.get("kind") != "RESEARCH_ONLY" or row.get("claims", {}).get("orders") is not False or row.get("claims", {}).get("approvedBuy") is not False:
            problems.append("UNEXPECTED_COLLECTION_SCOPE")
        session = row.get("session", {})
        if session.get("day") != SESSION_DAY or type(session.get("minute")) is not int or not 240 <= session["minute"] < 570:
            problems.append("UNEXPECTED_OBSERVATION_MINUTE")
        else:
            minutes.add(session["minute"])
        metrics = row.get("metrics", {})
        if type(metrics.get("uniqueSymbols")) is int and metrics["uniqueSymbols"] >= 10000 and type(metrics.get("freshPrices")) is int and metrics["freshPrices"] > 0:
            usable += 1
        for provider in row.get("providers", []):
            if provider.get("provider") == "MASSIVE_FULL_SNAPSHOT":
                if provider.get("status") == "RESPONSE_OBSERVED":
                    observed += 1
                latency = provider.get("requestLatencyMs")
                if type(latency) in (int, float) and latency >= 0:
                    latencies.append(latency)
    if minutes != set(range(240, 570)):
        problems.append("MISSING_OR_DUPLICATE_CLOCK_MINUTES")
    if usable < 314:
        problems.append("BROAD_SNAPSHOT_WITH_SOME_FRESH_DATA_BELOW_95_PERCENT")
    if observed < 314:
        problems.append("SNAPSHOT_VALID_RESPONSE_RATE_BELOW_95_PERCENT")
    if len(latencies) != 330 or sorted(latencies)[min(len(latencies)-1, int(len(latencies)*.95))] >= 10000:
        problems.append("REQUEST_LATENCY_NOT_ESTABLISHED_BELOW_10_SECONDS")
    return {"status": "COLLECTION_CHECKS_PASSED_ONLY" if not problems else "VALIDATION_FAILED", "problems": sorted(set(problems)), "tradableUniverseCoverage": "UNVERIFIED", "profitability": "NOT_TESTED", "approvedBuy": False}
