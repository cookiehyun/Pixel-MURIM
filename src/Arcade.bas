Attribute VB_Name = "Arcade"
Option Explicit

' Arcade mode: the player's fighter takes on the other five in random order, then its own
' shadow (mirror match, alternate colors), then the final boss Cheonma.
' Lose a match -> CONTINUE? countdown (retry the same fight).
' Clear all seven -> character ending, and Cheonma becomes playable (saved in save.txt, Data.UserFilePath).
' Playing as Cheonma: the six fighters, then the shadow Cheonma as the boss.
'   LADDER   : next opponent preview (A or wait)
'   CONTINUE : 9..0 countdown, A = retry, S / timeout = GAME OVER
'   ENDING   : ending text, A = title

Private Const FIGHTS As Long = 7
Private Const BOSS_PREFIX As String = "cheonma"
Private Const BOSS_NAME As String = "CHEONMA"
Private Const SAVE_FILE As String = "save.txt"

Private mOrder(0 To FIGHTS - 1) As String
Private mName(0 To FIGHTS - 1) As String
Private mStage(0 To FIGHTS - 1) As Long
Private mIdx As Long               ' current fight 0..FIGHTS-1
Private mPlayer As String
Private mPlayerName As String
Private mBaseLevel As Long
Private mContinues As Long
Private mT As Long
Private mGameOver As Boolean

Private cGold As Long, cDim As Long, cP1 As Long, cP2 As Long
Private mUnlockRead As Boolean
Private mUnlocked As Boolean
Private mJustUnlocked As Boolean

Public Sub Begin(ByVal player As String)
    Dim k As Long, n As Long, j As Long, t As String, pool() As String
    cGold = RGB(240, 190, 80): cDim = RGB(130, 120, 150)
    cP1 = RGB(90, 170, 255): cP2 = RGB(255, 90, 80)
    mPlayer = player
    mPlayerName = Screens.RosterName(Screens.RosterIndex(player))
    mBaseLevel = Game.CpuLevel
    ' the other roster members in random order
    ReDim pool(0 To Screens.RosterSize - 1)
    n = 0
    For k = 0 To Screens.RosterSize - 1
        If Screens.RosterPrefix(k) <> player Then
            pool(n) = Screens.RosterPrefix(k)
            n = n + 1
        End If
    Next k
    Randomize
    For k = n - 1 To 1 Step -1
        j = Int(Rnd * (k + 1))
        t = pool(k): pool(k) = pool(j): pool(j) = t
    Next k
    If player = BOSS_PREFIX Then
        For k = 0 To FIGHTS - 2                           ' all six fighters, then the shadow boss
            mOrder(k) = pool(k Mod n)
            mName(k) = Screens.RosterName(Screens.RosterIndex(mOrder(k)))
        Next k
    Else
        For k = 0 To FIGHTS - 3                           ' the other five ...
            mOrder(k) = pool(k Mod n)
            mName(k) = Screens.RosterName(Screens.RosterIndex(mOrder(k)))
        Next k
        mOrder(FIGHTS - 2) = player                       ' ... then your own shadow
        mName(FIGHTS - 2) = "SHADOW"
    End If
    For k = 0 To FIGHTS - 2
        mStage(k) = k Mod Data.StageCount
    Next k
    mOrder(FIGHTS - 1) = BOSS_PREFIX
    mName(FIGHTS - 1) = BOSS_NAME
    mStage(FIGHTS - 1) = Data.StageCount - 1
    mJustUnlocked = False
    mIdx = 0
    mContinues = 0
    ShowLadder
End Sub

Public Property Get FightNumber() As Long
    FightNumber = mIdx + 1
End Property

Public Property Get IsBossFight() As Boolean
    IsBossFight = (mIdx = FIGHTS - 1)
End Property

Private Sub ShowLadder()
    mT = 0
    Game.GameState = GS_LADDER
End Sub

' CPU gets a little sharper for the last fights; the boss is always HARD.
Private Sub StartFight()
    Game.P1Char = mPlayer
    Game.P2Char = mOrder(mIdx)
    Game.HumanIndex = 0
    Game.StageIndex = mStage(mIdx)
    If mIdx = FIGHTS - 1 Then
        Game.CpuLevel = LV_HARD
    ElseIf mIdx >= 3 And mBaseLevel < LV_HARD Then
        Game.CpuLevel = mBaseLevel + 1
    Else
        Game.CpuLevel = mBaseLevel
    End If
    Game.StartMatch
End Sub

' Called by Match when an arcade match is decided.
Public Sub MatchOver(ByVal won As Boolean)
    Game.CpuLevel = mBaseLevel
    mT = 0
    If won Then
        mIdx = mIdx + 1
        If mIdx >= FIGHTS Then
            If Not BossUnlocked Then
                SaveUnlock
                mJustUnlocked = True
            End If
            Game.GameState = GS_ENDING
        Else
            ShowLadder
        End If
    Else
        mGameOver = False
        Game.GameState = GS_CONTINUE
    End If
End Sub

