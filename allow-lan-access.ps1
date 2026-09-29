<#
.SYNOPSIS
    Permite acceder a ETH Analyzer desde otros dispositivos de la red local (móvil, tablet).

.DESCRIPTION
    Por defecto Windows bloquea las conexiones entrantes, así que el móvil no puede abrir
    la web ni importar datos desde la app. Este script:

      1. Marca la red wifi actual como "Privada" (red de confianza, no pública).
      2. Crea reglas de firewall que permiten los puertos del frontend y del backend
         SOLO desde direcciones de tu propia red local.

    EJECUTAR COMO ADMINISTRADOR:
      Botón derecho en PowerShell > "Ejecutar como administrador", y luego lanzar el script.

.EXAMPLE
    .\allow-lan-access.ps1
    .\allow-lan-access.ps1 -Remove     # revierte las reglas creadas
#>
param(
    [int[]]$Ports = @(4000, 8080, 8100),
    [switch]$Remove,
    [switch]$KeepNetworkPublic
)

$ErrorActionPreference = 'Stop'
$ruleName = 'ETH Analyzer (red local)'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host 'Este script necesita permisos de administrador.' -ForegroundColor Red
    Write-Host 'Abre PowerShell con "Ejecutar como administrador" y vuelve a lanzarlo.' -ForegroundColor Yellow
    exit 1
}

if ($Remove) {
    Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-NetFirewallRule -Name $_.Name
        Write-Host "Regla eliminada: $($_.DisplayName)" -ForegroundColor Yellow
    }
    Write-Host 'Listo. El acceso desde la red local vuelve a estar bloqueado.' -ForegroundColor Green
    exit 0
}

# --- 1. Red de confianza ---------------------------------------------------

$profile = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' } | Select-Object -First 1

if (-not $profile) { throw 'No se ha encontrado una conexión de red activa.' }

if ($profile -and $profile.NetworkCategory -eq 'Public' -and -not $KeepNetworkPublic) {
    Set-NetConnectionProfile -InterfaceIndex $profile.InterfaceIndex -NetworkCategory Private
    Write-Host "Red '$($profile.Name)' marcada como Privada." -ForegroundColor Green
} elseif ($profile) {
    Write-Host "Red '$($profile.Name)': $($profile.NetworkCategory)" -ForegroundColor Cyan
}

# --- 2. Interfaz y rango de la red local -----------------------------------

$ip = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.InterfaceIndex -eq $profile.InterfaceIndex -and
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*'
    } |
    Select-Object -First 1

if (-not $ip) { throw "No se ha encontrado una dirección IPv4 en la interfaz '$($profile.InterfaceAlias)'." }

if ($ip.PrefixLength -lt 1 -or $ip.PrefixLength -gt 32) {
    throw "La longitud de prefijo IPv4 no es válida: $($ip.PrefixLength)"
}

$addressBytes = [Net.IPAddress]::Parse($ip.IPAddress).GetAddressBytes()
$networkBytes = for ($i = 0; $i -lt $addressBytes.Length; $i++) {
    $bits = [math]::Min(8, [math]::Max(0, $ip.PrefixLength - ($i * 8)))
    $mask = if ($bits -eq 0) { 0 } else { (0xFF -shl (8 - $bits)) -band 0xFF }
    $addressBytes[$i] -band $mask
}
$scope = "$($networkBytes -join '.')/$($ip.PrefixLength)"
Write-Host "Se permitirá el acceso solo desde $scope" -ForegroundColor Cyan

# --- 3. Reglas de firewall -------------------------------------------------

Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Ports `
    -RemoteAddress $scope `
    -Profile Private, Domain `
    -Description 'Acceso al frontend y al backend de ETH Analyzer desde la red local' | Out-Null

Write-Host "Regla creada para los puertos: $($Ports -join ', ')" -ForegroundColor Green

# --- 4. Resumen ------------------------------------------------------------

Write-Host ''
Write-Host 'Desde el móvil (conectado a la misma wifi):' -ForegroundColor Green
Write-Host "  Web         ->  http://$($ip.IPAddress):8080" -ForegroundColor White
Write-Host "  En la app   ->  Ajustes > Importar desde el PC > http://$($ip.IPAddress):4000" -ForegroundColor White
Write-Host ''
Write-Host 'Para revertirlo: .\allow-lan-access.ps1 -Remove' -ForegroundColor DarkGray
