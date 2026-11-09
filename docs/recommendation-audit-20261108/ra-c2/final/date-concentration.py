"""Descriptive accounting on the existing four views; no new scoring arm or filter."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
source = HERE / 'analysis.json'
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'e846ad00b7522cc8508f7df692336b93610d435b9445bcefb40d598ec1135f9e'
j = json.loads(source.read_text())
rows = [r for r in j['caseRows'] if r['group'] == 'RETAINED68']
assert len(rows) == 68
result = dict(kind='DESCRIPTIVE_FIXED_DENOMINATOR_DATE_CONCENTRATION',
    sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), fixedDenominator=68,
    selection='Post hoc largest date midpoint contribution in each EXISTING view; not a prespecified test, selected-date strategy, new scoring arm or untouched confirmation.',
    units='Return fractions contributing to the same68-attempt mean; not a financed portfolio or compounded equity curve.', views={})
for view in j['summary']:
    by = {}
    for row in rows:
        day = row['candidateKey'][:10]
        by.setdefault(day, []).append(row['views'][view]['fixedBudgetWholeShareNetInterval'])
    totals = {day: [sum(x[i] for x in values)/68 for i in (0, 1)] for day, values in by.items()}
    top = max(totals, key=lambda day: sum(totals[day]))
    other = [sum(values[i] for day, values in totals.items() if day != top) for i in (0, 1)]
    full = j['summary'][view]['retained68HypotheticalWholeShareFixedFee']
    assert max(abs(totals[top][i]+other[i]-full[key]) for i, key in enumerate(('lower','upper'))) < 1e-12
    result['views'][view] = dict(dates=len(by), largestContributionDate=top,
        casesOnThatDate=len(by[top]), dateContribution=totals[top],
        otherDates=len(by)-1, otherCases=68-len(by[top]), otherContribution=other,
        originalMean=[full['lower'],full['upper']], sumReconciled=True)
result['limits'] = ['Original four cost views,3%entry limit,$1,000whole-share assumption and$3executed-side fees unchanged.',
    'No case removed from scoring; complementary contribution is accounting within the same mean, not a new exclusion test.',
    'No p-value, new hypothesis, exit change, authentic fill, independent-day assumption or future predictive claim.',
    'All102authentic outcome chains remain incomplete; selected original evidence is not an untouched sample.']
(HERE / 'date-concentration.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
