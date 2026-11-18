Attribute VB_Name = "Online"
Option Explicit

' Online versus (docs/ONLINE.md).
'   direct (M2): the host opens UDP port NET_PORT and waits; the friend joins with the host's IP address
'   server (M3 / M4, server/): QUICK MATCH (ranked queue), room codes, ranking. The game server pairs
'           the players and relays every message below between them, so nobody needs an open port.
' Host = left fighter (0), guest = right fighter (1).
'   lobby:  both pick a fighter (A = ready), the host picks the stage, the fight starts
'   fight:  Lockstep exchanges inputs; Game.GameTick runs a frame only when both are known
'   result: back to the lobby for a rematch; Esc leaves (BYE tells the other side)
' Online fights are tag battles (each player picks 2 fighters, tag key C).
' Messages (text):  HELLO <ver> | WELCOME <ver> | PICK <cursor> <1st> <2nd> <step 0-2> | STAGE <k> |
'                   START <host 1st> <host 2nd> <guest 1st> <guest 2nd> <stage> <delay> |
'                   PING <t> | PONG <t> | BYE | I ... | H ...

Public Const NET_PORT As Long = 47700
Private Const PROTO As String = "PM4"                 ' direct: tag teams (PM2 was 1 vs 1)

Private Const OS_OFF As Long = 0
Private Const OS_HOSTWAIT As Long = 1
Private Const OS_JOINING As Long = 2
Private Const OS_LOBBY As Long = 3
Private Const OS_FIGHT As Long = 4
Private Const OS_RESULT As Long = 5
Private Const OS_ERROR As Long = 6
Private Const OS_SRV_CONNECT As Long = 7    ' server: logging in
Private Const OS_ROOMWAIT As Long = 8       ' server: room made, waiting for the friend (or joining one)
Private Const OS_QUEUE As Long = 9          ' server: quick match search
Private Const OS_RANKING As Long = 10       ' server: top 10 screen

Public Const DEFAULT_SERVER As String = "161.33.45.170"   ' Pixel Murim game server (profile.txt "server=" overrides)
Private Const SRV_PROTO As String = "PM4"
Private Const GAME_BUILD As Long = 20261118          ' bump whenever fighting code changes: both players must match
Private Const ACT_QUICK As Long = 1, ACT_ROOM As Long = 2, ACT_JOINROOM As Long = 3, ACT_TOP As Long = 4
Private Const PROFILE_FILE As String = "profile.txt"

Private Const ROSTER_ON As Long = 7         ' fighters on the online grid (6 + Cheonma)
Private Const SILENT_LIMIT As Long = 200    ' 10 s without a packet = connection lost

Private mState As Long
Private mHost As Boolean
Private mPeerIp As String
Private mPeerPort As Long
Private mT As Long                         ' ticks in the current state
Private mSilent As Long                    ' ticks since the last packet
Private mMsg As String                     ' error / status text
Private mMySlot As Long, mMyReady As Boolean          ' my cursor; ready = both fighters picked
Private mPeerSlot As Long, mPeerReady As Boolean
Private mMyPick(0 To 1) As Long, mMyStep As Long      ' tag team: step 0 = picking the 1st, 1 = the 2nd, 2 = done
Private mPeerPick(0 To 1) As Long, mPeerStep As Long
Private mStage As Long
Private mStageChoosing As Boolean          ' host: both ready, choosing the stage
Private mRtt As Double                     ' smoothed round trip in ms (-1 = unknown)
Private mDelay As Long
Private mStartMsg As String                ' host: START message, repeated until the guest's inputs arrive
Private mHeardInput As Boolean
Private mResultT As Long
Private mTick As Long
Private mLocalIp As String                 ' host: this machine's address, looked up once
Private mServer As Boolean                 ' talking to the game server (else directly to the friend)
Private mAction As Long                    ' what to do once logged in (ACT_*)
Private mRoomCode As String
Private mMatchId As Long
Private mRanked As Boolean
Private mOppName As String
Private mOppRating As Long
Private mRating As Long, mGames As Long    ' my rating / ranked games (from the server)
Private mRatingDelta As String             ' "+16" after a ranked game, "" = none yet
Private mGameNo As Long                    ' games played in this match (result reports)
Private mTopN As Long, mMyRank As Long
Private mTopName(0 To 9) As String, mTopRating(0 To 9) As Long
Private mName As String, mToken As String, mServerIp As String   ' profile.txt (Data.UserFilePath)

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

