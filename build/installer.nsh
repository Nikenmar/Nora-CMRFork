!macro customInit
  ; Older CMR builds call quitAndInstall() without the NSIS /S flag, but the
  ; updater still marks the installer launch with --updated. Force only those
  ; update installs to stay silent; manual installer launches remain assisted.
  ${if} ${isUpdated}
    SetSilent silent
  ${endif}
!macroend
