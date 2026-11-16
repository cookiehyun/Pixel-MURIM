Attribute VB_Name = "Online"
Option Explicit

' Online versus over the internet / LAN (docs/ONLINE.md, milestone M2: direct connection).
' The host opens UDP port NET_PORT and waits; the friend joins with the host's IP address.
' Host = left fighter (0), guest = right fighter (1).
'   lobby:  both pick a fighter (A = ready), the host picks the stage, the fight starts
'   fight:  Lockstep exchanges inputs; Game.GameTick runs a frame only when both are known
'   result: back to the lobby for a rematch; Esc leaves (BYE tells the other side)
' Messages (text):  HELLO <ver> | WELCOME <ver> | PICK <slot> <ready> | STAGE <k> |
'                   START <p1 slot> <p2 slot> <stage> <delay> | PING <t> | PONG <t> | BYE | I ... | H ...

Public Const NET_PORT As Long = 47700
Private Const PROTO As String = "PM2"

Private Const OS_OFF As Long = 0
Private Const OS_HOSTWAIT As Long = 1
Private Const OS_JOINING As Long = 2
Private Const OS_LOBBY As Long = 3
Private Const OS_FIGHT As Long = 4
Private Const OS_RESULT As Long = 5
Private Const OS_ERROR As Long = 6

Private Const ROSTER_ON As Long = 7         ' fighters on the online grid (6 + Cheonma)
Private Const SILENT_LIMIT As Long = 200    ' 10 s without a packet = connection lost

Private mState As Long
Private mHost As Boolean
Private mPeerIp As String
Private mPeerPort As Long
Private mT As Long                         ' ticks in the current state
Private mSilent As Long                    ' ticks since the last packet
Private mMsg As String                     ' error / status text
Private mMySlot As Long, mMyReady As Boolean
Private mPeerSlot As Long, mPeerReady As Boolean
Private mStage As Long
Private mStageChoosing As Boolean          ' host: both ready, choosing the stage
Private mRtt As Double                     ' smoothed round trip in ms (-1 = unknown)
Private mDelay As Long
Private mStartMsg As String                ' host: START message, repeated until the guest's inputs arrive
Private mHeardInput As Boolean
Private mResultT As Long
Private mTick As Long
Private mLocalIp As String                 ' host: this machine's address, looked up once

Public Property Get Active() As Boolean
    Active = (mState <> OS_OFF)
End Property

' 0 off, 1 host waiting, 2 joining, 3 lobby, 4 fight, 5 result, 6 error (harness / debugging)
Public Property Get StateCode() As Long
    StateCode = mState
End Property

Public Property Get ErrorText() As String
    ErrorText = mMsg
End Property

Public Property Get IsHost() As Boolean
    IsHost = mHost
End Property

Public Property Get Rtt() As Double
    Rtt = mRtt
End Property

' ---------------------------------------------------------------- start / stop

Public Sub BeginHost()
    Reset
    mHost = True
    If Not Net.OpenSocket(NET_PORT) Then
        Fail "CANNOT OPEN PORT " & NET_PORT, Net.LastError
        Exit Sub
    End If
    mLocalIp = Net.LocalIp()
    SetState OS_HOSTWAIT
End Sub

Public Sub BeginJoin(ByVal ip As String)
    Reset
    mHost = False
    ip = Trim$(ip)
    If Not Net.ValidIp(ip) Then
        Fail "NOT AN IP ADDRESS", ip
        Exit Sub
    End If
    If Not Net.OpenSocket(0) Then
        Fail "NETWORK ERROR", Net.LastError
        Exit Sub
    End If
    mPeerIp = ip
    mPeerPort = NET_PORT
    SetState OS_JOINING
End Sub

' Leave online play (Esc, error confirmed, or the other side left).
Public Sub Leave()
    Dim k As Long
    If mState <> OS_OFF And Len(mPeerIp) > 0 Then
        For k = 1 To 3
            Send "BYE"
        Next k
    End If
    Lockstep.Finish
    Net.CloseSocket
    mState = OS_OFF
    Game.GameState = GS_MENU
End Sub

Private Sub Reset()
    Lockstep.Finish
    mPeerIp = "": mPeerPort = 0: mMsg = ""
    mMySlot = 0: mMyReady = False: mPeerSlot = 1: mPeerReady = False
    mStage = 0: mStageChoosing = False
    mRtt = -1: mDelay = 3: mStartMsg = "": mHeardInput = False
    mSilent = 0
