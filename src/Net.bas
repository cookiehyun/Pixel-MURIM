Attribute VB_Name = "Net"
Option Explicit

' UDP for online play (docs/ONLINE.md). One socket, plain text messages, never blocks.
'   Windows: ws2_32.dll (socket handle = LongPtr)
'   Mac:     libc BSD sockets (file descriptor = Long). Receiving uses MSG_DONTWAIT instead of
'            switching the socket to non-blocking mode, because fcntl is a variadic C function and
'            variadic calls are not safe from VBA on Apple silicon.
' The test harness replaces this module with a stub (tools/harness/NetStub.bas).

Private Const AF_INET As Long = 2
Private Const SOCK_DGRAM As Long = 2
Private Const IPPROTO_UDP As Long = 17
Private Const BUFLEN As Long = 1500

#If Mac Then
Private Declare PtrSafe Function m_socket Lib "/usr/lib/libc.dylib" Alias "socket" (ByVal domain As Long, ByVal stype As Long, ByVal protocol As Long) As Long
Private Declare PtrSafe Function m_bind Lib "/usr/lib/libc.dylib" Alias "bind" (ByVal fd As Long, ByRef addr As Byte, ByVal addrlen As Long) As Long
Private Declare PtrSafe Function m_connect Lib "/usr/lib/libc.dylib" Alias "connect" (ByVal fd As Long, ByRef addr As Byte, ByVal addrlen As Long) As Long
Private Declare PtrSafe Function m_getsockname Lib "/usr/lib/libc.dylib" Alias "getsockname" (ByVal fd As Long, ByRef addr As Byte, ByRef addrlen As Long) As Long
Private Declare PtrSafe Function m_sendto Lib "/usr/lib/libc.dylib" Alias "sendto" (ByVal fd As Long, ByRef buf As Byte, ByVal length As LongPtr, ByVal flags As Long, ByRef addr As Byte, ByVal addrlen As Long) As LongPtr
Private Declare PtrSafe Function m_recvfrom Lib "/usr/lib/libc.dylib" Alias "recvfrom" (ByVal fd As Long, ByRef buf As Byte, ByVal length As LongPtr, ByVal flags As Long, ByRef addr As Byte, ByRef addrlen As Long) As LongPtr
Private Declare PtrSafe Function m_close Lib "/usr/lib/libc.dylib" Alias "close" (ByVal fd As Long) As Long
Private Declare PtrSafe Function m_send Lib "/usr/lib/libc.dylib" Alias "send" (ByVal fd As Long, ByRef buf As Byte, ByVal length As LongPtr, ByVal flags As Long) As LongPtr
Private Declare PtrSafe Function m_errptr Lib "/usr/lib/libc.dylib" Alias "__error" () As LongPtr
Private Declare PtrSafe Function m_memcpy Lib "/usr/lib/libc.dylib" Alias "memcpy" (ByRef dst As Long, ByVal src As LongPtr, ByVal n As LongPtr) As LongPtr
Private Const MSG_DONTWAIT As Long = &H80
Private mSock As Long
#ElseIf VBA7 Then
Private Declare PtrSafe Function WSAStartup Lib "ws2_32.dll" (ByVal wVersionRequested As Integer, ByRef lpWSAData As Byte) As Long
Private Declare PtrSafe Function WSACleanup Lib "ws2_32.dll" () As Long
Private Declare PtrSafe Function WSAGetLastError Lib "ws2_32.dll" () As Long
Private Declare PtrSafe Function w_socket Lib "ws2_32.dll" Alias "socket" (ByVal af As Long, ByVal stype As Long, ByVal protocol As Long) As LongPtr
Private Declare PtrSafe Function w_bind Lib "ws2_32.dll" Alias "bind" (ByVal s As LongPtr, ByRef addr As Byte, ByVal namelen As Long) As Long
Private Declare PtrSafe Function w_connect Lib "ws2_32.dll" Alias "connect" (ByVal s As LongPtr, ByRef addr As Byte, ByVal namelen As Long) As Long
Private Declare PtrSafe Function w_getsockname Lib "ws2_32.dll" Alias "getsockname" (ByVal s As LongPtr, ByRef addr As Byte, ByRef namelen As Long) As Long
Private Declare PtrSafe Function w_sendto Lib "ws2_32.dll" Alias "sendto" (ByVal s As LongPtr, ByRef buf As Byte, ByVal length As Long, ByVal flags As Long, ByRef addr As Byte, ByVal tolen As Long) As Long
Private Declare PtrSafe Function w_recvfrom Lib "ws2_32.dll" Alias "recvfrom" (ByVal s As LongPtr, ByRef buf As Byte, ByVal length As Long, ByVal flags As Long, ByRef from As Byte, ByRef fromlen As Long) As Long
Private Declare PtrSafe Function w_ioctlsocket Lib "ws2_32.dll" Alias "ioctlsocket" (ByVal s As LongPtr, ByVal cmd As Long, ByRef argp As Long) As Long
Private Declare PtrSafe Function w_closesocket Lib "ws2_32.dll" Alias "closesocket" (ByVal s As LongPtr) As Long
Private mSock As LongPtr
#Else
Private Declare Function WSAStartup Lib "ws2_32.dll" (ByVal wVersionRequested As Integer, ByRef lpWSAData As Byte) As Long
Private Declare Function WSACleanup Lib "ws2_32.dll" () As Long
Private Declare Function WSAGetLastError Lib "ws2_32.dll" () As Long
Private Declare Function w_socket Lib "ws2_32.dll" Alias "socket" (ByVal af As Long, ByVal stype As Long, ByVal protocol As Long) As Long
Private Declare Function w_bind Lib "ws2_32.dll" Alias "bind" (ByVal s As Long, ByRef addr As Byte, ByVal namelen As Long) As Long
Private Declare Function w_connect Lib "ws2_32.dll" Alias "connect" (ByVal s As Long, ByRef addr As Byte, ByVal namelen As Long) As Long
Private Declare Function w_getsockname Lib "ws2_32.dll" Alias "getsockname" (ByVal s As Long, ByRef addr As Byte, ByRef namelen As Long) As Long
Private Declare Function w_sendto Lib "ws2_32.dll" Alias "sendto" (ByVal s As Long, ByRef buf As Byte, ByVal length As Long, ByVal flags As Long, ByRef addr As Byte, ByVal tolen As Long) As Long
Private Declare Function w_recvfrom Lib "ws2_32.dll" Alias "recvfrom" (ByVal s As Long, ByRef buf As Byte, ByVal length As Long, ByVal flags As Long, ByRef from As Byte, ByRef fromlen As Long) As Long
Private Declare Function w_ioctlsocket Lib "ws2_32.dll" Alias "ioctlsocket" (ByVal s As Long, ByVal cmd As Long, ByRef argp As Long) As Long
Private Declare Function w_closesocket Lib "ws2_32.dll" Alias "closesocket" (ByVal s As Long) As Long
Private mSock As Long
#End If

