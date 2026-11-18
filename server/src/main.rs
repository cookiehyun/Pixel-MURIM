//! Pixel Murim online server (docs/ONLINE.md, milestones M3 / M4).
//!
//! One UDP socket, plain text messages, standard library only.
//!   * room codes: a player makes a room and gets a 4-letter code, a friend joins with it
//!   * quick match: ranked queue, players with close ratings are paired
//!   * relay: once two players are matched, every game message (PICK, START, I, H, PING ...)
//!     from one is forwarded to the other unchanged
//!   * results: both report the winner; only an agreeing ranked result changes the Elo ratings
//!   * ranking: top 10 and your own rank
//!
//! Client -> server
//!   HELLO <proto> <name> <token>     register / log in (token = secret made by the client)
//!   KEEP                             keep-alive (every few seconds)        -> KEPT
//!   ROOM                             make a room            -> ROOMCODE <code>
//!   JOINROOM <code>                  join a friend's room   -> MATCHED ... (both)
//!   QUEUE / UNQUEUE                  ranked quick match on / off -> QUEUED, MATCHED ...
//!   RESULT <match id> <game> <winner>  game = 1, 2, ... within the match; winner: 0 host, 1 guest,
//!                                    -1 draw. May be sent several times. -> RATING <new> <change>
//!   LEAVE                            leave the room / match (the partner gets BYE)
//!   TOP                              -> TOP <n> <name> <rating> ... ME <rank> <rating> <games>
//!   anything else while matched      relayed to the partner
//! Web players (browser) connect with WebSocket (--ws-port, 127.0.0.1 only; Caddy adds TLS in front)
//! and log in with HELLO PW1 ...: the same messages, but they are only ever paired with other web players.
//! Server -> client
//!   WELCOME <proto> <rating> <games> | ERROR <code> | ROOMCODE <code> | QUEUED | NOROOM
//!   MATCHED <match id> <role 0 host / 1 guest> <ranked 0/1> <opponent> <opponent rating>
//!   BYE (partner left / timed out) | RATING <rating> <change> | TOP ...

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const PROTO: &str = "PM4";
const WEB_PROTO: &str = "PW1"; // browser version: separate game data, never paired with Excel players
const DEFAULT_PORT: u16 = 47700;
const CLIENT_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_MSG: usize = 600;
const MAX_MSGS_PER_SEC: u32 = 120;
const START_RATING: f64 = 1000.0;
const K: f64 = 32.0;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Where {
    Idle,
    RoomHost,
    Queued(Instant),
    InMatch(u64),
}

