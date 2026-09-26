# Century Link Board — requirements for another agent

English-only static PWA for GitHub Pages. No backend. Browser calls official Hong Kong open-data APIs directly (`Access-Control-Allow-Origin: *` on Citybus; KMB `data.etabus.gov.hk` is also used from the browser).

Timezone for every clock and service window: `Asia/Hong_Kong`. There is no DST.

---

## 1. Product

A commuter board for one person who:

1. Walks to **Century Link, Ying Hei Road** in Tung Chung North.
2. Takes **Citybus E11S** on weekday mornings toward Tin Hau.
3. Alights at **Western Harbour Crossing Bus-Bus Interchange (WHC BBI)**.
4. Changes to **960X, 968X, 960B, 982C or 955** toward **North Point Government Primary School, King’s Road**.

The user wrote “North Point Government Highschool”. The stop these five routes actually serve is **North Point Government Primary School (北角官立小學)** on King’s Road / the adjacent Java Road fire-station stop. Label it that way. Do not invent a high-school stop ID.

Language: **English only**. No language toggle.

---

## 2. Hard-coded IDs

### Home and nearby Citybus poles

| Role | Stop ID | English name | Why it is here |
|---|---|---|---|
| Home | `003443` | Century Link, Ying Hei Road | E11S seq 9 outbound |
| Nearby | `003454` | The Visionary, Ying Tung Road | S56 seq 7; ~3 min walk |
| Nearby | `001882` | Caribbean Coast Phase 1, Man Tung Road | All-day E11A / E21D |
| Nearby | `001880` | Caribbean Coast Phase 2, Man Tung Road | E11A / S56 corridor |
| Nearby | `001878` | Coastal Skyline, Man Tung Road | All-day Citybus |

`003443` only has special routes: E11S, E22S, E23A inbound, N21A, R11B. On Saturday afternoon the batch ETA is empty. That is correct.

### E11S path

| Seq | Stop ID | Name |
|---|---|---|
| 1 | `003566` | Mun Tung Estate |
| 8 | `001882` | Caribbean Coast Phase 1 |
| 9 | `003443` | Century Link, Ying Hei Road |
| 11 | `001629` | Western Harbour Crossing BBI |
| 23 | `001363` | Tin Hau Station |

Direction for E11S is outbound only. `route-stop/CTB/E11S/inbound` returns no stops.

### WHC interchange and school

| Operator | Place | Stop ID | Notes |
|---|---|---|---|
| Citybus | WHC BBI island-bound | `001629` | E11S, 955, 982C use this pole |
| Citybus | WHC BBI opposite bound | `001628` | Do **not** use for this commute |
| KMB | WHC BBI island-bound (YT311) | `E18D73287340B634` | 960X inbound, 968X outbound, 960B inbound |
| KMB | WHC BBI NT-bound (YT603) | `AD97EA183A25102C` | Evening / reverse. Do **not** use in the morning |
| Citybus | North Point Government Primary School, King’s Road | `001267` | 955 / 982C toward Sai Wan Ho |
| KMB | NORTH POINT GOVERNMENT PRIMARY SCHOOL (ED352) | `85CACCFD0C731C5B` | 960X / 968X / 960B toward Quarry Bay |
| Citybus | North Point Fire Station, Java Road | `001258` | One stop before the school on 955 / 982C |

---

## 3. API catalogue

Base URLs

- Citybus V2: `https://rt.data.gov.hk/v2/transport/citybus/`
- Citybus/NLB batch: `https://rt.data.gov.hk/v1/transport/batch/` and `https://rt.data.gov.hk/v1.1/transport/batch/`
- KMB/LWB: `https://data.etabus.gov.hk/v1/transport/kmb/`

Do **not** use Citybus V1 ` /v1/transport/citybus-nwfb/` except as historical reference.

### Citybus — static

```
GET /v2/transport/citybus/company/CTB
GET /v2/transport/citybus/route/CTB
GET /v2/transport/citybus/route/CTB/{route}
GET /v2/transport/citybus/stop/{stop_id}
GET /v2/transport/citybus/route-stop/CTB/{route}/outbound
GET /v2/transport/citybus/route-stop/CTB/{route}/inbound
GET /v1.1/transport/batch/stop-route/CTB/{stop_id}
```

Worked URLs

```
https://rt.data.gov.hk/v2/transport/citybus/route/CTB/E11S
https://rt.data.gov.hk/v2/transport/citybus/route/CTB/S56
https://rt.data.gov.hk/v2/transport/citybus/route/CTB/955
https://rt.data.gov.hk/v2/transport/citybus/route/CTB/982C
https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/E11S/outbound
https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/S56/outbound
https://rt.data.gov.hk/v2/transport/citybus/stop/003443
https://rt.data.gov.hk/v2/transport/citybus/stop/003454
https://rt.data.gov.hk/v1.1/transport/batch/stop-route/CTB/003443
https://rt.data.gov.hk/v1.1/transport/batch/stop-route/CTB/003454
```

