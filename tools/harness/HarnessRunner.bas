Attribute VB_Name = "HarnessRunner"
Option Explicit

Private mNetTag As Boolean            ' CMD nettag: the next nettest is a tag battle

' Drives the real game modules tick by tick from a text script (headless).
' Script lines:
'   <ticks> <keys>      keys joined with "+": L R U D A S Z X TAB H J DD F1, "-" = none
'   CMD control <i>     which fighter the keys control
'   CMD start <human> <level> <watch> <seed>   start a match (skips the menu)
'   CMD dummy <mode>    0 CPU, 1 idle, 2 guard, 3 attack
'   CMD meter <i> <n>   set super gauge
'   CMD place <x0> <x1> set positions
'   CMD nettest <seed> <local 0/1> <delay> <latency> <jitter> <loss %> <frames> [<bad hash frame>]
'                       online lockstep against a simulated remote over a fake network; inputs for both
'                       sides come from a per-frame generator, so every run must give the same
'                       "N <frame> <hash>" lines whatever the network does
'   CMD servertest <1 quick match / 2 create room / 3 join room / 4 ranking> <seed> <max ticks>
'                       the Online module in server mode against a scripted game server + opponent
'   CMD onlinetest <host 1 / guest 0> <seed> <max ticks>
'                       the real Online module (lobby, START, lockstep, result, BYE) against a scripted
'                       remote player over the stub network; logs "S" state changes and "E" at the end
' Output file: "T <tick> <paintCalls> <runs> <hitstop> | <fighter0> | <fighter1>" per tick,
'              "F <tick>" + SCREEN_H rows of hex BGR pixels for dumped frames.

