#!/usr/bin/env bash
# [verify] Runs the slow browser checks one after another (they share one GPU) and writes each raw
# log to $OUT (default docs/verification/raw). DEV = a dev server of the tree under test, PREVIEW =
# a production preview whose files do not change (perf-gate, browsers). Scratch screenshots go to
# $SCRATCH, never into the repo.
#   DEV=http://localhost:5860/ PREVIEW=http://localhost:5861/ OUT=docs/verification/raw-after \
#     bash scripts/verify/run-checks.sh [check ...]
# checks: pt pt-p2 pt-camp pt-camp-p2 pt-net pt-camp-net walk pacing breakables course perfgate browsers
set -u
DEV=${DEV:-http://localhost:5860/}
PREVIEW=${PREVIEW:-http://localhost:5861/}
OUT=${OUT:-docs/verification/raw}
SCRATCH=${SCRATCH:-${TMPDIR:-/tmp}/gotham-verify}
mkdir -p "$OUT" "$SCRATCH"
checks=${*:-pt pt-p2 pt-camp pt-camp-p2 pt-net pt-camp-net walk pacing breakables course perfgate browsers}
run() { # name, command...
  local name=$1; shift
  local t0=$(date +%s)
  echo "== $name: $*" > "$OUT/$name.txt"
  ( "$@" ) >> "$OUT/$name.txt" 2>&1
  local rc=$?
  echo "== exit $rc after $(( $(date +%s) - t0 )) s" >> "$OUT/$name.txt"
  echo "$name exit=$rc $(( $(date +%s) - t0 ))s" >> "$OUT/summary.txt"
}
for c in $checks; do case $c in
  pt)          run pt          env BASE=$DEV OUT=$SCRATCH/pt node scripts/playthrough.mjs ;;
  pt-p2)       run pt-p2       env BASE=$DEV OUT=$SCRATCH/pt-p2 P2=bot node scripts/playthrough.mjs ;;
  pt-camp)     run pt-camp     env BASE=$DEV OUT=$SCRATCH/pt-camp CAMPAIGN=1 QUALITY=potato node scripts/playthrough.mjs ;;
  pt-camp-p2)  run pt-camp-p2  env BASE=$DEV OUT=$SCRATCH/pt-camp-p2 CAMPAIGN=1 P2=bot QUALITY=potato node scripts/playthrough.mjs ;;
  pt-net)      run pt-net      env BASE=$DEV OUT=$SCRATCH/pt-net NET=broadcast QUALITY=potato node scripts/playthrough.mjs ;;
  pt-camp-net) run pt-camp-net env BASE=$DEV OUT=$SCRATCH/pt-camp-net CAMPAIGN=1 NET=broadcast QUALITY=potato node scripts/playthrough.mjs ;;
  walk)        run walk        node scripts/story-walk.mjs $DEV $SCRATCH/walk ;;
  pacing)      run pacing      node scripts/pacing.mjs --stops ;;
  breakables)  run breakables  node scripts/breakables-check.mjs $DEV ;;
  course)      run course      node scripts/course-check.mjs $DEV ;;
  perfgate)    run perfgate    env BASE=$PREVIEW node scripts/perf-gate.mjs ;;
  browsers)    run browsers    env BASE=$PREVIEW OUT=$SCRATCH/browsers node scripts/browsers.mjs ;;
  *) echo "unknown check $c" >&2 ;;
esac; done
echo "all done" >> "$OUT/summary.txt"