### Citybus — live ETA

```
GET /v2/transport/citybus/eta/CTB/{stop_id}/{route}
GET /v1/transport/batch/stop-eta/CTB/{stop_id}
```

Worked URLs

```
https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/003443/E11S
https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/001629/E11S
https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/001629/955
https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/001629/982C
https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/003454/S56
https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/003443
https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/003454
https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/001882
```

ETA object fields that matter: `route`, `dir`, `seq`, `stop`, `dest_en`, `eta_seq`, `eta`, `rmk_en`, `rmk_tc`, `data_timestamp`.

- `eta` empty string + remark `KMB Cycle` / `九巴時段` = scheduled slot from the other joint operator.
- `data: []` = nothing predicted.
- Citybus V2 does **not** expose `noGPS` / `departed`. Those batch fields are NLB-only.

Cache: `Cache-Control: max-age=45`. Poll every 15–20 seconds while the tab is visible. Honour HTTP 429.

Docs

- https://data.gov.hk/en-data/dataset/ctb-eta-transport-realtime-eta
- https://www.citybus.com.hk/datagovhk/bus_eta_api_specifications.pdf
- https://www.citybus.com.hk/datagovhk/bus_eta_data_dictionary.pdf
- https://static.data.gov.hk/opendata/eta/bus-route-list-and-eta-specific-stop-api-specifications.pdf

### KMB — static

```
GET https://data.etabus.gov.hk/v1/transport/kmb/route/
GET https://data.etabus.gov.hk/v1/transport/kmb/route/{route}/{bound}/{service_type}
GET https://data.etabus.gov.hk/v1/transport/kmb/route-stop/{route}/{bound}/{service_type}
GET https://data.etabus.gov.hk/v1/transport/kmb/stop
GET https://data.etabus.gov.hk/v1/transport/kmb/stop/{stop_id}
```

`bound` is `outbound` or `inbound` in the path (`O` / `I` in the payload). `service_type` is `1` for these routes.

Verified variants

| Route | Bound path | Origin → destination (morning useful direction) |
|---|---|---|
| 960X | `inbound` | Tuen Mun / Hung Shui Kiu → Quarry Bay (King’s Road) |
| 968X | `outbound` | Yuen Long (Tak Yip Street) → Quarry Bay (King’s Road) |
| 960B | `inbound` | Tuen Mun (Kin Sang) → Quarry Bay (King’s Road) |

KMB stores 960X *outbound* as Hung Shui Kiu → Quarry Bay. Use the variant whose destination is Quarry Bay / King’s Road. Confirm with `/route/960X/inbound/1` and `/route/960X/outbound/1` if IDs drift.

Worked URLs

```
https://data.etabus.gov.hk/v1/transport/kmb/route/960X/outbound/1
https://data.etabus.gov.hk/v1/transport/kmb/route-stop/960X/outbound/1
https://data.etabus.gov.hk/v1/transport/kmb/route-stop/968X/outbound/1
https://data.etabus.gov.hk/v1/transport/kmb/route-stop/960B/inbound/1
https://data.etabus.gov.hk/v1/transport/kmb/stop/E18D73287340B634
https://data.etabus.gov.hk/v1/transport/kmb/stop/85CACCFD0C731C5B
```

### KMB — live ETA

```
GET https://data.etabus.gov.hk/v1/transport/kmb/eta/{stop_id}/{route}/{service_type}
GET https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/{stop_id}
```

Worked URLs

```
https://data.etabus.gov.hk/v1/transport/kmb/eta/E18D73287340B634/960X/1
https://data.etabus.gov.hk/v1/transport/kmb/eta/E18D73287340B634/968X/1
https://data.etabus.gov.hk/v1/transport/kmb/eta/E18D73287340B634/960B/1
https://data.etabus.gov.hk/v1/transport/kmb/eta/85CACCFD0C731C5B/960X/1
```

KMB remarks such as `Scheduled Bus` / `原定班次` mean timetable, not AVL.

Docs

- https://data.gov.hk/en-data/dataset/hk-td-tis_21-etakmb
- https://data.etabus.gov.hk/datagovhk/kmb_eta_data_dictionary.pdf

955 and 982C are **Citybus**, not KMB.

---

## 4. Classification logic

For each ETA row:

```
remark = rmk_en + rmk_tc + rmk
scheduled = remark matches /cycle|scheduled|時段|班次|timetable/i
mins = round((parse(eta) - now) / 60000)
age = now - parse(data_timestamp)

if eta empty and scheduled -> SCHEDULED
if eta empty -> UNCERTAIN
if scheduled -> SCHEDULED
if age > 120s -> STALE
else -> LIVE
```