' Harness / debugging: "rating <r> <change> games <n> match <id> game <n>"
Public Property Get ServerInfo() As String
    ServerInfo = "rating " & mRating & " " & mRatingDelta & " games " & mGames & " match " & mMatchId & " game " & mGameNo & _
                 " room " & mRoomCode & " opp " & mOppName & " top " & mTopN & " rank " & mMyRank
End Property

Public Property Get IsHost() As Boolean
    IsHost = mHost
End Property

Public Property Get Rtt() As Double
    Rtt = mRtt
End Property

' ---------------------------------------------------------------- start / stop

' Server modes. Each logs in first (asking for a fighter name the very first time).
Public Sub BeginQuickMatch()
    BeginServer ACT_QUICK, ""
End Sub

Public Sub BeginRoomCreate()
    BeginServer ACT_ROOM, ""
End Sub

Public Sub BeginRoomJoin(ByVal code As String)
    BeginServer ACT_JOINROOM, code
End Sub

Public Sub BeginRanking()
    BeginServer ACT_TOP, ""
End Sub

Private Sub BeginServer(ByVal action As Long, ByVal code As String)
    Reset
    If Not EnsureProfile() Then
        mState = OS_OFF
        Game.GameState = GS_MENU
        Exit Sub
    End If
    mServer = True
    mAction = action
    mRoomCode = UCase$(Trim$(code))
    mHost = False
    If Not Net.OpenSocket(0) Then
        Fail "NETWORK ERROR", Net.LastError
        Exit Sub
    End If
    mPeerIp = mServerIp
    mPeerPort = NET_PORT
    If Not Net.ConnectTo(mPeerIp, mPeerPort) Then
        Fail "NETWORK ERROR", Net.LastError
        Exit Sub
    End If
    SetState OS_SRV_CONNECT
End Sub

' Fighter name + secret token (identifies this player to the server), in profile.txt (Data.UserFilePath).
Private Function EnsureProfile() As Boolean
    Dim lines As Variant, k As Long, ln As String, n As String
    If Len(mToken) = 0 Then
        mServerIp = DEFAULT_SERVER
        On Error Resume Next
        lines = Data.ReadUserLines(PROFILE_FILE)
        If Err.Number = 0 Then
            For k = LBound(lines) To UBound(lines)
                ln = Trim$(lines(k))
                If LCase$(Left$(ln, 5)) = "name=" Then mName = Mid$(ln, 6)
                If LCase$(Left$(ln, 6)) = "token=" Then mToken = Mid$(ln, 7)
                If LCase$(Left$(ln, 7)) = "server=" And Net.ValidIp(Mid$(ln, 8)) Then mServerIp = Mid$(ln, 8)
            Next k
        End If
        Err.Clear
        On Error GoTo 0
    End If
    If Len(mName) = 0 Then
        n = CleanName(InputBox("Your fighter name for online play (letters and numbers, up to 10):", "Pixel Murim Online", ""))
        KeyInput.Init
        If Len(n) = 0 Then Exit Function
        mName = n
    End If
    If Len(mToken) < 16 Then mToken = NewToken()
    SaveProfile
    EnsureProfile = True
End Function

' Harness: profile without the input box or the file.
Public Sub SetProfile(ByVal nm As String, ByVal token As String, ByVal serverIp As String)
    mName = CleanName(nm): mToken = token: mServerIp = serverIp
End Sub

Private Function CleanName(ByVal s As String) As String
    Dim k As Long, c As String
    s = UCase$(s)
    For k = 1 To Len(s)
        c = Mid$(s, k, 1)
        If (c >= "A" And c <= "Z") Or (c >= "0" And c <= "9") Then CleanName = CleanName & c
    Next k
    If Len(CleanName) > 10 Then CleanName = Left$(CleanName, 10)
End Function

Private Function NewToken() As String
    Dim k As Long, set_ As String
    set_ = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    Randomize
    For k = 1 To 24
        NewToken = NewToken & Mid$(set_, 1 + Int(Rnd * Len(set_)), 1)
    Next k
End Function

Private Sub SaveProfile()
    Dim f As Integer
    On Error Resume Next
    f = FreeFile
    Open Data.UserFilePath(PROFILE_FILE) For Output As #f
    Print #f, "name=" & mName
    Print #f, "token=" & mToken
    If mServerIp <> DEFAULT_SERVER Then Print #f, "server=" & mServerIp
    Close #f
    On Error GoTo 0
End Sub

