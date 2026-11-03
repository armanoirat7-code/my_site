#Requires -Version 5.1
# Local site server + shop API + AI chat.
# Run: powershell -ExecutionPolicy Bypass -File .\server.ps1

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Web.Extensions
$root = $PSScriptRoot
$port = 5190
$prefix = "http://127.0.0.1:$port/"
$uploadsDir = Join-Path $root "uploads"
$envPath = Join-Path $root ".env"

function Read-DotEnv($path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  foreach ($line in [IO.File]::ReadAllLines($path, [Text.Encoding]::UTF8)) {
    $t = $line.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { continue }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    $map[$k] = $v
  }
  return $map
}

function Get-JsonBytes($obj) {
  $json = $obj | ConvertTo-Json -Depth 10 -Compress
  return ,([Text.Encoding]::UTF8.GetBytes($json))
}

$dotenv = Read-DotEnv $envPath

if (-not (Test-Path $uploadsDir)) {
  New-Item -ItemType Directory -Path $uploadsDir | Out-Null
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Port $port busy. Close other server or change port in server.ps1"
  exit 1
}

Write-Host "API:   $prefix"
Write-Host "UI:    http://127.0.0.1:5173/   (npm run dev)"
Write-Host "Admin: http://127.0.0.1:5173/admin"
Write-Host "Stop:  Ctrl+C"
Write-Host ""

function Get-Mime($ext) {
  switch ($ext.ToLower()) {
    ".html" { "text/html; charset=utf-8" }
    ".css"  { "text/css; charset=utf-8" }
    ".js"   { "application/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".svg"  { "image/svg+xml" }
    ".png"  { "image/png" }
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".webp" { "image/webp" }
    ".ico"  { "image/x-icon" }
    default { "application/octet-stream" }
  }
}

function Read-BodyBytes($req) {
  $ms = New-Object IO.MemoryStream
  $req.InputStream.CopyTo($ms)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return ,$bytes
}

function Invoke-AiCore([byte[]]$bodyBytes, $apiKey, $model) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "node"
  $psi.Arguments = "ai-core/run.js"
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
  $psi.EnvironmentVariables["OPENAI_API_KEY"] = [string]$apiKey
  $psi.EnvironmentVariables["BAZIS_AI_MODEL"] = [string]$model

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  if (-not $proc.Start()) { throw "node" }
  $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
  $stderrTask = $proc.StandardError.ReadToEndAsync()
  if ($null -ne $bodyBytes -and $bodyBytes.Length -gt 0) {
    $proc.StandardInput.BaseStream.Write($bodyBytes, 0, $bodyBytes.Length)
  }
  $proc.StandardInput.Close()
  if (-not $proc.WaitForExit(25000)) {
    try { $proc.Kill() } catch {}
    throw "timeout"
  }
  $null = $stderrTask.Result
  return @{ ExitCode = $proc.ExitCode; Stdout = ([string]$stdoutTask.Result).Trim() }
}

function Invoke-DataCore([byte[]]$bodyBytes, $method, $path, $token) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "node"
  $psi.Arguments = "data-core/run.js"
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
  $psi.EnvironmentVariables["DATA_METHOD"] = [string]$method
  $psi.EnvironmentVariables["DATA_PATH"] = [string]$path
  $psi.EnvironmentVariables["DATA_TOKEN"] = [string]$token
  foreach ($name in @("ADMIN_PASSWORD", "MANAGER_PASSWORD", "ADMIN_KEY")) {
    $value = $dotenv[$name]
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $psi.EnvironmentVariables[$name] = [string]$value
    }
  }

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  if (-not $proc.Start()) { throw "node" }
  $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
  $stderrTask = $proc.StandardError.ReadToEndAsync()
  if ($null -ne $bodyBytes -and $bodyBytes.Length -gt 0) {
    $proc.StandardInput.BaseStream.Write($bodyBytes, 0, $bodyBytes.Length)
  }
  $proc.StandardInput.Close()
  if (-not $proc.WaitForExit(20000)) {
    try { $proc.Kill() } catch {}
    throw "timeout"
  }
  $null = $stderrTask.Result
  return ([string]$stdoutTask.Result).Trim()
}

function Get-SessionRole($token) {
  if ([string]::IsNullOrWhiteSpace($token)) { return "" }
  try {
    $stdout = Invoke-DataCore $null "GET" "/api/session" $token
    if ([string]::IsNullOrWhiteSpace($stdout)) { return "" }
    $stdout = $stdout.Replace("`r", "")
    $split = $stdout.IndexOf("`n")
    if ($split -lt 1) { return "" }
    if ([int]$stdout.Substring(0, $split) -ne 200) { return "" }
    $obj = $stdout.Substring($split + 1) | ConvertFrom-Json
    return [string]$obj.role
  } catch {
    return ""
  }
}

