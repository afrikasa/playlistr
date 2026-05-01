'' start_server.vbs — arranca o Playlistr em background (sem janela visível)
'' Usado pelo Task Scheduler no arranque do Windows.

Dim root, python, backend
root    = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
python  = "C:\Users\marcu\AppData\Local\Programs\Python\Python39\python.exe"
backend = root & "backend"

'' Libertar porta 8000 se já estiver ocupada
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":8000 ""') do taskkill /F /PID %a", 0, True

'' Iniciar uvicorn sem janela (0 = escondido, False = não esperar)
shell.Run """" & python & """ -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir """ & backend & """", 0, False
