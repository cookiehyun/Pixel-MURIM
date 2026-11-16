Attribute VB_Name = "Lockstep"
Option Explicit

' Online play: deterministic lockstep with input delay (docs/ONLINE.md section 3).
' Both peers exchange only their raw key bits (Fighter.RawLocal) per tick. Tick N runs only
' when both inputs for N are known; the local input pressed now is used DELAY ticks later,
' which hides the network delay. Every packet repeats the last WINDOW local inputs, so a lost
' packet is covered by the next one. Every HASH_EVERY ticks both sides compare Fighter.StateHash.
' Transport-free: Online / the harness send OutPacket() and pass received text to Receive().
'
' Packets (plain text):
'   I <first frame> <ack> <hex4> <hex4> ...   local inputs for frames first, first+1, ...
'                                              ack = next remote frame we still need
'   H <frame> <hash>                           state hash after running <frame>

Private Const BUF As Long = 256           ' ring buffer of frames (must exceed delay + window + stalls)
Private Const WINDOW As Long = 8          ' inputs repeated per packet
Public Const HASH_EVERY As Long = 20      ' 1 second

Private mOn As Boolean
Private mLocal As Long                    ' fighter index played on this machine (0 = left)
Private mDelay As Long
Private mFrame As Long                    ' next frame to simulate
Private mNextLocal As Long                ' next local frame to fill
Private mRemoteNeed As Long               ' first remote frame not yet received
Private mRemoteAck As Long                ' remote has all our frames below this
Private mIn(0 To 1, 0 To BUF - 1) As Long
Private mHas(0 To 1, 0 To BUF - 1) As Long   ' frame number stored in the slot (-1 = empty)
Private mMyHash(0 To BUF - 1) As Long
Private mMyHashF(0 To BUF - 1) As Long
Private mTheirHash(0 To BUF - 1) As Long
Private mTheirHashF(0 To BUF - 1) As Long
Private mHashOut As String                ' hash packet waiting to be sent
Private mDesyncFrame As Long              ' first frame whose hashes differ (-1 = none)
Private mStalls As Long                   ' ticks spent waiting for the remote
Private mLastHeard As Long                ' ticks since the last packet from the remote
Private mPendPress As Long                ' button presses made while stalled, added to the next frame

Public Sub Begin(ByVal localIndex As Long, ByVal delay As Long)
    Dim s As Long, k As Long
    mOn = True
    mLocal = localIndex
    If delay < 1 Then delay = 1
    If delay > 10 Then delay = 10
    mDelay = delay
    mFrame = 0: mRemoteNeed = 0: mRemoteAck = 0
    mDesyncFrame = -1: mStalls = 0: mLastHeard = 0: mHashOut = "": mPendPress = 0
    For s = 0 To 1
        For k = 0 To BUF - 1
            mHas(s, k) = -1: mIn(s, k) = 0
        Next k
    Next s
    For k = 0 To BUF - 1
        mMyHashF(k) = -1: mTheirHashF(k) = -1
    Next k
    ' the first DELAY frames are empty input on both sides
    For k = 0 To mDelay - 1
        Store mLocal, k, 0
        Store 1 - mLocal, k, 0
    Next k
    mNextLocal = mDelay
    mRemoteNeed = mDelay
End Sub

Public Sub Finish()
    mOn = False
End Sub

Public Property Get Active() As Boolean
    Active = mOn
End Property

Public Property Get LocalIndex() As Long
    LocalIndex = mLocal
End Property

Public Property Get Frame() As Long
    Frame = mFrame
End Property

Public Property Get NextLocalFrame() As Long
    NextLocalFrame = mNextLocal
End Property

Public Property Get Delay() As Long
    Delay = mDelay
End Property

Public Property Get Stalls() As Long
    Stalls = mStalls
End Property

Public Property Get DesyncFrame() As Long
    DesyncFrame = mDesyncFrame
End Property

Public Property Get TicksSinceHeard() As Long
    TicksSinceHeard = mLastHeard
End Property

Private Sub Store(ByVal side As Long, ByVal f As Long, ByVal raw As Long)
    mIn(side, f Mod BUF) = raw
    mHas(side, f Mod BUF) = f
End Sub

Private Function Known(ByVal side As Long, ByVal f As Long) As Boolean
    Known = (mHas(side, f Mod BUF) = f)
End Function

