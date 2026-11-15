Attribute VB_Name = "KeyInput"
Option Explicit

' Real-time keyboard input. Poll() once per logic tick, then query IsDown / IsPressed.
'   Windows: GetAsyncKeyState (user32).
'   Mac:     CGEventSourceKeyState (CoreGraphics). Keys are still stored as Windows virtual-key
'            codes everywhere (key config file, KeyName); MacCode() translates them.
'            Mac has no "tapped since last call" bit, so the game loop calls Sample() while it
'            waits between ticks to catch short taps.

#If Mac Then
Private Declare PtrSafe Function CGEventSourceKeyState Lib "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices" (ByVal stateID As Long, ByVal keyCode As Integer) As Long
Private Declare PtrSafe Function objc_getClass Lib "/usr/lib/libobjc.dylib" (ByVal className As String) As LongPtr
Private Declare PtrSafe Function sel_registerName Lib "/usr/lib/libobjc.dylib" (ByVal selName As String) As LongPtr
Private Declare PtrSafe Function objc_msgSend Lib "/usr/lib/libobjc.dylib" (ByVal obj As LongPtr, ByVal sel As LongPtr) As LongPtr
Private mNSApp As LongPtr
Private mSelActive As LongPtr
Private mLatch(0 To 32) As Boolean     ' 0 To BTN_COUNT - 1: key seen down by Sample() since the last Poll()
Private mMac1(0 To 255) As Long        ' Windows VK -> Mac key code (MacCode, cached)
Private mMac2(0 To 255) As Long
Private mMacReady As Boolean
' Mac only: set to False if Excel ever crashes when the game starts (skips the "is Excel in front" check)
Public Const MAC_FOCUS_CHECK As Boolean = True
#ElseIf VBA7 Then
Private Declare PtrSafe Function GetAsyncKeyState Lib "user32" (ByVal vKey As Long) As Integer
Private Declare PtrSafe Function GetForegroundWindow Lib "user32" () As LongPtr
Private Declare PtrSafe Function GetWindowThreadProcessId Lib "user32" (ByVal hwnd As LongPtr, ByRef lpdwProcessId As Long) As Long
Private Declare PtrSafe Function GetCurrentProcessId Lib "kernel32" () As Long
Private Declare PtrSafe Function GetWindowText Lib "user32" Alias "GetWindowTextA" (ByVal hwnd As LongPtr, ByVal lpString As String, ByVal cch As Long) As Long
#Else
Private Declare Function GetAsyncKeyState Lib "user32" (ByVal vKey As Long) As Integer
Private Declare Function GetForegroundWindow Lib "user32" () As Long
Private Declare Function GetWindowThreadProcessId Lib "user32" (ByVal hwnd As Long, ByRef lpdwProcessId As Long) As Long
Private Declare Function GetCurrentProcessId Lib "kernel32" () As Long
Private Declare Function GetWindowText Lib "user32" Alias "GetWindowTextA" (ByVal hwnd As Long, ByVal lpString As String, ByVal cch As Long) As Long
#End If

' Logical buttons
Public Const BTN_LEFT As Long = 0
Public Const BTN_RIGHT As Long = 1
Public Const BTN_UP As Long = 2
Public Const BTN_DOWN As Long = 3
Public Const BTN_LP As Long = 4   ' light punch
Public Const BTN_HP As Long = 5   ' heavy punch
Public Const BTN_LK As Long = 6   ' light kick
Public Const BTN_HK As Long = 7   ' heavy kick
Public Const BTN_QUIT As Long = 8
Public Const BTN_SWAP As Long = 9       ' debug: switch controlled fighter (Tab)
Public Const BTN_DBG_HIT As Long = 10   ' debug: hit the other fighter (H)
Public Const BTN_DBG_DOWN As Long = 11  ' debug: knock the other fighter down (J)
Public Const BTN_DBG_DUMMY As Long = 12 ' debug: toggle dummy attacks (D)
Public Const BTN_DBG_BOX As Long = 13   ' debug: toggle hitbox display (F1)
Public Const BTN_TAG As Long = 14         ' tag mode: switch fighters (C)
' multiplayer key sets (order: left right up down LP HP LK HK TAG), set by KeyConfig
'   defaults 1P: W A S D move + R T / F G attacks      2P: arrows move + K L / , . attacks
Public Const BTN_M1 As Long = 15          ' first button of the 1P multiplayer set (9 buttons, the 9th = tag)
Public Const BTN_M2 As Long = 24          ' first button of the 2P multiplayer set
Public Const BTN_COUNT As Long = 33

Private mVK(0 To BTN_COUNT - 1) As Long
Private mCur(0 To BTN_COUNT - 1) As Boolean
Private mPrev(0 To BTN_COUNT - 1) As Boolean
Private mPid As Long
Private mScanPrev(0 To 255) As Boolean
Private mHadFocus As Boolean
Private mFocusLost As Boolean

