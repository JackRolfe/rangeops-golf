# 05. Balls

Status: resolved
Spec: ../spec.md
Blocked by: 03

## What

Balls tab: bucket sizes, pay by card or with ball credit when the balance covers it, the code shown large after paying. The wallet: unused codes, passes (valid until) and ball credit. Buy a monthly pass or a credit pack.

## Acceptance

- [x] Component tests against the fake: buy a bucket and see its code; buy credit and pay a bucket with it; buy a pass.

## Comments

Done in `apps/player/src/balls/BallsScreen.tsx`. The API offers passes and ball credit to players (`POST /orders/passes`, `GET /me/wallet`), so both are in. Ball credit pays only when the balance covers the bucket; the button says how much there is.
