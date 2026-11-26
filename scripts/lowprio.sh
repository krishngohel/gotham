#!/bin/sh
# [perf3] Run a command at BelowNormal priority on Windows (child processes, e.g. the browser, inherit it).
# Usage: sh scripts/lowprio.sh node scripts/perf-ab.mjs ...   (arguments with spaces: avoid, or use commas)
exec cmd //c start //belownormal //wait //b "$@"
