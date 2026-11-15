# Balance (CPU HARD vs CPU HARD)

Measured headless with `tools/harness` (CMD norender, 60 s rounds, best of 3, both sides,
varied seeds, ~25 matches per pairing). CPU-vs-CPU numbers are a sanity check, not proof of
human-level balance.

| fighter | overall | notes |
|---|---|---|
| Hongryeon | 61% | fans + kicks, HP 960 |
| Danwoo | 54% | all-rounder, HP 1000 |
| Muyeong | 54% | longest reach, HP 930 |
| Cheonma | 51% | close-range pressure, playable version HP 1000 |
| Cheolsan | 44% | grappler, slowest, HP 1080 |
| Seolhwa | 44% | rushdown, fastest, HP 880 |
| Heukrim | 43% | zoner, fast footwork, HP 1000 |

Health follows the Street Fighter / Tekken rule of thumb: about 1000 for everyone, at most
+-10% (only the slow grappler gets more). Roles make the difference, not health.

Lopsided pairings left (n ~ 25 each, +-10%p noise): Seolhwa > Cheonma 77:23, Muyeong > Seolhwa 72:28,
Cheonma > Cheolsan 72:28, Hongryeon > Cheonma 72:28, Danwoo > Seolhwa 72:28, Hongryeon > Cheolsan 70:30.

Naegong (inner energy, added after players found fireball spam unanswerable):
specials 1 / 2 cost naegong (250-400 of 1000), refill 7 per tick, no refill while the special is out;
fireball recovery raised so a jump over it can be punished. Supers still use only the super gauge.

Pass history
1. 3 fighters: Cheolsan 64% -> command grab / throw / HP nerf; Muyeong 38% -> buffs
2. 4 fighters: Seolhwa 81% -> speed, damage, recovery nerfs
3. 6 fighters: Heukrim 15% -> HP, speed, startup, needles buffs; Muyeong slight nerf
4. CPU style per fighter (zoners keep range), varied seeds; Cheolsan small nerf
5. Heukrim 38% -> HP 1040, needles 65, sweep recovery 10
6. Naegong gauge: zoners collapsed (Heukrim 24%, Hongryeon 35%), Muyeong 67%
   -> cheaper zoner specials, Muyeong HP 940
7. Cheolsan 59% -> HP 1030; Heukrim HP 1070; Danwoo fireball 350 -> 45-58%
8. Matchups Cheolsan-Hongryeon 79:21 and Heukrim-Danwoo 73:27: Cheolsan's command grab dealt 63% of his damage
   -> grab reach 20 / damage 145; Hongryeon HP 1000 + longer uppercut invincibility; Danwoo fireball 300
   -> those two now 58:42 and 45:55, overall 44-56%
9. Gameplay patch (lighter light-hit pushback, heavies step in, overhead, reach-based guard, longer
   projectile recovery): Hongryeon 67%, Cheolsan 36%
10. Health by role (Cheolsan 1080, Muyeong 930, Seolhwa 880, Heukrim 1000 and faster, Hongryeon 960,
    smaller Hongryeon overhead, lighter Cheolsan grab and Heukrim heavy) -> 44-60%
11. Wake-up roll + 6-tick throw invulnerability after getting up, CPU re-decides its guard per attack and
    rolls / reverses on wake-up; Cheonma playable with his own kit (demon palm, draining command grab,
    burst super, +15% damage under 30% health): 43-61%, Cheonma 51%. Hongryeon still at the upper edge.
    (one heukrim-vs-seolhwa run crashed in LibreOffice: that pair has n=11)

Re-run: generate `tools/harness/scripts/bal_<a>_<b>.txt`, run them (optionally in parallel with
`HARNESS_PIPE=<name>`), then `python3 tools/harness/balance.py`.
