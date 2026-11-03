#!/bin/bash
W=$W
for t in main patched; do
  cd $W/$t; : > $W/$t.res
  for f in test/*.test.mjs; do
    if env -i PATH=$PATH HOME=$HOME /opt/node20/bin/node "$f" > $W/logs-$t-$(basename $f).log 2>&1; then echo "PASS $f" >> $W/$t.res; else echo "FAIL $f" >> $W/$t.res; fi
  done
done
echo DONE > $W/done
