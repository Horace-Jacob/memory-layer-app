# ============================================================================
# REQUIRED INCLUDES
# ============================================================================
!include "WordFunc.nsh"
!insertmacro WordReplace

# ============================================================================
# Custom Install Macro
# ============================================================================
!macro customInstall
  DetailPrint "Registering native messaging host..."

  # Define variables
  !define HOST_NAME "com.memorylayer.native_host"
  !define EXTENSION_ID "lbifhofknjbeolifhcbdgfkejbejdmke"

  # Get AppData path
  ReadEnvStr $0 APPDATA
  StrCpy $1 "$0\memory-layer-desktop"

  # Create directory
  CreateDirectory "$1"

  # Create manifest JSON file
  FileOpen $2 "$1\native-host-manifest.json" w

  # Get native-host.exe path and convert backslashes to forward slashes
  StrCpy $3 "$INSTDIR\native-host.exe"
  ${WordReplace} $3 "\" "/" "+" $3

  # Write JSON
  FileWrite $2 '{$\r$\n'
  FileWrite $2 '  "name": "${HOST_NAME}",$\r$\n'
  FileWrite $2 '  "description": "MemoryLayer Desktop Native Messaging Host",$\r$\n'
  FileWrite $2 '  "path": "$3",$\r$\n'
  FileWrite $2 '  "type": "stdio",$\r$\n'
  FileWrite $2 '  "allowed_origins": [$\r$\n'
  FileWrite $2 '    "chrome-extension://${EXTENSION_ID}/"$\r$\n'
  FileWrite $2 '  ]$\r$\n'
  FileWrite $2 '}$\r$\n'

  FileClose $2

  # Register in Chrome (silently - no CMD window)
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\${HOST_NAME}" "" "$1\native-host-manifest.json"

  # Register in Edge (silently - no CMD window)
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\${HOST_NAME}" "" "$1\native-host-manifest.json"

  DetailPrint "Native messaging host registered"

!macroend

!macro customUnInstall
  DetailPrint "Unregistering native messaging host..."

  !define HOST_NAME "com.memorylayer.native_host"

  # Remove registry keys (silently)
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\${HOST_NAME}"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\${HOST_NAME}"

  # Remove manifest file
  ReadEnvStr $0 APPDATA
  Delete "$0\memory-layer-desktop\native-host-manifest.json"

  DetailPrint "Native messaging host unregistered"

!macroend