End Sub

Private Sub SetState(ByVal s As Long)
    mState = s
    mT = 0
    If s <> OS_FIGHT Then Game.GameState = GS_ONLINE
End Sub

Private Sub Fail(ByVal title As String, ByVal detail As String)
    Lockstep.Finish
    Net.CloseSocket
    mMsg = title & "|" & UCase$(detail)
    mState = OS_ERROR
    mT = 0
    Game.GameState = GS_ONLINE
End Sub

Private Sub Send(ByVal msg As String)
    Net.SendTo mPeerIp, mPeerPort, msg
End Sub

' ---------------------------------------------------------------- every game tick

' Read everything that arrived and react. Called at the start of every Game.GameTick while online.
Public Sub Pump()
    Dim msg As String, ip As String, port As Long, p() As String, n As Long
    mTick = mTick + 1
    mT = mT + 1
    mSilent = mSilent + 1
    If mState = OS_FIGHT Or mState = OS_RESULT Then Lockstep.TickHeard
    Do While Net.Receive(msg, ip, port)
        n = n + 1
        If n > 64 Then Exit Do
        p = Split(Trim$(msg), " ")
        If UBound(p) < 0 Then GoTo NextMsg
        If mState = OS_HOSTWAIT And p(0) = "HELLO" Then
            mPeerIp = ip: mPeerPort = port                 ' the guest found us: remember its address
        End If
        If Len(mPeerIp) = 0 Then GoTo NextMsg
        If ip <> mPeerIp Or port <> mPeerPort Then GoTo NextMsg  ' someone else: ignore
        mSilent = 0
        Handle p, msg
NextMsg:
    Loop
    If mState = OS_OFF Or mState = OS_ERROR Then Exit Sub
    If mState >= OS_LOBBY And mSilent > SILENT_LIMIT Then Fail "CONNECTION LOST", "NO DATA FOR 10 SECONDS"
End Sub

Private Sub Handle(ByVal p As Variant, ByVal raw As String)
    Select Case p(0)
    Case "HELLO"
        If mHost Then
            If UBound(p) < 1 Then Exit Sub
            If p(1) <> PROTO Then
                Send "WELCOME " & PROTO
                Fail "VERSION MISMATCH", "UPDATE BOTH COPIES OF THE GAME"
                Exit Sub
            End If
            Send "WELCOME " & PROTO
            If mState = OS_HOSTWAIT Then SetState OS_LOBBY
        End If
    Case "WELCOME"
        If Not mHost And mState = OS_JOINING Then
            If UBound(p) < 1 Then Exit Sub
            If p(1) <> PROTO Then
                Fail "VERSION MISMATCH", "UPDATE BOTH COPIES OF THE GAME"
                Exit Sub
            End If
            SetState OS_LOBBY
        End If
    Case "PICK"
        If UBound(p) >= 2 And mState = OS_LOBBY Then
            mPeerSlot = CLng(p(1)): mPeerReady = (p(2) = "1")
            If mPeerSlot < 0 Or mPeerSlot >= ROSTER_ON Then mPeerSlot = 0
        End If
    Case "STAGE"
        If UBound(p) >= 1 And Not mHost Then mStage = CLng(p(1)) Mod Data.StageCount
    Case "PING"
        If UBound(p) >= 1 Then Send "PONG " & p(1)
    Case "PONG"
        If UBound(p) >= 1 Then NoteRtt CDbl(p(1))
    Case "START"
        If Not mHost And UBound(p) >= 4 And (mState = OS_LOBBY Or mState = OS_RESULT) Then
            StartFight CLng(p(1)), CLng(p(2)), CLng(p(3)), CLng(p(4))
        End If
    Case "BYE"
        Fail "OPPONENT LEFT", ""
    Case "I", "H"
        If mState = OS_FIGHT Or mState = OS_RESULT Then
            If p(0) = "I" Then mHeardInput = True
            Lockstep.Receive raw
        End If
    End Select
End Sub

Private Sub NoteRtt(ByVal sentMs As Double)
    Dim r As Double
    r = NowMs() - sentMs
    If r < 0 Or r > 5000 Then Exit Sub
    If mRtt < 0 Then mRtt = r Else mRtt = mRtt * 0.8 + r * 0.2
