"""Flag VBA constructs the LibreOffice harness cannot parse, and Excel-only errors LibreOffice accepts.
usage: python3 tools/lint_vba.py"""
import glob, re, sys
bad = 0
for p in sorted(glob.glob("src/*.bas")):
    in_proc = False
    for n, line in enumerate(open(p, encoding="ascii"), 1):
        code = line.split("'")[0]
        if re.match(r"\s*(Public |Private |Friend )?(Static )?(Sub|Function|Property) ", code):
            in_proc = True
        elif in_proc and re.match(r"(Public |Private |Global |Dim |Const |Type |Enum )", code) \
                and not re.match(r"(Public |Private )(Sub|Function|Property|Declare)", code):
            print(f"{p}:{n}: module-level declaration after the first procedure -> move it to the top (Excel compile error)"); bad += 1
        # single-line If whose Then and Else parts are both Sub calls with arguments
        m = re.match(r"\s*If .+ Then\s+([A-Za-z_][\w.]*)\s+[^=]+\s+Else\s+([A-Za-z_][\w.]*)\s+[^=]+$", code.strip("\r\n"))
        if m:
            print(f"{p}:{n}: one-line If with Sub calls in both branches -> use a block If"); bad += 1
        if re.search(r"\b[A-Za-z_][\w.]*\s+\([^()]*\)\s*[\\/*+&-].*,", code) and not re.search(r"=|\bIf\b|\bThen\b", code.split(",")[0]):
            print(f"{p}:{n}: Sub call whose first argument starts with '(' -> compute it first"); bad += 1
        if re.search(r"Function \w+\(.*\) As \w+\(\)", code):
            print(f"{p}:{n}: function returning a typed array -> return Variant"); bad += 1
        if re.search(r"\bm\w+\((nm|key)\)", code) and "Item" not in code and "Collection" in open(p).read():
            pass
# a variable with the same name as a Sub/Function in the same module (VBA ignores case):
# Excel reports "Expected Sub, Function, or Property" at the call
for p in sorted(glob.glob("src/*.bas")):
    txt = open(p, encoding="ascii").read()
    procs = {m.lower(): m for m in re.findall(r"^\s*(?:Public |Private |Friend )?(?:Static )?(?:Sub|Function|Property \w+) (\w+)", txt, re.M)}
    for n, line in enumerate(txt.split("\n"), 1):
        code = line.split("'")[0]
        m = re.match(r"\s*(?:Dim|Static|Private|Public) (?!Sub|Function|Property|Const|Declare|Type|Enum)(.*)", code)
        if not m:
            continue
        for part in m.group(1).split(","):
            v = re.match(r"\s*(?:WithEvents )?(\w+)", part)
            if v and v.group(1).lower() in procs:
                print(f"{p}:{n}: variable '{v.group(1)}' has the same name as procedure '{procs[v.group(1).lower()]}' (VBA ignores case)"); bad += 1
sys.exit(1 if bad else 0)