struct Client {
    proto: String,
    token: String,
    name: String,
    last_seen: Instant,
    at: Where,
    window_start: Instant,
    window_count: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Player {
    pub name: String,
    pub rating: f64,
    pub games: u32,
    pub wins: u32,
}

struct Match {
    host: SocketAddr,
    guest: SocketAddr,
    ranked: bool,
    reports: HashMap<u32, [Option<i32>; 2]>, // game number -> what host / guest reported
    counted: Vec<u32>,                        // games already settled
}

enum Event {
    Msg(SocketAddr, String),
    Gone(SocketAddr), // a WebSocket closed
}

type WsMap = Arc<Mutex<HashMap<SocketAddr, TcpStream>>>;

pub struct Server {
    sock: UdpSocket,
    ws: WsMap,
    ws_port: u16,
    tx: Sender<Event>,
    rx: Receiver<Event>,
    clients: HashMap<SocketAddr, Client>,
    players: HashMap<String, Player>, // by token
    rooms: HashMap<String, SocketAddr>,
    matches: HashMap<u64, Match>,
    next_match: u64,
    db_path: String,
    rng: u64,
    dirty: bool,
}

// ---------------------------------------------------------------- pure helpers (unit tested)

/// Elo: expected score of a against b.
pub fn expected(ra: f64, rb: f64) -> f64 {
    1.0 / (1.0 + 10f64.powf((rb - ra) / 400.0))
}

/// New ratings after a game; score_a = 1 win, 0.5 draw, 0 loss.
pub fn elo(ra: f64, rb: f64, score_a: f64) -> (f64, f64) {
    let ea = expected(ra, rb);
    (ra + K * (score_a - ea), rb + K * ((1.0 - score_a) - (1.0 - ea)))
}

/// Quick match: may two queued players with these ratings and waits be paired?
/// The allowed gap grows with the shorter wait (100 + 25 per second, at most 800).
pub fn can_pair(ra: f64, rb: f64, wait_a: f64, wait_b: f64) -> bool {
    let wait = wait_a.min(wait_b);
    let allowed = (100.0 + 25.0 * wait).min(800.0);
    (ra - rb).abs() <= allowed
}

/// Names: A-Z 0-9, 1..10 chars (the game font has only these).
pub fn clean_name(s: &str) -> Option<String> {
    let n: String = s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_uppercase();
    if n.is_empty() || n.len() > 10 { None } else { Some(n) }
}

pub fn valid_token(s: &str) -> bool {
    (16..=40).contains(&s.len()) && s.chars().all(|c| c.is_ascii_alphanumeric())
}

pub fn parse_db(text: &str) -> HashMap<String, Player> {
    let mut m = HashMap::new();
    for line in text.lines() {
        let p: Vec<&str> = line.split('\t').collect();
        if p.len() < 5 || !valid_token(p[0]) {
            continue;
        }
        if let (Some(name), Ok(r), Ok(g), Ok(w)) = (clean_name(p[1]), p[2].parse(), p[3].parse(), p[4].parse()) {
            m.insert(p[0].to_string(), Player { name, rating: r, games: g, wins: w });
        }
    }
    m
}

pub fn format_db(players: &HashMap<String, Player>) -> String {
    let mut keys: Vec<&String> = players.keys().collect();
    keys.sort();
    let mut s = String::new();
    for k in keys {
        let p = &players[k];
        s.push_str(&format!("{}\t{}\t{}\t{}\t{}\n", k, p.name, p.rating, p.games, p.wins));
    }
    s
}

/// Ranked players (at least one game), best first; ties by more games then name.
pub fn ranking(players: &HashMap<String, Player>) -> Vec<(&String, &Player)> {
    let mut v: Vec<(&String, &Player)> = players.iter().filter(|(_, p)| p.games > 0).collect();
    v.sort_by(|a, b| {
        b.1.rating
            .partial_cmp(&a.1.rating)
            .unwrap()
            .then(b.1.games.cmp(&a.1.games))
            .then(a.1.name.cmp(&b.1.name))
    });
    v
}

// ---------------------------------------------------------------- server

impl Server {
    pub fn new(port: u16, ws_port: u16, db_path: &str) -> std::io::Result<Server> {
        let sock = UdpSocket::bind(("0.0.0.0", port))?;
        let (tx, rx) = channel();
        let players = fs::read_to_string(db_path).map(|t| parse_db(&t)).unwrap_or_default();
        let seed = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
        Ok(Server {
            sock,
            ws: Arc::new(Mutex::new(HashMap::new())),
            ws_port,
            tx,
            rx,
            clients: HashMap::new(),
            players,
            rooms: HashMap::new(),
            matches: HashMap::new(),
            next_match: 1,
            db_path: db_path.to_string(),
            rng: seed | 1,
            dirty: false,
        })
    }

    pub fn local_port(&self) -> u16 {
        self.sock.local_addr().map(|a| a.port()).unwrap_or(0)
    }

    fn rand(&mut self) -> u64 {
        // xorshift64*
        self.rng ^= self.rng >> 12;
        self.rng ^= self.rng << 25;
        self.rng ^= self.rng >> 27;
        self.rng.wrapping_mul(0x2545F4914F6CDD1D)
    }

    fn new_code(&mut self) -> String {
        const L: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I / O (look like 1 / 0)
        loop {
            let c: String = (0..4).map(|_| L[(self.rand() % L.len() as u64) as usize] as char).collect();
            if !self.rooms.contains_key(&c) {
                return c;
            }
        }
    }

    fn send(&self, to: SocketAddr, msg: &str) {
        if is_ws(to) {
            if let Some(st) = self.ws.lock().unwrap().get_mut(&to) {
                let _ = st.write_all(&ws_frame(msg.as_bytes()));
            }
        } else {
            let _ = self.sock.send_to(msg.as_bytes(), to);
        }
    }

    fn log(&self, s: &str) {
        println!("{} {}", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0), s);
        let _ = std::io::stdout().flush();
    }

