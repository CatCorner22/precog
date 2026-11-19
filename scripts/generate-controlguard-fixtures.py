"""Run with PYTHONPATH pointing to a ControlGuard checkout."""
from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import controlguard
from controlguard.calendar_leave import cliff, leave
from controlguard.ledger import Ledger
from controlguard.policy import policy
from controlguard.pricing import price, skim
from controlguard.risk import GATES, sod, triage

root = Path(__file__).resolve().parents[1] / "src/lib/precog"
catalogs = json.loads(Path(controlguard.__file__).with_name("catalogs.json").read_text())
catalogs["TW"] = {key: text.replace("e.g.,", "for example,") for key, text in catalogs["TW"].items()}
(root / "controlguard-catalogs.json").write_text(
    json.dumps({key: catalogs[key] for key in ("C", "DEF", "O", "TW")}, indent=2, ensure_ascii=False) + "\n"
)

cases = []


def add(tool, args, result, **context):
    cases.append({"tool": tool.__name__, "args": args, "result": result, **context})


for args in (
    dict(quantity=3, invoice_pack=12, po_pack=24, billed_price=80, contract_list_price=120, discount=.2),
    dict(quantity=1, invoice_pack=0, po_pack=0, billed_price=2, contract_list_price=3, discount=0),
    dict(quantity=1, invoice_pack=1, po_pack=1, billed_price=10, contract_list_price=100, discount=.9),
    dict(quantity=1, invoice_pack=3, po_pack=3, billed_price=1, contract_list_price=1, discount=0),
):
    add(price, args, price(args))
for values in ([1.06, 1.08, 1.1, .95], [1.1, 1.1, 1.1, 1.01],
               [1.06, 1.06, 1.06, 1.08, 1.09, 1.1, 1.01, 1, .99, .95], []):
    args = dict(tolerance=.1, invoices=[dict(invoice_unit_price=v, po_unit_price=1) for v in values])
    add(skim, args, skim(args))
for args in (
    dict(start="2024-01-31", term_months=1, notice_days=30),
    dict(start="2101-02-31", term_days=120, notice_days=30),
):
    add(cliff, args, cliff(args))
for args in (
    dict(text="Use 1–2 days per month, half-day per year, or 1 to 2 days. Give 3 days notice."),
    dict(text="Give 1 day’s notice, 1 day's notice, 3 days’ notice, or 3 days' notice. Use 2 days of leave."),
    dict(text="Use 0.7 days", shift_hours=7.3, kind="statutory_leave", usage_increment_hours=.2),
):
    add(leave, args, leave(args))
for args in (
    dict(text="First, the log is checked promptly.", title="Policy: Finance--Payments. FIN Policy 1"),
    dict(text="📌 Within 3 days of receipt, it shall be paid.", kind="contract", title="Expenses"),
):
    add(policy, args, policy(args))
with TemporaryDirectory() as temp:
    ledger = Ledger(Path(temp) / "ledger.sqlite")
    proof = dict(subject="Cash reviewer", control="independent-bank-reconciliation",
                 compensating_has_actor=True, compensating_has_cadence=True, compensating_has_artifact=True)
    signer = dict(subject=proof["subject"], control=proof["control"], signer="Ada",
                  actor="José", cadence="weekly", artifact="Review log")
    entries = [ledger.append(**signer, now=datetime(2026, 1, 2, tzinfo=timezone.utc))]
    entries.append(ledger.append(**signer, now=datetime(2026, 1, 9, tzinfo=timezone.utc)))
    hard = dict(gates={key: key == "active_incident" for key in GATES})
    add(triage, hard, triage(hard, ledger))
    scores = dict(gates=dict.fromkeys(GATES, False), impact=4, likelihood=4, legal=0,
                  detection=0, recoverability=0, aggregation=0)
    conflict = dict(asset_class="Cash", vertices=["reconciliation", "custody"], impact=7, exploitability=10)
    for impact, exploitability in ((10, 5.99), (5, 6.98), (6.103515625, 9.8304), (10, 5.999999999999999)):
        args = dict(conflict, subject="Cash reviewer", impact=impact, exploitability=exploitability)
        add(sod, args, sod(args, ledger))
    for date in (8, 9, 22, 23):
        now = datetime(2026, 1, date, tzinfo=timezone.utc)
        args = dict(scores, **proof, compensating_credit=2)
        add(triage, args, triage(args, ledger, now), now=now.isoformat())
        args = dict(conflict, **proof, factor=.5)
        add(sod, args, sod(args, ledger, now), now=now.isoformat())
    args = dict(conflict, **{**proof, "compensating_has_actor": False}, factor=.5)
    add(sod, args, sod(args, ledger))
    args = dict(subject="Cash reviewer", asset_class="Cash", vertices=["custody", "custody"])
    add(sod, args, sod(args, ledger))

(root / "controlguard-fixtures.json").write_text(
    json.dumps({"cases": cases, "entries": entries}, indent=2, ensure_ascii=False) + "\n"
)
