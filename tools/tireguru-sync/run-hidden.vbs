' Invisible launcher for scheduled robot tasks — no console window pops up,
' so nobody can accidentally kill a sync mid-run by closing it.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """" & WScript.Arguments(0) & """", 0, False
