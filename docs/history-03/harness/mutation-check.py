# HISTORY-03 harness self-check (reviewer: Claude). Copies the tree (without .git and data/) to a throwaway directory, applies three
# SIMULATED repairs (the proposed wording for W04, W03, A01) to that copy only, and prints the path of the copy. Then run:
#   HISTORY03_TREE=<copy> node --test docs/history-03/harness/*.test.mjs
# Expected: [FINDING W04], [FINDING W03], [FINDING A01] fail; [PROPOSED W04/W03/A01] pass (reported as TODO ok); everything else unchanged.
# Nothing in the real tree is modified. Usage: python3 -I -B mutation-check.py <repo root> [<empty work dir>]
import sys, shutil, tempfile, pathlib
src = pathlib.Path(sys.argv[1]).resolve(); dst = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path(tempfile.mkdtemp(prefix='h03-mut-'))
shutil.copytree(src, dst / 'tree', ignore=shutil.ignore_patterns('.git', 'data'))
p = dst / 'tree' / 'scan.mjs'; s = p.read_text()
for a, b in [("(the Alpaca PAPER account: real fills on every proven buy, fake money)", "(the Alpaca practice account: fake money, tests engines that are NOT proven)"),
             ("(no budget limit: every proven buy is listed, you decide; size still follows the evidence)", "(no budget limit on the buys ACTIONS lists; you decide)"),
             ("'YARDSTICK: on 5 years, the S&P 500 beat every long-term stock-picking method tested. Long-term money: a halal index fund (check ZAD).'", "'YARDSTICK: no long-term stock-picking method has passed the full test yet. Long-term money: a halal index fund (check ZAD).'"),
             ("'; insider buying works in rising markets ('", "'; Insider buying (rising markets): NOT PROVEN ('")]:
    assert s.count(a) == 1, 'anchor not found once: ' + a[:60]; s = s.replace(a, b)
p.write_text(s); print(dst / 'tree')
