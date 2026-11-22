' ===================================================================
' Buddy Trace - Silent Launcher + Health Watchdog
'
' 3.0.4 (2026-11-22):
'   Old version blindly launched BuddyTrace.exe every 30 min.
'   If the service was alive-but-frozen (port open, HTTP hanging),
'   the new process saw the port in use and exited -> frozen service
'   never recovered. User saw "page won't open, opens after a while".
'
' New behavior (run by BOTH BuddyTrace-Boot and BuddyTrace-Watchdog):
'   1. Probe http://127.0.0.1:41829/api/health (5s timeout).
'   2. Healthy -> do nothing (just log one line).
'   3. Unhealthy -> kill stuck BuddyTrace.exe, then relaunch hidden.
'
' NOTE: ASCII ONLY. cscript/wscript reads .vbs as system ANSI (GBK
' on Chinese Windows). Non-ASCII comments turn into mojibake and can
' swallow line breaks -> "Expected statement" error. (Hit 2026-11-05.)
' ===================================================================

Option Explicit

Dim shell, fso, here, exePath, logDir, logFile, ts
Dim healthy, probeUrl, xmlHttp, port, probePorts, i

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = here & "\BuddyTrace.exe"
logDir = here & "\data\logs"
logFile = logDir & "\watchdog.log"

If Not fso.FileExists(exePath) Then
  WScript.Quit 0
End If

On Error Resume Next
If Not fso.FolderExists(logDir) Then
  fso.CreateFolder logDir
End If
On Error GoTo 0

Sub LogLine(msg)
  On Error Resume Next
  Set ts = fso.OpenTextFile(logFile, 8, True)
  If Err.Number = 0 Then
    ts.WriteLine "[" & Now() & "] " & msg
    ts.Close
  End If
  Err.Clear
  On Error GoTo 0
End Sub

' Probe one port. Return True if /api/health answers with JSON containing "ok".
Function ProbePort(p)
  Dim x, txt
  ProbePort = False
  On Error Resume Next
  Set x = CreateObject("MSXML2.XMLHTTP")
  If Err.Number <> 0 Then Exit Function
  x.open "GET", "http://127.0.0.1:" & p & "/api/health", False
  x.setRequestHeader "Cache-Control", "no-cache"
  x.send ""
  If Err.Number = 0 Then
    If x.status = 200 Then
      txt = x.responseText
      If InStr(txt, """ok"":true") > 0 Or InStr(txt, """ok"": true") > 0 Then
        ProbePort = True
      End If
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Function

' Try default ports (same list as src/ports.js)
probePorts = Array(41829, 41830, 41831)
healthy = False
For i = 0 To UBound(probePorts)
  If ProbePort(probePorts(i)) Then
    healthy = True
    port = probePorts(i)
    Exit For
  End If
Next

If healthy Then
  LogLine "health OK on port " & port & " - no action"
  WScript.Quit 0
End If

' Not healthy: kill stuck process, then relaunch.
LogLine "health FAILED - restarting service"
On Error Resume Next
shell.Run "taskkill /F /IM BuddyTrace.exe /T", 0, True
Err.Clear
WScript.Sleep 1500
shell.Run """" & exePath & """ --no-open", 0, False
Err.Clear
On Error GoTo 0
LogLine "restart command issued"

' Wait up to 20s and verify it came back.
Dim ok2, j
ok2 = False
For i = 1 To 20
  WScript.Sleep 1000
  For j = 0 To UBound(probePorts)
    If ProbePort(probePorts(j)) Then
      ok2 = True
      port = probePorts(j)
      Exit For
    End If
  Next
  If ok2 Then Exit For
Next

If ok2 Then
  LogLine "service back OK on port " & port
Else
  LogLine "WARNING: service still not responding after restart"
End If
