#Requires -Version 5.1
# Keeps site + public tunnel alive while PC is on.
# Run: start-site.bat

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$port = 5190
$localUrl = "http://127.0.0.1:$port/"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$urlFile = Join-Path $root "PUBLIC_URL.txt"
$logFile = Join-Path $root "watchdog.log"
$tunnelLog = Join-Path $root "tunnel.log"

function Write-Log {
  param([string]$Message)
  $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $Message
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-Local {
  try {
    $r = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Stop-PortOwner {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if ($null -eq $conns) { return }
  $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function Stop-Tunnels {
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
  if ($null -eq $procs) { return }
  foreach ($p in $procs) {
    if ($p.CommandLine -and ($p.CommandLine -like "*tunnel --url*")) {
      try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
}

function Start-SiteServer {
  Write-Log "Starting local server..."
  $serverPs1 = Join-Path $root "server.ps1"
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -WindowStyle Hidden -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$serverPs1 | Out-Null
}

function Get-TunnelAlive {
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
  if ($null -eq $procs) { return $false }
  foreach ($p in $procs) {
    if ($p.CommandLine -and ($p.CommandLine -like "*tunnel --url*")) { return $true }
  }
  return $false
}

function Start-PublicTunnel {
  if (-not (Test-Path $cloudflared)) {
    Write-Log "cloudflared missing"
    return
  }

  Stop-Tunnels
  if (Test-Path $tunnelLog) {
    Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue
  }

  Write-Log "Starting Cloudflare tunnel..."
  $argList = "tunnel --url $localUrl"
  $outLog = Join-Path $root "tunnel-out.log"
  $errLog = Join-Path $root "tunnel-err.log"
  if (Test-Path $outLog) { Remove-Item $outLog -Force -ErrorAction SilentlyContinue }
  if (Test-Path $errLog) { Remove-Item $errLog -Force -ErrorAction SilentlyContinue }
  Start-Process -FilePath $cloudflared -ArgumentList $argList -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden | Out-Null

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $txt = ""
    if (Test-Path $errLog) { $txt += (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $outLog) { $txt += (Get-Content $outLog -Raw -ErrorAction SilentlyContinue) }
    if (-not $txt) { continue }
    $m = [regex]::Match($txt, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($m.Success) {
      $url = $m.Value
      Set-Content -Path $urlFile -Value $url -Encoding UTF8
      Write-Log "Public URL: $url"
      return
    }
  }
  Write-Log "Tunnel URL not detected yet"
}

Write-Log "Watchdog started"
Write-Host ""
Write-Host "Keep this window open. Link will be in PUBLIC_URL.txt"
Write-Host "Stop: Ctrl+C"
Write-Host ""

while ($true) {
  try {
    if (-not (Test-Local)) {
      Write-Log "Local down - restarting"
      Stop-PortOwner
      Start-Sleep -Seconds 1
      Start-SiteServer
      Start-Sleep -Seconds 3
      if (Test-Local) {
        Start-PublicTunnel
      } else {
        Write-Log "Server still down"
      }
    } elseif (-not (Get-TunnelAlive)) {
      Write-Log "Tunnel down - restarting"
      Start-PublicTunnel
    }
  } catch {
    Write-Log ("Watch loop error: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds 15
}
