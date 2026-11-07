param(
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$CodeDir = Split-Path -Parent $PSScriptRoot
$BatFile = Join-Path $CodeDir 'open-library.bat'
$Desktop = [Environment]::GetFolderPath('Desktop')
$LinkFile = Join-Path $Desktop 'Buddy Trace.lnk'

if ($Remove) {
  if (Test-Path $LinkFile) {
    Remove-Item $LinkFile -Force
    Write-Host "  removed: $LinkFile"
  } else {
    Write-Host "  not found: $LinkFile"
  }
  exit 0
}

if (-not (Test-Path $BatFile)) {
  Write-Host "ERROR: launcher not found: $BatFile"
  exit 1
}

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($LinkFile)
$sc.TargetPath = $BatFile
$sc.WorkingDirectory = $CodeDir
$sc.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$sc.Description = 'Open WorkBuddy memory library'
$sc.WindowStyle = 7
$sc.Save()

if (Test-Path $LinkFile) {
  Write-Host "  OK  desktop shortcut created:"
  Write-Host "      $LinkFile"
  Write-Host "      target: $BatFile"
} else {
  Write-Host "  FAIL to create shortcut"
  exit 1
}