    pub fn run(&mut self) {
        self.log(&format!("pixel murim server {} listening on UDP {}", PROTO, self.local_port()));
        // UDP (Excel players) on its own thread, feeding the same queue as the WebSockets
        let udp = self.sock.try_clone().expect("udp clone");
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 2048];
            loop {
                if let Ok((n, from)) = udp.recv_from(&mut buf) {
                    if n <= MAX_MSG {
                        if let Ok(text) = std::str::from_utf8(&buf[..n]) {
                            let _ = tx.send(Event::Msg(from, text.trim().to_string()));
                        }
                    }
                }
            }
        });
        if self.ws_port > 0 {
            match TcpListener::bind(("127.0.0.1", self.ws_port)) {
                Ok(l) => {
                    self.log(&format!("websocket (web players) on 127.0.0.1:{}", self.ws_port));
                    let (tx, map) = (self.tx.clone(), self.ws.clone());
                    std::thread::spawn(move || ws_accept(l, tx, map));
                }
                Err(e) => self.log(&format!("cannot open websocket port {}: {}", self.ws_port, e)),
            }
        }
        let mut last_sweep = Instant::now();
        loop {
            match self.rx.recv_timeout(Duration::from_millis(250)) {
                Ok(Event::Msg(from, text)) => self.handle(from, &text),
                Ok(Event::Gone(a)) => {
                    if self.clients.contains_key(&a) {
                        self.leave(a, true);
                        self.clients.remove(&a);
                    }
                }
                Err(_) => {} // timeout: fall through to the periodic work
            }
            if last_sweep.elapsed() >= Duration::from_millis(250) {
                last_sweep = Instant::now();
                self.sweep();
                self.matchmake();
                if self.dirty {
                    self.save();
                }
            }
        }
    }

    fn save(&mut self) {
        let tmp = format!("{}.tmp", self.db_path);
        if fs::write(&tmp, format_db(&self.players)).is_ok() && fs::rename(&tmp, &self.db_path).is_ok() {
            self.dirty = false;
        }
    }

    fn rate_ok(&mut self, from: SocketAddr) -> bool {
        if let Some(c) = self.clients.get_mut(&from) {
            if c.window_start.elapsed() >= Duration::from_secs(1) {
                c.window_start = Instant::now();
                c.window_count = 0;
            }
            c.window_count += 1;
            return c.window_count <= MAX_MSGS_PER_SEC;
        }
        true
    }

    pub fn handle(&mut self, from: SocketAddr, text: &str) {
        let p: Vec<&str> = text.split(' ').collect();
        if p.is_empty() || p[0].is_empty() {
            return;
        }
        if p[0] == "HELLO" {
            self.hello(from, &p);
            return;
        }
        if !self.clients.contains_key(&from) {
            self.send(from, "ERROR LOGIN");
            return;
        }
        if !self.rate_ok(from) {
            return;
        }
        self.clients.get_mut(&from).unwrap().last_seen = Instant::now();
        let at = self.clients[&from].at;
        match p[0] {
            "KEEP" => self.send(from, "KEPT"),
            "ROOM" => {
                self.leave(from, false);
                let code = self.new_code();
                self.rooms.insert(code.clone(), from);
                self.clients.get_mut(&from).unwrap().at = Where::RoomHost;
                self.send(from, &format!("ROOMCODE {}", code));
                self.log(&format!("room {} by {}", code, self.clients[&from].name));
            }
            "JOINROOM" if p.len() >= 2 => {
                let code = p[1].to_ascii_uppercase();
                match self.rooms.get(&code).copied() {
                    Some(host)
                        if host != from
                            && self.clients.get(&host).map(|c| c.proto.as_str()) == Some(self.clients[&from].proto.as_str()) =>
                    {
                        self.leave(from, false);
                        self.rooms.remove(&code);
                        self.start_match(host, from, false);
                    }
                    _ => self.send(from, "NOROOM"),
                }
            }
            "QUEUE" => {
                if !matches!(at, Where::Queued(_)) {
                    self.leave(from, false);
                    self.clients.get_mut(&from).unwrap().at = Where::Queued(Instant::now());
                }
                self.send(from, "QUEUED");
            }
            "UNQUEUE" => {
                if matches!(at, Where::Queued(_)) {
                    self.clients.get_mut(&from).unwrap().at = Where::Idle;
                }
            }
            "LEAVE" => self.leave(from, true),
            "TOP" => self.top(from),
            "RESULT" if p.len() >= 4 => {
                if let (Ok(id), Ok(g), Ok(w)) = (p[1].parse::<u64>(), p[2].parse::<u32>(), p[3].parse::<i32>()) {
                    self.result(from, id, g, w);
                }
            }
            _ => {
                // game traffic between the two players: relay as is
                if let Where::InMatch(id) = at {
                    if let Some(m) = self.matches.get(&id) {
                        let to = if m.host == from { m.guest } else { m.host };
                        self.send(to, text);
                        if p[0] == "BYE" {
                            self.end_match(id, Some(from));
                        }
                    }
                }
            }
        }
    }

    fn hello(&mut self, from: SocketAddr, p: &[&str]) {
        if p.len() < 4 || (p[1] != PROTO && p[1] != WEB_PROTO) || (p[1] == WEB_PROTO) != is_ws(from) {
            self.send(from, "ERROR VERSION");
            return;
        }
        let proto = p[1].to_string();
        let (name, token) = match (clean_name(p[2]), valid_token(p[3])) {
            (Some(n), true) => (n, p[3].to_string()),
            _ => {
                self.send(from, "ERROR NAME");
                return;
            }
        };
        // one session per player: a new HELLO from another address replaces the old one
        let old: Vec<SocketAddr> = self.clients.iter().filter(|(a, c)| c.token == token && **a != from).map(|(a, _)| *a).collect();
        for a in old {
            self.leave(a, true);
            self.clients.remove(&a);
        }
        let pl = self.players.entry(token.clone()).or_insert(Player { name: name.clone(), rating: START_RATING, games: 0, wins: 0 });
        if pl.name != name {
            pl.name = name.clone();
            self.dirty = true;
        }
        let (r, g) = (pl.rating, pl.games);
        let now = Instant::now();
        let c = self.clients.entry(from).or_insert(Client {
            proto: proto.clone(),
            token: token.clone(),
            name: name.clone(),
            last_seen: now,
            at: Where::Idle,
            window_start: now,
            window_count: 0,
        });
        c.last_seen = now;
        c.name = name;
        self.send(from, &format!("WELCOME {} {:.0} {}", proto, r, g));
    }

    fn rating_of(&self, a: SocketAddr) -> f64 {
        self.clients.get(&a).and_then(|c| self.players.get(&c.token)).map(|p| p.rating).unwrap_or(START_RATING)
    }

    fn start_match(&mut self, host: SocketAddr, guest: SocketAddr, ranked: bool) {
        let id = self.next_match;
        self.next_match += 1;
        self.matches.insert(id, Match { host, guest, ranked, reports: HashMap::new(), counted: Vec::new() });
        for a in [host, guest] {
            self.clients.get_mut(&a).unwrap().at = Where::InMatch(id);
        }
        let (hn, gn) = (self.clients[&host].name.clone(), self.clients[&guest].name.clone());
        let (hr, gr) = (self.rating_of(host), self.rating_of(guest));
        let rk = if ranked { 1 } else { 0 };
        self.send(host, &format!("MATCHED {} 0 {} {} {:.0}", id, rk, gn, gr));
        self.send(guest, &format!("MATCHED {} 1 {} {} {:.0}", id, rk, hn, hr));
        self.log(&format!("match {} {} {} vs {}", id, if ranked { "ranked" } else { "room" }, hn, gn));
    }

    /// Leave whatever the client is in; the partner of a match gets BYE when `tell` is set.
    fn leave(&mut self, a: SocketAddr, tell: bool) {
        let at = match self.clients.get(&a) {
            Some(c) => c.at,
            None => return,
        };
        match at {
            Where::RoomHost => self.rooms.retain(|_, h| *h != a),
            Where::InMatch(id) => {
                if tell {
                    if let Some(m) = self.matches.get(&id) {
                        let to = if m.host == a { m.guest } else { m.host };
                        self.send(to, "BYE");
                    }
                }
                self.end_match(id, Some(a));
            }
            _ => {}
        }
        if let Some(c) = self.clients.get_mut(&a) {
            c.at = Where::Idle;
        }
    }

    fn end_match(&mut self, id: u64, _by: Option<SocketAddr>) {
        if let Some(m) = self.matches.remove(&id) {
            for x in [m.host, m.guest] {
                if let Some(c) = self.clients.get_mut(&x) {
                    if c.at == Where::InMatch(id) {
                        c.at = Where::Idle;
                    }
                }
            }
        }
    }

    /// Both players report each game's winner (repeats are fine). When both reports for a game are
    /// in, they are compared once; ranked games that agree change the ratings.
    fn result(&mut self, from: SocketAddr, id: u64, game: u32, winner: i32) {
        let (host, guest, ranked, reports) = match self.matches.get_mut(&id) {
            Some(m) if m.host == from || m.guest == from => {
                if m.counted.contains(&game) || game == 0 || game > 1000 {
                    return;
                }
                let side = if m.host == from { 0 } else { 1 };
                let r = m.reports.entry(game).or_insert([None, None]);
                r[side] = Some(winner.clamp(-1, 1));
                if r[0].is_none() || r[1].is_none() {
                    return;
                }
                let r = *r;
                m.reports.remove(&game);
                m.counted.push(game);
                (m.host, m.guest, m.ranked, r)
            }
            _ => return,
        };
        if reports[0] != reports[1] {
            self.log(&format!("match {} result mismatch {:?} - not counted", id, reports));
            return;
        }
        if !ranked {
            return;
        }
        let winner = reports[0].unwrap();
        let (th, tg) = (self.clients[&host].token.clone(), self.clients[&guest].token.clone());
        let (rh, rg) = (self.players[&th].rating, self.players[&tg].rating);
        let score_h = match winner {
            0 => 1.0,
            1 => 0.0,
            _ => 0.5,
        };
        let (nh, ng) = elo(rh, rg, score_h);
        for (t, nr, won) in [(&th, nh, winner == 0), (&tg, ng, winner == 1)] {
            let p = self.players.get_mut(t).unwrap();
            p.rating = nr;
            p.games += 1;
            if won {
                p.wins += 1;
            }
        }
        self.dirty = true;
        self.send(host, &format!("RATING {:.0} {:+.0}", nh, nh - rh));
        self.send(guest, &format!("RATING {:.0} {:+.0}", ng, ng - rg));
        self.log(&format!("match {} ranked result {} : {:.0}->{:.0} / {:.0}->{:.0}", id, winner, rh, nh, rg, ng));
    }

    fn top(&self, to: SocketAddr) {
        let r = ranking(&self.players);
        let mut s = format!("TOP {}", r.len().min(10));
        for (_, p) in r.iter().take(10) {
            s.push_str(&format!(" {} {:.0}", p.name, p.rating));
        }
        let me = &self.clients[&to].token;
        let pos = r.iter().position(|(t, _)| *t == me).map(|i| i + 1).unwrap_or(0);
        let (mr, mg) = self.players.get(me).map(|p| (p.rating, p.games)).unwrap_or((START_RATING, 0));
        s.push_str(&format!(" ME {} {:.0} {}", pos, mr, mg));
        self.send(to, &s);
    }

    fn sweep(&mut self) {
        let dead: Vec<SocketAddr> = self.clients.iter().filter(|(_, c)| c.last_seen.elapsed() > CLIENT_TIMEOUT).map(|(a, _)| *a).collect();
        for a in dead {
            self.log(&format!("timeout {}", self.clients[&a].name));
            self.leave(a, true);
            self.clients.remove(&a);
        }
    }

    fn matchmake(&mut self) {
        let mut q: Vec<(SocketAddr, Instant, f64)> = self
            .clients
            .iter()
            .filter_map(|(a, c)| if let Where::Queued(t) = c.at { Some((*a, t, 0.0)) } else { None })
            .collect();
        let proto_of = |s: &Server, a: &SocketAddr| s.clients.get(a).map(|c| c.proto.clone()).unwrap_or_default();
        for e in q.iter_mut() {
            e.2 = self.rating_of(e.0);
        }
        q.sort_by_key(|e| e.1); // longest wait first
        let mut used = vec![false; q.len()];
        for i in 0..q.len() {
            if used[i] {
                continue;
            }
            let mut best: Option<usize> = None;
            for j in (i + 1)..q.len() {
                if used[j] {
                    continue;
                }
                let (wa, wb) = (q[i].1.elapsed().as_secs_f64(), q[j].1.elapsed().as_secs_f64());
                if proto_of(self, &q[i].0) == proto_of(self, &q[j].0)
                    && can_pair(q[i].2, q[j].2, wa, wb)
                    && best.is_none_or(|b| (q[j].2 - q[i].2).abs() < (q[b].2 - q[i].2).abs()) {
                        best = Some(j);
                    }
            }
            if let Some(j) = best {
                used[i] = true;
                used[j] = true;
                self.start_match(q[i].0, q[j].0, true); // the one who waited longer hosts
            }
        }
    }
}