Public Sub BeginHost()
    Reset
    mHost = True
    If Not Net.OpenSocket(NET_PORT) Then
        #If Mac Then
            ' Mac Excel's sandbox does not let it accept incoming connections: hosting a direct game is impossible
            Fail "MAC CANNOT HOST A DIRECT GAME", "USE ROOM CODE INSTEAD (OR HOST ON WINDOWS)  " & Net.LastError
        #Else
            Fail "CANNOT OPEN PORT " & NET_PORT, Net.LastError
        #End If
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
    If Not Net.ConnectTo(mPeerIp, mPeerPort) Then
        Fail "NETWORK ERROR", Net.LastError
        Exit Sub
    End If
    SetState OS_JOINING
End Sub

' Leave online play (Esc, error confirmed, or the other side left).
Public Sub Leave()
    Dim k As Long
    If mState <> OS_OFF And Len(mPeerIp) > 0 Then
        For k = 1 To 3
            If mServer Then
                Send "LEAVE"                               ' the server tells the partner (BYE)
            Else
                Send "BYE"
            End If
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
    mMyStep = 0: mPeerStep = 0: mMyPick(0) = 0: mMyPick(1) = 1: mPeerPick(0) = 1: mPeerPick(1) = 0
    mStage = 0: mStageChoosing = False
    mRtt = -1: mDelay = 3: mStartMsg = "": mHeardInput = False
    mSilent = 0
    mServer = False: mAction = 0: mRoomCode = "": mMatchId = 0: mRanked = False
    mOppName = "": mOppRating = 0: mRatingDelta = "": mGameNo = 0: mTopN = 0: mMyRank = 0
End Sub

Private Sub SetState(ByVal s As Long)
    mState = s
    mT = 0
    If s <> OS_FIGHT Then Game.GameState = GS_ONLINE
End Sub

Private Sub Fail(ByVal title As String, ByVal detail As String)
    If mServer And Len(mPeerIp) > 0 Then Send "LEAVE"
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

' Version tag sent in the lobby: the build number plus a checksum of the move data, so two copies
' with different moves.txt (or different code builds) refuse to start instead of desyncing.
Public Function BuildTag() As String
    Dim k As Long, h As Double
    h = GAME_BUILD
    For k = 0 To Data.MvCount - 1
        h = Fighter.HashMix(h, Data.MvStartup(k) + 37 * Data.MvActive(k) + 1009 * Data.MvRecovery(k))
        h = Fighter.HashMix(h, Data.MvDamage(k) + 31 * Data.MvHitstun(k) + 997 * Data.MvBlockstun(k))
        h = Fighter.HashMix(h, Data.MvHbX(k) + 7 * Data.MvHbY(k) + 101 * Data.MvHbW(k) + 1013 * Data.MvHbH(k))
        h = Fighter.HashMix(h, Data.MvType(k) + 17 * Data.MvLevel(k) + 409 * Data.MvCost(k))
        h = Fighter.HashMix(h, CLng(Data.MvP1(k) * 10) + 503 * CLng(Data.MvP2(k) * 10))
    Next k
    BuildTag = GAME_BUILD & "-" & Hex$(CLng(h))
End Function

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
    If mSilent > SILENT_LIMIT And mState <> OS_HOSTWAIT And mState <> OS_JOINING And mState <> OS_SRV_CONNECT Then
        If mServer And mState <> OS_LOBBY And mState <> OS_FIGHT And mState <> OS_RESULT Then
            Fail "SERVER NOT RESPONDING", "NO ANSWER FOR 10 SECONDS  " & Net.Diag()
        Else
            Fail "CONNECTION LOST", "NO DATA FOR 10 SECONDS"
        End If
    End If
End Sub

