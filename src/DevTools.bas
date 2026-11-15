Attribute VB_Name = "DevTools"
Option Explicit

' Sync VBA modules between this workbook and the src\ folder next to it.
' Requires: File > Options > Trust Center > Trust Center Settings >
'           Macro Settings > "Trust access to the VBA project object model".
'           Mac: Excel > Preferences > Security > "Trust access to the VBA project object model".
' Works on Windows and Mac Excel.
' DevTools itself is never overwritten by ImportSrc (re-import it manually if it changes).

Private Const SRC_DIR As String = "src"
Private Const SELF_NAME As String = "DevTools"

Public Sub ImportSrc()
    Dim proj As Object, comp As Object, srcPath As String, f As String
    Dim names As New Collection, nm As Variant

    srcPath = SrcFolder()
    GrantFolder srcPath, New Collection
    On Error GoTo NoTrust
    Set proj = ThisWorkbook.VBProject
    On Error GoTo 0

    f = Dir(srcPath)                     ' no wildcard: Mac Excel's Dir does not support it
    Do While Len(f) > 0
        If LCase$(Right$(f, 4)) = ".bas" And Left$(f, 1) <> "." Then names.Add Left$(f, Len(f) - 4)
        f = Dir()
    Loop
    If names.Count = 0 Then
        MsgBox "No .bas files found in " & srcPath & vbCrLf & _
               "Save this workbook in the pixel-murim folder (next to src and data).", vbExclamation, "DevTools"
        Exit Sub
    End If

    For Each nm In names
        If StrComp(nm, SELF_NAME, vbTextCompare) <> 0 Then
            Set comp = Nothing
            On Error Resume Next
            Set comp = proj.VBComponents(CStr(nm))
            On Error GoTo 0
            If Not comp Is Nothing Then
                comp.Name = comp.Name & "_old"   ' rename first: Remove is deferred until the macro ends
                proj.VBComponents.Remove comp
            End If
            proj.VBComponents.Import srcPath & nm & ".bas"
        End If
    Next nm
    ' remove standard modules that no longer exist in src\ (renamed / deleted)
    Dim stale As New Collection, keep As Boolean, removed As Long
    For Each comp In proj.VBComponents
        If comp.Type = 1 And StrComp(comp.Name, SELF_NAME, vbTextCompare) <> 0 Then
            keep = False
            For Each nm In names
                If StrComp(nm, comp.Name, vbTextCompare) = 0 Then keep = True
            Next nm
            If Not keep Then stale.Add comp
        End If
    Next comp
    For Each comp In stale
        proj.VBComponents.Remove comp
        removed = removed + 1
    Next comp
    MsgBox names.Count & " file(s) imported from " & srcPath & IIf(removed > 0, vbCrLf & removed & " old module(s) removed", ""), _
           vbInformation, "DevTools"
    Exit Sub
NoTrust:
    MsgBox "Excel does not allow access to the VBA project." & vbCrLf & _
           "Windows: File > Options > Trust Center > Trust Center Settings > Macro Settings" & vbCrLf & _
           "Mac: Excel > Preferences (Settings) > Security" & vbCrLf & _
           "Turn on ""Trust access to the VBA project object model"", then run ImportSrc again.", vbExclamation, "DevTools"
End Sub

' src folder next to the workbook, with the right path separator for Windows ("\") or Mac ("/").
Private Function SrcFolder() As String
    SrcFolder = ThisWorkbook.Path & Application.PathSeparator & SRC_DIR & Application.PathSeparator
End Function

' Mac Excel is sandboxed and asks before touching each file. Ask for the folder, every file
' in it and the extra paths (files about to be created) in ONE "Grant File Access" dialog;
' Excel remembers the answer. No-op on Windows.
Private Sub GrantFolder(ByVal folder As String, ByVal extra As Collection)
    #If Mac Then
        Dim paths() As Variant, n As Long, f As String, x As Variant
        ReDim paths(0 To 0)
        paths(0) = Left$(folder, Len(folder) - 1)
        n = 1
        f = Dir(folder)
        Do While Len(f) > 0
            If Left$(f, 1) <> "." Then
                ReDim Preserve paths(0 To n)
                paths(n) = folder & f
                n = n + 1
            End If
            f = Dir()
        Loop
        For Each x In extra
            ReDim Preserve paths(0 To n)
            paths(n) = CStr(x)
            n = n + 1
        Next x
        On Error Resume Next
        GrantAccessToMultipleFiles paths
        On Error GoTo 0
    #End If
End Sub

Public Sub ExportSrc()
    Dim comp As Object, srcPath As String, n As Long, outFiles As New Collection
    srcPath = SrcFolder()
    For Each comp In ThisWorkbook.VBProject.VBComponents
        If comp.Type = 1 Then outFiles.Add srcPath & comp.Name & ".bas"
    Next comp
    GrantFolder srcPath, outFiles
    If Len(Dir(srcPath, vbDirectory)) = 0 Then MkDir srcPath
    For Each comp In ThisWorkbook.VBProject.VBComponents
        If comp.Type = 1 Then            ' vbext_ct_StdModule
            comp.Export srcPath & comp.Name & ".bas"
            n = n + 1
        End If
    Next comp
    MsgBox n & " module(s) exported to " & srcPath, vbInformation, "DevTools"
End Sub