fn main() {
    let mut port = DEFAULT_PORT;
    let mut ws_port: u16 = 0;
    let mut db = String::from("players.tsv");
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" if i + 1 < args.len() => {
                port = args[i + 1].parse().unwrap_or(DEFAULT_PORT);
                i += 1;
            }
            "--ws-port" if i + 1 < args.len() => {
                ws_port = args[i + 1].parse().unwrap_or(0);
                i += 1;
            }
            "--db" if i + 1 < args.len() => {
                db = args[i + 1].clone();
                i += 1;
            }
            _ => {}
        }
        i += 1;
    }
    let mut s = Server::new(port, ws_port, &db).unwrap_or_else(|e| {
        eprintln!("cannot open UDP port {}: {}", port, e);
        std::process::exit(1)
    });
    s.run();
}

// ---------------------------------------------------------------- WebSocket (RFC 6455, text frames only)

/// WebSocket players get a made-up address 0.x.y.z:1 so the rest of the server can treat them like UDP ones.
fn is_ws(a: SocketAddr) -> bool {
    matches!(a.ip(), IpAddr::V4(v) if v.octets()[0] == 0)
}

fn ws_accept(l: TcpListener, tx: Sender<Event>, map: WsMap) {
    let mut next: u32 = 1;
    for st in l.incoming().flatten() {
        let id = next;
        next = next.wrapping_add(1).max(1) & 0x00ff_ffff;
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(0, (id >> 16) as u8, (id >> 8) as u8, id as u8)), 1);
        let (tx, map) = (tx.clone(), map.clone());
        std::thread::spawn(move || {
            if let Some(w) = ws_handshake(&st) {
                map.lock().unwrap().insert(addr, w);
                ws_read_loop(st, addr, &tx, &map);
                map.lock().unwrap().remove(&addr);
                let _ = tx.send(Event::Gone(addr));
            }
        });
    }
}