Private mOpen As Boolean
Private mErr As String
' diagnostics (shown on online error screens): packets sent / refused, last errors, packets received
Private mSentOk As Long, mSentFail As Long, mSendErr As Long, mRecvOk As Long, mRecvErr As Long
Private mConnected As Boolean        ' Mac: socket connected to the one peer (see ConnectTo)
Private mBuf(0 To BUFLEN - 1) As Byte

Public Property Get LastError() As String
    LastError = mErr
End Property

' "S12/0 E0 R0/35": sent ok / failed, last send errno, received / last receive errno
Public Function Diag() As String
    Diag = "S" & mSentOk & "/" & mSentFail & " E" & mSendErr & " R" & mRecvOk & "/" & mRecvErr
End Function

Public Property Get IsOpen() As Boolean
    IsOpen = mOpen
End Property

' sockaddr_in for ip:port (16 bytes). ip "" = any address.
'   Windows: family (2 bytes, little endian), port (big endian), address, 8 zeros
'   Mac:     length (1 byte), family (1 byte), port (big endian), address, 8 zeros
Private Sub MakeAddr(ByRef a() As Byte, ByVal ip As String, ByVal port As Long)
    Dim p() As String, k As Long
    ReDim a(0 To 15)
    #If Mac Then
        a(0) = 16: a(1) = AF_INET
    #Else
        a(0) = AF_INET: a(1) = 0
    #End If
    a(2) = (port \ 256) And 255: a(3) = port And 255
    If Len(ip) > 0 Then
        p = Split(ip, ".")
        For k = 0 To 3
            a(4 + k) = CByte(CLng(p(k)) And 255)
        Next k
    End If
