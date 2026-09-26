$ErrorActionPreference = 'Continue'
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC'
Set-Location -LiteralPath 'C:\'
$frontend = 'g:\Mi unidad\Documents\[Development]\ETHAnalyzerWeb\frontend'
$out = "$env:TEMP\eth_sync.out"
$err = "$env:TEMP\eth_sync.err"
$argStr = '--prefix "' + $frontend + '" run cap:sync'
$p = Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList $argStr -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
"ExitCode=" + $p.ExitCode
Write-Host '--- stdout ---'
Get-Content $out -ErrorAction SilentlyContinue
Write-Host '--- stderr ---'
Get-Content $err -ErrorAction SilentlyContinue