Empty `data` array is not “scheduled”. Combine it with the service calendar:

- E11S: Monday–Friday 06:20–08:20 at Ying Hei Road.
- If empty inside that window → “No vehicle reporting yet”.
- If empty outside that window → “No service”.

Never invent an arrival from a printed timetable and label it live.

---

## 5. Nearby-stop logic

1. Render tabs for the five poles in section 2.
2. On select, call `GET /v1/transport/batch/stop-eta/CTB/{stop_id}`.
3. Show up to 8 soonest rows, each with route, destination, minutes, live/scheduled chip.
4. Prefetch the other poles in the background so tab switches are instant.
5. Default selected tab: The Visionary `003454` (S56 lives here; home pole is often empty).

S56 is a daily circular. It is the route that should populate The Visionary on weekends when E11S is dead.

---

## 6. Weekday connection mapper

Commuter path

```
Ying Hei 003443  --E11S-->  WHC BBI 001629
                         wait / walk 3–8 min
                         --960X / 968X / 960B / 982C / 955-->
                         North Point Government Primary School
```

### Published windows (weekday only)

These are planning envelopes, not official GTFS. Live ETA overrides them when present.

| Route | Operator | Useful direction | Approximate WHC window |
|---|---|---|---|
| E11S | CTB | Mun Tung → Tin Hau | 07:05–08:40 at WHC |
| 960X | KMB | Hung Shui Kiu → Quarry Bay | 06:40–09:20 |
| 968X | KMB | Yuen Long → Quarry Bay | 07:10–09:10 |
| 960B | KMB | Kin Sang → Quarry Bay | 07:00–09:20 |
| 955 | CTB | Ching Tin → Sai Wan Ho | 07:00–09:30 |
| 982C | CTB | Shek Mun → Sai Wan Ho | 07:00–09:00 |

Saturday, Sunday, public holiday: mark every connector **Weekend / off**. Do not suggest a transfer.

### Live matching algorithm

```
e11s_whc = first live E11S ETA at CTB 001629
ready_at = e11s_whc.eta + interchange_walk   # default 5 min

for each connector:
  next = first live ETA at that connector’s WHC stop
  if weekend: OFF
  else if next and e11s_whc:
      if next.eta >= ready_at: POSSIBLE (slack = next.eta - ready_at)
      else: TIGHT / MISS
  else if next and inside window: LIVE (no E11S pairing yet)
  else if inside window: IN WINDOW, no vehicle
  else: OFF WINDOW
```

Optional extra: also fetch school-stop ETA (`001267` / `85CACCFD0C731C5B`) to show “minutes after boarding”. Not required for v1.

Interchange walk is user-configurable (3 / 5 / 8 min) because CTB and KMB poles at WHC are not the same physical kiosk.

---

## 7. UI requirements

1. Hero: next E11S minutes at `003443`, live chip, clock time, destination.
2. “Leave home by” = first E11S minutes − walk-to-stop.
3. E11S list (max 3).
4. Nearby stop tabs + live list.
5. WHC connection cards for the five routes with Possible / Tight / Weekend labels.
6. Notify at 3 minutes via the Notification API only while the tab is open. GitHub Pages cannot do true Web Push.
7. Poll 15s when visible; pause when hidden.
8. English copy only.
9. Footer cites DATA.GOV.HK / Citybus / KMB and prints stop IDs.

Empty Saturday state must stay honest for E11S and the connectors, while nearby poles still show S56 / E11A / E21D.

---

## 8. Stack and deploy

- Static `index.html` + `styles.css` + `app.js`.
- GitHub Pages from repo root. Keep relative `./` paths.
- No API keys.
- Service worker may cache the shell. **Never cache** `rt.data.gov.hk` or `data.etabus.gov.hk`.
- Optional later: Cloudflare Worker + Web Push. Not needed for Pages.

---

## 9. Acceptance checks

| When | Expected |
|---|---|
| Saturday afternoon, home stop | E11S empty + “No service”. Nearby Visionary / Caribbean Coast still list live buses if the feed has them. Connectors marked Weekend. |
| Monday 07:10, home stop | Live E11S minutes at `003443`. |
| Monday 07:40 | E11S ETA at `001629` plus at least one connector Possible or Tight. |
| Feed timeout | Last snapshot / visible error. No fake timetable. |
| Wrong WHC pole `001628` | Must not be used for morning island-bound matching. |

---

## 10. Current implementation map

| File | Role |
|---|---|
| `index.html` | English layout |
| `styles.css` | Century Link board theme |
| `app.js` | Fetch, classify, nearby tabs, WHC matcher |
| `manifest.json` / `sw.js` / `favicon.svg` | PWA shell |
| `README.md` | Pages deploy notes |
| `REQUIREMENTS.md` | This file |
