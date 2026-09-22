# Forensic statistical suite

This directory contains local, educational screening tools for transaction data. They describe
patterns that may be useful prompts for a process conversation; they are not proof of fraud or
error and should never be used to accuse anyone.

- `benford.ts` — pure first- and second-significant-digit distributions, chi-square bands, MAD
  conformity, and continuity-corrected z-scores.
- `forensic-suite.ts` — combines Benford checks with round amounts, robust magnitude outliers,
  repeated transaction groups, payment-to-deposit timing, and adjustment/refund concentration.
- `demo-transactions.ts` — deterministic dental day-sheet data for trying the screen locally.
- `transactions-csv.ts` — parses date/amount transaction CSV files with optional kind, memo, and
  person columns.

The entry point is the **Forensic screen** view in the Intelligence tab. It keeps imported and
pasted data in local component state only; nothing is persisted.
