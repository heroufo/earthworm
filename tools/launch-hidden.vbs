' ---------------------------------------------------------------
' launch-hidden.vbs  -  静默启动一个后台程序（不弹任何窗口）
'
' 参数： 1) 工作目录   2) 程序路径   3... 参数
' 用法： wscript //nologo launch-hidden.vbs "C:\app" "C:\app\node.exe" "server.mjs"
'
' 说明：WScript.Shell.Run 的第二个参数 0 = 窗口隐藏，
'       第三个参数 False = 不等待子进程退出。
' ---------------------------------------------------------------
Option Explicit
Dim args, workDir, cmd, i, sh

Set args = WScript.Arguments
If args.Count < 2 Then
    WScript.Echo "usage: launch-hidden.vbs <workdir> <exe> [args...]"
    WScript.Quit 1
End If

workDir = args(0)

' 每个参数单独加引号，路径带空格也不会出错
cmd = ""
For i = 1 To args.Count - 1
    cmd = cmd & """" & args(i) & """ "
Next

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = workDir
sh.Run cmd, 0, False
