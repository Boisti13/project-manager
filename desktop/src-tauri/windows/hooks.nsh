; Hooks for the Windows installer (bundle.windows.nsis.installerHooks), see
; https://v2.tauri.app/distribute/windows-installer/#installer-hooks

; Runs after every install and update.
!macro NSIS_HOOK_POSTINSTALL
  ; Updates only repoint an existing Start menu shortcut and never create
  ; one, so once it was gone the app stayed missing from Start and Windows
  ; search (2026-10-29). Put it back whenever it's missing (/NS: no shortcuts).
  ${If} $NoShortcutMode <> 1
    !if "${STARTMENUFOLDER}" != ""
      ${IfNot} ${FileExists} "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
        CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
        CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      ${EndIf}
    !else
      ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
        CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      ${EndIf}
    !endif
  ${EndIf}

  ; The installer offers "just for me" (%LOCALAPPDATA%) and "for all users"
  ; (Program Files). A copy in the other place stayed behind with its own Start
  ; menu entry and was never updated, so the app kept saying an update is
  ; available. Remove that other copy. Both keep their data in
  ; %LOCALAPPDATA%\<bundle id>, which the uninstaller leaves alone.
  StrCpy $R0 ""
  ${If} $MultiUser.InstallMode == "AllUsers"
    ReadRegStr $R0 HKCU "${UNINSTKEY}" "InstallLocation"
    ReadRegStr $R1 HKCU "${UNINSTKEY}" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 HKLM "${UNINSTKEY}" "InstallLocation"
    ReadRegStr $R1 HKLM "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ; InstallLocation is stored in quotes
  StrCpy $R2 $R0 1
  ${If} $R2 == '"'
    StrCpy $R0 $R0 -1 1
  ${EndIf}

  ${If} $R0 != ""
  ${AndIf} $R0 != $INSTDIR
  ${AndIf} ${FileExists} "$R0\uninstall.exe"
    ${If} $MultiUser.InstallMode == "AllUsers"
      ; The copy just for this user: no extra rights needed, so quietly.
      ; _?= runs the uninstaller in place, so ExecWait really waits.
      DetailPrint "Removing the copy of ${PRODUCTNAME} $R1 in $R0"
      ExecWait '"$R0\uninstall.exe" /S /CurrentUser _?=$R0'
      Delete "$R0\uninstall.exe"
      RMDir "$R0"
    ${ElseIfNot} ${Silent}
      ; The copy for all users needs administrator rights: ask first.
      ${If} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "${PRODUCTNAME} $R1 is also installed for all users ($R0). That copy would stay on its old version, and Windows shows both in the Start menu.$\n$\nRemove it now? Windows will ask for administrator rights. Your data is kept." IDYES`
        DetailPrint "Removing the copy of ${PRODUCTNAME} $R1 in $R0"
        ExecShellWait "runas" "$R0\uninstall.exe" "/S /AllUsers"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
