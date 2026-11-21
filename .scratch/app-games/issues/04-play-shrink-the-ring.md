# 04. Choose a game and play Shrink the Ring

Status: resolved
Spec: ../spec.md
Blocked by: 02, 03

## What

- Games home shows two game cards, Bullseye and Shrink the Ring, each starting a new session in that mode. The setup screen shows the chosen game and lets the player switch it.
- While playing Shrink the Ring, the ring drawn on the map is the ring for the next shot, the footer shows the streak ("in a row") and the ring size as a percentage of the start, and a message says when the ring shrinks.
- Session rows and session detail name the game. Detail of a Shrink session shows the smallest ring reached.

## Acceptance

- [x] Component test: the practice screen draws the shrunken ring after three hits in a row and shows the streak.
- [x] Playwright: play a Shrink the Ring session start to finish.

## Comments

Done. Game cards replace 'Start practice' and are hidden while a draft exists (resume or discard it first). `RangeMapCanvas` only applies its minimum ring size while setting the ring, so a ring Shrink the Ring takes below it is drawn as judged. Playwright: 'plays Shrink the Ring start to finish' passes, with the existing core flow.
