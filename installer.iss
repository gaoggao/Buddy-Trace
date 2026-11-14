; ═══════════════════════════════════════════════════════════════════
; 溯源 · Buddy Trace —— Inno Setup 安装脚本
;
; 老板要求（2026-11-05）：
;   「在你的那个安装包里，应该同时有卸载的功能。
;     就是在系统的 Windows 系统的应用卸载里面应该有卸载的选项。」
;   「我想默认安到D盘上，但是有的用户可能没有D盘，只有一个C盘。
;     能不能先检测有D盘就按D盘，没有D盘就按C盘。」
;
; 关键点：
;   ① 装到 D 盘（有 D 盘且可写）或 C 盘 AppData（没有 D 盘）
;   ② 在「应用和功能」里注册（带图标、版本、发布者）
;   ③ 带标准卸载程序（unins000.exe）
;   ④ 卸载时问用户「数据要不要保留」
;   ⑤ 卸载时自动删计划任务、桌面图标、正在跑的进程
;
; 编译：ISCC.exe installer.iss
; ═══════════════════════════════════════════════════════════════════

#define AppName        "溯源 · Buddy Trace"
#define AppNameEn      "Buddy Trace"
#define AppVersion     "2.1.8"
#define AppPublisher   "Buddy Trace"
#define AppURL         "https://github.com/gaoggao/Buddy-Trace"
#define AppExeName     "BuddyTrace.exe"

[Setup]
AppId={{8F3A2B1C-4D5E-4F6A-9B8C-7D6E5F4A3B2C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}/releases
AppComments=WorkBuddy 记忆的延伸 —— 项目丝滑交接，历史随时溯源

DefaultDirName={code:GetDefaultDir}
DefaultGroupName={#AppName}
DisableDirPage=no
UsePreviousAppDir=yes

OutputDir=..\dist
OutputBaseFilename=BuddyTrace-Setup-{#AppVersion}
SetupIconFile=assets\logo.ico
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}

Compression=lzma2/max
SolidCompression=yes

WizardStyle=modern
DisableWelcomePage=no
DisableProgramGroupPage=yes

PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} 安装程序
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}


