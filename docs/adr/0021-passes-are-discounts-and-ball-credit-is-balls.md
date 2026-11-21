# 0021. Passes are discounts, and ball credit is counted in balls

Status: accepted, 2026-11-19

## Context

Idea 8 in [docs/PLAN.md](../PLAN.md) is "memberships, passes and ball credits, held on the player's account". The console spec and the API had each picked a different model:

- **Console (spec and fake):** a monthly pass gives so many buckets and bay-hours each calendar month, and a credit pack is so many prepaid buckets.
- **API:** a monthly pass gives a percent off bay-hours and card-paid buckets for a number of days, and ball credit is a balance of balls at a range.

The user has decided that staff sell passes and ball credit at the counter and redeem credit there. So both the console and the API need one model.

## Decision

Use the API's model everywhere:

- **Monthly pass:** a percent off bay-hours and buckets, valid for a number of days from purchase. Buying another extends it from when the current one ends.
- **Ball credit:** a prepaid balance of balls at one range that never expires. Redeeming takes one bucket's balls off the balance and hands the bucket over.

Reasons:

1. **A discount applies itself.** Booking and buying in the app take the percent off with no staff step. An allowance needs someone to count what has been used each month, and needs monthly resets that can go wrong.
2. **Balls fit any bucket.** Ranges sell different bucket sizes and change them. A balance in balls covers every size and never needs converting when sizes change. Prepaid buckets would tie the credit to one size.
3. **Stored value is familiar.** The Japanese IC cards in the plan hold a balance, not a count of uses. "I have 350 balls left" is easy for a player to read and for staff to check.
4. **It's already what the app sells,** with real orders behind it. Changing the API would have meant migrating paid passes for no gain.

An "includes N buckets a month" membership can still be sold as a monthly pass plus a credit pack.

## Consequences

- The console's `Pass` is a discount pass (`discountPercent`, `validUntil`) or ball credit (`ballsLeft`). The allowance fields and per-month redemptions are gone, from the fake too.
- A counter sale needs the player's email, because passes and credit are held on an account. The API creates the account if it doesn't exist yet, so the player can later sign in with that email and find the pass already there.
- Staff redeem credit by choosing a bucket size; the API checks the balance and issues a bucket code that is already handed over, so it shows in the day's orders like any bucket.
- Supersedes the pass rules in `.scratch/range-console/spec.md` and ticket 07.