' Has the player cleared arcade once (Cheonma playable)? Read from save.txt (Data.UserFilePath) once.
Public Function BossUnlocked() As Boolean
    Dim lines As Variant, k As Long
    If Not mUnlockRead Then
        mUnlockRead = True
        On Error Resume Next
        lines = Data.ReadUserLines(SAVE_FILE)
        If Err.Number = 0 Then
            For k = LBound(lines) To UBound(lines)
                If Trim$(lines(k)) = "cheonma=1" Then mUnlocked = True
            Next k
        End If
        Err.Clear
        On Error GoTo 0
    End If
    BossUnlocked = mUnlocked
End Function

Private Sub SaveUnlock()
    Dim f As Integer
    mUnlocked = True
    mUnlockRead = True
    On Error Resume Next                                  ' a read-only folder must not break the ending
    f = FreeFile
    Open Data.UserFilePath(SAVE_FILE) For Output As #f
    Print #f, "cheonma=1"
    Close #f
    On Error GoTo 0
End Sub

Private Function CountdownSecs() As Long
    CountdownSecs = 9 - mT \ 20
End Function

Public Sub ScreenTick()
    Screens.TickMenu
    mT = mT + 1
    Select Case Game.GameState
    Case GS_LADDER
        If mT >= 70 Or (mT >= 10 And KeyInput.IsPressed(BTN_LP)) Then StartFight
    Case GS_CONTINUE
        If mGameOver Then
            If mT >= 60 Or (mT >= 15 And KeyInput.IsPressed(BTN_LP)) Then Game.GameState = GS_MENU
        ElseIf KeyInput.IsPressed(BTN_LP) Then
            mContinues = mContinues + 1
            StartFight
        ElseIf KeyInput.IsPressed(BTN_HP) Or CountdownSecs() < 0 Then
            mGameOver = True
            mT = 0
        ElseIf KeyInput.IsPressed(BTN_LK) Then
            mT = ((mT \ 20) + 1) * 20                    ' Z = count down faster
        End If
    Case GS_ENDING
        If mT >= 40 And KeyInput.IsPressed(BTN_LP) Then Game.GameState = GS_MENU
    End Select
End Sub

Public Sub ScreenRender()
    Select Case Game.GameState
    Case GS_LADDER: LadderRender
    Case GS_CONTINUE: ContinueRender
    Case GS_ENDING: EndingRender
    End Select
End Sub

' ---------------------------------------------------------------- ladder

Private Sub Panels()
    Renderer.BeginFrame True
    Renderer.FillRect 0, 10, 64, 90, RGB(14, 20, 40)
    Renderer.FillRect 128, 10, 64, 90, RGB(40, 14, 18)
    Renderer.FillRect 63, 10, 1, 90, cP1
    Renderer.FillRect 128, 10, 1, 90, cP2
End Sub

Private Sub LadderRender()
    Dim k As Long, x As Long, y As Long, cx As Long, c As Long, blink As Boolean, t As String
    cx = SCREEN_W \ 2
    Panels
    If mIdx = FIGHTS - 1 Then t = "FINAL STAGE" Else t = "STAGE " & (mIdx + 1) & " OF " & FIGHTS
    PixelFont.DrawBig t, cx, 2, cGold, 1
    PixelFont.DrawText "1P", 3, 13, cP1
    PixelFont.DrawText "CPU", SCREEN_W - 3, 13, cP2, 1, 2
    Screens.DrawBigView mPlayer, 32, False, 0, 63
    Screens.DrawBigView mOrder(mIdx), 160, True, 129, SCREEN_W - 1, (mOrder(mIdx) = mPlayer)
    PixelFont.DrawBig "VS", cx, 13, RGB(255, 240, 210), 2
    PixelFont.DrawBig mName(mIdx), cx, 31, IIf(mIdx = FIGHTS - 1, RGB(255, 90, 70), RGB(255, 240, 210)), 1

    blink = ((Screens.MenuTick \ 5) Mod 2 = 0)
    For k = 0 To FIGHTS - 1                                                ' 4 on top, 3 (centred) below
        If k < 4 Then
            x = 64 + k * 16: y = 46
        Else
            x = 72 + (k - 4) * 16: y = 68
        End If
        If k = FIGHTS - 1 And mIdx < FIGHTS - 1 Then
            Renderer.FillRect x, y, 15, 20, RGB(40, 12, 16)              ' boss stays hidden
            PixelFont.DrawBig "?", x + 8, y + 3, RGB(150, 50, 50), 2
        Else
            Screens.DrawPortraitAt Screens.RosterIndex(mOrder(k)), x, y, 15, (mOrder(k) = mPlayer)   ' shadow: other colors
        End If
        If k < mIdx Then                                                    ' beaten: red cross
            For c = 2 To 16
                Renderer.FillRect x + (c - 2) * 12 \ 14 + 1, y + c, 2, 1, RGB(220, 40, 40)
                Renderer.FillRect x + 12 - (c - 2) * 12 \ 14, y + c, 2, 1, RGB(220, 40, 40)
            Next c
        End If
        If k = mIdx Then
            If blink Then c = cP2 Else c = RGB(120, 40, 40)
            Renderer.DrawRectOutline x - 1, y - 1, 17, 22, c
            Renderer.DrawRectOutline x, y, 15, 20, c
        Else
            Renderer.DrawRectOutline x, y, 15, 20, RGB(70, 60, 90)
        End If
    Next k
    PixelFont.DrawText "A = FIGHT", cx, 93, RGB(110, 100, 130), 1, 1