End Sub

Private Function NowMs() As Double
    NowMs = Int(WinApi.NowSec() * 1000#)
    NowMs = NowMs - Int(NowMs / 1000000000#) * 1000000000#
End Function

' Lobby / waiting screens: input and periodic messages. Called by Game.GameTick in GS_ONLINE.
Public Sub LobbyTick()
    Select Case mState
    Case OS_HOSTWAIT
        If KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP) Then Leave
    Case OS_JOINING
        If mT Mod 10 = 1 Then Send "HELLO " & PROTO
        If mT > SILENT_LIMIT Then Fail "NO ANSWER", "IS THE HOST WAITING? SAME WI-FI OR TAILSCALE?"
        If KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP) Then Leave
    Case OS_LOBBY
        LobbyInput
        If mT Mod 5 = 1 Then Send "PICK " & mMySlot & " " & IIf(mMyReady, "1", "0")
        If mT Mod 10 = 3 Then Send "PING " & NowMs()
        If mHost And mStageChoosing And mT Mod 10 = 5 Then Send "STAGE " & mStage
    Case OS_RESULT
        mResultT = mResultT + 1
        SendFightPackets                                   ' the other side may still need our last inputs
        If mResultT >= 60 Then
            Lockstep.Finish
            mMyReady = False: mPeerReady = False: mStageChoosing = False
            SetState OS_LOBBY
        End If
    Case OS_ERROR
        If mT > 10 And (KeyInput.IsPressed(BTN_LP) Or KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP)) Then
            mState = OS_OFF
            Game.GameState = GS_MENU
        End If
    End Select
End Sub

Private Sub LobbyInput()
    Dim k As Long
    If KeyInput.IsPressed(BTN_QUIT) Then
        Leave
        Exit Sub
    End If
    If mStageChoosing Then                                  ' host, both ready
        If KeyInput.IsPressed(BTN_LEFT) Then mStage = (mStage + Data.StageCount - 1) Mod Data.StageCount
        If KeyInput.IsPressed(BTN_RIGHT) Then mStage = (mStage + 1) Mod Data.StageCount
        If KeyInput.IsPressed(BTN_HP) Then
            mStageChoosing = False
            mMyReady = False
        End If
        If KeyInput.IsPressed(BTN_LP) Then HostStart
        If Not mPeerReady Then mStageChoosing = False      ' the guest changed its mind
        Exit Sub
    End If
    If Not mMyReady Then
        k = mMySlot
        If KeyInput.IsPressed(BTN_LEFT) Then k = (k + ROSTER_ON - 1) Mod ROSTER_ON
        If KeyInput.IsPressed(BTN_RIGHT) Then k = (k + 1) Mod ROSTER_ON
        If KeyInput.IsPressed(BTN_UP) Or KeyInput.IsPressed(BTN_DOWN) Then
            k = (k + 4) Mod 8
            If k >= ROSTER_ON Then k = k - 4
        End If
        mMySlot = k
        If KeyInput.IsPressed(BTN_LP) And SlotOpen(k) Then mMyReady = True
    ElseIf KeyInput.IsPressed(BTN_HP) Then
        mMyReady = False
    End If
    If mHost And mMyReady And mPeerReady Then mStageChoosing = True
End Sub

' Cheonma needs the arcade clear on this machine; everyone else is always open.
Private Function SlotOpen(ByVal k As Long) As Boolean
    SlotOpen = (k < 6) Or Arcade.BossUnlocked
End Function

