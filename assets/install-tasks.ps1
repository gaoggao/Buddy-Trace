<#
  注册 Buddy Trace 的计划任务

  为什么不用 schtasks（2026-11-05 踩的坑）

    schtasks /TR 参数要传带引号的命令行：
      "C:\Windows\System32\wscript.exe" "D:\BuddyTrace\run-hidden.vbs"

    但从 Inno Setup 的 Exec() 或 cmd 传进去时，引号会被层层转义拆坏，
    schtasks 解析失败，报 Mandatory option 'sc' is missing。
    实测：任务根本没创建（用户装了发现没任务）。

  改用 PowerShell

    Register-ScheduledTask 的 -Argument 参数是普通字符串，
    不用操心 shell 转义。而且能直接设置 -Hidden（不弹窗）。

  这个脚本干什么

    1. 删掉可能存在的旧任务
    2. 建 BuddyTrace-Boot（开机启动）
    3. 建 BuddyTrace-Watchdog（每 30 分钟）
    4. 两个都设 Hidden = 不弹窗
    5. 结果写日志

  注意

    这个文件必须存成「带 BOM 的 UTF-8」。
    无 BOM 时 PowerShell 按系统 ANSI 读，中文注释会变乱码并导致语法错误。
#>

$ErrorActionPreference = 'Stop'

# 脚本装在程序根目录，所以 $PSScriptRoot 就是程序目录
# （原来写成 Split-Path -Parent 是因为开发时脚本在 assets\ 子目录，
#   但安装时复制到根目录，那样算出来会变成上级目录 → 找不到 VBS）
$AppDir = $PSScriptRoot
$VbsPath = Join-Path $AppDir 'run-hidden.vbs'
$WScript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$LogFile = Join-Path $AppDir 'install-tasks.log'

function Write-Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
}

Write-Log '=== 注册计划任务 ==='
Write-Log "VBS:      $VbsPath"
Write-Log "wscript:  $WScript"

if (-not (Test-Path $VbsPath)) {
    Write-Log '找不到 run-hidden.vbs，放弃'
    exit 1
}
if (-not (Test-Path $WScript)) {
    Write-Log '找不到 wscript.exe，放弃'
    exit 1
}

$Action = New-ScheduledTaskAction -Execute $WScript -Argument ('"' + $VbsPath + '"')
Write-Log "Action: $WScript `"$VbsPath`""

$Settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

try {
    $old = Get-ScheduledTask -TaskName 'BuddyTrace-Boot' -ErrorAction SilentlyContinue
    if ($old) { Unregister-ScheduledTask -TaskName 'BuddyTrace-Boot' -Confirm:$false }

    $T1 = New-ScheduledTaskTrigger -AtLogOn
    Register-ScheduledTask -TaskName 'BuddyTrace-Boot' -Action $Action -Trigger $T1 -Settings $Settings -Principal $Principal -Description 'Buddy Trace 记忆库：开机自动启动（静默）' | Out-Null
    Write-Log 'OK BuddyTrace-Boot 已创建'
} catch {
    Write-Log ('FAIL BuddyTrace-Boot: ' + $_.Exception.Message)
}

try {
    $old2 = Get-ScheduledTask -TaskName 'BuddyTrace-Watchdog' -ErrorAction SilentlyContinue
    if ($old2) { Unregister-ScheduledTask -TaskName 'BuddyTrace-Watchdog' -Confirm:$false }

    $StartAt = (Get-Date).AddMinutes(1)
    $T2 = New-ScheduledTaskTrigger -Once -At $StartAt -RepetitionInterval (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName 'BuddyTrace-Watchdog' -Action $Action -Trigger $T2 -Settings $Settings -Principal $Principal -Description 'Buddy Trace 记忆库：每 30 分钟检查服务并同步（静默）' | Out-Null
    Write-Log 'OK BuddyTrace-Watchdog 已创建'
} catch {
    Write-Log ('FAIL BuddyTrace-Watchdog: ' + $_.Exception.Message)
}

Write-Log ''
Write-Log '=== 验证 ==='
foreach ($n in @('BuddyTrace-Boot', 'BuddyTrace-Watchdog')) {
    $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
    if ($t) {
        Write-Log "OK $n 状态=$($t.State) 隐藏=$($t.Settings.Hidden)"
    } else {
        Write-Log "FAIL $n 不存在"
    }
}

Write-Log '=== 完成 ==='
exit 0