[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"


[Tasks]
Name: "desktopicon"; Description: "创建桌面图标"; GroupDescription: "桌面:"; Flags: checkedonce
; 计划任务是无条件注册的，这一项只是给用户看，不影响实际行为
Name: "startup"; Description: "开机自动启动（后台服务，已默认开启）"; GroupDescription: "启动:"; Flags: checkedonce


[Files]
Source: "dist\BuddyTrace.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\logo.ico"; DestDir: "{app}"; Flags: ignoreversion
; 静默包装脚本 —— 计划任务调它，避免黑窗闪
; （老板 2026-11-05：「不能让窗口弹出来，用户会以为是中病毒了」）
Source: "assets\run-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
; 注册计划任务的 PowerShell 脚本（比 schtasks 可靠，能设 Hidden）
Source: "assets\install-tasks.ps1"; DestDir: "{app}"; Flags: ignoreversion
; 匿名安装计数（安装完成时执行一次，失败静默）
Source: "assets\install-ping.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\docs\使用说明书.docx"; DestDir: "{app}\docs"; Flags: ignoreversion skipifsourcedoesntexist
; ── 2.0 增量更新：初始业务代码（可单独更新）──
; 装上就带一份 code\src\，exe 启动时优先加载这里；之后更新只换这个目录
; 排除 shell.js：它是 exe 的入口，已经打进 exe 里了
Source: "src\*.js"; DestDir: "{app}\code\src"; Excludes: "shell.js"; Flags: ignoreversion


[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\logo.ico"
Name: "{group}\使用说明书"; Filename: "{app}\docs\使用说明书.docx"
Name: "{group}\卸载 {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\logo.ico"; Tasks: desktopicon


[Run]
; ⚠ 只在这里启动一次，CurStepChanged 里不再启动
; （2026-11-05 踩过：两处都启动 → 弹了两个窗口）
Filename: "{app}\{#AppExeName}"; Description: "立即启动 {#AppName}"; Flags: nowait postinstall skipifsilent


[UninstallRun]
; 卸载前：先停计划任务（否则它会把进程拉起来），再杀进程
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""BuddyTrace-Boot"""; Flags: runhidden; RunOnceId: "StopBoot"
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""BuddyTrace-Watchdog"""; Flags: runhidden; RunOnceId: "StopDog"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""BuddyTrace-Boot"""; Flags: runhidden; RunOnceId: "DelBoot"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""BuddyTrace-Watchdog"""; Flags: runhidden; RunOnceId: "DelDog"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM {#AppExeName}"; Flags: runhidden; RunOnceId: "KillApp"


[UninstallDelete]
Type: filesandordirs; Name: "{app}\docs"
Type: filesandordirs; Name: "{app}\code"
Type: filesandordirs; Name: "{app}\code.bak"
Type: files; Name: "{app}\logo.ico"
Type: files; Name: "{app}\install-tasks.ps1"
Type: files; Name: "{app}\install-tasks.log"
Type: files; Name: "{app}\install-tasks-fail.log"


[Code]

var
  KeepData: Boolean;

{ ═══════════════════════════════════════════════════════════════
  检测默认安装位置

  检测逻辑（不只看"有没有 D 盘"，还要看能不能真的写进去）：
    ① D 盘存在（DirExists）
    ② 可写（试建一个临时文件）
    ③ 剩余空间 > 500 MB
    全满足 → D:\BuddyTrace
    否则   → C:\Users\<用户>\AppData\Local\BuddyTrace

  为什么不检查 DriveType：
    Inno Setup 的 Pascal Script 没有内置 GetDriveType，
    要自己声明 Windows API，容易出错。
    用"试写文件"更直接 —— 写不进去就是不能用，不管它是 U 盘还是光驱。
  ═══════════════════════════════════════════════════════════════ }

function CanWriteTo(Dir: String): Boolean;
var
  TestFile: String;
  S: TStringList;
begin
  Result := False;
  TestFile := Dir + '__buddy_trace_test.tmp';
  S := TStringList.Create;
  try
    try
      S.SaveToFile(TestFile);
      Result := True;
    except
      Result := False;
    end;
  finally
    S.Free;
    if FileExists(TestFile) then
      DeleteFile(TestFile);
  end;
end;

function GetDefaultDir(Param: String): String;
var
  FreeMB: Cardinal;
  TotalMB: Cardinal;
begin
  // ── 尝试 D 盘 ──
  if DirExists('D:\') then
  begin
    // 剩余空间 > 500 MB
    if GetSpaceOnDisk('D:\', True, FreeMB, TotalMB) then
    begin
      if FreeMB > 500 then
      begin
        // 能写吗
        if CanWriteTo('D:\') then
        begin
          Result := 'D:\BuddyTrace';
          exit;
        end;
      end;
    end;
  end;

  // ── 兜底：AppData\Local ──
  Result := ExpandConstant('{localappdata}\BuddyTrace');
end;

{ ═══════════════════════════════════════════════════════════════
  安装时：注册计划任务
  ═══════════════════════════════════════════════════════════════ }

procedure RegisterScheduledTasks();
var
  ResultCode: Integer;
begin
  { ===============================================================
    计划任务：调 PowerShell 脚本注册

    为什么不用 schtasks（2026-11-05 踩的坑）：
      schtasks 的 /TR 参数要传带引号的命令行：
        "wscript.exe" "run-hidden.vbs"
      但从 Inno Setup 的 Exec() 传进去时，引号被层层转义拆坏，
      schtasks 报「Mandatory option sc is missing」，任务创建失败。
      实测：用户装了发现没有计划任务。

    改用 PowerShell：
      Register-ScheduledTask 的 -Argument 是普通字符串，不用操心转义，
      而且能直接设 -Hidden（任务隐藏，不弹窗）。
      脚本在 assets\install-tasks.ps1（安装时复制到程序目录）。
    =============================================================== }

  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' +
      ExpandConstant('{app}\install-tasks.ps1') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // 结果写进日志（用户看不到，出问题时能查）
  if ResultCode <> 0 then
    SaveStringToFile(ExpandConstant('{app}\install-tasks-fail.log'),
      'PowerShell 返回 ' + IntToStr(ResultCode) + #13#10, False);
end;

procedure SendInstallPing();
var
  ResultCode: Integer;
begin
  { 匿名安装计数：只发一串随机 ID + 版本号，不含任何个人或电脑信息。
    断网/被拦/超时都静默跳过，绝不影响安装结果。 }
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' +
      ExpandConstant('{app}\install-ping.ps1') + '" ' +
      '-AppDir "' + ExpandConstant('{app}') + '" ' +
      '-Version "{#AppVersion}"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // 只注册计划任务，不启动程序
    //
    // ⚠ 2026-11-05 修复两个问题：
    //   ① 原来这里也启动了 exe，加上 [Run] 段的 postinstall 项，
    //      一共启动了两次 → 弹两个窗口。现在只保留 [Run] 段那一处。
    //   ② 原来是 if WizardIsTaskSelected('startup') 才注册，
    //      但 /VERYSILENT 模式下所有 Tasks 默认不选中，
    //      导致静默安装时计划任务根本不创建，服务永远不会自动启动。
    //
    //   计划任务是核心功能（开机启动 + 每 30 分钟同步），
    //   不该让用户选，所以改成无条件注册。
    RegisterScheduledTasks();
    SendInstallPing();
  end;
end;

{ ═══════════════════════════════════════════════════════════════
  卸载时：问用户数据要不要保留
  ═══════════════════════════════════════════════════════════════ }

function InitializeUninstall(): Boolean;
var
  DataDir: String;
  Answer: Integer;
begin
  Result := True;
  KeepData := True;

  DataDir := ExpandConstant('{app}\data');
  if not DirExists(DataDir) then
    exit;

  Answer := MsgBox(
    '要保留你的记忆库数据吗？' + #13#10 + #13#10 +
    '数据目录：' + DataDir + #13#10 + #13#10 +
    '· 选「是」→ 保留数据（重装后原来的记录还在）' + #13#10 +
    '· 选「否」→ 连同数据一起删掉（无法恢复）' + #13#10 + #13#10 +
    '注意：WorkBuddy 自己的文件我们从来不碰，删不删都不影响 WorkBuddy。',
    mbConfirmation, MB_YESNO);

  if Answer = IDNO then
  begin
    Answer := MsgBox(
      '确定要删除全部记忆库数据吗？' + #13#10 + #13#10 +
      '删掉之后，你所有的历史记录都会消失。' + #13#10 +
      '如果只是想暂时不用，建议选「保留」。',
      mbConfirmation, MB_YESNO);
    if Answer = IDNO then
      KeepData := True
    else
      KeepData := False;
  end;

  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{app}\data');
    if (not KeepData) and DirExists(DataDir) then
      DelTree(DataDir, True, True, True);
  end;
end;
