$out = "$env:TEMP\whoami.out"
$err = "$env:TEMP\whoami.err"
$p = Start-Process -FilePath "$env:WINDIR\System32\whoami.exe" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
"ExitCode=" + $p.ExitCode
"---stdout---"
Get-Content $out -ErrorAction SilentlyContinue
"---stderr---"
Get-Content $err -ErrorAction SilentlyContinue
