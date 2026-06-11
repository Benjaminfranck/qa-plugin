# Planted bugs (ground truth)

| # | Page | Bug | How it manifests |
|---|---|---|---|
| 1 | / | console.error on load | "boom: analytics config missing" |
| 2 | / | Sign up button broken | click → uncaught TypeError (window.startSignup undefined) |
| 3 | / | Broken image | /img/team.png → 404, naturalWidth 0 |
| 4 | / | Dead link | "Careers" → /careers → 404 |
| 5 | / (mobile ≤600px) | Burger menu dead | #burger visible, click does nothing |
| 6 | /pricing | Silent form | empty email submits, zero feedback |
| 7 | /pricing | Failing API call | POST /api/quote → 404 on every submit |
| 8 | /pricing | Low-contrast text | .faint #c9c9c9 on white |

/about is intentionally bug-free (false-positive control).