/// Reads the HTTP upgrade request and answers it; returns a writer clone of the stream.
fn ws_handshake(st: &TcpStream) -> Option<TcpStream> {
    st.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
    let mut req = Vec::new();
    let mut b = [0u8; 1];
    let mut r = st;
    while !req.ends_with(b"\r\n\r\n") {
        if req.len() > 8192 || r.read(&mut b).ok()? == 0 {
            return None;
        }
        req.push(b[0]);
    }
    let text = String::from_utf8_lossy(&req);
    let key = text.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        if k.trim().eq_ignore_ascii_case("sec-websocket-key") { Some(v.trim().to_string()) } else { None }
    })?;
    let accept = base64(&sha1(format!("{}258EAFA5-E914-47DA-95CA-C5AB0DC85B11", key).as_bytes()));
    let mut w = st.try_clone().ok()?;
    let resp = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
        accept
    );
    w.write_all(resp.as_bytes()).ok()?;
    let _ = st.set_nodelay(true);
    st.set_read_timeout(Some(CLIENT_TIMEOUT)).ok()?;
    Some(w)
}

fn ws_read_loop(mut st: TcpStream, addr: SocketAddr, tx: &Sender<Event>, map: &WsMap) {
    loop {
        let mut h = [0u8; 2];
        if st.read_exact(&mut h).is_err() {
            return;
        }
        let op = h[0] & 0x0f;
        let masked = h[1] & 0x80 != 0;
        let mut len = (h[1] & 0x7f) as u64;
        if len == 126 {
            let mut e = [0u8; 2];
            if st.read_exact(&mut e).is_err() {
                return;
            }
            len = u16::from_be_bytes(e) as u64;
        } else if len == 127 {
            return; // nobody sends 64 KB game messages
        }
        if len > 4096 {
            return;
        }
        let mut mask = [0u8; 4];
        if masked && st.read_exact(&mut mask).is_err() {
            return;
        }
        let mut data = vec![0u8; len as usize];
        if st.read_exact(&mut data).is_err() {
            return;
        }
        if masked {
            for (k, d) in data.iter_mut().enumerate() {
                *d ^= mask[k % 4];
            }
        }
        match op {
            1 => {
                if data.len() <= MAX_MSG {
                    if let Ok(t) = String::from_utf8(data) {
                        let _ = tx.send(Event::Msg(addr, t.trim().to_string()));
                    }
                }
            }
            8 => return,
            9 => {
                let mut f = vec![0x8a, data.len() as u8];
                f.extend_from_slice(&data);
                if let Some(w) = map.lock().unwrap().get_mut(&addr) {
                    let _ = w.write_all(&f);
                }
            }
            _ => {}
        }
    }
}

