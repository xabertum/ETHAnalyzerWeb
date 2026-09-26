<#
.SYNOPSIS
    Compila la APK de ETH Analyzer.

.DESCRIPTION
    Compila el frontend, lo sincroniza con el proyecto Android y genera una APK firmada.
    Gradle necesita un JDK 17-21; si el JDK del sistema es más reciente, indica uno
    compatible con el parámetro -JdkPath o la variable de entorno ETH_BUILD_JDK.

.EXAMPLE
    .\build-apk.ps1
    .\build-apk.ps1 -JdkPath "C:\jdk21"
#>
param(
    [string]$JdkPath = $env:ETH_BUILD_JDK,
    [string]$AndroidSdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" })
)

$ErrorActionPreference = 'Stop'
$frontend = Join-Path $PSScriptRoot 'frontend'
$android = Join-Path $frontend 'android'

if (-not (Test-Path -LiteralPath $android)) {
    Write-Host 'No existe el proyecto Android. Generándolo...' -ForegroundColor Yellow
    Push-Location -LiteralPath $frontend
    npx cap add android
    Pop-Location
}

if ($JdkPath -and -not (Test-Path -LiteralPath (Join-Path $JdkPath 'bin\java.exe'))) {
    throw "No se encuentra un JDK en $JdkPath"
}

if (-not $JdkPath) {
    Write-Host 'Usando el JDK del sistema. Si falla con "Unsupported class file major version",' -ForegroundColor Yellow
    Write-Host 'indica un JDK 17-21 con -JdkPath.' -ForegroundColor Yellow
}

Write-Host '==> Compilando el frontend y sincronizando con Android' -ForegroundColor Cyan
Push-Location -LiteralPath $frontend
npm run cap:sync
Pop-Location

Write-Host '==> Compilando la APK' -ForegroundColor Cyan
Push-Location -LiteralPath $android
if ($JdkPath) { $env:JAVA_HOME = $JdkPath }
$env:ANDROID_HOME = $AndroidSdk
& .\gradlew.bat assembleRelease
$exit = $LASTEXITCODE
Pop-Location

if ($exit -ne 0) { throw "La compilación falló con código $exit" }

$apk = Join-Path $android 'app\build\outputs\apk\release\app-release.apk'
if (Test-Path -LiteralPath $apk) {
    $size = [math]::Round((Get-Item $apk).Length / 1MB, 1)
    Write-Host ''
    Write-Host "APK generada ($size MB):" -ForegroundColor Green
    Write-Host "  $apk" -ForegroundColor Green
} else {
    throw 'La compilación terminó pero no se encontró la APK'
}