End Sub

' "a.b.c.d" with four numbers 0-255?
Public Function ValidIp(ByVal ip As String) As Boolean
    Dim p() As String, k As Long
    p = Split(Trim$(ip), ".")
    If UBound(p) <> 3 Then Exit Function
    For k = 0 To 3
        If Len(p(k)) = 0 Or Len(p(k)) > 3 Then Exit Function
        If Not IsNumeric(p(k)) Then Exit Function
        If CLng(p(k)) < 0 Or CLng(p(k)) > 255 Then Exit Function
    Next k
    ValidIp = True
End Function

' Open the UDP socket on port (0 = any free port). False + LastError on failure.
Public Function OpenSocket(ByVal port As Long) As Boolean
    Dim a() As Byte
    CloseSocket
    mErr = ""
    mConnected = False
    mSentOk = 0: mSentFail = 0: mSendErr = 0: mRecvOk = 0: mRecvErr = 0
    On Error GoTo Fail
    #If Mac Then
        mSock = m_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        If mSock < 0 Then mErr = "socket() failed (errno " & MacErrno() & ")": Exit Function
        ' Only a host binds a fixed port. A client (port 0) does not bind at all: the first sendto picks a
        ' port by itself, and Mac Excel's sandbox may refuse an explicit bind.
        If port > 0 Then
            MakeAddr a, "", port
            If m_bind(mSock, a(0), 16) <> 0 Then
                mErr = "port " & port & " not allowed (errno " & MacErrno() & ")"
                m_close mSock
                Exit Function
            End If
        End If
    #Else
        Dim wsa(0 To 511) As Byte, nb As Long
        If WSAStartup(&H202, wsa(0)) <> 0 Then mErr = "WSAStartup failed": Exit Function
        mSock = w_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        If mSock = -1 Or mSock = 0 Then mErr = "socket() failed": WSACleanup: Exit Function
        MakeAddr a, "", port
        If w_bind(mSock, a(0), 16) <> 0 Then
            mErr = "port " & port & " is in use (error " & WSAGetLastError() & ")"
            w_closesocket mSock
            WSACleanup
            Exit Function
        End If
        nb = 1
        w_ioctlsocket mSock, &H8004667E, nb          ' FIONBIO: never block
    #End If
    mOpen = True
    OpenSocket = True
    Exit Function
Fail:
    mErr = "network error " & Err.Number & ": " & Err.Description
End Function

Public Sub CloseSocket()
    If Not mOpen Then Exit Sub
    On Error Resume Next
    #If Mac Then
        m_close mSock
    #Else
        w_closesocket mSock
        WSACleanup
    #End If
    mOpen = False
End Sub

' Talk only to ip:port from now on (client side: the game server, or the host of a direct game).
' Mac: required. Excel's sandbox refuses to receive on an unconnected UDP socket (errno 1),
' but a connected socket is outgoing "client" traffic and its replies are allowed. Windows: nothing to do.
Public Function ConnectTo(ByVal ip As String, ByVal port As Long) As Boolean
    #If Mac Then
        Dim a() As Byte
        If Not mOpen Then Exit Function
        MakeAddr a, ip, port
        If m_connect(mSock, a(0), 16) <> 0 Then
            mErr = "connect failed (errno " & MacErrno() & ")"
            Exit Function
        End If
        mConnected = True
    #End If
    ConnectTo = True
End Function

