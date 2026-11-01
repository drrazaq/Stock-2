# HISTORY-03 claim extractor, BROADER word list (recall check for batch 2; reviewer: Claude). Same tokenizer; adds test, tests, proof,
# approved, losing, promising, record, better, worse, a year, per year. Read-only. Finds user-facing string literals in the given JavaScript files that
# contain performance-claim words or numeric performance phrases, and prints one JSON record per hit with file, line and exact text.
# String literals are extracted with a small tokenizer (', ", ` with ${...} kept verbatim); comments are skipped.
# Each record also names the enclosing top-level function (nearest preceding `function NAME` / `const NAME = (...) =>`).
# Usage: python3 -I extract-claims.py <repo root> <file>... > hits.json
import json, re, sys, pathlib
root = pathlib.Path(sys.argv[1]); files = sys.argv[2:]
WORDS = re.compile(r"\b(test|tests|proof|approved|losing|promising|record|better|worse|a year|per year|tested|untested|proven|unproven|unseen|out[- ]of[- ]sample|positive|profitable|profit|beat|beats|beating|won|win rate|wins?|winning|edge|backtest(ed)?|historically|history says|survived?|passed|passes|works|worked|reliable|guarantee[ds]?|expected return|avg|average)\b", re.I)
NUMPERF = re.compile(r"(\d+(\.\d+)?\s*%\s*(of (the )?(trades|picks|calls)|win|won|a year|per year|/yr|after cost|net|avg|average|return|gain|beat|vs|better))|((win|won|return|gain|avg|average|beat|edge|after cost)[^.%]{0,40}\d+(\.\d+)?\s*%)|\bt\s*[=≥>]\s*\d|\bn\s*=\s*\d", re.I)
def literals(src):
    i, n, line = 0, len(src), 1
    while i < n:
        c = src[i]
        if c == '\n': line += 1; i += 1; continue
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); j = n if j < 0 else j + 2; line += src.count('\n', i, j); i = j; continue
        if c in '\'"`':
            q, j, start, depth = c, i + 1, line, 0
            while j < n:
                d = src[j]
                if d == '\\': j += 2; continue
                if q == '`' and src.startswith('${', j): depth += 1; j += 2; continue
                if q == '`' and depth and d == '}': depth -= 1; j += 1; continue
                if d == q and not depth: break
                j += 1
            text = src[i + 1:j]; line += src.count('\n', i, j); yield start, text; i = j + 1; continue
        i += 1
FN = re.compile(r"\s{0,2}(?:export\s+)?(?:async\s+)?function\s+(\w+)|\s{0,2}(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>")
def enclosing(lines, ln):
    best = None
    for i, l in enumerate(lines[:ln], 1):
        m = FN.match(l)
        if m: best = m.group(1) or m.group(2)
    return best
out = []
for f in files:
    p = root / f
    if not p.exists(): continue
    src = p.read_text(errors='replace'); lines = src.split('\n')
    for ln, text in literals(src):
        if len(text) < 12 or not re.search(r'[a-z]{3}', text): continue
        if re.fullmatch(r"[\w./:@-]+", text): continue
        w, m = WORDS.findall(text), NUMPERF.search(text)
        if w or m:
            out.append({'file': f, 'line': ln, 'text': text[:600], 'words': sorted({x[0].lower() for x in w}), 'numeric': bool(m), 'fn': enclosing(lines, ln)})
json.dump(out, sys.stdout, indent=0, ensure_ascii=False)
