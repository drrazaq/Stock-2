"""Finite stored-model accounting; no data requests, missing-value imputation or new arm."""
import hashlib
import json
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
source = HERE.parents[1] / 'data/squad11-lab.json'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '77e49a4b263a694112f5e26b40b4419fe6f82cd462a5865b0726067261defd1a'
producer = HERE.parents[1] / 'squad11-lab.mjs'
control = HERE.parents[1] / 'anomaly-core.mjs'
assert hashlib.sha256(producer.read_bytes()).hexdigest() == '6851886bfb72e9bb680f4c69a4f20b38f1e2f6b9fb3cd51d394213b7cb8b3b52'
assert hashlib.sha256(control.read_bytes()).hexdigest() == 'c761ea1296ca625e742d6a17b6006171548498ae02ffadd7dd467dc919932b02'
rows = json.loads(source.read_text(), parse_float=Decimal)['trades']['SQ11-PB12']
paired = [r for r in rows if isinstance(r.get('sameStock'), (Decimal, int))]
missing = [r for r in rows if r not in paired]
assert (len(rows), len(paired), len(missing)) == (357, 324, 33)
known_difference = sum(r['net']-r['sameStock'] for r in paired)
required_missing_advantage = -known_difference / len(missing)
missing_net_mean = sum(r['net'] for r in missing) / len(missing)
control_threshold = missing_net_mean-required_missing_advantage
# Source r4 fields retain four decimal places. These are rounding envelopes,
# not statistical uncertainty or authentic price bounds.
threshold_error = Decimal('0.0001')*len(paired)/len(missing)
result = dict(kind='SAVED_PB12_MISSING_CONTROL_SENSITIVITY',
    sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    producerSha256=hashlib.sha256(producer.read_bytes()).hexdigest(),
    ownAverageSha256=hashlib.sha256(control.read_bytes()).hexdigest(),
    nullControlSemantics='Retained producer calls ownAverage on same-half/liquid/same-hold other-date windows, skipping busy overlaps; helper returnsnull with fewer than3eligible returns. Per-row historic cause is not retained/authenticated.',
    fullSavedRows=len(rows), pairedRows=len(paired), missingControlRows=len(missing),
    knownPairedDifferenceSum=str(known_difference),
    meanMissingAdvantageNeededForFullZero=str(required_missing_advantage),
    neededAdvantageRoundingEnvelope=[str(required_missing_advantage-threshold_error), str(required_missing_advantage+threshold_error)],
    meanStoredNetOnMissingRows=str(missing_net_mean),
    missingControlMeanThresholdForFullZero=str(control_threshold),
    interpretation='To erase the known paired deficit across all357rows, missing33net-minus-sameStock differences must average about+71.72percentage points; equivalently their missing controls must average about−45.33%at the saved net values. Not evidence that they do.',
    limits=['Original rounded percentage-model friction basis only; no exact executable $1,000 whole-share/$3-side P&L.',
            'No missing controls imputed, outcomes excluded, exits changed or new strategy/filter tested.',
            'Current saved rows differ from frozen firstRun; original NOT PROVEN verdict unchanged.',
            'Full357-row same-stock superiority is not established; original prices/actions/terminal and control paths remain missing.'])
(HERE/'missing-control-sensitivity.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
