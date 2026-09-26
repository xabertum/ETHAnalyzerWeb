$ErrorActionPreference = 'Continue'
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC'
Set-Location -LiteralPath 'C:\'
$frontend = 'g:\Mi unidad\Documents\[Development]\ETHAnalyzerWeb\frontend'
$out = "$env:TEMP\eth_install.out"
$err = "$env:TEMP\eth_install.err"
$argStr = '--prefix "' + $frontend + '" install'
$p = Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList $argStr -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
"ExitCode=" + $p.ExitCode
Write-Host '--- stdout (tail) ---'
Get-Content $out -ErrorAction SilentlyContinue | Select-Object -Last 60
Write-Host '--- stderr (tail) ---'
Get-Content $err -ErrorAction SilentlyContinue | Select-Object -Last 60