Public Sub SendTo(ByVal ip As String, ByVal port As Long, ByVal msg As String)
    Dim a() As Byte, b() As Byte
    If Not mOpen Or Len(msg) = 0 Then Exit Sub
    MakeAddr a, ip, port
    b = StrConv(msg, vbFromUnicode)
    On Error Resume Next
    Dim n As Long
    #If Mac Then
        If mConnected Then
            n = CLng(m_send(mSock, b(0), UBound(b) + 1, 0))     ' connected: the address is fixed
        Else
            n = CLng(m_sendto(mSock, b(0), UBound(b) + 1, 0, a(0), 16))
        End If
        If n < 0 Then mSendErr = MacErrno()
    #Else
        n = w_sendto(mSock, b(0), UBound(b) + 1, 0, a(0), 16)
        If n < 0 Then mSendErr = WSAGetLastError()
    #End If
    If n > 0 Then mSentOk = mSentOk + 1 Else mSentFail = mSentFail + 1
End Sub

' Next waiting message, if any (never waits). Returns the sender's ip / port too.
Public Function Receive(ByRef msg As String, ByRef fromIp As String, ByRef fromPort As Long) As Boolean
    Dim a(0 To 15) As Byte, alen As Long, n As Long, tries As Long, b() As Byte
    If Not mOpen Then Exit Function
    On Error GoTo Fail
    For tries = 1 To 8                                 ' Windows reports "port unreachable" as a failed read: skip those
        alen = 16
        #If Mac Then
            n = CLng(m_recvfrom(mSock, mBuf(0), BUFLEN, MSG_DONTWAIT, a(0), alen))
        #Else
            n = w_recvfrom(mSock, mBuf(0), BUFLEN, 0, a(0), alen)
        #End If
        If n > 0 Then
            b = mBuf
            ReDim Preserve b(0 To n - 1)
            msg = StrConv(b, vbUnicode)
            mRecvOk = mRecvOk + 1
            fromIp = a(4) & "." & a(5) & "." & a(6) & "." & a(7)
            fromPort = CLng(a(2)) * 256 + a(3)
            Receive = True
            Exit Function
        End If
        #If Mac Then
            If n < 0 Then mRecvErr = MacErrno()         ' 35 = nothing waiting (normal)
            Exit Function
        #Else
            If WSAGetLastError() <> 10054 Then Exit Function    ' 10035 = nothing waiting
        #End If
    Next tries
    Exit Function
Fail:
    mErr = "receive error " & Err.Number
End Function

#If Mac Then
' errno of the last failed libc call (1 = not permitted, 13 = denied, 48 = port in use).
Private Function MacErrno() As Long
    Dim e As Long
    On Error Resume Next
    m_memcpy e, m_errptr(), 4
    MacErrno = e
End Function
#End If

' This machine's address on the local network (the one a friend on the same Wi-Fi would use).
' Found by "connecting" a throwaway UDP socket toward a public address: nothing is sent.
Public Function LocalIp() As String
    Dim a() As Byte, me_(0 To 15) As Byte, alen As Long
    On Error GoTo Fail
    LocalIp = "?"
    MakeAddr a, "8.8.8.8", 53
    #If Mac Then
        Dim fd As Long
        fd = m_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        If fd < 0 Then Exit Function
        If m_connect(fd, a(0), 16) = 0 Then
            alen = 16
            If m_getsockname(fd, me_(0), alen) = 0 Then LocalIp = me_(4) & "." & me_(5) & "." & me_(6) & "." & me_(7)
        End If
        m_close fd
    #Else
        Dim wsa(0 To 511) As Byte
        #If VBA7 Then
            Dim s As LongPtr
        #Else
            Dim s As Long
        #End If
        If WSAStartup(&H202, wsa(0)) <> 0 Then Exit Function
        s = w_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        If s <> -1 And s <> 0 Then
            If w_connect(s, a(0), 16) = 0 Then
                alen = 16
                If w_getsockname(s, me_(0), alen) = 0 Then LocalIp = me_(4) & "." & me_(5) & "." & me_(6) & "." & me_(7)
            End If
            w_closesocket s
        End If
        WSACleanup
    #End If
    Exit Function
Fail:
    LocalIp = "?"
End Function
