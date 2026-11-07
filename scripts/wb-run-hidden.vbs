' ═══════════════════════════════════════════════════════════════════
' Buddy Trace · 静默运行包装
'
' ── 为什么需要这个 ──
'
' 老板发现（2026-11-03）：
'   「你别让这个窗口每隔几分钟或者每隔半个小时就闪一次。
'     给用户装到电脑上，用户以为电脑中病毒了，会重做系统。」
'
' 问题：计划任务直接调 node.exe 会弹一个黑窗口，每 30 分钟闪一次。
' 解决：用 VBS 的 WScript.Shell.Run，窗口样式 = 0（完全隐藏）。
'
' ── 用法 ──
'   cscript.exe //nologo wb-run-hidden.vbs
' ═══════════════════════════════════════════════════════════════════

Option Explicit

Dim shell, fso, here, codeDir, scriptPath, nodeExe, cmd, logFile, ts

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
codeDir = fso.GetParentFolderName(here)
scriptPath = here & "\wb-watchdog.js"

logFile = codeDir & "\..\data\logs\vbs.log"

' ── 找 node.exe ──
' 先试 PATH（最简单：直接用 "node" 这个名字，Run 会走 PATH）
nodeExe = "node"

' 但如果有明确的安装路径，用绝对路径更稳（PATH 里可能没有）
Dim tryList, i, p
tryList = Array( _
  shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\nodejs\node.exe", _
  "E:\Program Files\nodejs\node.exe", _
  "C:\Program Files\nodejs\node.exe", _
  shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe" _
)

For i = 0 To UBound(tryList)
  p = tryList(i)
  If Len(p) > 0 Then
    If fso.FileExists(p) Then
      nodeExe = p
      Exit For
    End If
  End If
Next

' ── 拼命令 ──
cmd = """" & nodeExe & """ """ & scriptPath & """"

' ── 静默执行并等待 ──
Dim rc
rc = -1
On Error Resume Next
rc = shell.Run(cmd, 0, True)
Dim errNum, errDesc
errNum = Err.Number
errDesc = Err.Description
On Error GoTo 0

' ── 记一行日志（方便排查，不弹窗）──
On Error Resume Next
Set ts = fso.OpenTextFile(logFile, 8, True)
If Err.Number = 0 Then
  ts.WriteLine Now() & "  rc=" & rc & "  node=" & nodeExe & "  err=" & errNum & " " & errDesc
  ts.Close
End If
On Error GoTo 0
