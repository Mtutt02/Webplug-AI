# StrikeCast — Bowling Delivery Biomechanics & Sensor Detection Spec

**Purpose:** Engineering reference for detecting a real ten-pin bowling delivery from (A) a phone swung like a ball (linear acceleration + gyroscope) and (B) a webcam tracking a bare hand (21 MediaPipe landmarks), and for coaching the bowler. Section 5 is the load-bearing part for detection code; Sections 1–4 are the physical model behind it.

**One-line model of the delivery the tester described (and that the literature confirms):** you grip the ball, swing it back behind you, then on the downswing it whips forward and the hand releases it with the ball traveling **forward and slightly up and out** while the **fingers lift and the wrist/forearm rotates** (for a right-hander, counter-clockwise). The hook is created by that **lift + turn at the bottom of the swing**, not by a downward chop. ([bowlerx.com](https://www.bowlerx.com/resources/how-release-bowling-ball.html), [Wikipedia: Hook (bowling)](https://en.wikipedia.org/wiki/Hook_(bowling)))

---

## 1. The delivery, phase by phase (what the hand/arm does)

Sequence (4- or 5-step approach): **stance/address → pushaway → backswing → downswing → slide → release → follow-through.** The ball swings as a pendulum off the shoulder; the feet and the swing must arrive at the foul line together. ([USA Bowling lesson sheet](https://bpaa.com/Portals/0/Learn%20the%20Sport/LearntheSportWeek2LessonPRINT.pdf), [AMF release guide](https://www.amf.com/blog/a-guide-to-bowling-release-tips-and-tricks))

| Phase | Hand/arm direction | Rough hand speed | Wrist / fingers |
|---|---|---|---|
| **Stance / address** | Still, ball held at waist/chest, elbow in | ~0 | Wrist firm (ideally slightly cupped), fingers + thumb in the ball, hand behind/under the ball. Thumb pointed straight ahead — a thumb angled out pushes the swing off-plane. ([Human Kinetics](https://us.humankinetics.com/blogs/excerpt/hand-positions-for-different-releases)) |
| **Pushaway** | Ball pushed **forward and slightly down/out**, away from the body | Slow, 0.5–1 m/s | Wrist holds its set position; no turn yet. Pushaway direction sets the whole swing plane. |
| **Backswing** | Ball falls from the pushaway then swings **up and back** behind the bowler to the apex | Accelerating then decelerating to ~0 at the top | Wrist stays firm; hand stays **behind/under** the ball ("leading with the pinkie"). No conscious turn. Apex height roughly correlates with the speed that will be generated. ([Human Kinetics](https://us.humankinetics.com/blogs/excerpt/hand-positions-for-different-releases)) |
| **Downswing** | Ball drops from apex **down and forward**, accelerating toward the bottom of the arc (past the sliding ankle) | Fastest of the swing; hand/ball reaches ~6–10 m/s near the bottom | Wrist still firm and behind the ball; the turn has NOT started yet — turning early "tops" the ball. ([bowlerx.com](https://www.bowlerx.com/resources/how-release-bowling-ball.html)) |
| **Slide** | Non-swing-side footwork; slide foot plants as the ball reaches the **bottom** of the swing | — (feet, not hand) | Timing checkpoint: ball should reach the bottom of the swing **as the slide foot plants**. Ball too early/late = bad timing. ([AMF](https://www.amf.com/blog/a-guide-to-bowling-release-tips-and-tricks), [Human Kinetics timing](https://uk.humankinetics.com/blogs/excerpt/timing-on-the-approach)) |
| **RELEASE** | Ball goes **forward, up and out** past the slide foot | Peak forward speed; the throw | Thumb exits first; the two middle fingers then **lift and turn** the underside of the ball **upward and to the side** — this is the "lift and turn" that makes revs + hook. Up-and-out, not down. (Section 2) |
| **Follow-through** | Arm continues **forward and up**, elbow finishing above shoulder, hand toward the target | Decelerating to 0 | Hand finishes high and toward target; "reach for the handshake." Staying behind the ball through the finish is the cue. ([USA Bowling](https://bpaa.com/Portals/0/Learn%20the%20Sport/LearntheSportWeek2LessonPRINT.pdf), [bowl.com drill](https://bowl.com/news/a-drill-for-staying-behind-the-ball)) |

**Timing / tempo (whole motion):** coaches judge "terminal timing" by where the ball is in the arc when the slide step begins; good timing = **repeatable** timing, checked at two points, the ball-start and the swing apex. Early timing (feet done before the arm reaches release) kills finger leverage. ([bowlingthismonth.com](https://bowlingthismonth.com/quick-tips/improving-timing-consistency), [Human Kinetics](https://uk.humankinetics.com/blogs/excerpt/timing-on-the-approach))

---

## 2. The release in detail (the key to revs and hook)

**Lift and turn.** At the bottom of the swing the thumb falls out of the ball first; the middle and ring fingers then stay in a split-second longer and **rotate the underside of the ball upward and around** — "lift." This forward-and-up finger action is what imparts revolutions. Coming *over the top* of the ball makes it spin/slide instead of hook. ([Wikipedia: Hook](https://en.wikipedia.org/wiki/Hook_(bowling)), [bowling.com Q&A](https://www.bowling.com/knowledge-hub/questions/bowling-tips/hooking-a-bowling-ball/question_7_what-is-the-correct-way-to-release-the-ball-for-a-hook))

**Why up-and-forward, not a downward chop.** The ball is already moving forward at the bottom of the pendulum; the fingers add an *upward* leverage as the ball rolls off them. A downward motion ("topping," hand getting on top of the ball) removes the fingers' ability to lift and produces a spinning, weak ball. The finish is up and out toward the target, elbow above shoulder. ([bowlerx.com](https://www.bowlerx.com/resources/how-release-bowling-ball.html), [bowl.com](https://bowl.com/news/a-drill-for-staying-behind-the-ball))

**Staying behind / under the ball.** Before release the hand should be *behind and slightly under* the ball (thumb roughly 10–12 o'clock, fingers 4–6 o'clock for a right-hander), not on top. Getting on top early is the classic fault. ([bowling.com Q&A](https://www.bowling.com/knowledge-hub/questions/bowling-tips/hooking-a-bowling-ball/question_7_what-is-the-correct-way-to-release-the-ball-for-a-hook), [bowl.com drill](https://bowl.com/news/a-drill-for-staying-behind-the-ball))

**Wrist position (cupped / firm / broken).**
- *Cupped* (flexed toward the forearm) = more revs / more hook.
- *Firm/flat* = moderate.
- *Broken* (hyperextended back, hand on top) = fewer revs, weaker roll.
Turning with the **forearm** (not just snapping the wrist) keeps the thumb exiting first; turning with the wrist alone risks topping the ball. ([bowlerx.com](https://www.bowlerx.com/resources/how-release-bowling-ball.html))

**Axis rotation vs axis tilt (the two angles the turn creates):**
- **Axis rotation** = the *horizontal* angle of the ball's spin axis (a.k.a. side roll). 0° = pure end-over-end (no hook); ~90° = maximum side spin. More rotation = longer skid then more backend hook. A typical natural release is ~**45°**; most bowlers sit **35–65°**. ([Storm](https://www.stormbowling.com/read/ten-pin-bowling-roll-technique), [National Bowling Academy](https://www.nationalbowlingacademy.com/video/axis-rotation-axis-tilt-bowling-release-adjustments), [Wikipedia: Bowling form](https://en.wikipedia.org/wiki/Bowling_form))
- **Axis tilt** = the *vertical* angle of the spin axis. Low tilt = ball rolls like a car wheel (more hook); high tilt = "spinner," rolls more like a top (longer skid, less hook). Useful manipulation range is small, roughly **10–15°** for most, up to ~25°+ for spinners. ([bowlingthismonth.com](https://www.bowlingthismonth.com/bowling-tips/introduction-to-bowling-ball-axis-control/print), [Storm](https://www.stormbowling.com/read/axis-tilt-bowling-explained))

**Styles (same mechanics, different amounts of turn/speed):**
- **Stroker** — smooth, finesse; low-to-moderate revs, stays behind the ball, little turn. Speed-dominant.
- **Tweener** — between stroker and cranker; moderate revs and speed.
- **Cranker** — big backswing, strong wrist cup + aggressive turn, high revs, more axis rotation; rev-dominant. A "power stroker" (e.g., Pete Weber) gets high revs from a crisp wrist/finger snap rather than muscling the swing. ([bowling.com bowler types](https://www.bowling.com/knowledge-hub/bowling-balls/bowler-types/all), [Wikipedia: Bowling form](https://en.wikipedia.org/wiki/Bowling_form))

---

## 3. The numbers that define a delivery

### Rev rate, speed, axis by style

| Style | Rev rate (RPM) | Ball speed (mph) | Notes |
|---|---|---|---|
| Stroker | 200–300 | 14–18 | Finesse, stays behind ball |
| Tweener | 300–400 | 15–19 | In-between |
| Cranker | 400–600+ | 16–20 | High revs, big turn |
| Spinner | 200–350 | 13–17 | High axis **tilt**, little hook |
| Two-hander | 500–700+ | 17–22 | Highest revs |

Source: [bowling.com bowler types](https://www.bowling.com/knowledge-hub/bowling-balls/bowler-types/all); tweener band 300–370 also per [Wikipedia](https://en.wikipedia.org/wiki/Bowling_form).

### Population / "average" benchmarks
- **Average rev rate ≈ 325 RPM** (300–350 "average"). ([motivbowling.com](https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html))
- **Average ball speed ≈ 17–18 mph.** ([motivbowling.com](https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html))
- Rule of thumb: speed and revs should scale together, ~**50 RPM per 1 mph**. ([motivbowling.com](https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html))
- PBA reference point: Jason Belmonte measured **518 RPM / 18.9 mph** at a 2020 event; that event's 30 men averaged **436 RPM / 18.6 mph**, 10 women **297 RPM / 17.8 mph** (single-event, measurement noise). ([Times Union via PressReader](https://www.pressreader.com/usa/albany-times-union/20200929/281917365525200))

### Axis rotation / axis tilt (degrees)
| Metric | Range | Typical | Source |
|---|---|---|---|
| Axis rotation | 0° (end-over-end) → ~90° (max side) | ~45° natural; most 35–65° | [NBA](https://www.nationalbowlingacademy.com/video/axis-rotation-axis-tilt-bowling-release-adjustments), [Storm](https://www.stormbowling.com/read/ten-pin-bowling-roll-technique) |
| Axis tilt | 0° → ~90° | 10–15° useful range; spinners higher | [bowlingthismonth](https://www.bowlingthismonth.com/bowling-tips/introduction-to-bowling-ball-axis-control/print) |

### Rev-rate-to-speed ratio (rev vs speed dominance)
RPM ÷ mph. **>25 = rev-dominant, 20–25 = balanced, <20 = speed-dominant** (coach's "rev rate optimization score"; thresholds approximate and applied inconsistently across sources — tune). Example "balanced" bowler: 21 mph / 500 RPM. ([motivbowling.com](https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html))

### Speed drop, release → pins
Ball loses **~3–3.5 mph** from release to pins (some tracking systems e.g. Specto show 3.5–4.2 mph; a 1.5–2 mph figure is cited but looks low). Depends on oil/lane friction. Use **~3 mph default, tunable 2–4.** ([topendsports](https://www.topendsports.com/sport/tenpin/physics-speed.htm), [bowlingthismonth May 2025 Q&A](https://www.bowlingthismonth.com/bowling-tips/coach-ive-got-a-question-may-2025))

### Other defining numbers
- **Launch angle / "the line":** the angle the ball is projected relative to the boards (not well standardized in consumer numbers; measure as lateral direction of travel at release).
- **Timing/tempo:** total swing ~0.8–1.2 s; ball reaches bottom of swing as slide foot plants. ([AMF](https://www.amf.com/blog/a-guide-to-bowling-release-tips-and-tricks))
- **Consistency/repeatability:** variance of release point, rev rate, speed, and swing plane across shots — the single biggest separator of good from bad. ([bowlingthismonth](https://bowlingthismonth.com/quick-tips/improving-timing-consistency))

---

## 4. What a legitimate swing trainer should measure & cue

Coaches repeatedly cue, and the app should measure + give feedback on:
1. **Tempo / timing** — is the ball at the bottom of the swing when the slide "plants"? Early vs late. ([Human Kinetics](https://uk.humankinetics.com/blogs/excerpt/timing-on-the-approach), [bowlingthismonth](https://bowlingthismonth.com/quick-tips/how-to-fix-early-timing))
2. **Swing plane consistency** — does the swing stay on one straight plane (no looping out / around)? Driven by pushaway direction. ([Human Kinetics](https://us.humankinetics.com/blogs/excerpt/hand-positions-for-different-releases))
3. **Release-point repeatability** — same spot, same hand position, shot to shot. ([bowlingthismonth](https://bowlingthismonth.com/quick-tips/improving-timing-consistency))
4. **Rev rate** — are you generating revs via lift, not muscle?
5. **Speed control** — consistent and matched to revs (the ~50 RPM/mph relationship).
6. **Staying behind/under the ball** — not getting on top / not topping; firm wrist. ([bowl.com drill](https://bowl.com/news/a-drill-for-staying-behind-the-ball))
7. **Smoothness** — no squeezing/muscling; smooth motion keeps the hand behind the ball longer. ([AMF](https://www.amf.com/blog/a-guide-to-bowling-release-tips-and-tricks))

---

## 5. DETECTION LOGIC (the key deliverable)

Two independent pipelines. Each produces the same output struct so the UI/coaching layer is input-agnostic:

```
Delivery {
  handedness: 'R' | 'L',
  phases: { pushawayStart, backswingApex, downswingPeak, releaseT, followThroughEnd }  // timestamps
  ballSpeed_mph, pinSpeed_mph,
  revRate_rpm,
  hookDirection: 'R'|'L', hookMagnitude: 0..1,
  axisRotation_deg (approx), axisTilt_deg (approx, low-confidence),
  tempo { totalMs, backswingMs, downswingMs, ratio },
  swingPlaneDeviation, releasePointConsistency (vs rolling history),
  stayingBehind: 0..1 (1 = good)
}
```

> **General note for both:** the release is an **up-and-forward motion with a wrist rotation**, NOT a downward slam. Any detector keyed on "hand goes down fast" will misfire. Key the release on the **forward/up acceleration peak + a coincident rotation (flick) spike.**

---

### 5A. PHONE (held in hand)

**Inputs** (Web `DeviceMotion`): `linearAcceleration {x,y,z}` in m/s² (gravity removed), `rotationRate {alpha,beta,gamma}` in deg/s. Sample 60–100 Hz. Frame (portrait, screen facing bowler): **x = across** (left–right), **y = long axis of phone** (up toward top edge), **z = out of screen**. `alpha` = yaw about z, `beta` = pitch about x, `gamma` = roll about y. These axes rotate with the phone, so define the "throw/travel axis" dynamically from gravity + motion rather than assuming one fixed axis.

**Pre-processing**
- Low-pass (≈15 Hz) a copy for phase detection; keep raw for the flick peak.
- Maintain gravity vector (from DeviceMotion's `accelerationIncludingGravity` minus `linearAcceleration`, or a complementary filter) → gives "down." "Forward/down-lane" ≈ the horizontal component of the velocity vector during the downswing.
- Integrate `linearAcceleration` over short windows to get velocity; reset the integrator to zero whenever the device is still (|a|<0.3 m/s² for >200 ms) to kill drift.

**Phase signatures & state machine**

| Phase | Sensor signature |
|---|---|
| IDLE / stance | `|a|` ≈ 0, gyro ≈ 0, stable gravity direction |
| Pushaway | small `|a|` bump (0.5–2 m/s²) in the forward+down direction after stillness |
| Backswing | sustained accel, then **velocity magnitude falls toward ~0** = **apex** (detect as local min of |v|, gyro also near 0). Phone's long axis tilts back. |
| Downswing | `|a|` ramps up to the swing's **global peak**; velocity grows; direction swings forward+down |
| **RELEASE** | the **forward-up linear-accel peak** immediately followed (within +0…150 ms) by a sharp **rotationRate peak about the travel axis** (the flick). `releaseT` = time of that gyro peak. |
| Follow-through | `|a|` and gyro decay; phone long axis finishes pointing up/forward |

**Detecting the RELEASE moment (concrete):**
1. Detect `downswingPeak` = global max of forward-up linear accel in the swing (threshold e.g. `|a| > 25 m/s²`, tune; a hard swing peaks well above gravity).
2. In the window `[downswingPeak, downswingPeak + 150 ms]`, find the max of `|rotationRate|` projected on the travel axis → that peak = **the flick = release**. Require it exceed a flick threshold (e.g. `>400 deg/s`, tune) to distinguish a real release from a dead-hand swing.
3. If no flick spike appears, flag "no release detected / you didn't flick."

**Ball speed:**
- `v_release` = magnitude of the integrated velocity vector at `releaseT` (integration started at `backswingApex` where v≈0, so drift window is only ~0.3–0.5 s). `ballSpeed_mph = v_release * 2.237`.
- Sanity-clamp to 8–24 mph. A gripped phone's hand speed ≈ ball speed at release.
- **Fallback if integration is too noisy:** one-time calibration throw mapping `peak |a|` (or peak |v|) → a known mph, then linear-scale. Recommend shipping both and preferring integration with the still-reset drift correction.
- `pinSpeed_mph = ballSpeed_mph − 3` (tunable 2–4). ([topendsports](https://www.topendsports.com/sport/tenpin/physics-speed.htm))

**Rev rate from the wrist flick:**
- The flick is rotation about the **travel axis** (axis pointing down-lane). Convert its peak angular rate:
  `revRate_rpm = k * peakFlick_degps / 6`  (since 360°/rev ÷ 60 s/min ⇒ rpm = deg/s ÷ 6; e.g. 1800 deg/s = 300 rpm).
- Peak *hand* angular velocity over-reads the ball's sustained rev rate, so apply calibration `k ≈ 0.7` (tune 0.5–1.0 against a known bowler). This lands typical swings in the 200–500 RPM band, matching Section 3.
- Report with the style bands (e.g. "~320 RPM — tweener range").

**Hook direction & handedness:**
- **Sign of the rotationRate about the travel axis at the flick** gives the turn direction. Right-hander = **counter-clockwise viewed from behind the ball** (hand turns like a left door-knob turn); left-hander = clockwise. ([Wikipedia: Hook](https://en.wikipedia.org/wiki/Hook_(bowling)))
- Because the phone's axis signs depend on grip orientation, **calibrate once**: have the user do a single slow right-to-left (or their natural) flick; record the sign of the dominant gyro axis and store it as "hook = +". Thereafter sign→direction, |value|→magnitude.
- `hookMagnitude` = normalized `peakFlick_degps` (0 at ~0, 1 at ~3000 deg/s / 500 RPM-equivalent).

**Axis rotation / tilt (approximate — flag as experimental):**
- Build the gyro vector **ω** at the flick and the travel-direction unit vector **t** (from velocity) and gravity **g**.
- `axisRotation_deg ≈ angle between ω and the vertical plane containing t` — more of ω aligned with **t** (spin axis pointing down-lane) ⇒ more side roll ⇒ higher rotation; ω about the horizontal transverse axis ⇒ end-over-end (~0°). Map to 0–90°.
- `axisTilt_deg ≈ angle of ω out of horizontal` (vertical component). **Low confidence with a single gripped phone — recommend not surfacing a hard tilt number at launch; show rotation only, or show tilt as a coarse low/med/high.**

**Tempo / plane / consistency:**
- `backswingMs` = pushawayStart→apex; `downswingMs` = apex→releaseT; `ratio` = down/back. Good deliveries are repeatable; flag large swings vs the user's own rolling mean.
- **Swing plane:** integrate position (double-integrate accel between apex and release, drift-reset at stillness) → the path; `swingPlaneDeviation` = lateral (cross-travel) spread of the path. High = looping swing.
- **Release-point / repeatability:** store releaseT-relative orientation + v_release + peakFlick across shots; report standard deviations. Low variance = consistent.
- **Slide-vs-swing timing limitation:** phone-only has **no foot/slide data**, so true terminal timing can't be measured directly. Proxy: flag if the forward-accel peak and the flick are far apart in time (feels "early/late"), and surface tempo consistency instead. State this limitation in the app.

---

### 5B. WEBCAM HAND (21 MediaPipe landmarks)

**Landmark map:** `0` wrist; thumb `1-4` (tip `4`); index `5-8` (MCP `5`, tip `8`); middle `9-12` (MCP `9`, tip `12`); ring `13-16` (MCP `13`, tip `16`); pinky `17-20` (MCP `17`, tip `20`). Use MediaPipe's **world landmarks** (approx-metric 3D) when available; image landmarks are 2D + a weak relative z. ~30 fps.

**Normalize everything** by hand size `S = dist(0, 9)` (wrist→middle-MCP) so results are scale/distance-invariant.

**Grip vs open (ball held vs released):**
- For each finger compute tip-to-MCP (or tip-to-wrist) distance normalized by `S`:
  `curl_i = dist(tip_i, mcp_i) / S` for i in {index 8/5, middle 12/9, ring 16/13, pinky 20/17}.
- `gripScore = mean(curl_i)`. **Fist/curled (ball held)** when gripScore below a low threshold (e.g. <0.9, tune); **open (released)** when fingers extend (gripScore jumps high, e.g. >1.4).
- **RELEASE moment = the frame where gripScore crosses from held→open fastest** (max positive d(gripScore)/dt) at/near the bottom of the swing arc — the fingers "fling open," mirroring the ball leaving the hand.

**The swing (track wrist landmark 0 over frames):**
- Bowler stands side-on to the cam: **forward = image-x toward target, up = image-y.** Wrist-0 traces the pendulum.
- Backswing = wrist moving up/back; **apex** = y-velocity sign change at the top (wrist highest/back-most, speed ≈ 0); downswing = wrist accelerating down-and-forward; bottom of arc = wrist lowest. Release is **near the bottom moving forward-and-up** — detect the forward-up velocity peak of landmark 0, coincident with the grip→open transition.

**Wrist rotation / the turn that makes hook:**
- Define the **palm vector** `P = (landmark 17 − landmark 5)` (index-MCP → pinky-MCP, spans the knuckles across the hand).
- Define the **palm normal** `N = (5−0) × (17−0)` (cross product of index-MCP and pinky-MCP relative to wrist) → points out of the palm.
- **Roll angle** `θ = atan2(P.y, P.x)` in the image plane. As the hand supinates/pronates through release, `θ` sweeps. The **rate and direction of Δθ across the release frames = the wrist turn that creates revs/hook.**
  - **Right-hander:** palm rotates **counter-clockwise** (from the bowler's view) through release; left-hander clockwise. Sign of Δθ ⇒ `hookDirection`; |Δθ| per unit time ⇒ `revRate` proxy and `hookMagnitude`.
  - **Rev rate proxy:** `revRate_rpm ≈ k2 * (Δθ_deg / Δt_s) / 6`, tune `k2`. (Webcam fps limits peak capture; expect to under-read fast crankers — note it.)
- **Staying behind / under vs on top ("topping"):** track **N** (palm normal) in the frames *just before* release. Good = N points **forward-and-up / behind the ball** (palm facing up-and-forward, hand under/behind). Fault = N points **down / palm on top** (hand got on top of the ball). `stayingBehind` = alignment of N with the forward-up direction at pre-release (1 good → 0 topping). This is the webcam's strongest unique coaching signal.
- **Axis rotation (approx):** proportion of the turn (Δθ in image plane ≈ side roll) vs end-over-end — higher sustained Δθ through release ⇒ higher axis rotation. Map to 0–90° qualitatively. **Axis tilt** needs out-of-plane (depth) rotation ⇒ low confidence on a single webcam; surface coarse low/med/high only.

**Tempo / plane / consistency (webcam):**
- `tempo` from apex/release frame timestamps of landmark 0.
- **Swing plane:** lateral (cross-forward) spread of the wrist-0 path = looping vs straight.
- **Release-point consistency:** store release-frame wrist position + θ-at-release across shots; report variance.

**Webcam limitations to state in-app:** single camera = weak depth, so axis **tilt** and any rotation **in depth** are unreliable; 30 fps undersamples a fast flick (rev rate under-reads for crankers); the bowler must stay **side-on and in frame**. Use world landmarks and temporal smoothing (e.g. 3–5 frame median) to reduce jitter.

---

## 6. "What to coach" — live feedback the app can surface

Map measured values → cues (thresholds are starting points, tune):

| Condition | Live message |
|---|---|
| downswing/backswing ratio off, or flick far from accel peak | "Your tempo is rushing the slide — let the ball reach the bottom before you turn." |
| Palm normal points down pre-release (webcam) / early rotation (phone) | "You're getting on top of the ball — stay behind and under it." |
| Low flick / low Δθ, revRate < ~200 | "Rev rate 180 — finish up *through* the ball; lift with your fingers, don't chop down." |
| revRate high but speed low (ratio >25) | "Rev-dominant — add a little speed to match your revs." |
| speed high, revs low (ratio <20) | "Speed-dominant — slow down ~1 mph or add lift for more hook." |
| High swingPlaneDeviation | "Your swing is looping out — push the ball straight out in front to keep the plane." |
| High release-point / rev / speed variance across shots | "Inconsistent release — repeat the same finish; your revs varied 120 RPM this set." |
| No flick/open detected | "No release detected — flick the ball off your fingers at the bottom." |
| Good, repeatable | "Clean release — 320 RPM, 17 mph, 45° rotation. Stay with it." |

---

## 7. Typical-value reference tables (with sources)

**By style** — see Section 3 table. Source: [bowling.com](https://www.bowling.com/knowledge-hub/bowling-balls/bowler-types/all), [Wikipedia](https://en.wikipedia.org/wiki/Bowling_form).

**Averages:** ~325 RPM, ~17–18 mph, ~50 RPM per mph. ([motivbowling.com](https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html))

**Axis:** rotation 0–90° (natural ~45°, most 35–65°); tilt useful range ~10–15°. ([NBA](https://www.nationalbowlingacademy.com/video/axis-rotation-axis-tilt-bowling-release-adjustments), [bowlingthismonth](https://www.bowlingthismonth.com/bowling-tips/introduction-to-bowling-ball-axis-control/print))

**Ratio:** RPM/mph — >25 rev-dominant, 20–25 balanced, <20 speed-dominant (approximate). ([motivbowling.com](https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html))

**Speed drop to pins:** ~3 mph (range 2–4). ([topendsports](https://www.topendsports.com/sport/tenpin/physics-speed.htm), [bowlingthismonth](https://www.bowlingthismonth.com/bowling-tips/coach-ive-got-a-question-may-2025))

**Conversion constants for code:** rpm = deg/s ÷ 6; mph = m/s × 2.237; 300 RPM = 1800 deg/s = 5 rev/s.

---

## 8. Sources
- USA Bowling lesson sheet (phases): https://bpaa.com/Portals/0/Learn%20the%20Sport/LearntheSportWeek2LessonPRINT.pdf
- Human Kinetics — hand positions for releases: https://us.humankinetics.com/blogs/excerpt/hand-positions-for-different-releases
- Human Kinetics — timing on the approach: https://uk.humankinetics.com/blogs/excerpt/timing-on-the-approach
- AMF — release tips: https://www.amf.com/blog/a-guide-to-bowling-release-tips-and-tricks
- bowlerx.com — how to release: https://www.bowlerx.com/resources/how-release-bowling-ball.html
- Wikipedia — Hook (bowling): https://en.wikipedia.org/wiki/Hook_(bowling)
- Wikipedia — Bowling form (styles, tweener band): https://en.wikipedia.org/wiki/Bowling_form
- bowling.com — bowler types (style numbers): https://www.bowling.com/knowledge-hub/bowling-balls/bowler-types/all
- bowling.com — correct hook release: https://www.bowling.com/knowledge-hub/questions/bowling-tips/hooking-a-bowling-ball/question_7_what-is-the-correct-way-to-release-the-ball-for-a-hook
- Storm — ten-pin roll technique (rev/tilt/rotation defs): https://www.stormbowling.com/read/ten-pin-bowling-roll-technique
- Storm — axis tilt explained: https://www.stormbowling.com/read/axis-tilt-bowling-explained
- Bowling This Month — intro to axis control (tilt 10–15°): https://www.bowlingthismonth.com/bowling-tips/introduction-to-bowling-ball-axis-control/print
- Bowling This Month — improving timing consistency: https://bowlingthismonth.com/quick-tips/improving-timing-consistency
- Bowling This Month — how to fix early timing: https://bowlingthismonth.com/quick-tips/how-to-fix-early-timing
- Bowling This Month — speed drop Q&A: https://www.bowlingthismonth.com/bowling-tips/coach-ive-got-a-question-may-2025
- National Bowling Academy — axis rotation/tilt release adjustments (45°, 35–65°): https://www.nationalbowlingacademy.com/video/axis-rotation-axis-tilt-bowling-release-adjustments
- motivbowling.com — rev vs speed dominant (averages, ratio): https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html
- Albany Times Union / PressReader — PBA spin & speed numbers: https://www.pressreader.com/usa/albany-times-union/20200929/281917365525200
- Topend Sports — tenpin physics (speed loss): https://www.topendsports.com/sport/tenpin/physics-speed.htm
- bowl.com — staying behind the ball drill: https://bowl.com/news/a-drill-for-staying-behind-the-ball
- MediaPipe Hands — 21 hand landmarks: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker

*Caveats: RPM/mph bands and the rev-ratio thresholds come from coaching/manufacturer sources and vary; axis rotation/tilt degree figures are coarse and the ratio cutoffs are applied inconsistently across sources — treat all as tunable starting points, not settled biomechanics. Phone axis-rotation/tilt and webcam axis-tilt are approximate derivations and should ship behind a "beta/experimental" label.*