function Write-Response($ctx, $status, $contentType, $bytes) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = $contentType
  $ctx.Response.Headers["Access-Control-Allow-Origin"] = "*"
  $ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
  $ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, x-auth-token"
  $ctx.Response.Headers["Cache-Control"] = "no-store"
  if ($null -ne $bytes) {
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  }
  $ctx.Response.Close()
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $method = $req.HttpMethod
  $path = [Uri]::UnescapeDataString($req.Url.LocalPath)

  if ($method -eq "OPTIONS") {
    Write-Response $ctx 204 "text/plain" $null
    continue
  }

  # --- AI chat API ---
  if ($path -eq "/api/chat" -and $method -eq "POST") {
    try {
      $apiKey = $dotenv["OPENAI_API_KEY"]
      if ([string]::IsNullOrWhiteSpace($apiKey)) {
        Write-Response $ctx 503 "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes('{"error":"no_key"}'))
        continue
      }
      $model = $dotenv["BAZIS_AI_MODEL"]
      if ([string]::IsNullOrWhiteSpace($model)) { $model = "" }

      $bodyBytes = Read-BodyBytes $req
      $result = Invoke-AiCore $bodyBytes $apiKey $model
      if ([string]::IsNullOrWhiteSpace($result.Stdout)) { throw "empty node" }
      $status = 200
      if ($result.ExitCode -ne 0) {
        if ($result.Stdout -match '"no_key"') { $status = 503 }
        elseif ($result.Stdout -match '"bad_json"') { $status = 400 }
        else { $status = 502 }
      }
      Write-Response $ctx $status "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes($result.Stdout))
    } catch {
      $err = (@{ error = "chat_failed" } | ConvertTo-Json -Compress)
      Write-Response $ctx 502 "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes($err))
    }
    continue
  }

  # --- orders and catalog in data/site.sqlite ---
  if ($path -eq "/api/orders" -or $path -eq "/api/products" -or $path -eq "/api/login") {
    try {
      $bodyBytes = $null
      if ($method -eq "POST" -or $method -eq "PATCH") { $bodyBytes = Read-BodyBytes $req }
      $stdout = Invoke-DataCore $bodyBytes $method $path ([string]$req.Headers["x-auth-token"])
      if ([string]::IsNullOrWhiteSpace($stdout)) { throw "empty data" }
      $stdout = $stdout.Replace("`r", "")
      $split = $stdout.IndexOf("`n")
      if ($split -lt 1) { throw "bad data" }
      $status = [int]$stdout.Substring(0, $split)
      $json = $stdout.Substring($split + 1)
      Write-Response $ctx $status "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes($json))
    } catch {
      Write-Response $ctx 500 "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes('{"error":"store_failed"}'))
    }
    continue
  }

  # --- image upload API ---
  if ($path -eq "/api/upload" -and $method -eq "POST") {
    if ((Get-SessionRole ([string]$req.Headers["x-auth-token"])) -ne "admin") {
      Write-Response $ctx 401 "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"forbidden"}'))
      continue
    }
    try {
      Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
      $bodyBytes = Read-BodyBytes $req
      $body = [Text.Encoding]::UTF8.GetString($bodyBytes)
      $parser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
      $parser.MaxJsonLength = 20MB
      $obj = $parser.DeserializeObject($body)
      $ext = [string]$obj["ext"]
      if ($ext -notin @("jpg","jpeg","png","webp")) { $ext = "jpg" }
      $b64 = [string]$obj["data"]
      if ($b64 -match "^data:image/[^;]+;base64,(.+)$") { $b64 = $Matches[1] }
      $imgBytes = [Convert]::FromBase64String($b64)
      if ($imgBytes.Length -gt 3MB) { throw "too large" }
      $name = ("img-{0:yyyyMMdd-HHmmss}-{1}.{2}" -f (Get-Date), (Get-Random -Maximum 99999), $ext)
      $out = Join-Path $uploadsDir $name
      [IO.File]::WriteAllBytes($out, $imgBytes)
      $url = "/uploads/$name"
      $resp = "{{""ok"":true,""url"":""{0}""}}" -f $url
      Write-Response $ctx 200 "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes($resp))
    } catch {
      Write-Response $ctx 400 "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes('{"ok":false}'))
    }
    continue
  }

  $dist = Join-Path $root "dist"
  $indexHtml = Join-Path $dist "index.html"
  if ($path -eq "/" -or $path -eq "/admin" -or $path -eq "/admin/") {
    if (Test-Path $indexHtml) {
      Write-Response $ctx 200 "text/html; charset=utf-8" ([IO.File]::ReadAllBytes($indexHtml))
      continue
    }
  }

  $rel = $path.TrimStart("/").Replace("/", "\")
  $candidates = @()
  if ($rel) {
    $candidates += (Join-Path $dist $rel)
    $candidates += (Join-Path $root $rel)
  }
  $served = $false
  foreach ($file in $candidates) {
    $fullRoot = [IO.Path]::GetFullPath($root)
    $fullFile = [IO.Path]::GetFullPath($file)
    if (-not $fullFile.StartsWith($fullRoot)) { continue }
    if (Test-Path $file -PathType Leaf) {
      Write-Response $ctx 200 (Get-Mime ([IO.Path]::GetExtension($file))) ([IO.File]::ReadAllBytes($file))
      $served = $true
      break
    }
  }
  if ($served) { continue }
  if ((Test-Path $indexHtml) -and -not [IO.Path]::GetExtension($path)) {
    Write-Response $ctx 200 "text/html; charset=utf-8" ([IO.File]::ReadAllBytes($indexHtml))
    continue
  }
  Write-Response $ctx 404 "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
}