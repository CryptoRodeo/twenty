# Where to change things

| What | File |
|---|---|
| Level names and rep targets | `src/domain/levels.ts` |
| Landmark window (`LANDMARK_DURATION_SEC`) and graduation validity (`GRADUATION_VALID_DAYS`) | `src/domain/levels.ts` |
| Weekly target adjustment rules | `src/domain/planner.ts` |
| Default planned days and weekly minute goal | `src/domain/planner.ts` |
| Pacing / cue timing math | `src/domain/pacing.ts` |
| Totals, records, streak, chart buckets | `src/domain/stats.ts` |
| Colours, spacing, type scale | `src/theme/index.ts` |
| Database schema | `src/data/migrations.ts` |
| JSON backup format | `src/data/backup.ts` |