pub fn ws_frame(payload: &[u8]) -> Vec<u8> {
    let mut f = vec![0x81];
    if payload.len() < 126 {
        f.push(payload.len() as u8);
    } else {
        f.push(126);
        f.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    }
    f.extend_from_slice(payload);
    f
}

pub fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    let mut m = data.to_vec();
    let bits = (data.len() as u64) * 8;
    m.push(0x80);
    while m.len() % 64 != 56 {
        m.push(0);
    }
    m.extend_from_slice(&bits.to_be_bytes());
    for chunk in m.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[4 * i], chunk[4 * i + 1], chunk[4 * i + 2], chunk[4 * i + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for (i, wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | (!b & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let t = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(*wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = t;
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }
    let mut out = [0u8; 20];
    for i in 0..5 {
        out[4 * i..4 * i + 4].copy_from_slice(&h[i].to_be_bytes());
    }
    out
}

pub fn base64(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::new();
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for k in 0..4 {
            if k <= c.len() {
                s.push(T[(n >> (18 - 6 * k) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_accept_key() {
        // the example from RFC 6455 section 1.3
        let k = base64(&sha1(b"dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11"));
        assert_eq!(k, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }

    #[test]
    fn elo_even_win() {
        let (a, b) = elo(1000.0, 1000.0, 1.0);
        assert!((a - 1016.0).abs() < 1e-9 && (b - 984.0).abs() < 1e-9);
    }

    #[test]
    fn elo_upset_moves_more() {
        let (a, _) = elo(900.0, 1100.0, 1.0);
        assert!(a - 900.0 > 16.0);
        let (c, _) = elo(1100.0, 900.0, 1.0);
        assert!(c - 1100.0 < 16.0);
    }

    #[test]
    fn elo_draw_even_no_change() {
        let (a, b) = elo(1000.0, 1000.0, 0.5);
        assert!((a - 1000.0).abs() < 1e-9 && (b - 1000.0).abs() < 1e-9);
    }

    #[test]
    fn pairing_window_grows() {
        assert!(can_pair(1000.0, 1090.0, 0.0, 0.0));
        assert!(!can_pair(1000.0, 1300.0, 0.0, 0.0));
        assert!(can_pair(1000.0, 1300.0, 10.0, 12.0));
        assert!(!can_pair(1000.0, 1900.0, 999.0, 999.0));
    }

    #[test]
    fn names_and_tokens() {
        assert_eq!(clean_name("kim_99"), Some("KIM99".into()));
        assert_eq!(clean_name("___"), None);
        assert_eq!(clean_name("ABCDEFGHIJK"), None);
        assert!(valid_token("abcDEF0123456789"));
        assert!(!valid_token("short"));
        assert!(!valid_token("abc def 0123456789"));
    }

    #[test]
    fn db_round_trip_and_ranking() {
        let mut m = HashMap::new();
        m.insert("t".repeat(16), Player { name: "AAA".into(), rating: 1010.5, games: 3, wins: 2 });
        m.insert("u".repeat(16), Player { name: "BBB".into(), rating: 990.0, games: 1, wins: 0 });
        m.insert("v".repeat(16), Player { name: "NEW".into(), rating: 1000.0, games: 0, wins: 0 });
        let back = parse_db(&format_db(&m));
        assert_eq!(back, m);
        let r = ranking(&m);
        assert_eq!(r.len(), 2); // no games = not ranked
        assert_eq!(r[0].1.name, "AAA");
    }
}
