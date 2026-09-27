/**
 * What kind of loss each scenario describes, written down per scenario rather
 * than guessed from words in its id.
 *
 * `fraudRelated`: someone takes money or goods on purpose (theft, skimming,
 * kickbacks, diversion, misappropriation, card abuse). Fraud scenarios get the
 * fraud likelihood credits for dual control and cameras, and the fraud
 * reference figures beside them. A departure or an accident is not fraud.
 *
 * `cashRelated`: the scheme runs through cash, deposits or payments to a
 * payee, so the daily cash figure scales its size and an alarm counts fully.
 */
export interface ScenarioKind {
  fraudRelated: boolean;
  cashRelated: boolean;
}

/** The flags a scenario is priced with. A scenario missing from the table is priced as not fraud. */
export function scenarioFlags(scenarioId: string): ScenarioKind {
  return SCENARIO_KINDS[scenarioId] ?? NOT_FRAUD;
}

const NOT_FRAUD: ScenarioKind = { fraudRelated: false, cashRelated: false };
const FRAUD: ScenarioKind = { fraudRelated: true, cashRelated: false };
const CASH_FRAUD: ScenarioKind = { fraudRelated: true, cashRelated: true };

/** Every scenario id the industry templates carry. Add a row when a template adds a scenario. */
const SCENARIO_KINDS: Record<string, ScenarioKind> = {
  // Shared across industries
  "sc-cash-sod-failure": CASH_FRAUD,
  "sc-vendor-fraud": CASH_FRAUD,
  "sc-writeoff-abuse": FRAUD,
  "sc-key-person-leaves": NOT_FRAUD,
  // Dental and medical
  "sc-front-desk-leaves": NOT_FRAUD,
  "sc-drug-diversion": FRAUD,
  // Professional services
  "sc-trust-misappropriation": FRAUD,
  // Restaurant
  "sc-salestax-unremitted": FRAUD,
  "sc-tip-pool-manipulation": FRAUD,
  // Construction
  "sc-fictitious-sub": CASH_FRAUD,
  "sc-change-order-kickback": FRAUD,
  "sc-material-theft": FRAUD,
  "sc-field-time-padding": FRAUD,
  // Automotive
  "sc-ro-cash-skim": CASH_FRAUD,
  "sc-wire-je-cover": CASH_FRAUD,
  "sc-parts-resale": FRAUD,
  "sc-deal-fee-skim": FRAUD,
  // Nonprofit
  "sc-skimmed-donations": CASH_FRAUD,
  "sc-restricted-diverted": FRAUD,
  "sc-card-abuse": FRAUD,
};