End Sub

' ---------------------------------------------------------------- continue / game over

Private Sub ContinueRender()
    Dim cx As Long, s As Long, c As Long
    cx = SCREEN_W \ 2
    Renderer.FillRect 0, 0, SCREEN_W, SCREEN_H, RGB(10, 8, 16)
    Screens.DrawBigView mPlayer, 32, False, 0, 63
    If mGameOver Then
        PixelFont.DrawBig "GAME OVER", cx + 20, 38, RGB(220, 60, 50), 2
        Exit Sub
    End If
    PixelFont.DrawBig "CONTINUE?", cx + 20, 18, cGold, 2
    s = CountdownSecs()
    If s < 0 Then s = 0
    If s <= 3 Then c = RGB(255, 90, 70) Else c = RGB(255, 240, 210)
    PixelFont.DrawBig CStr(s), cx + 20, 40, c, 4
    PixelFont.DrawText "VS " & mName(mIdx), cx + 20, 74, cDim, 1, 1
    PixelFont.DrawText "A = CONTINUE   S = GIVE UP", cx + 20, 88, RGB(150, 140, 170), 1, 1
End Sub

' ---------------------------------------------------------------- ending

Private Function EndingLine(ByVal prefix As String, ByVal n As Long) As String
    Dim t As Variant
    Select Case prefix
    Case "cheolsan"
        t = Array("THE IRON MOUNTAIN STOOD", "UNMOVED. HE RETURNED TO THE", "TEMPLE AND RANG THE GREAT", "BELL FOR NINE DAYS.")
    Case "muyeong"
        t = Array("ONE BLADE. TEN THOUSAND CUTS.", "MUYEONG SHEATHED HIS SWORD", "AND VANISHED INTO THE MIST", "OF THE BAMBOO FOREST.")
    Case "seolhwa"
        t = Array("SNOW FELL ON THE PEAK AS", "SEOLHWA LANDED HER LAST KICK.", "NO ONE IN MURIM COULD", "CATCH HER SHADOW AGAIN.")
    Case "heukrim"
        t = Array("HEUKRIM TOOK THE DEMON ART", "FOR HIMSELF. THE BLACK", "FOREST HAS A NEW MASTER", "AND IT IS VERY QUIET.")
    Case "cheonma"
        t = Array("THE HEAVENLY DEMON STRUCK", "DOWN HIS OWN SHADOW. NO ONE", "IS LEFT TO CHALLENGE HIM.", "MURIM BOWS TO ONE MASTER.")
    Case "hongryeon"
        t = Array("THE RED LOTUS BLOOMED OVER", "THE WATERFALL. HONGRYEON", "CLOSED HER FANS AND SMILED.", "THE DANCE WAS OVER.")
    Case Else
        t = Array("THE WANDERER DEFEATED THE", "HEAVENLY DEMON AND WALKED ON.", "HIS RED BAND STILL FLIES", "ON EVERY MOUNTAIN ROAD.")
    End Select
    EndingLine = t(n)
End Function

Private Sub EndingRender()
    Dim cx As Long, k As Long, shown As Long
    cx = SCREEN_W \ 2
    Renderer.FillRect 0, 0, SCREEN_W, SCREEN_H, RGB(12, 10, 22)
    Renderer.FillRect 0, 10, 64, 90, RGB(14, 20, 40)
    Renderer.FillRect 63, 10, 1, 90, cGold
    Screens.DrawBigView mPlayer, 32, False, 0, 63
    PixelFont.DrawBig "CONGRATULATIONS", cx, 2, cGold, 1
    PixelFont.DrawBig mPlayerName, 128, 16, RGB(255, 240, 210), 1
    shown = mT \ 12                                       ' lines appear one by one
    For k = 0 To 3
        If k < shown Then PixelFont.DrawText EndingLine(mPlayer, k), 70, 32 + k * 9, RGB(220, 210, 230)
    Next k
    If shown > 4 Then
        PixelFont.DrawText "CONTINUES " & mContinues, 128, 72, cDim, 1, 1
        If mJustUnlocked And (mT \ 8) Mod 2 = 0 Then
            PixelFont.DrawText "NEW FIGHTER: CHEONMA", 128, 82, RGB(255, 90, 70), 1, 1
        ElseIf Not mJustUnlocked Then
            PixelFont.DrawBig "THE END", 128, 80, cGold, 1
        End If
    End If
    If mT >= 40 Then PixelFont.DrawText "A = TITLE", 128, 93, RGB(110, 100, 130), 1, 1
End Sub