Public Function RunScript(ByVal dataDir As String, ByVal script As String, ByVal outPath As String, ByVal dumpEvery As Long) As String
    Dim lines() As String, p() As String, ks() As String, ln As String, keys As String
    Dim i As Long, n As Long, t As Long, k As Long, f As Integer, tick As Long, noRender As Boolean, lastPhase As Long

    On Error GoTo Fail
    Data.BaseDir = dataDir
    Game.GameInit True
    f = FreeFile
    Open outPath For Output As #f
    lines = Split(Replace(script, vbCr, ""), vbLf)
    For i = 0 To UBound(lines)
        ln = Trim(lines(i))
        If Len(ln) > 0 And Left(ln, 1) <> "#" Then
            p = Split(ln, " ")
            If p(0) = "CMD" Then
                Select Case p(1)
                Case "start"
                    ' CMD start <human 0/1> <level 0-2> <watch 0/1> <seed>
                    Game.HumanIndex = CLng(p(2))
                    Game.CpuLevel = CLng(p(3))
                    Game.WatchMode = (p(4) = "1")
                    Game.AutoRestart = True
                    Game.GameMode = MODE_SANDBOX
                    If UBound(p) >= 6 Then Game.GameMode = CLng(p(6))      ' 0 training, 1 VS CPU
                    Game.HarnessSeed = CLng(p(5))
                    Game.StartMatch CLng(p(5))
                Case "tagchars"
                    Game.GameMode = MODE_TAG
                    Game.P1Char = p(2): Game.P1Char2 = p(3)
                    Game.P2Char = p(4): Game.P2Char2 = p(5)
                    Game.StartMatch 1
                Case "chars"
                    Game.P1Char = p(2)
                    Game.P2Char = p(3)
                    Game.StartMatch 1
                Case "roundtime"
                    Match.RoundTicks = CLng(p(2))
                Case "norender"
                    noRender = True
                Case "dump"
                    dumpEvery = CLng(p(2))
                Case "meter"
                    Fighter.F(CLng(p(2))).meter = CLng(p(3))
                Case "posetest"
                    Print #f, "P " & Data.HasSprite("hongryeon.intro") & " " & Data.HasSprite("hongryeon.nope")
                Case "quanttest"
                    Print #f, "Q " & Renderer.Quant(&H6A5C50) & " " & Renderer.Quant(&H6B5D4F) & " " & Renderer.Quant(&H1E2A3B) & " " & Renderer.Quant(&H3B2A26) & " | " & Renderer.QuantInfo()
                Case "rendermode"
                    Renderer.RenderMode = CLng(p(2))
                    Renderer.Invalidate
                Case "ng"
                    Fighter.F(CLng(p(2))).naegong = CLng(p(3))
                Case "hp"
                    Fighter.F(CLng(p(2))).health = CLng(p(3))
                Case "render"
                    noRender = (p(2) = "0")
                Case "control": Fighter.SetControl CLng(p(2))
                Case "dummy": Fighter.SetDummy CLng(p(2))
                Case "place"
                    Fighter.F(0).x = CDbl(p(2))
                    Fighter.F(1).x = CDbl(p(3))
                Case "servertest"
                    ServerTest f, CLng(p(2)), CLng(p(3)), CLng(p(4))
                Case "onlinetest"
                    OnlineTest f, (p(2) = "1"), CLng(p(3)), CLng(p(4))
                Case "nettag"
                    mNetTag = True
                Case "nettest"
                    k = -1
                    If UBound(p) >= 9 Then k = CLng(p(9))
                    NetTest f, CLng(p(2)), CLng(p(3)), CLng(p(4)), CLng(p(5)), CLng(p(6)), CLng(p(7)), CLng(p(8)), k
                End Select
            Else
                n = CLng(p(0))
                keys = "-"
                If UBound(p) >= 1 Then keys = p(1)
                For t = 1 To n
                    KeyInput.ClearNext
                    If keys <> "-" Then
                        ks = Split(keys, "+")
                        For k = 0 To UBound(ks)
                            KeyInput.SetNextByName ks(k)
                        Next k
                    End If
                    Game.GameTick
                    If Not noRender Then Game.GameRender
                    tick = tick + 1
                    If noRender Then
                        ' balance runs: only log match results
                        If Match.Phase = MP_MATCHEND And lastPhase <> MP_MATCHEND Then
                            Print #f, "R " & tick & " " & Fighter.F(0).prefix & " " & Match.Wins(0) & " " & Fighter.F(1).prefix & " " & Match.Wins(1)
                        End If
                        lastPhase = Match.Phase
                        GoTo NextTick
                    End If
                    Print #f, "T " & tick & " " & Renderer.PaintCalls & " " & Renderer.RectCount & " " & Combat.HitStop & _
                              " " & Game.GameState & " " & Combat.ComboCount(0) & " " & Combat.ComboCount(1) & _
                              " M" & Match.Phase & "/" & Match.Wins(0) & "-" & Match.Wins(1) & _
                              " | " & FighterLine(0) & " | " & FighterLine(1)
                    If dumpEvery > 0 Then
                        If tick Mod dumpEvery = 0 Then DumpFrame f, tick
                    End If
NextTick:
                Next t
            End If
        End If
    Next i
    Close #f
    RunScript = "ok " & tick
    Exit Function
Fail:
    RunScript = "ERR " & Err.Number & " " & Err.Description & " (tick " & tick & ", script line " & (i + 1) & ")"
    On Error Resume Next
    Close #f
End Function

' ---------------------------------------------------------------- online lockstep test

