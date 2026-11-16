"""Integration test: runs the real server on a free UDP port and drives it with fake players.
usage: python3 server/test_server.py   (builds with cargo first)"""
import os, socket, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "target", "release", "pixel-murim-server")

class P:
    def __init__(self, port, name, token):
        self.s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.s.bind(("127.0.0.1", 0)); self.s.settimeout(0.5)
        self.srv = ("127.0.0.1", port); self.name, self.token = name, token
    def send(self, m): self.s.sendto(m.encode(), self.srv)
    def recv(self, want=None, timeout=3.0):
        end = time.time() + timeout
        while time.time() < end:
            try:
                m = self.s.recv(2048).decode()
            except socket.timeout:
                continue
            if want is None or m.split(" ")[0] == want:
                return m
        raise AssertionError(f"{self.name}: no {want} within {timeout}s")
    def hello(self):
        self.send(f"HELLO PM4 {self.name} {self.token}")
        return self.recv("WELCOME")

def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: sys.exit(1)

def main():
    subprocess.check_call(["cargo", "build", "--release", "-q"], cwd=HERE)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    db = os.path.join(tempfile.mkdtemp(), "players.tsv")
    srv = subprocess.Popen([BIN, "--port", str(port), "--db", db], stdout=subprocess.PIPE, text=True)
    time.sleep(0.3)
    try:
        a = P(port, "alice", "A" * 20); b = P(port, "bob", "B" * 20); c = P(port, "carol", "C" * 20)
        check(a.hello() == "WELCOME PM4 1000 0", "login, new player starts at 1000")
        b.hello(); c.hello()
        x = P(port, "x", "short"); x.send("HELLO PM4 x short"); check(x.recv("ERROR") == "ERROR NAME", "bad token refused")
        x.send("HELLO PM2 x " + "X" * 20); check(x.recv("ERROR") == "ERROR VERSION", "old version refused")
        x.send("ROOM"); check(x.recv("ERROR") == "ERROR LOGIN", "commands need a login")

        # ---- room code
        a.send("ROOM"); code = a.recv("ROOMCODE").split()[1]
        check(len(code) == 4 and code.isalpha() and "I" not in code and "O" not in code, f"room code {code}")
        b.send("JOINROOM ZZZZ"); check(b.recv("NOROOM") == "NOROOM", "wrong code -> NOROOM")
        b.send("JOINROOM " + code.lower())
        ma, mb = a.recv("MATCHED").split(), b.recv("MATCHED").split()
        check(ma[2] == "0" and mb[2] == "1" and ma[3] == "0", "room match: host 0 / guest 1, not ranked")
        check(ma[4] == "BOB" and mb[4] == "ALICE", "opponent names upper-cased")
        mid = ma[1]
        c.send("JOINROOM " + code); check(c.recv("NOROOM") == "NOROOM", "room closes once joined")
        # ---- relay
        a.send("PICK 3 1"); check(b.recv("PICK") == "PICK 3 1", "relay host -> guest")
        b.send("I 0 0 001 002 003"); check(a.recv("I") == "I 0 0 001 002 003", "relay guest -> host (inputs)")
        c.send("I 0 0 FFF"); time.sleep(0.2)
        try:
            a.s.settimeout(0.3); m = a.s.recv(2048).decode(); check(False, f"outsider relayed: {m}")
        except socket.timeout:
            check(True, "outsider's packets are not relayed"); a.s.settimeout(0.5)
        # unranked result: no rating message
        a.send(f"RESULT {mid} 1 0"); b.send(f"RESULT {mid} 1 0"); time.sleep(0.3)
        a.send("TOP"); t = a.recv("TOP").split()
        check(t[1] == "0", "room games do not count for the ranking")
        # leave -> partner gets BYE
        a.send("LEAVE"); check(b.recv("BYE") == "BYE", "LEAVE -> partner BYE")

        # ---- quick match + ranked results
        a.send("QUEUE"); a.recv("QUEUED"); b.send("QUEUE"); b.recv("QUEUED")
        ma, mb = a.recv("MATCHED").split(), b.recv("MATCHED").split()
        check(ma[3] == "1" and ma[1] == mb[1], "quick match pairs the two, ranked")
        mid = ma[1]; host_is_a = ma[2] == "0"
        winner_a = "0" if host_is_a else "1"
        # disagreeing reports do not count
        a.send(f"RESULT {mid} 1 {winner_a}"); b.send(f"RESULT {mid} 1 {'1' if winner_a == '0' else '0'}"); time.sleep(0.3)
        a.send("TOP"); check(a.recv("TOP").split()[1] == "0", "mismatching reports ignored")
        for _ in range(3):                                   # repeated reports (packet loss insurance)
            a.send(f"RESULT {mid} 2 {winner_a}"); b.send(f"RESULT {mid} 2 {winner_a}")
        ra, rb = a.recv("RATING").split(), b.recv("RATING").split()
        check(ra == ["RATING", "1016", "+16"] and rb == ["RATING", "984", "-16"], f"Elo applied: {ra} {rb}")
        time.sleep(0.3)
        a.send("TOP"); check(a.recv("TOP").split()[3] == "1016", "repeated reports counted once")
        a.send("KEEP"); check(a.recv("KEPT") == "KEPT", "KEEP -> KEPT")
        # rematch in the same pairing: next game counts too
        a.send(f"RESULT {mid} 3 {winner_a}"); b.send(f"RESULT {mid} 3 {winner_a}")
        ra2 = a.recv("RATING").split(); check(int(ra2[1]) > 1016, f"rematch counted: {ra2}")
        a.send("TOP"); t = a.recv("TOP").split()
        check(t[1] == "2" and t[2] == "ALICE" and t[t.index('ME') + 1] == "1", f"ranking: {' '.join(t)}")
        # ---- persistence: restart keeps ratings
        a.send("LEAVE"); b.recv("BYE")
        time.sleep(0.5); srv.terminate(); srv.wait()
        srv = subprocess.Popen([BIN, "--port", str(port), "--db", db], stdout=subprocess.PIPE, text=True); time.sleep(0.3)
        w = a.hello().split(); check(w[2] == ra2[1] and w[3] == "2", f"ratings survive a restart: {w}")
        # ---- one session per player: logging in elsewhere replaces the old address
        a2 = P(port, "alice", "A" * 20); a2.hello(); a.send("ROOM"); check(a.recv("ERROR") == "ERROR LOGIN", "old session dropped")
        # ---- quick match does not pair far-apart ratings at once
        b.hello(); c.hello()
        print("all server tests passed")
    finally:
        srv.terminate()

main()
