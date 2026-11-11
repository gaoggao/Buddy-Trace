# Buddy Trace install counter (one-shot, silent)
# Runs once at the end of setup. Sends ONLY an anonymous random id + version.
# No IP, no computer name, no account, no WorkBuddy content is ever read.
# Failure is silent and never affects installation.
param(
  [string]$AppDir,
  [string]$Version
)

try {
  $ErrorActionPreference = 'SilentlyContinue'

  # Windows PowerShell 5.1 默认 TLS 1.0，服务器要求 TLS 1.2 -> 必须显式指定
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

  # Stable anonymous id: keep it across re-installs, regenerate only if missing.
  $idFile = Join-Path $AppDir '.bt-install-id'
  $id = $null
  if (Test-Path $idFile) {
    $id = ([System.IO.File]::ReadAllText($idFile)).Trim()
  }
  if (-not $id -or $id.Length -lt 8) {
    $id = [guid]::NewGuid().ToString()
    [System.IO.File]::WriteAllText($idFile, $id)
  }

  $payload = '{"id":"' + $id + '","v":"' + $Version + '"}'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

  $req = [System.Net.HttpWebRequest]::Create('https://buddy-trace.lbase.com/admin/api/install-ping')
  $req.Method = 'POST'
  $req.ContentType = 'application/json'
  $req.Timeout = 5000
  $req.ReadWriteTimeout = 5000
  $req.UserAgent = 'BuddyTraceSetup'
  $req.ContentLength = $bytes.Length

  $stream = $req.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()

  $resp = $req.GetResponse()
  $resp.Close()
} catch {
  # Intentionally silent: no network, no DNS, blocked by firewall -> install still succeeds.
}