Private Sub HostStart()
    If mRtt < 0 Then mDelay = 3 Else mDelay = Int(mRtt / 50#) + 2
    If mDelay < 2 Then mDelay = 2
    If mDelay > 6 Then mDelay = 6
    mStartMsg = "START " & mMySlot & " " & mPeerSlot & " " & mStage & " " & mDelay
    Send mStartMsg
    StartFight mMySlot, mPeerSlot, mStage, mDelay
End Sub

Private Sub StartFight(ByVal p1 As Long, ByVal p2 As Long, ByVal stage As Long, ByVal delay As Long)
    Game.P1Char = Screens.RosterPrefix(p1)
    Game.P2Char = Screens.RosterPrefix(p2)
    Game.StageIndex = stage Mod Data.StageCount
    Game.GameMode = MODE_VSCPU
    Game.Multi = False
    Game.WatchMode = False
    Game.AutoRestart = False
    Game.StartMatch 0
    Fighter.SetControl IIf(mHost, 0, 1)
    mDelay = delay
    mHeardInput = False
    mResultT = 0
    Lockstep.Begin IIf(mHost, 0, 1), delay
    SetState OS_FIGHT
End Sub

' ---------------------------------------------------------------- during the fight

' Right after this tick's local input was captured: send it (and the latest hash).
Public Sub SendFightPackets()
    Dim s As String
    If Not Lockstep.Active Then Exit Sub
    Send Lockstep.OutPacket()
    s = Lockstep.OutHash()
    If Len(s) > 0 Then Send s
    If mHost And Not mHeardInput And mT Mod 10 = 0 And Len(mStartMsg) > 0 Then Send mStartMsg   ' START may have been lost
End Sub

' After a simulated frame: match over / desync.
Public Sub AfterFrame()
    If mState <> OS_FIGHT Then Exit Sub
    If Lockstep.DesyncFrame >= 0 Then
        Fail "SYNC ERROR", "THE TWO GAMES DIFFER FROM FRAME " & Lockstep.DesyncFrame
        Exit Sub
    End If
    If Match.Phase = MP_MATCHEND And Match.PhaseTicks >= 50 Then
        mState = OS_RESULT
        mResultT = 0
        Game.GameState = GS_ONLINE
    End If
End Sub

' Small overlay while fighting: ping / delay, and a note while waiting for the other side.
Public Sub RenderOverlay()
    Dim t As String
    If mRtt >= 0 Then t = "PING " & CLng(mRtt) & "MS  DELAY " & mDelay Else t = "DELAY " & mDelay
    PixelFont.DrawText t, SCREEN_W \ 2, 93, RGB(120, 110, 140), 1, 1
    If Lockstep.TicksSinceHeard > 10 Then PixelFont.DrawBig "WAITING FOR OPPONENT", SCREEN_W \ 2, 44, RGB(255, 236, 190), 1
End Sub

' ---------------------------------------------------------------- screens

Public Sub Render()
    Dim cx As Long, p() As String, k As Long, x As Long, y As Long, c As Long, t As String
    cx = SCREEN_W \ 2
    Renderer.BeginFrame True
    Renderer.FillRect 0, 0, SCREEN_W, SCREEN_H, RGB(12, 10, 22)
    Select Case mState
    Case OS_HOSTWAIT
        PixelFont.DrawBig "ONLINE HOST", cx, 4, RGB(240, 190, 80), 1
        PixelFont.DrawText "TELL YOUR FRIEND THIS ADDRESS", cx, 24, RGB(130, 120, 150), 1, 1
        PixelFont.DrawBig mLocalIp, cx, 34, RGB(255, 240, 210), 2
        PixelFont.DrawText "PORT " & NET_PORT & " (UDP)", cx, 54, RGB(130, 120, 150), 1, 1
        If (mT \ 10) Mod 2 = 0 Then PixelFont.DrawText "WAITING FOR A PLAYER...", cx, 68, RGB(255, 236, 190), 1, 1
        PixelFont.DrawText "S = CANCEL", cx, 92, RGB(110, 100, 130), 1, 1
    Case OS_JOINING
        PixelFont.DrawBig "ONLINE JOIN", cx, 4, RGB(240, 190, 80), 1
        PixelFont.DrawText "CONNECTING TO", cx, 28, RGB(130, 120, 150), 1, 1
        PixelFont.DrawBig mPeerIp, cx, 38, RGB(255, 240, 210), 2
        If (mT \ 10) Mod 2 = 0 Then PixelFont.DrawText "WAITING FOR THE HOST...", cx, 68, RGB(255, 236, 190), 1, 1
        PixelFont.DrawText "S = CANCEL", cx, 92, RGB(110, 100, 130), 1, 1
    Case OS_LOBBY
        LobbyRender
    Case OS_RESULT
        PixelFont.DrawBig "MATCH OVER", cx, 40, RGB(255, 204, 92), 2
        PixelFont.DrawText "BACK TO FIGHTER SELECT...", cx, 62, RGB(130, 120, 150), 1, 1
    Case OS_ERROR
        p = Split(mMsg, "|")
        PixelFont.DrawBig p(0), cx, 30, RGB(255, 90, 70), 1
        If UBound(p) >= 1 Then PixelFont.DrawText p(1), cx, 46, RGB(200, 190, 210), 1, 1
        PixelFont.DrawText "A = MENU", cx, 92, RGB(110, 100, 130), 1, 1
    End Select
    Renderer.Flush
End Sub

Private Sub LobbyRender()
    Dim cx As Long, k As Long, x As Long, y As Long, c As Long, me_ As Long, t As String, blink As Boolean
    cx = SCREEN_W \ 2
    blink = ((mT \ 5) Mod 2 = 0)
    Renderer.FillRect 0, 10, 64, 90, RGB(14, 20, 40)
    Renderer.FillRect 128, 10, 64, 90, RGB(40, 14, 18)
    Renderer.FillRect 63, 10, 1, 90, RGB(90, 170, 255)
    Renderer.FillRect 128, 10, 1, 90, RGB(255, 90, 80)
    PixelFont.DrawBig "ONLINE VERSUS", cx, 2, RGB(240, 190, 80), 1
    PixelFont.DrawText IIf(mHost, "YOU", "HOST"), 3, 13, RGB(90, 170, 255)
    PixelFont.DrawText IIf(mHost, "GUEST", "YOU"), SCREEN_W - 3, 13, RGB(255, 90, 80), 1, 2
    ' left = host's fighter, right = guest's
    Screens.DrawBigView Screens.RosterPrefix(IIf(mHost, mMySlot, mPeerSlot)), 32, False, 0, 63
    Screens.DrawBigView Screens.RosterPrefix(IIf(mHost, mPeerSlot, mMySlot)), 160, True, 129, SCREEN_W - 1, _
                        (mMySlot = mPeerSlot)
    If (mHost And mMyReady) Or (Not mHost And mPeerReady) Then PixelFont.DrawText "READY", 32, 20, RGB(255, 236, 190), 1, 1
    If (mHost And mPeerReady) Or (Not mHost And mMyReady) Then PixelFont.DrawText "READY", 160, 20, RGB(255, 236, 190), 1, 1
    ' grid: 4 + 3
    For k = 0 To ROSTER_ON - 1
        If k < 4 Then
            x = 64 + k * 16: y = 22
        Else
            x = 72 + (k - 4) * 16: y = 44
        End If
        If SlotOpen(k) Or k = mPeerSlot Then
            Screens.DrawPortraitAt k, x, y, 15
        Else
            Renderer.FillRect x, y, 15, 20, RGB(26, 22, 36)
            PixelFont.DrawBig "?", x + 8, y + 3, RGB(70, 64, 90), 2
        End If
        c = RGB(70, 60, 90)
        If k = mPeerSlot Then c = RGB(255, 90, 80)
        If k = mMySlot And (blink Or mMyReady) Then c = RGB(240, 190, 80)
        Renderer.DrawRectOutline x, y, 15, 20, c
        If k = mMySlot Then Renderer.DrawRectOutline x - 1, y - 1, 17, 22, c
    Next k
    PixelFont.DrawBig UCase$(Screens.RosterName(mMySlot)), cx, 68, RGB(255, 240, 210), 1
    If mStageChoosing Then
        t = "< " & UCase$(Data.StageName(mStage)) & " >"
        PixelFont.DrawText t, cx, 78, RGB(255, 236, 190), 1, 1
        PixelFont.DrawText "A = FIGHT  S = BACK", cx, 93, RGB(150, 140, 170), 1, 1
    ElseIf mMyReady And mPeerReady Then
        PixelFont.DrawText "HOST: " & UCase$(Data.StageName(mStage)), cx, 78, RGB(255, 236, 190), 1, 1
        PixelFont.DrawText "HOST IS CHOOSING THE STAGE", cx, 93, RGB(150, 140, 170), 1, 1
    ElseIf mMyReady Then
        PixelFont.DrawText "WAITING FOR OPPONENT", cx, 78, RGB(255, 236, 190), 1, 1
        PixelFont.DrawText "S = CHANGE", cx, 93, RGB(150, 140, 170), 1, 1
    Else
        PixelFont.DrawText "A = READY  ESC = LEAVE", cx, 93, RGB(150, 140, 170), 1, 1
    End If
    If mRtt >= 0 Then PixelFont.DrawText "PING " & CLng(mRtt) & "MS", cx, 86, RGB(110, 100, 130), 1, 1
End Sub
