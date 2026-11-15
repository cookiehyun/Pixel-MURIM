Attribute VB_Name = "WinApi"
Option Explicit

' OS wrappers that are not input related (Windows API, or libc on a Mac).
' (The test harness swaps this module for a stub.)
'   SleepMs        : Sleep, made accurate to ~1 ms while the game runs (timeBeginPeriod)
'   NowSec         : high resolution clock (QueryPerformanceCounter) in seconds
'   HighResTimer   : turn the 1 ms Windows timer resolution on / off

#If Mac Then
Private Declare PtrSafe Function usleep Lib "/usr/lib/libc.dylib" (ByVal microseconds As Long) As Long
Private Declare PtrSafe Function clock_gettime_nsec_np Lib "/usr/lib/libc.dylib" (ByVal clockId As Long) As LongLong
Private Const CLOCK_UPTIME_RAW As Long = 8
#ElseIf VBA7 Then
Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
Private Declare PtrSafe Function QueryPerformanceCounter Lib "kernel32" (ByRef lpCount As Currency) As Long
Private Declare PtrSafe Function QueryPerformanceFrequency Lib "kernel32" (ByRef lpFrequency As Currency) As Long
Private Declare PtrSafe Function timeBeginPeriod Lib "winmm" (ByVal uPeriod As Long) As Long
Private Declare PtrSafe Function timeEndPeriod Lib "winmm" (ByVal uPeriod As Long) As Long
#Else
Private Declare Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
Private Declare Function QueryPerformanceCounter Lib "kernel32" (ByRef lpCount As Currency) As Long
Private Declare Function QueryPerformanceFrequency Lib "kernel32" (ByRef lpFrequency As Currency) As Long
Private Declare Function timeBeginPeriod Lib "winmm" (ByVal uPeriod As Long) As Long
Private Declare Function timeEndPeriod Lib "winmm" (ByVal uPeriod As Long) As Long
#End If

Private mFreq As Currency
Private mHiRes As Boolean

Public Sub SleepMs(ByVal ms As Long)
    #If Mac Then
        If ms > 0 Then usleep ms * 1000
    #Else
        If ms > 0 Then Sleep ms
    #End If
End Sub

' Seconds from an arbitrary start, microsecond resolution (VBA's Timer is much coarser).
Public Function NowSec() As Double
    #If Mac Then
        NowSec = CDbl(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)) / 1000000000#
    #Else
        Dim c As Currency
        If mFreq = 0 Then QueryPerformanceFrequency mFreq
        QueryPerformanceCounter c
        NowSec = c / mFreq
    #End If
End Function

' Mac Excel runs in a sandbox and asks before touching each file. Ask for the folder, every
' file in it and keys.txt (written by the key config) in ONE "Grant File Access" dialog;
' Excel remembers the answer, so later runs ask nothing. Once per session. No-op on Windows.
Public Sub GrantFolderAccess(ByVal folder As String)
    #If Mac Then
        Static asked As Boolean
        Dim paths() As Variant, n As Long, f As String, hasKeys As Boolean
        If asked Then Exit Sub
        asked = True
        ReDim paths(0 To 0)
        paths(0) = folder
        n = 1
        f = Dir(folder & "/")
        Do While Len(f) > 0
            If Left$(f, 1) <> "." Then
                ReDim Preserve paths(0 To n)
                paths(n) = folder & "/" & f
                n = n + 1
                If LCase$(f) = "keys.txt" Then hasKeys = True
            End If
            f = Dir()
        Loop
        If Not hasKeys Then
            ReDim Preserve paths(0 To n)
            paths(n) = folder & "/keys.txt"
        End If
        On Error Resume Next
        GrantAccessToMultipleFiles paths
        On Error GoTo 0
    #End If
End Sub

Public Sub HighResTimer(ByVal turnOn As Boolean)
    #If Mac Then
        Exit Sub                         ' Mac sleep is already accurate
    #Else
    If turnOn And Not mHiRes Then
        timeBeginPeriod 1
        mHiRes = True
    ElseIf Not turnOn And mHiRes Then
        timeEndPeriod 1
        mHiRes = False
    End If
    #End If
End Sub
