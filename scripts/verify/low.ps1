# [verify] Runs one command line at BelowNormal priority (children such as Chromium inherit it) and
# waits. Keeps the owner's machine responsive while the long browser checks run.
#   powershell -File scripts/verify/low.ps1 -Log out.txt -Env "BASE_URL=http://localhost:5860" -Cmd "npx playwright test movement.spec.js"
param([string]$Cmd, [string]$Log = '', [string[]]$Env = @())
# powershell -File passes "A=1","B=2" as one string "A=1,B=2": split before each NAME=.
foreach ($kv in ($Env | ForEach-Object { $_ -split ',(?=[A-Z_][A-Z0-9_]*=)' })) { $k, $v = $kv -split '=', 2; Set-Item -Path "env:$k" -Value $v }
$line = $Cmd
if ($Log) { $line = "$line > `"$Log`" 2>&1" }
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $line -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try { $p.PriorityClass = 'BelowNormal' } catch {}
$p.WaitForExit()
exit $p.ExitCode
