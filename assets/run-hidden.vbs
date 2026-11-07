' ===================================================================
' Buddy Trace - Silent Launcher
'
' WHY THIS EXISTS (2026-11-05)
'
'   Scheduled tasks that call BuddyTrace.exe directly cause a console
'   window to flash on screen every 30 minutes. Users think the machine
'   is infected.
'
'   wscript.exe is a GUI host: it never creates a console. This VBS
'   launches the exe with window style 0 (fully hidden).
'
' HOW IT IS USED
'
'   Scheduled task points at:
'     wscript.exe "D:\BuddyTrace\run-hidden.vbs"
'
'   Or manually:
'     wscript.exe run-hidden.vbs
'
' NOTE: ALL COMMENTS IN THIS FILE MUST BE ENGLISH.
'   cscript/wscript reads .vbs as system ANSI (GBK on Chinese Windows).
'   A BOM-less UTF-8 file with Chinese comments turns into mojibake,
'   and the garbage bytes can swallow line breaks, merging a comment
'   with the next statement -> "Expected statement" error.
'   (Hit this on 2026-11-05. Keep this file ASCII-only.)
' ===================================================================

Option Explicit

Dim shell, fso, here, exePath, cmd

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' The .vbs sits next to BuddyTrace.exe
here = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = here & "\BuddyTrace.exe"

' If the exe is missing, exit silently (never show a dialog)
If Not fso.FileExists(exePath) Then
  WScript.Quit 0
End If

' --no-open = run in background, do not open a browser
cmd = """" & exePath & """ --no-open"

' -------------------------------------------------------------------
' Run(cmd, windowStyle, waitOnReturn)
'   windowStyle 0 = hidden
'   waitOnReturn False = return immediately
'
' Why False: the service is a long-running process and never exits.
' Waiting would keep this .vbs alive forever, and the scheduler would
' think the task is still running and refuse to start the next one.
'
' With False: the .vbs exits at once and the service keeps running.
' If the service is already up, the next run detects the port in use
' and exits by itself, so we never get two copies.
' -------------------------------------------------------------------
On Error Resume Next
shell.Run cmd, 0, False

' Append one line to the log so failures are traceable later
Dim logFile, ts
On Error Resume Next
If fso.FolderExists(here & "\data\logs") Then
  logFile = here & "\data\logs\vbs.log"
  Set ts = fso.OpenTextFile(logFile, 8, True)
  If Err.Number = 0 Then
    ts.WriteLine Now() & "  run-hidden.vbs launched"
    ts.Close
  End If
End If
On Error GoTo 0
