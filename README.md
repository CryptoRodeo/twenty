# Twenty

A personal, offline burpee training tracker: an 11-level program, a pacing
timer that beeps once per rep, a roadmap, and progress stats. Single user, no
accounts, no backend, no network calls. Original app, not affiliated with any
commercial training program.

## Run it

```bash
npm install
npx expo start
```

Then open the project in Expo Go on a phone, or build a dev client. Dark theme
only; Android and iOS.

## Tests

```bash
npm test          # Jest: domain, data, store, components, screens
npm run typecheck # tsc --noEmit, strict
```

The domain layer (`src/domain/`) is pure and carries the bulk of the tests:
level unlocks, graduation rules, planner adjustments and timer math.

## Where to change things

| What | File |
|---|---|
| Level names and rep targets | `src/domain/levels.ts` |
| Landmark window (20:00) and graduation validity (30 days) | `src/domain/levels.ts` |
| Weekly target adjustment rules | `src/domain/planner.ts` |
| Default planned days and weekly minute goal | `src/domain/planner.ts` |
| Pacing / cue timing math | `src/domain/pacing.ts` |
| Totals, records, streak, chart buckets | `src/domain/stats.ts` |
| Colours, spacing, type scale | `src/theme/index.ts` |
| Database schema | `src/data/migrations.ts` |
| JSON backup format | `src/data/backup.ts` |

## Starting out

A new install starts as a beginner. On the Home screen you choose the level you
are working on (or import existing progress). Choosing a level completes
nothing; it only sets what you are aiming at. You can change it any time in
Settings. Once you actually hit a level's targets, that level and every level
below it count as completed.

## Rules this app implements

- A **landmark** is a session of exactly **20:00** whose completed reps reach
  that level's target for that movement. Sessions of any other length count
  toward stats and totals but can never unlock a landmark.
- A level is **reached** when both of its landmarks are met, in any order,
  across any sessions. One big result can unlock several levels at once, and
  reaching a level completes all lower levels.
- **Graduation** additionally requires both landmarks in the **same Mon-Sun
  week**, and must be re-confirmed every **30 days** or the level drops back
  to 4B. History is kept either way.
- **Streak** = consecutive Mon-Sun weeks, counting back from this week (or
  last week if this week has not reached the goal yet), in which logged
  minutes meet the weekly goal. An imported streak is added when the chain
  runs back past the first logged session.
- **Weekly targets** move by the rules in `src/domain/planner.ts`: a small bump
  after hitting the target (smaller if it felt hard), flat at maximum effort
  or a near miss, and a back-off after missing by more than 5%. A missed
  session never stacks. When a target reaches the next landmark, that day
  becomes a **Landmark attempt**.
- **Edit Week** changes the layout from the **following** week; an existing
  planned week is never overwritten.
- **Backup**: Settings can export everything as JSON and restore it later.
  Restoring replaces all current data, after a confirmation.

## Known limitation

Rep beeps do not play while the app is in the background; Expo cannot
reliably schedule audio at sub-5-second intervals there. Workout position is
recomputed from timestamps when the app returns to the foreground, so the
count and clock stay correct; only the sound pauses.