Public Sub Init()
    mVK(BTN_LEFT) = &H25    ' Left arrow
    mVK(BTN_UP) = &H26      ' Up arrow
    mVK(BTN_RIGHT) = &H27   ' Right arrow
    mVK(BTN_DOWN) = &H28    ' Down arrow
    mVK(BTN_LP) = &H41      ' A
    mVK(BTN_HP) = &H53      ' S
    mVK(BTN_LK) = &H5A      ' Z
    mVK(BTN_HK) = &H58      ' X
    mVK(BTN_QUIT) = &H1B    ' Esc
    mVK(BTN_SWAP) = &H9     ' Tab
    mVK(BTN_DBG_HIT) = &H48   ' H
    mVK(BTN_DBG_DOWN) = &H4A  ' J
    mVK(BTN_DBG_DUMMY) = &H44 ' D
    mVK(BTN_DBG_BOX) = &H70   ' F1
    mVK(BTN_TAG) = &H43       ' C
    ' multiplayer sets (BTN_M1 / BTN_M2) are filled by KeyConfig.Load
    #If Mac Then
        mPid = 0
    #Else
        mPid = GetCurrentProcessId()
    #End If
    mHadFocus = True
    mFocusLost = False

    Dim i As Long
    For i = 0 To BTN_COUNT - 1
        #If Mac Then
            mLatch(i) = False
        #Else
            GetAsyncKeyState mVK(i)   ' flush stale "pressed since last call" bits
        #End If
        mCur(i) = False
        mPrev(i) = False
    Next i
End Sub

Public Sub SetVK(ByVal b As Long, ByVal vk As Long)
    mVK(b) = vk
End Sub

Public Function GetVK(ByVal b As Long) As Long
    GetVK = mVK(b)
End Function

' Key config: the virtual key that went down since the previous call (0 = none). Mouse buttons ignored.
Public Function ScanKey() As Long
    Dim vk As Long, dn As Boolean
    For vk = 8 To 254
        dn = VKDown(vk)
        If dn And Not mScanPrev(vk) And ScanKey = 0 And AppHasFocus() Then ScanKey = vk
        mScanPrev(vk) = dn
    Next vk
End Function


' Button index of a logical control (0 left, 1 right, 2 up, 3 down, 4 LP, 5 HP, 6 LK, 7 HK)
' in key set ks (0 = single player arrows + A S Z X, 1 = multiplayer 1P, 2 = multiplayer 2P).
Public Function KeyOf(ByVal ks As Long, ByVal logical As Long) As Long
    Select Case ks
    Case 1: KeyOf = BTN_M1 + logical
    Case 2: KeyOf = BTN_M2 + logical
    Case Else: KeyOf = logical
    End Select
End Function

Public Sub Poll()
    Dim focused As Boolean, i As Long, s As Integer
    focused = AppHasFocus()
    mFocusLost = mHadFocus And Not focused       ' Excel just lost the foreground
    mHadFocus = focused
    For i = 0 To BTN_COUNT - 1
        mPrev(i) = mCur(i)
        If focused Then
            #If Mac Then
                mCur(i) = VKDown(mVK(i)) Or mLatch(i)
                mLatch(i) = False
            #Else
                s = GetAsyncKeyState(mVK(i))
                ' high bit = held now, low bit = tapped since last call (catches taps shorter than a tick)
                mCur(i) = ((s And &H8000) <> 0) Or ((s And 1) <> 0)
            #End If
        Else
            mCur(i) = False
        End If
    Next i
End Sub

' Called by the game loop while it waits for the next tick. Mac only (Windows keeps its own
' "tapped" bit): remembers keys that are down now so a tap shorter than a tick is not lost.
Public Sub Sample()
    #If Mac Then
        Dim i As Long
        For i = 0 To BTN_COUNT - 1
            If Not mLatch(i) Then mLatch(i) = VKDown(mVK(i))
        Next i
    #End If
End Sub

' Is this Windows virtual key held right now? (whole keyboard, focus not checked)
Private Function VKDown(ByVal vk As Long) As Boolean
    #If Mac Then
        Dim c1 As Long, c2 As Long, k As Long
        If Not mMacReady Then
            For k = 0 To 255
                MacCode k, mMac1(k), mMac2(k)
            Next k
            mMacReady = True
        End If
        If vk < 0 Or vk > 255 Then Exit Function
        c1 = mMac1(vk): c2 = mMac2(vk)
        If c1 >= 0 Then VKDown = ((CGEventSourceKeyState(0, c1) And &HFF) <> 0)
        If Not VKDown And c2 >= 0 Then VKDown = ((CGEventSourceKeyState(0, c2) And &HFF) <> 0)
    #Else
        VKDown = ((GetAsyncKeyState(vk) And &H8000) <> 0)
    #End If
End Function

