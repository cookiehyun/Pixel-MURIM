"""Stand-in opponent for testing Pixel Murim online play with ONE copy of Excel.

It speaks the same protocol as src/Online.bas (docs/ONLINE.md) but does not run the game:
it just plays random inputs (or stands still). Use it to check that Excel's networking works
on a machine before trying two machines.

  Excel hosts, this program joins (same computer):
      python3 tools/online_peer.py join 127.0.0.1
  This program hosts, Excel joins (type this computer's IP, or 127.0.0.1 on the same computer):
      python3 tools/online_peer.py host

Options: --fighter N (0-5, default 2 = Muyeong), --idle (stand still), --stage N (when hosting).
Stop with Ctrl+C (it tells Excel it left).
"""
import argparse, random, socket, sys, time

PROTO = "PM2"
PORT = 47700
TICK = 0.05            # 20 ticks per second, like the game


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["host", "join"])
    ap.add_argument("ip", nargs="?", default="127.0.0.1")
    ap.add_argument("--fighter", type=int, default=2)
    ap.add_argument("--stage", type=int, default=0)
    ap.add_argument("--idle", action="store_true")
    a = ap.parse_args()

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setblocking(False)
    if a.mode == "host":
        s.bind(("0.0.0.0", PORT))
        peer = None
        print(f"hosting on UDP {PORT}: in Excel choose MULTIPLAYER > ONLINE > JOIN GAME")
    else:
        s.bind(("0.0.0.0", 0))
        peer = (a.ip, PORT)
        print(f"joining {a.ip}:{PORT}: in Excel choose MULTIPLAYER > ONLINE > HOST GAME first")

    state = "wait"            # wait -> lobby -> fight
    excel_slot, excel_ready = 0, False
    delay, nxt, need_from_excel = 3, 0, 0
    inputs = {}
    t = 0
    rnd = random.Random(1)
    cur = 0
    s_start = ""

    def send(msg):
        if peer:
            s.sendto(msg.encode("ascii"), peer)

    def my_input(frame):
        nonlocal cur
        if a.idle:
            return 0
        if frame % 4 == 0:
            d = rnd.choice([0, 1, 2, 2, 1, 4, 8, 9, 10, 0])
            b = 0
            if rnd.random() < 0.4:
                b = 1 << rnd.randrange(4)
            cur = d | (b << 4) | (b << 8)
            return cur
        return cur & 0xF0F          # keep holding, no new press

    try:
        while True:
            t += 1
            # ---- receive
            while True:
                try:
                    data, addr = s.recvfrom(1500)
                except (BlockingIOError, ConnectionResetError):
                    break
                msg = data.decode("ascii", "replace").strip()
                p = msg.split(" ")
                if a.mode == "host" and peer is None and p[0] == "HELLO":
                    peer = addr
                    print("Excel connected from", addr)
                if addr != peer:
                    continue
                if p[0] == "HELLO":
                    send("WELCOME " + PROTO)
                    if state == "wait":
                        state = "lobby"
                elif p[0] == "WELCOME" and state == "wait":
                    state = "lobby"
                    print("connected to Excel")
                elif p[0] == "PICK":
                    if state == "fight":                 # Excel is back in the lobby: match over
                        print("match over, back in the lobby")
                        state, inputs, need_from_excel = "lobby", {}, 0
                    excel_slot, excel_ready = int(p[1]), p[2] == "1"
                elif p[0] == "PING":
                    send("PONG " + p[1])
                elif p[0] == "START" and state != "fight":
                    delay = int(p[4])
                    state, nxt = "fight", delay
                    print("fight started, input delay", delay)
                elif p[0] == "I":
                    need_from_excel = int(p[2])          # Excel has our frames below this
                elif p[0] == "BYE":
                    print("Excel left")
                    if a.mode == "join":
                        return
                    peer, state, inputs, need_from_excel = None, "wait", {}, 0
            # ---- send
            if state == "wait" and a.mode == "join" and t % 10 == 1:
                send("HELLO " + PROTO)
            if state == "lobby":
                if t % 5 == 1:
                    send(f"PICK {a.fighter} 1")
                if a.mode == "host" and excel_ready and t % 10 == 0:
                    start = f"START {a.fighter} {excel_slot} {a.stage} {delay}"
                    send(start)
                    state, nxt = "fight", delay
                    print("fight started (we host), Excel plays slot", excel_slot)
                    s_start = start
            if state == "fight":
                # stay at most a little ahead of what Excel has confirmed
                while nxt <= need_from_excel + delay + 4:
                    inputs[nxt] = my_input(nxt)
                    nxt += 1
                first = max(0, nxt - 8)
                send(f"I {first} 0 " + " ".join(f"{inputs.get(f, 0):03X}" for f in range(first, nxt)))
                if a.mode == "host" and t % 10 == 0 and need_from_excel <= delay and s_start:
                    send(s_start)                            # START may have been lost
            time.sleep(TICK)
    except KeyboardInterrupt:
        for _ in range(3):
            send("BYE")
        print("bye")


if __name__ == "__main__":
    main()