Private Sub Handle(ByVal p As Variant, ByVal raw As String)
    If mServer Then
        If HandleServer(p) Then Exit Sub
    End If
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
        If Not mServer And Not mHost And mState = OS_JOINING Then
            If UBound(p) < 1 Then Exit Sub
            If p(1) <> PROTO Then
                Fail "VERSION MISMATCH", "UPDATE BOTH COPIES OF THE GAME"
                Exit Sub
            End If
            SetState OS_LOBBY
        End If
    Case "PICK"
        If UBound(p) >= 2 And mState = OS_LOBBY Then
            ' PICK <cursor> <1st> <2nd> <step>
            If UBound(p) >= 4 Then
                mPeerSlot = ClampSlot(CLng(p(1))): mPeerPick(0) = ClampSlot(CLng(p(2))): mPeerPick(1) = ClampSlot(CLng(p(3)))
                mPeerStep = CLng(p(4))
                mPeerReady = (mPeerStep >= 2)
            End If
            ' different game versions desync on the first frame: stop here with a clear message
            If UBound(p) < 5 Then
                Fail "UPDATE NEEDED", "THE OTHER PLAYER HAS AN OLD VERSION|BOTH GET THE LATEST ZIP AND IMPORT"
                Exit Sub
            ElseIf p(5) <> BuildTag() Then
                Fail "UPDATE NEEDED", "YOUR GAME VERSIONS DIFFER|BOTH GET THE LATEST ZIP AND IMPORT"
                Exit Sub
            End If
        End If
    Case "STAGE"
        If UBound(p) >= 1 And Not mHost Then mStage = CLng(p(1)) Mod Data.StageCount
    Case "PING"
        If UBound(p) >= 1 Then Send "PONG " & p(1)
    Case "PONG"
        If UBound(p) >= 1 Then NoteRtt CDbl(p(1))
    Case "START"
        If Not mHost And UBound(p) >= 6 And (mState = OS_LOBBY Or mState = OS_RESULT) Then
            StartFight ClampSlot(CLng(p(1))), ClampSlot(CLng(p(2))), ClampSlot(CLng(p(3))), ClampSlot(CLng(p(4))), CLng(p(5)), CLng(p(6))
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

' Messages from the game server itself (everything else is the partner's, relayed). True = handled.
Private Function HandleServer(ByVal p As Variant) As Boolean
    Dim k As Long
    HandleServer = True
    Select Case p(0)
    Case "WELCOME"
        If mState <> OS_SRV_CONNECT Or UBound(p) < 3 Then Exit Function
        mRating = CLng(p(2)): mGames = CLng(p(3))
        Select Case mAction
        Case ACT_QUICK
            Send "QUEUE"
            SetState OS_QUEUE
        Case ACT_ROOM
            Send "ROOM"
            SetState OS_ROOMWAIT
        Case ACT_JOINROOM
            Send "JOINROOM " & mRoomCode
            SetState OS_ROOMWAIT
        Case Else
            Send "TOP"
            SetState OS_RANKING
        End Select
    Case "ROOMCODE"
        If UBound(p) >= 1 Then mRoomCode = p(1)
    Case "QUEUED", "KEPT"
    Case "NOROOM"
        Fail "NO SUCH ROOM", "CHECK THE CODE " & mRoomCode
    Case "ERROR"
        If UBound(p) >= 1 Then
            If p(1) = "VERSION" Then
                Fail "UPDATE THE GAME", "THE SERVER RUNS A NEWER VERSION"
            Else
                Fail "SERVER REFUSED", p(1)
            End If
        End If
    Case "MATCHED"
        If UBound(p) < 5 Then Exit Function
        mMatchId = CLng(p(1)): mHost = (p(2) = "0"): mRanked = (p(3) = "1")
        mOppName = p(4): mOppRating = CLng(p(5))
        mGameNo = 0: mRatingDelta = ""
        mMyReady = False: mPeerReady = False: mStageChoosing = False
        mMyStep = 0: mPeerStep = 0
        mPeerSlot = IIf(mMySlot = 1, 0, 1)
        SetState OS_LOBBY
    Case "RATING"
        If UBound(p) >= 2 Then mRating = CLng(p(1)): mRatingDelta = p(2): mGames = mGames + 1
    Case "TOP"
        If UBound(p) < 1 Then Exit Function
        mTopN = CLng(p(1))
        If mTopN > 10 Then mTopN = 10
        For k = 0 To mTopN - 1
            If 3 + k * 2 <= UBound(p) Then mTopName(k) = p(2 + k * 2): mTopRating(k) = CLng(p(3 + k * 2))
        Next k
        For k = 2 To UBound(p) - 1
            If p(k) = "ME" And k + 3 <= UBound(p) Then
                mMyRank = CLng(p(k + 1)): mRating = CLng(p(k + 2)): mGames = CLng(p(k + 3))
            End If
        Next k
    Case Else
        HandleServer = False                                ' the partner's message
    End Select
