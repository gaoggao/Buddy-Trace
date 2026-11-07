param(
  [switch]$Remove,
  [int]$IntervalMinutes = 30
)

$ErrorActionPreference = 'Stop'

$TaskName = 'BuddyTrace-Watchdog'
$BootTaskName = 'BuddyTrace-Boot'
$CodeDir = Split-Path -Parent $PSScriptRoot
$Watchdog = Join-Path $PSScriptRoot 'wb-watchdog.js'
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue

if (-not $NodeCmd) {
  Write-Host 'ERROR: node.exe not found. Install Node.js first.'
  exit 1
}
$NodeExe = $NodeCmd.Source

if (-not (Test-Path $Watchdog)) {
  Write-Host "ERROR: watchdog script not found: $Watchdog"
  exit 1
}

if ($Remove) {
  foreach ($n in @($TaskName, $BootTaskName)) {
    $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
    if ($t) {
      Unregister-ScheduledTask -TaskName $n -Confirm:$false
      Write-Host "  removed: $n"
    } else {
      Write-Host "  not found: $n"
    }
  }
  exit 0
}

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'ERROR: needs Administrator. Run PowerShell as admin.'
  exit 1
}

Write-Host '==== Register scheduled tasks ===='
Write-Host "  watchdog: $Watchdog"
Write-Host "  workdir : $CodeDir"
Write-Host "  interval: $IntervalMinutes min"
Write-Host ''

# ── 关键：用 VBS 静默包装，不弹黑窗口 ──
#
# 老板发现（2026-11-03）：
#   「你别让这个窗口每隔几分钟或者每隔半个小时就闪一次。
#     给用户装到电脑上，用户以为电脑中病毒了，会重做系统。」
#
# 所以计划任务不直接调 node.exe（那会弹控制台窗口），
# 而是调 wscript.exe 执行 wb-run-hidden.vbs —— VBS 里用 Run(..., 0, ...) 隐藏窗口。
Write-Host "  DEBUG: PSScriptRoot=[$PSScriptRoot] CodeDir=[$CodeDir]"
$VbsPath = Join-Path (Join-Path $CodeDir 'scripts') 'wb-run-hidden.vbs'
if (-not (Test-Path $VbsPath)) {
  Write-Host "ERROR: VBS wrapper not found: $VbsPath"
  exit 1
}

$WscriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'
if (-not (Test-Path $WscriptExe)) {
  Write-Host "ERROR: wscript.exe not found"
  exit 1
}

# wscript.exe 本身不弹窗；VBS 里再设 Run 的窗口样式为 0
$action = New-ScheduledTaskAction -Execute $WscriptExe -Argument ('"' + $VbsPath + '"') -WorkingDirectory $CodeDir
Write-Host "  action: wscript.exe `"$VbsPath`""
Write-Host ''

$startAt = (Get-Date).AddMinutes(1)
# 注意：RepetitionDuration 不能用 [TimeSpan]::MaxValue —— 计划任务不接受 P99999999D
# 标准做法：用 Register-ScheduledTask 时先不设 duration，注册后用 XML 补成"无限"
$triggerRepeat = New-ScheduledTaskTrigger -Once -At $startAt -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$principal = New-ScheduledTaskPrincipal -UserId $id.Name -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew

$old = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($old) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggerRepeat -Principal $principal -Settings $settings -Description 'WorkBuddy memory library: check service every 30 min (silent)' | Out-Null
Write-Host "  registered: $TaskName"

$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$old2 = Get-ScheduledTask -TaskName $BootTaskName -ErrorAction SilentlyContinue
if ($old2) { Unregister-ScheduledTask -TaskName $BootTaskName -Confirm:$false }
Register-ScheduledTask -TaskName $BootTaskName -Action $action -Trigger $triggerBoot -Principal $principal -Settings $settings -Description 'WorkBuddy memory library: start on boot' | Out-Null
Write-Host "  registered: $BootTaskName"

Write-Host ''
Write-Host '==== Verify ===='
foreach ($n in @($TaskName, $BootTaskName)) {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if ($t) {
    Write-Host "  OK  $n  state=$($t.State)"
  } else {
    Write-Host "  FAIL $n"
  }
}

Write-Host ''
Write-Host '  Run now:  Start-ScheduledTask -TaskName BuddyTrace-Watchdog'
Write-Host '  Remove:   powershell -ExecutionPolicy Bypass -File scripts\wb-install-task.ps1 -Remove'