' Local keys sampled this tick: they are used for frame Frame + Delay. Call once per game tick;
' while stalled the slot is already filled and the call does nothing (no input runs ahead).
Public Sub CaptureLocal(ByVal raw As Long)
    If Not mOn Then Exit Sub
    If mNextLocal > mFrame + mDelay Then
        mPendPress = mPendPress Or (raw And &H10F0&)        ' keep taps (buttons, tag) made while waiting
        Exit Sub
    End If
    Store mLocal, mNextLocal, raw Or mPendPress
    mPendPress = 0
    mNextLocal = mNextLocal + 1
End Sub

' Both inputs for the next frame known?
Public Function Ready() As Boolean
    If Not mOn Then Exit Function
    Ready = Known(0, mFrame) And Known(1, mFrame)
End Function

' Called by the game loop when it wanted to run a tick but Ready was False.
Public Sub NoteStall()
    mStalls = mStalls + 1
End Sub

Public Sub TickHeard()
    mLastHeard = mLastHeard + 1
End Sub

' Feed both fighters the inputs of the current frame and advance (call only when Ready).
Public Sub FeedFrame()
    Fighter.FeedRaw 0, mIn(0, mFrame Mod BUF)
    Fighter.FeedRaw 1, mIn(1, mFrame Mod BUF)
End Sub

' Raw input bits of fighter side for the frame being simulated (tag key, see Fighter.RawLocal).
Public Function CurrentRaw(ByVal side As Long) As Long
    CurrentRaw = mIn(side, mFrame Mod BUF)
End Function

' After the simulation of the current frame: record the hash every HASH_EVERY frames, advance.
Public Sub EndFrame()
    Dim h As Long
    If mFrame Mod HASH_EVERY = 0 Then
        h = Fighter.StateHash()
        mMyHash(mFrame Mod BUF) = h
        mMyHashF(mFrame Mod BUF) = mFrame
        mHashOut = "H " & mFrame & " " & h
        CompareHash mFrame
    End If
    mFrame = mFrame + 1
End Sub

Private Sub CompareHash(ByVal f As Long)
    Dim k As Long
    k = f Mod BUF
    If mMyHashF(k) = f And mTheirHashF(k) = f Then
        If mMyHash(k) <> mTheirHash(k) And mDesyncFrame < 0 Then mDesyncFrame = f
    End If
End Sub

' Packet with our latest inputs (send every tick). Empty string = nothing new to say.
Public Function OutPacket() As String
    Dim f0 As Long, f As Long, s As String
    If Not mOn Then Exit Function
    f0 = mNextLocal - WINDOW
    If f0 < mRemoteAck Then f0 = mRemoteAck                     ' the remote already has these
    If f0 < 0 Then f0 = 0
    If f0 >= mNextLocal Then
        s = "I " & mNextLocal & " " & mRemoteNeed                ' nothing new: still tell what we need
    Else
        s = "I " & f0 & " " & mRemoteNeed
        For f = f0 To mNextLocal - 1
            s = s & " " & Right$("000" & Hex$(mIn(mLocal, f Mod BUF)), 4)
        Next f
    End If
    OutPacket = s
End Function

' Hash packet to send (once), or "".
Public Function OutHash() As String
    OutHash = mHashOut
    mHashOut = ""
End Function

' Text received from the remote peer.
Public Sub Receive(ByVal pkt As String)
    Dim p() As String, f0 As Long, k As Long, f As Long, rs As Long
    If Not mOn Or Len(pkt) < 3 Then Exit Sub
    p = Split(pkt, " ")
    mLastHeard = 0
    rs = 1 - mLocal
    Select Case p(0)
    Case "I"
        f0 = CLng(p(1))
        If CLng(p(2)) > mRemoteAck Then mRemoteAck = CLng(p(2))
        For k = 3 To UBound(p)
            f = f0 + k - 3
            ' accept only frames we still need and that fit the buffer (old or far-future ones are ignored)
            If f >= mFrame And f < mFrame + BUF - 16 Then
                If Not Known(rs, f) Then Store rs, f, CLng("&H" & p(k))
            End If
        Next k
        Do While Known(rs, mRemoteNeed)
            mRemoteNeed = mRemoteNeed + 1
        Loop
    Case "H"
        f = CLng(p(1))
        mTheirHash(f Mod BUF) = CLng(p(2))
        mTheirHashF(f Mod BUF) = f
        CompareHash f
    End Select
End Sub
