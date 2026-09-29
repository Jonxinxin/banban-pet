!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时清除这台电脑上的伴伴设置、称呼与专属情话？$\r$\n选择“否”可在重新安装后继续使用原有内容。" /SD IDNO IDNO keepBanbanData
    SetShellVarContext current
    RMDir /r "$APPDATA\Banban"
  keepBanbanData:
!macroend