End Function

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
    If mServer And mState <> OS_ERROR And mT Mod 40 = 20 Then Send "KEEP"   ' stay logged in on the server
    Select Case mState
    Case OS_SRV_CONNECT
        If mT Mod 10 = 1 Then Send "HELLO " & SRV_PROTO & " " & mName & " " & mToken
        If mT > SILENT_LIMIT Then Fail "SERVER NOT RESPONDING", mServerIp & "  " & Net.Diag()
        If KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP) Then Leave
    Case OS_ROOMWAIT, OS_QUEUE
        If KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP) Then Leave
    Case OS_RANKING
        If mT Mod 100 = 0 Then Send "TOP"
        If mT > 5 And (KeyInput.IsPressed(BTN_LP) Or KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP)) Then Leave
    Case OS_HOSTWAIT
        If KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP) Then Leave
    Case OS_JOINING
        If mT Mod 10 = 1 Then Send "HELLO " & PROTO
        If mT > SILENT_LIMIT Then Fail "NO ANSWER", "IS THE HOST WAITING? SAME WI-FI OR TAILSCALE?"
        If KeyInput.IsPressed(BTN_QUIT) Or KeyInput.IsPressed(BTN_HP) Then Leave
    Case OS_LOBBY
        LobbyInput
        If mT Mod 5 = 1 Then Send "PICK " & mMySlot & " " & mMyPick(0) & " " & mMyPick(1) & " " & mMyStep & " " & BuildTag()
        If mT Mod 10 = 3 Then Send "PING " & NowMs()
        If mHost And mStageChoosing And mT Mod 10 = 5 Then Send "STAGE " & mStage
    Case OS_RESULT
        mResultT = mResultT + 1
        SendFightPackets                                   ' the other side may still need our last inputs
        ' server: report who won (3 times: a lost packet must not lose the result; the server counts it once)
        If mServer And (mResultT = 1 Or mResultT = 6 Or mResultT = 11) Then
            Send "RESULT " & mMatchId & " " & mGameNo & " " & Match.MatchWinner
        End If
        If mResultT >= IIf(mRanked, 80, 60) Then
            Lockstep.Finish
            mMyReady = False: mPeerReady = False: mStageChoosing = False
            mMyStep = 0: mPeerStep = 0: mMySlot = mMyPick(0)     ' rematch: pick again, cursor on the last team
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
    Dim k As Long, n As Long
    Screens.TickMenu                                        ' blinking arrows on the stage page
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
            mMyStep = 1
        End If
        If KeyInput.IsPressed(BTN_LP) Then HostStart
        If Not mPeerReady Then mStageChoosing = False      ' the guest changed its mind
        Exit Sub
    End If
    If mMyStep < 2 Then                                     ' pick the tag team: 1st fighter, then the 2nd
        k = mMySlot
        n = OpenCount()
        If k >= n Then k = 0
        If KeyInput.IsPressed(BTN_LEFT) Then k = (k + n - 1) Mod n
        If KeyInput.IsPressed(BTN_RIGHT) Then k = (k + 1) Mod n
        If KeyInput.IsPressed(BTN_UP) Or KeyInput.IsPressed(BTN_DOWN) Then
            k = (k + 4) Mod 8
            If k >= n Then k = k - 4
        End If
        mMySlot = k
        If KeyInput.IsPressed(BTN_LP) And SlotOpen(k) And Not (mMyStep = 1 And k = mMyPick(0)) Then
            mMyPick(mMyStep) = k
            mMyStep = mMyStep + 1
        ElseIf KeyInput.IsPressed(BTN_HP) And mMyStep > 0 Then
            mMyStep = mMyStep - 1
        End If
    ElseIf KeyInput.IsPressed(BTN_HP) Then
        mMyStep = 1
    End If
    mMyReady = (mMyStep >= 2)
    If mHost And mMyReady And mPeerReady Then mStageChoosing = True
End Sub

' Fighters on this machine's grid: the six, plus Cheonma once arcade is cleared here.
Private Function OpenCount() As Long
    If Arcade.BossUnlocked Then OpenCount = ROSTER_ON Else OpenCount = ROSTER_ON - 1
End Function

' Grid position of slot k: 4 on top, the rest centred below.
Private Sub GridPos(ByVal k As Long, ByRef x As Long, ByRef y As Long)
    Dim below As Long
    If k < 4 Then
        x = 64 + k * 16: y = 22
    Else
        below = OpenCount() - 4
        x = 64 + (4 - below) * 8 + (k - 4) * 16: y = 44
    End If
End Sub

Private Function ClampSlot(ByVal k As Long) As Long
    If k < 0 Or k >= ROSTER_ON Then ClampSlot = 0 Else ClampSlot = k
End Function

' Cheonma needs the arcade clear on this machine; everyone else is always open.
Private Function SlotOpen(ByVal k As Long) As Boolean
    SlotOpen = (k < 6) Or Arcade.BossUnlocked
End Function