' Deterministic "player" input for a frame: a direction held for 4 frames, buttons pressed now and then.
Private Function GenInput(ByVal seed As Long, ByVal side As Long, ByVal frame As Long) As Long
    Dim x As Double, blk As Long, r As Long, dirs As Variant, b As Long
    blk = frame \ 4
    x = LcgNext(LcgNext(seed * 7919# + side * 104729# + blk))
    dirs = Array(0, 1, 2, 2, 1, 4, 8, 9, 10, 0, 2, 1)          ' none, L, R, R, L, U, D, D+L, D+R ...
    r = dirs(Int(x / 2147483647# * 12))
    x = LcgNext(x)
    If frame Mod 4 = 0 And x / 2147483647# < 0.45 Then
        b = 2 ^ Int(LcgNext(x) / 2147483647# * 4)              ' one of LP HP LK HK
        r = r Or (b * 16) Or (b * 256)
    End If
    If frame Mod 60 = 30 And x / 2147483647# < 0.6 Then r = r Or &H1000&   ' tag now and then (tag mode)
    GenInput = r
End Function

Private Function LcgNext(ByVal x As Double) As Double
    LcgNext = x * 48271# + 11#
    LcgNext = LcgNext - Int(LcgNext / 2147483647#) * 2147483647#
End Function

Private Sub NetTest(ByVal f As Integer, ByVal seed As Long, ByVal localIdx As Long, ByVal delay As Long, _
                    ByVal latency As Long, ByVal jitter As Long, ByVal lossPct As Long, ByVal frames As Long, _
                    ByVal badHashFrame As Long)
    Const QN As Long = 4096
    Dim qAt(0 To QN - 1) As Long, qTxt(0 To QN - 1) As String, qn_ As Long
    Dim wall As Long, k As Long, rNext As Long, rs As Long, s As String, g As Long, lastFrame As Long
    Dim rnd_ As Double, sent As Long, lost As Long, h As Long

    Game.GameMode = MODE_VSCPU
    If mNetTag Then                                        ' online fights are tag battles
        Game.GameMode = MODE_TAG
        Game.P1Char = "danwoo": Game.P1Char2 = "seolhwa": Game.P2Char = "cheolsan": Game.P2Char2 = "hongryeon"
    End If
    Game.Multi = False
    Game.WatchMode = False
    Game.AutoRestart = True
    Game.HarnessSeed = seed
    Game.NetExternalLocal = True
    Game.StartMatch seed
    Lockstep.Begin localIdx, delay
    rs = 1 - localIdx
    rNext = delay                                          ' the remote's next frame to generate
    rnd_ = seed + 12345#
    lastFrame = -1

    For wall = 0 To frames * 20
        ' the simulated remote produces its input for frame rNext and sends its last 8 frames
        If rNext <= wall + delay Then
            s = "I " & IIf(rNext - 7 < 0, 0, rNext - 7) & " 0"
            For g = IIf(rNext - 7 < 0, 0, rNext - 7) To rNext
                s = s & " " & Right$("000" & Hex$(GenInput(seed, rs, g)), 4)
            Next g
            rNext = rNext + 1
            rnd_ = LcgNext(rnd_)
            sent = sent + 1
            If rnd_ / 2147483647# * 100 >= lossPct Then
                rnd_ = LcgNext(rnd_)
                qAt(qn_ Mod QN) = wall + latency + Int(rnd_ / 2147483647# * (jitter + 1))
                qTxt(qn_ Mod QN) = s
                qn_ = qn_ + 1
            Else
                lost = lost + 1
            End If
        End If
        ' deliver everything that has arrived (in any order: jitter reorders packets)
        For k = IIf(qn_ - QN < 0, 0, qn_ - QN) To qn_ - 1
            If Len(qTxt(k Mod QN)) > 0 And qAt(k Mod QN) <= wall Then
                Lockstep.Receive qTxt(k Mod QN)
                qTxt(k Mod QN) = ""
            End If
        Next k
        ' local player: input for the frame Lockstep is filling now
        Lockstep.CaptureLocal GenInput(seed, localIdx, Lockstep.NextLocalFrame)
        Lockstep.TickHeard
        Game.GameTick
        ' the outgoing packet is built every tick like the real thing (exercises the code path)
        s = Lockstep.OutPacket()
        s = Lockstep.OutHash()
        If Len(s) > 0 Then
            ' echo our own hash back as if the remote computed the same; a bad one at badHashFrame
            h = CLng(Split(s, " ")(2))
            If CLng(Split(s, " ")(1)) = badHashFrame Then h = h + 1
            Lockstep.Receive "H " & Split(s, " ")(1) & " " & h
        End If
        If Lockstep.Frame - 1 > lastFrame Then
            lastFrame = Lockstep.Frame - 1
            Print #f, "N " & lastFrame & " " & Fighter.StateHash()
        End If
        If Lockstep.Frame >= frames Then Exit For
    Next wall
    Print #f, "E frames=" & Lockstep.Frame & " wall=" & wall & " stalls=" & Lockstep.Stalls & _
              " sent=" & sent & " lost=" & lost & " desync=" & Lockstep.DesyncFrame & _
              " p0hp=" & Fighter.F(0).health & " p1hp=" & Fighter.F(1).health & " round=" & Match.Wins(0) & "-" & Match.Wins(1) & " tags=" & Tag.TagCount(0) & "/" & Tag.TagCount(1) & " tagmode=" & Tag.Active
    Lockstep.Finish
    Game.NetExternalLocal = False
End Sub

' Scripted game server (and the opponent behind it) for the server modes.
Private Sub ServerTest(ByVal f As Integer, ByVal mode As Long, ByVal seed As Long, ByVal maxTicks As Long)
    Const SIP As String = "10.0.0.5"
    Dim wall As Long, s As String, q() As String, p() As String, lastSt As Long, lastGs As Long, g As Long
    Dim weHost As Boolean, ranked As Boolean, matched As Boolean, rStarted As Boolean, rDelay As Long, rNext As Long
    Dim rs As Long, results As Long, byeAt As Long, roomT As Long, ratingSent As Boolean, startSent As Boolean
    Net.StubClear
    Game.NetExternalLocal = True
    Online.SetProfile "tester", String$(20, "T"), SIP
    Select Case mode
    Case 1: Online.BeginQuickMatch
    Case 2: Online.BeginRoomCreate
    Case 3: Online.BeginRoomJoin "abcd"
    Case Else: Online.BeginRanking
    End Select
    lastSt = -1: lastGs = -1: byeAt = -1
    For wall = 1 To maxTicks
        KeyInput.ClearNext
        Do
            s = Net.StubTakeOut()
            If Len(s) = 0 Then Exit Do
            q = Split(s, "|")
            If q(0) <> SIP Then Print #f, "X sent to " & q(0) & ": " & q(2)
            p = Split(q(2), " ")
            Print #f, "O " & wall & " " & q(2)
            Select Case p(0)
            Case "HELLO": Net.StubInject SIP, 47700, "WELCOME PM4 1000 0"
            Case "KEEP": Net.StubInject SIP, 47700, "KEPT"
            Case "QUEUE"
                Net.StubInject SIP, 47700, "QUEUED"
                Net.StubInject SIP, 47700, "MATCHED 7 1 1 RIVAL 1012"      ' we are the guest of a ranked match
                weHost = False: ranked = True: matched = True
            Case "ROOM"
                Net.StubInject SIP, 47700, "ROOMCODE QWER"
                roomT = wall
            Case "JOINROOM"
                If p(1) = "ABCD" Then
                    Net.StubInject SIP, 47700, "MATCHED 7 1 0 FRIEND 1000"
                    weHost = False: matched = True
                Else
                    Net.StubInject SIP, 47700, "NOROOM"
                End If
            Case "TOP": Net.StubInject SIP, 47700, "TOP 3 KIM 1100 TESTER 1040 LEE 990 ME 2 1040 5"
            Case "PING": Net.StubInject SIP, 47700, "PONG " & p(1)
            Case "PICK"
                If matched And Not rStarted Then Net.StubInject SIP, 47700, "PICK 4 4 5 2"   ' opponent: Heukrim + Hongryeon, ready
            Case "START"
                If Not rStarted Then rStarted = True: rDelay = CLng(p(4)): rNext = rDelay
            Case "RESULT"
                results = results + 1
                If ranked And Not ratingSent Then
                    Net.StubInject SIP, 47700, "RATING 1016 +16"
                    ratingSent = True
                End If
            End Select
        Loop
        If mode = 2 And roomT > 0 And wall = roomT + 20 And Not matched Then
            Net.StubInject SIP, 47700, "MATCHED 7 0 0 FRIEND 1000"      ' friend joined: we host
            weHost = True: matched = True
        End If
        rs = IIf(weHost, 1, 0)
        ' opponent hosting: starts once we are ready
        If matched And Not weHost And Not startSent And Online.StateCode = 3 And wall Mod 20 = 0 Then
            Net.StubInject SIP, 47700, "START 4 5 0 1 2 3"
            startSent = True: rStarted = True: rDelay = 3: rNext = 3
        End If
        If rStarted And Online.StateCode = 4 Then
            If rNext <= Lockstep.Frame + rDelay Then
                s = "I " & IIf(rNext - 7 < 0, 0, rNext - 7) & " 0"
                For g = IIf(rNext - 7 < 0, 0, rNext - 7) To rNext
                    s = s & " " & Right$("000" & Hex$(GenInput(seed, rs, g)), 4)
                Next g
                rNext = rNext + 1
                Net.StubInject SIP, 47700, s
            End If
        End If
        If Online.StateCode = 3 And results >= 1 And byeAt < 0 Then byeAt = wall + 30
        If wall = byeAt Then Net.StubInject SIP, 47700, "BYE"
        If Online.StateCode = 3 And wall Mod 7 = 0 Then KeyInput.SetNextByName "A"
        If Online.StateCode = 3 And wall Mod 7 = 3 Then KeyInput.SetNextByName "R"
        If Lockstep.Active And Online.StateCode = 4 Then Lockstep.CaptureLocal GenInput(seed, 1 - rs, Lockstep.NextLocalFrame)
        If mode = 4 And wall = 40 Then KeyInput.SetNextByName "A"         ' leave the ranking screen
        Game.GameTick
        If wall = 15 Or wall = 60 Or wall = 1800 Or wall = 3395 Then
            Game.GameRender
            DumpFrame f, wall
        End If
        If Online.StateCode <> lastSt Or Game.GameState <> lastGs Then
            Print #f, "S " & wall & " online=" & Online.StateCode & " game=" & Game.GameState & " frame=" & Lockstep.Frame & _
                      " p1=" & Game.P1Char & " p2=" & Game.P2Char & " host=" & Online.IsHost & " " & Online.ServerInfo & " err=" & Online.ErrorText
            lastSt = Online.StateCode: lastGs = Game.GameState
        End If
        If (Online.StateCode = 6 And byeAt > 0) Or (mode = 4 And Online.StateCode = 0) Then Exit For
    Next wall
    Print #f, "E wall=" & wall & " online=" & Online.StateCode & " results=" & results & " " & Online.ServerInfo & " err=" & Online.ErrorText
    Game.NetExternalLocal = False
End Sub

' Scripted remote player speaking the online protocol; this machine's player presses A when needed.
Private Sub OnlineTest(ByVal f As Integer, ByVal asHost As Boolean, ByVal seed As Long, ByVal maxTicks As Long)
    Const PIP As String = "10.0.0.2"
    Dim wall As Long, msg As String, p() As String, q() As String, lastSt As Long, lastGs As Long
    Dim rStarted As Boolean, rDelay As Long, rNext As Long, rFrame0 As Long, s As String, g As Long, rs As Long
    Dim pport As Long, matches As Long, sentBye As Boolean
    Net.StubClear
    Game.NetExternalLocal = True
    If asHost Then
        pport = 50123
        Online.BeginHost
    Else
        pport = 47700
        Online.BeginJoin PIP
    End If
    rs = IIf(asHost, 1, 0)                                  ' fighter index of the remote player
    lastSt = -1: lastGs = -1
    For wall = 1 To maxTicks
        KeyInput.ClearNext
        ' --- remote player ---
        If asHost And wall = 3 Then Net.StubInject PIP, pport, "HELLO PM4"
        If asHost And wall = 4 Then Net.StubInject "10.0.0.9", 999, "PICK 3 1"      ' stranger: must be ignored
        Do
            s = Net.StubTakeOut()
            If Len(s) = 0 Then Exit Do
            q = Split(s, "|")
            p = Split(q(2), " ")
            Select Case p(0)
            Case "HELLO": Net.StubInject PIP, pport, "WELCOME PM4"
            Case "PING": Net.StubInject PIP, pport, "PONG " & p(1)
            Case "PICK"
                If Not rStarted Then Net.StubInject PIP, pport, "PICK 2 2 4 2"    ' remote team: Muyeong + Heukrim, ready
            Case "START"
                If Not rStarted Then rStarted = True: rDelay = CLng(p(4)): rNext = rDelay
            End Select
        Loop
        If Not asHost And Online.StateCode = 3 And Not rStarted And wall Mod 20 = 0 Then
            ' remote host: picks, then starts the match (stage 1, delay 3)
            Net.StubInject PIP, pport, "PICK 2 2 4 2"
            If wall >= 60 Then
                Net.StubInject PIP, pport, "START 2 4 0 1 1 3"
                rStarted = True: rDelay = 3: rNext = 3
            End If
        End If
        If rStarted And Online.StateCode = 4 Then
            ' remote inputs: frames up to its own progress (it runs in step with us), last 8 each time
            If rNext <= Lockstep.Frame + rDelay Then
                s = "I " & IIf(rNext - 7 < 0, 0, rNext - 7) & " 0"
                For g = IIf(rNext - 7 < 0, 0, rNext - 7) To rNext
                    s = s & " " & Right$("000" & Hex$(GenInput(seed, rs, g)), 4)
                Next g
                rNext = rNext + 1
                Net.StubInject PIP, pport, s
            End If
        End If
        If Online.StateCode = 5 And rStarted Then
            rStarted = False                                 ' next round of the lobby
            matches = matches + 1
        End If
        If matches >= 1 And Online.StateCode = 3 And Not sentBye And wall Mod 40 = 0 Then
            Net.StubInject PIP, pport, "BYE"
            sentBye = True
        End If
        ' --- this machine's player: pick two fighters (A, right, A), (host) start ---
        If Online.StateCode = 3 And wall Mod 7 = 0 Then KeyInput.SetNextByName "A"
        If Online.StateCode = 3 And wall Mod 7 = 3 Then KeyInput.SetNextByName "R"
        If Lockstep.Active And Online.StateCode = 4 Then Lockstep.CaptureLocal GenInput(seed, 1 - rs, Lockstep.NextLocalFrame)
        Game.GameTick
        If wall = 2 Or wall = 9 Or wall = 13 Or wall = 300 Or wall = 1740 Or wall = 3559 Then
            Game.GameRender
            DumpFrame f, wall                                 ' screenshots: waiting, lobby, stage, fight, result, error
        End If
        If Online.StateCode <> lastSt Or Game.GameState <> lastGs Then
            Print #f, "S " & wall & " online=" & Online.StateCode & " game=" & Game.GameState & _
                      " frame=" & Lockstep.Frame & " p1=" & Game.P1Char & "+" & Game.P1Char2 & " p2=" & Game.P2Char & "+" & Game.P2Char2 & " tag=" & Tag.Active & " err=" & Online.ErrorText
            lastSt = Online.StateCode: lastGs = Game.GameState
        End If
        If Online.StateCode = 6 And sentBye Then Exit For
    Next wall
    Print #f, "E wall=" & wall & " online=" & Online.StateCode & " matches=" & matches & " frame=" & Lockstep.Frame & _
              " hp=" & Fighter.F(0).health & "/" & Fighter.F(1).health & " err=" & Online.ErrorText
    Game.NetExternalLocal = False
End Sub

Private Function FighterLine(ByVal i As Long) As String
    With Fighter.F(i)
        FighterLine = .prefix & " st=" & .state & " t=" & .stTick & " x=" & Format(.x, "0.0") & _
            " y=" & Format(.footY, "0.0") & " hp=" & .health & " stun=" & .stun & " chain=" & .chain & _
            " face=" & .facing & " mv=" & .mv & " meter=" & .meter & " dir=" & .inDir & " press=" & .inPress
    End With
End Function

Private Sub DumpFrame(ByVal f As Integer, ByVal tick As Long)
    Dim x As Long, y As Long, s As String
    Print #f, "F " & tick
    For y = 0 To SCREEN_H - 1
        s = ""
        For x = 0 To SCREEN_W - 1
            s = s & Right("00000" & Hex(Renderer.BackPixel(x, y)), 6)
        Next x
        Print #f, s
    Next y
End Sub
