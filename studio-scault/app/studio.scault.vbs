' Roda o iniciar-app.ps1 sem abrir janela de terminal.
' O atalho da area de trabalho aponta para este arquivo.
Dim sh, aqui
Set sh = CreateObject("WScript.Shell")
aqui = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & aqui & "iniciar-app.ps1""", 0, False
