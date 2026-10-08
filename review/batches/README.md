# Batch review records

One JSON file per authored question batch: `<batch-id>.json`.

`npm run validate:review` fails the build if a batch id appears in
`src/data/questions/` without a matching record here whose `status` is
`"signed-off"`. This is what makes the project's promise — *no question ships
without review* — mechanically enforced rather than aspirational.

## Format

```json
{
  "batchId": "b001",
  "questionIds": ["NF-0001", "NF-0002"],
  "reviewer": "name or handle",
  "reviewedAt": "2026-10-08",
  "findings": [
    {
      "questionId": "NF-0002",
      "severity": "corrected",
      "note": "Answer key said /26 but 200 hosts require /24. Fixed and re-verified."
    }
  ],
  "status": "signed-off"
}
```

## Why the review is not free

Phase 6 of the plan budgets authoring and review as **separate** work items.
Written questions cost roughly 8–12 minutes each to author with a documentation
cross-check, and a further 5–7 minutes to review. A 40-question batch is
therefore around 9–13 hours of work, and the review half of that is what stops a
wrong answer reaching a learner.

See `docs/PROJECT.md` §11 for the full verification process.