' Windows virtual key -> Mac key code(s) (kVK_*). c2 is the second key for left/right modifiers.
' -1 = no Mac key.
Public Sub MacCode(ByVal vk As Long, ByRef c1 As Long, ByRef c2 As Long)
    c1 = -1: c2 = -1
    Select Case vk
    Case &H41 To &H5A        ' A..Z
        c1 = CLng(Split("0 11 8 2 14 3 5 4 34 38 40 37 46 45 31 35 12 15 1 17 32 9 13 7 16 6")(vk - &H41))
    Case &H30 To &H39        ' 0..9
        c1 = CLng(Split("29 18 19 20 21 23 22 26 28 25")(vk - &H30))
    Case &H60 To &H69        ' numpad 0..9
        c1 = CLng(Split("82 83 84 85 86 87 88 89 91 92")(vk - &H60))
    Case &H70 To &H7B        ' F1..F12
        c1 = CLng(Split("122 120 99 118 96 97 98 100 101 109 103 111")(vk - &H70))
    Case &H25: c1 = 123      ' left
    Case &H27: c1 = 124      ' right
    Case &H28: c1 = 125      ' down
    Case &H26: c1 = 126      ' up
    Case &H8: c1 = 51        ' backspace
    Case &H9: c1 = 48        ' tab
    Case &HD: c1 = 36        ' return
    Case &H1B: c1 = 53       ' esc
    Case &H20: c1 = 49       ' space
    Case &H14: c1 = 57       ' caps lock
    Case &H21: c1 = 116      ' page up
    Case &H22: c1 = 121      ' page down
    Case &H23: c1 = 119      ' end
    Case &H24: c1 = 115      ' home
    Case &H2E: c1 = 117      ' forward delete
    Case &H10: c1 = 56: c2 = 60    ' shift (either)
    Case &HA0: c1 = 56
    Case &HA1: c1 = 60
    Case &H11: c1 = 59: c2 = 62    ' control (either)
    Case &HA2: c1 = 59
    Case &HA3: c1 = 62
    Case &H12: c1 = 58: c2 = 61    ' option = alt (either)
    Case &HA4: c1 = 58
    Case &HA5: c1 = 61
    Case &H5B, &H5C: c1 = 55: c2 = 54   ' Windows key = command
    Case &HBA: c1 = 41       ' ;
    Case &HBB: c1 = 24       ' =
    Case &HBC: c1 = 43       ' ,
    Case &HBD: c1 = 27       ' -
    Case &HBE: c1 = 47       ' .
    Case &HBF: c1 = 44       ' /
    Case &HC0: c1 = 50       ' `
    Case &HDB: c1 = 33       ' [
    Case &HDC: c1 = 42       ' \
    Case &HDD: c1 = 30       ' ]
    Case &HDE: c1 = 39       ' '
    Case &H6A: c1 = 67       ' numpad *
    Case &H6B: c1 = 69       ' numpad +
    Case &H6D: c1 = 78       ' numpad -
    Case &H6E: c1 = 65       ' numpad .
    Case &H6F: c1 = 75       ' numpad /
    End Select
End Sub

' True on the one tick another window took the foreground (used for auto-pause).
Public Function FocusLost() As Boolean
    FocusLost = mFocusLost
End Function

Public Function IsDown(ByVal b As Long) As Boolean
    IsDown = mCur(b)
End Function

Public Function IsPressed(ByVal b As Long) As Boolean
    IsPressed = mCur(b) And Not mPrev(b)
End Function

Public Function HasFocus() As Boolean
    HasFocus = AppHasFocus()
End Function

' Ignore keys while another app is in front (GetAsyncKeyState is global).
' Counts as "Excel is in front" when the foreground window belongs to this Excel process,
' when Windows reports no foreground window for a moment (while switching), or when the
' window title says Excel (some setups report another process id for Excel's own window).
Private Function AppHasFocus() As Boolean
    #If Mac Then
        ' [NSApp isActive]: is Excel the frontmost app?
        If Not MAC_FOCUS_CHECK Then
            AppHasFocus = True
            Exit Function
        End If
        If mNSApp = 0 Then
            mNSApp = objc_msgSend(objc_getClass("NSApplication"), sel_registerName("sharedApplication"))
            mSelActive = sel_registerName("isActive")
        End If
        If mNSApp = 0 Or mSelActive = 0 Then
            AppHasFocus = True
        Else
            AppHasFocus = ((objc_msgSend(mNSApp, mSelActive) And &HFF) <> 0)
        End If
    #Else
    Dim pid As Long, t As String
    #If VBA7 Then
        Dim fg As LongPtr
    #Else
        Dim fg As Long
    #End If
    fg = GetForegroundWindow()
    If fg = 0 Then
        AppHasFocus = True
        Exit Function
    End If
    GetWindowThreadProcessId fg, pid
    If pid = mPid Then
        AppHasFocus = True
        Exit Function
    End If
    t = ForegroundTitle()
    AppHasFocus = (InStr(1, t, "Excel", vbTextCompare) > 0) Or (InStr(1, t, ThisWorkbook.Name, vbTextCompare) > 0)
    #End If
End Function

' Title of the window in front (shown in the status bar while the game waits for Excel).
Public Function ForegroundTitle() As String
    #If Mac Then
        ForegroundTitle = "another app"
    #Else
    Dim buf As String, n As Long
    buf = String$(256, vbNullChar)
    n = GetWindowText(GetForegroundWindow(), buf, 255)
    If n > 0 Then ForegroundTitle = Left$(buf, n)
    #End If
End Function
