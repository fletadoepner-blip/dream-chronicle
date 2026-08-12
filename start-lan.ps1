$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 4174

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Service is already listening on port $port."
} else {
  Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

$activeInterfaces = Get-NetAdapter |
  Where-Object { $_.Status -eq 'Up' -and $_.HardwareInterface -eq $true } |
  Select-Object -ExpandProperty ifIndex

$address = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceIndex -in $activeInterfaces -and $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $address) { throw 'No LAN IPv4 address was found.' }
Write-Host "Open locally: http://127.0.0.1:$port"
Write-Host "Share on this LAN: http://${address}:$port"