Private Sub HostStart()
    If mRtt < 0 Then mDelay = 3 Else mDelay = Int(mRtt / 50#) + 2
    If mDelay < 2 Then mDelay = 2
    If mDelay > 6 Then mDelay = 6
    mStartMsg = "START " & mMyPick(0) & " " & mMyPick(1) & " " & mPeerPick(0) & " " & mPeerPick(1) & " " & mStage & " " & mDelay
    Send mStartMsg
    StartFight mMyPick(0), mMyPick(1), mPeerPick(0), mPeerPick(1), mStage, mDelay
End Sub

' Online fights are always tag battles: host's team on the left (h1 starts), guest's on the right.
Private Sub StartFight(ByVal h1 As Long, ByVal h2 As Long, ByVal g1 As Long, ByVal g2 As Long, ByVal stage As Long, ByVal delay As Long)
    Game.P1Char = Screens.RosterPrefix(h1): Game.P1Char2 = Screens.RosterPrefix(h2)
    Game.P2Char = Screens.RosterPrefix(g1): Game.P2Char2 = Screens.RosterPrefix(g2)
    Game.StageIndex = stage Mod Data.StageCount
    Game.GameMode = MODE_TAG
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
        Fail "SYNC ERROR", "THE TWO GAMES DIFFER FROM FRAME " & Lockstep.DesyncFrame & "|" & Lockstep.DesyncDetail
        Exit Sub
    End If
    If Match.Phase = MP_MATCHEND And Match.PhaseTicks >= 50 Then
        mState = OS_RESULT
        mResultT = 0
        mGameNo = mGameNo + 1
        mRatingDelta = ""
        Game.GameState = GS_ONLINE
    End If
End Sub

' Overlay while fighting: ping / delay for the first seconds, and a note while waiting for the other side.
Public Sub RenderOverlay()
    Dim t As String
    If Lockstep.Frame < 80 Then                             ' bottom line is the HUD's later on (MAX labels)
        If mRtt >= 0 Then t = "PING " & CLng(mRtt) & "MS  DELAY " & mDelay Else t = "DELAY " & mDelay
        PixelFont.DrawText t, SCREEN_W \ 2, 93, RGB(120, 110, 140), 1, 1
    End If
    If Lockstep.TicksSinceHeard > 10 Then PixelFont.DrawBig "WAITING FOR OPPONENT", SCREEN_W \ 2, 44, RGB(255, 236, 190), 1
End Sub

' ---------------------------------------------------------------- screens

Public Sub Render()
    Dim cx As Long, p() As String, k As Long, x As Long, y As Long, c As Long, t As String
    cx = SCREEN_W \ 2
    Renderer.BeginFrame True
    Renderer.FillRect 0, 0, SCREEN_W, SCREEN_H, RGB(12, 10, 22)
    Select Case mState
    Case OS_SRV_CONNECT
        PixelFont.DrawBig "ONLINE", cx, 4, RGB(240, 190, 80), 1
        If (mT \ 10) Mod 2 = 0 Then PixelFont.DrawText "CONNECTING TO THE SERVER...", cx, 44, RGB(255, 236, 190), 1, 1
        PixelFont.DrawText "S = CANCEL", cx, 92, RGB(110, 100, 130), 1, 1
    Case OS_ROOMWAIT
        If mAction = ACT_JOINROOM Then
            PixelFont.DrawBig "JOIN ROOM", cx, 4, RGB(240, 190, 80), 1
            PixelFont.DrawText "JOINING ROOM", cx, 30, RGB(130, 120, 150), 1, 1
            PixelFont.DrawBig mRoomCode, cx, 40, RGB(255, 240, 210), 3
        Else
            PixelFont.DrawBig "ROOM", cx, 4, RGB(240, 190, 80), 1
            PixelFont.DrawText "TELL YOUR FRIEND THIS CODE", cx, 24, RGB(130, 120, 150), 1, 1
            If Len(mRoomCode) > 0 Then PixelFont.DrawBig mRoomCode, cx, 36, RGB(255, 240, 210), 3
            PixelFont.DrawText "ONLINE > ROOM CODE > JOIN ROOM", cx, 62, RGB(130, 120, 150), 1, 1
            If (mT \ 10) Mod 2 = 0 Then PixelFont.DrawText "WAITING FOR YOUR FRIEND...", cx, 74, RGB(255, 236, 190), 1, 1
        End If
        PixelFont.DrawText "S = CANCEL", cx, 92, RGB(110, 100, 130), 1, 1
    Case OS_QUEUE
        PixelFont.DrawBig "QUICK MATCH", cx, 4, RGB(240, 190, 80), 1
        PixelFont.DrawText mName & "  RATING " & mRating, cx, 26, RGB(200, 190, 210), 1, 1
        If (mT \ 10) Mod 2 = 0 Then PixelFont.DrawText "SEARCHING FOR AN OPPONENT...", cx, 44, RGB(255, 236, 190), 1, 1
        PixelFont.DrawText CStr(mT \ 20) & " S", cx, 56, RGB(130, 120, 150), 1, 1
        PixelFont.DrawText "S = CANCEL", cx, 92, RGB(110, 100, 130), 1, 1
    Case OS_RANKING
        RankingRender
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
        PixelFont.DrawBig "MATCH OVER", cx, 34, RGB(255, 204, 92), 2
        If mRanked Then
            If Len(mRatingDelta) > 0 Then
                PixelFont.DrawBig "RATING " & mRating & " (" & mRatingDelta & ")", cx, 54, _
                                  IIf(Left$(mRatingDelta, 1) = "-", RGB(255, 110, 90), RGB(120, 230, 140)), 1
            Else
                PixelFont.DrawText "SENDING RESULT...", cx, 56, RGB(130, 120, 150), 1, 1
            End If
        End If
        PixelFont.DrawText "BACK TO FIGHTER SELECT...", cx, 70, RGB(130, 120, 150), 1, 1
    Case OS_ERROR
        p = Split(mMsg, "|")
        PixelFont.DrawBig p(0), cx, 30, RGB(255, 90, 70), 1
        If UBound(p) >= 1 Then PixelFont.DrawText p(1), cx, 46, RGB(200, 190, 210), 1, 1
        If UBound(p) >= 2 Then PixelFont.DrawText p(2), cx, 56, RGB(200, 190, 210), 1, 1
        If UBound(p) >= 3 Then PixelFont.DrawText p(3), cx, 66, RGB(200, 190, 210), 1, 1
        PixelFont.DrawText "A = MENU", cx, 92, RGB(110, 100, 130), 1, 1
    End Select
    Renderer.Flush
End Sub

Private Sub RankingRender()
    Dim cx As Long, k As Long, y As Long, c As Long
    cx = SCREEN_W \ 2
    PixelFont.DrawBig "RANKING", cx, 3, RGB(240, 190, 80), 1
    If mTopN = 0 Then
        PixelFont.DrawText "NO RANKED GAMES YET", cx, 40, RGB(130, 120, 150), 1, 1
    End If
    For k = 0 To mTopN - 1
        y = 16 + k * 7
        If mTopName(k) = mName Then c = RGB(255, 236, 150) Else c = RGB(210, 200, 220)
        PixelFont.DrawText CStr(k + 1), 56, y, RGB(130, 120, 150), 1, 2
        PixelFont.DrawText mTopName(k), 62, y, c
        PixelFont.DrawText CStr(mTopRating(k)), 136, y, c, 1, 2
    Next k
    If mMyRank > 0 Then
        PixelFont.DrawText "YOU  RANK " & mMyRank & "  " & mName & "  " & mRating, cx, 86, RGB(255, 236, 150), 1, 1
    Else
        PixelFont.DrawText "YOU  " & mName & "  " & mRating & "  (PLAY A RANKED GAME)", cx, 86, RGB(200, 190, 210), 1, 1
    End If
    PixelFont.DrawText "A = BACK", cx, 93, RGB(110, 100, 130), 1, 1
End Sub

' Fighter shown big for my side (mine = True) or the opponent's: the one being picked, else the 1st pick.
Private Function ShownSlot(ByVal mine As Boolean) As Long
    If mine Then
        If mMyStep = 0 Then ShownSlot = mMySlot Else ShownSlot = mMyPick(0)
    Else
        If mPeerStep = 0 Then ShownSlot = mPeerSlot Else ShownSlot = mPeerPick(0)
    End If
End Function

' "DANWOO + MUYEONG" style line for the host's (host = True) or the guest's team; READY when done.
Private Function TeamLine(ByVal host As Boolean) As String
    Dim mine As Boolean, stp As Long, a As Long, b As Long, cur As Long
    mine = (host = mHost)
    If mine Then
        stp = mMyStep: a = mMyPick(0): b = mMyPick(1): cur = mMySlot
    Else
        stp = mPeerStep: a = mPeerPick(0): b = mPeerPick(1): cur = mPeerSlot
    End If
    Select Case stp
    Case 0: TeamLine = ""
    Case 1: TeamLine = "+ " & Screens.RosterName(cur) & "?"
    Case Else: TeamLine = "+ " & Screens.RosterName(b) & " READY"
    End Select
End Function

Private Sub LobbyRender()
    Dim cx As Long, k As Long, x As Long, y As Long, c As Long, me_ As Long, other As Long, t As String, blink As Boolean
    cx = SCREEN_W \ 2
    ' both teams picked: the stage page (the host chooses, the guest sees the host's choice)
    If mStageChoosing Then
        Screens.DrawStagePage mStage, "LEFT RIGHT = SELECT  A = FIGHT  S = BACK", True
        Exit Sub
    ElseIf Not mHost And mMyReady And mPeerReady Then
        Screens.DrawStagePage mStage, "THE HOST IS CHOOSING THE STAGE  S = BACK", False
        Exit Sub
    End If
    blink = ((mT \ 5) Mod 2 = 0)
    Renderer.FillRect 0, 10, 64, 90, RGB(14, 20, 40)
    Renderer.FillRect 128, 10, 64, 90, RGB(40, 14, 18)
    Renderer.FillRect 63, 10, 1, 90, RGB(90, 170, 255)
    Renderer.FillRect 128, 10, 1, 90, RGB(255, 90, 80)
    PixelFont.DrawBig IIf(mRanked, "RANKED MATCH", "ONLINE VERSUS"), cx, 2, RGB(240, 190, 80), 1
    If mServer Then                                         ' names (and ratings) from the server
        PixelFont.DrawText IIf(mHost, mName, mOppName), 3, 13, RGB(90, 170, 255)
        PixelFont.DrawText IIf(mHost, mOppName, mName), SCREEN_W - 3, 13, RGB(255, 90, 80), 1, 2
        If mRanked Then
            PixelFont.DrawText CStr(IIf(mHost, mRating, mOppRating)), 3, 19, RGB(130, 120, 150)
            PixelFont.DrawText CStr(IIf(mHost, mOppRating, mRating)), SCREEN_W - 3, 19, RGB(130, 120, 150), 1, 2
        End If
    Else
        PixelFont.DrawText IIf(mHost, "YOU", "HOST"), 3, 13, RGB(90, 170, 255)
        PixelFont.DrawText IIf(mHost, "GUEST", "YOU"), SCREEN_W - 3, 13, RGB(255, 90, 80), 1, 2
    End If
    ' left = host's team, right = guest's: big view = the fighter being picked (or the 1st pick)
    me_ = ShownSlot(True): other = ShownSlot(False)
    Screens.DrawBigView Screens.RosterPrefix(IIf(mHost, me_, other)), 32, False, 0, 63
    Screens.DrawBigView Screens.RosterPrefix(IIf(mHost, other, me_)), 160, True, 129, SCREEN_W - 1, (me_ = other)
    PixelFont.DrawText TeamLine(mHost), 3, 25, RGB(255, 236, 190)
    PixelFont.DrawText TeamLine(Not mHost), SCREEN_W - 3, 25, RGB(255, 236, 190), 1, 2
    ' grid: 4 + 3
    For k = 0 To OpenCount() - 1                            ' only fighters this machine can pick (no "?" slot)
        GridPos k, x, y
        Screens.DrawPortraitAt k, x, y, 15
        c = RGB(70, 60, 90)
        If k = mPeerSlot Then c = RGB(255, 90, 80)
        If (mMyStep >= 1 And k = mMyPick(0)) Or (mMyStep >= 2 And k = mMyPick(1)) Then c = RGB(180, 140, 60)   ' already picked
        If k = mMySlot And (blink Or mMyReady) Then c = RGB(240, 190, 80)
        Renderer.DrawRectOutline x, y, 15, 20, c
        If k = mMySlot Then Renderer.DrawRectOutline x - 1, y - 1, 17, 22, c
    Next k
    PixelFont.DrawBig UCase$(Screens.RosterName(mMySlot)), cx, 68, RGB(255, 240, 210), 1
    If mMyStep < 2 Then PixelFont.DrawText "PICK FIGHTER " & (mMyStep + 1) & " OF 2", cx, 78, RGB(200, 190, 210), 1, 1
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
    ElseIf mMyStep = 1 Then
        PixelFont.DrawText "A = OK  S = BACK", cx, 93, RGB(150, 140, 170), 1, 1
    Else
        PixelFont.DrawText "A = OK  ESC = LEAVE", cx, 93, RGB(150, 140, 170), 1, 1
    End If
    If mRtt >= 0 Then PixelFont.DrawText "PING " & CLng(mRtt) & "MS", cx, 86, RGB(110, 100, 130), 1, 1
End Sub
