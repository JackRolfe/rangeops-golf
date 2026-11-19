# Spec: App stage 1, Games

Status: ready-for-agent
Source: `docs/PLAN.md`, "The app", stage 1.

## Problem

The player app is a practice tracker with Home, Practice and History screens. The plan turns it into the Games tab of a tabbed app: a child picks a game, plays it on the range map, and sees a score to beat. Two games are needed now: **Bullseye** (what the app does today) and **Shrink the Ring** (from the site demo). Existing users must keep their history.

## What done looks like

- A tab bar with **Games** first. Practice, history and the accuracy chart live under Games. Settings moves to its own tab.
- A session has a `mode`: `bullseye` or `shrink`.
- In `shrink`, three on-target shots in a row shrink the ring by a fifth, down to a floor. The rule lives in `apps/player/src/domain` with tests, ported from `replay()` in `apps/site/index.html`.
- Each shot stores the ring radius it was played against. The IndexedDB schema goes to version 2 with a migration that back-fills `radius` on old shots from their session's target and `mode: 'bullseye'` on old sessions. A test opens a real version-1 database full of history and checks nothing is lost.
- **Beat Your Best**: for the chosen club and game, the Games screen shows the best score so far as the one to beat, and a finished session says when it set a new best. No new data.
- A child can play both games start to finish on a phone.

## Decisions (reversible, made here)

| Decision | Choice | Why |
| --- | --- | --- |
| Tabs in stage 1 | **Games** and **Settings**. Drive joins between them in stage 2; Book and Balls arrive with stage 4. | No dead-end "coming soon" tabs for a child to tap. |
| Where history goes | A Progress view inside Games, opened from "View all". The tab bar stays visible with Games selected. | The plan puts history under Games. |
| Starting ring size | The player still sizes the ring before the first shot. That size is the session's `target.radius` and is the **starting ring**. | Keeps today's flow; the demo's fixed 36 px ring is a demo convenience. |
| Shrink floor | One third of the starting ring. | The demo starts at 36 and floors at 12. |
| Which shots count for the streak | A shot is on target against the ring it was played at (`shot.radius`). A miss resets the streak. Undo replays from the remaining shots. | Same as `replay()`, which stores each shot's hit when it is taken. |
| Who computes `shot.radius` | `addShot` in `data/db.ts`, from the session, its range's dimensions and the domain rule, inside the same transaction. | One place owns the invariant; the UI can't store a wrong radius. |
| Beat Your Best scope | Best session accuracy for the same club **and the same game**, over completed sessions with at least 5 shots. Ties go to the earlier session. | A 1-of-1 session would otherwise be an unbeatable 100%. Shrink scores aren't comparable with Bullseye scores. |
| Accuracy in history and charts | Unchanged formula, but each shot is judged against its own `radius`. For Bullseye that equals today's result. | |

## Out of scope

Leaderboards, timed games, the Fetch challenge, range-published maps (stage 4), and any change to the site.

## Tickets

In blocker order, under `issues/`:

1. `01-shrink-rule.md`: the Shrink the Ring rule in the domain.
2. `02-mode-and-shot-radius.md`: `mode`, per-shot radius, DB v2 migration. Blocked by 01.
3. `03-tab-bar-and-games-tab.md`: tab bar, Games home, Progress under Games, Settings tab.
4. `04-play-shrink-the-ring.md`: choose a game and play Shrink the Ring. Blocked by 02, 03.
5. `05-beat-your-best.md`: best score to beat. Blocked by 02, 03.
