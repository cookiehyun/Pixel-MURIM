Attribute VB_Name = "Net"
Option Explicit

' Harness stand-in for src/Net.bas: an in-memory wire. The test plays the remote side with
' StubInject (messages "arriving") and StubTakeOut (what the game sent).

Private mOpen As Boolean
Private mIn As New Collection
Private mOut As New Collection

Public Property Get LastError() As String
    LastError = "stub"
End Property

Public Function Diag() As String
    Diag = "stub"
End Function

Public Property Get IsOpen() As Boolean
    IsOpen = mOpen
End Property

Public Function ValidIp(ByVal ip As String) As Boolean
    ValidIp = (UBound(Split(Trim$(ip), ".")) = 3)
End Function

Public Function OpenSocket(ByVal port As Long) As Boolean
    mOpen = True
    OpenSocket = True
End Function

Public Sub CloseSocket()
    mOpen = False
End Sub

Public Sub SendTo(ByVal ip As String, ByVal port As Long, ByVal msg As String)
    If mOpen And Len(msg) > 0 Then mOut.Add ip & "|" & port & "|" & msg
End Sub

Public Function Receive(ByRef msg As String, ByRef fromIp As String, ByRef fromPort As Long) As Boolean
    Dim p() As String
    If Not mOpen Or mIn.Count = 0 Then Exit Function
    p = Split(CStr(mIn.Item(1)), "|")
    mIn.Remove 1
    fromIp = p(0): fromPort = CLng(p(1)): msg = p(2)
    Receive = True
End Function

Public Function LocalIp() As String
    LocalIp = "10.0.0.1"
End Function

Public Sub StubInject(ByVal ip As String, ByVal port As Long, ByVal msg As String)
    mIn.Add ip & "|" & port & "|" & msg
End Sub

' Next message the game sent ("" = none), as "ip|port|text".
Public Function StubTakeOut() As String
    If mOut.Count = 0 Then Exit Function
    StubTakeOut = CStr(mOut.Item(1))
    mOut.Remove 1
End Function

Public Sub StubClear()
    Set mIn = New Collection
    Set mOut = New Collection
End Sub
