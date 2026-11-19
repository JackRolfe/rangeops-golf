# 04 Setup: bays, opening hours, prices

Status: ready-for-agent
Type: task
Blocked by: 02, 03

The Setup screen edits bays, opening hours and the price list through `ConsoleApi`, with a price preview. Saving shows validation errors from ticket 03 and saves nothing when invalid.

## Acceptance

- Change an off-peak price, save, preview reflects it.
- A price under the floor shows an error and isn't saved.
