import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { readHireDate, tenureFromHireDate } from "./hire-date";
import { entitlementsForTitle, matchJobTitle } from "../onboarding/job-catalog";
import { MAX_ROLE_LENGTH } from "../onboarding/own-team";
import { reorderLastFirst } from "./roster-names";
import { isInactive, isKnownActive, isOnLeave, isTrue, statusKey } from "./roster-status";
import type { ColumnMap } from "./roster-columns";
import { slug } from "../text";
export interface RosterImportIssue {
  row: number;
  message: string;
}

export interface TitleMapping {
  row: number;
  name: string;
  title: string;
  /** Catalog title the row's job title mapped to, or undefined when nothing matched. */
  catalogTitle?: string;
  confidence?: "exact" | "partial";
}

export function nameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalRole(value: string, roleTemplates: Record<string, unknown>): string {
  const trimmed = value.trim();
  const match = Object.keys(roleTemplates).find(
    (role) => role.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

const ENTITLEMENT_ALIASES: Record<string, EntitlementId> = {
  payroll: "enter_payroll",
  "approve payroll": "approve_payroll",
  "employee records": "edit_payroll_master",
  "payroll master": "edit_payroll_master",
  "pay rates": "edit_payroll_master",
  "journal entries": "post_journal_entries",
  "journal entry": "post_journal_entries",
  je: "post_journal_entries",
  "pay bills": "release_payment",
  ap: "release_payment",
  "pay vendors": "release_payment",
  "add vendors": "create_vendor",
  "vendor setup": "create_vendor",
  "bank rec": "bank_reconcile",
  reconcile: "bank_reconcile",
  deposits: "prepare_deposit",
  cash: "collect_cash",
  "take payments": "collect_cash",
  "front desk payments": "collect_cash",
  refunds: "approve_writeoffs",
  writeoffs: "approve_writeoffs",
  "write-offs": "approve_writeoffs",
  adjustments: "post_adjustments",
  claims: "submit_claims",
  billing: "submit_claims",
  admin: "pms_admin_roles",
  "system admin": "pms_admin_roles",
  "user admin": "pms_admin_roles",
  "read only": "view_reports_only",
  reports: "view_reports_only",
};

function findEntitlement(token: string): EntitlementId | undefined {
  const normalized = normalize(token);
  const direct = ENTITLEMENTS.find((entitlement) => normalize(entitlement.id) === normalized);
  if (direct) return direct.id;
  const byLabel = ENTITLEMENTS.find((entitlement) => normalize(entitlement.label) === normalized);
  if (byLabel) return byLabel.id;
  const alias = Object.entries(ENTITLEMENT_ALIASES).find(([key]) => normalize(key) === normalized);
  return alias?.[1];
}

export interface ImportContext {
  tpl: IndustryTemplate;
  columns: ColumnMap;
  today: Date;
  dayFirst: boolean;
  issues: RosterImportIssue[];
  unknownEntitlements: string[];
  unknownStatuses: Set<string>;
  /** Titles and employee ids seen so far for each name. */
  seenNames: Map<string, { titleKeys: Set<string>; idKeys: Set<string> }>;
  /** People read so far by employee id, with every title seen for that id. */
  byEmployeeId: Map<string, { person: Person; titleKeys: Set<string> }>;
  onLeave: string[];
  /** Current team members by name; a name can belong to more than one. */
  existingByName: Map<string, Person[]>;
  /** Current team members by the employee id their roster gave them. */
  existingByEmployeeId: Map<string, Person>;
  usedIds: Set<string>;
  /** People read so far by name and title, so a second location can join the first. */
  byNameTitle: Map<string, Person>;
  /**
   * The file is this app's own team export: names are kept as written and
   * every row is a person, even two with one name and title.
   */
  ownExport: boolean;
}

/** Cuts a value to `max` characters without leaving a dangling separator. */
function tidyCut(value: string, max: number): string {
  return value.slice(0, max).replace(/[\s,;:/–—-]+$/u, "");
}

function cellAt(cells: readonly string[], column: number | undefined): string {
  return column === undefined ? "" : (cells[column] ?? "").trim();
}

function readName(
  cells: readonly string[],
  columns: ColumnMap,
  keepAsWritten = false,
): { name: string; idInName: string } {
  const split =
    columns.first !== undefined && columns.last !== undefined
      ? `${cellAt(cells, columns.first)} ${cellAt(cells, columns.last)}`.trim()
      : "";
  const raw = split || cellAt(cells, columns.name);
  // Workday writes the employee id after the name: "Ana Ruiz (1001)".
  const withId = raw.match(/^(.*\S)\s*\((\d{2,})\)$/);
  const name = withId ? withId[1] : raw;
  return {
    name: split || keepAsWritten ? name : reorderLastFirst(name),
    idInName: withId?.[2] ?? "",
  };
}

/** Whether the row's person works here, and the status that says they are on leave, if any. */
function readActive(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): { active: boolean; leave?: string } {
  let inactive = false;
  let leave: string | undefined;
  context.columns.statuses.forEach((column, index) => {
    const value = cellAt(cells, column);
    if (!value) return;
    if (isOnLeave(value)) leave ??= value;
    else if (isInactive(value)) inactive = true;
    else if (index === 0 && !isKnownActive(value)) reportUnknownStatus(context, value, row);
  });
  for (const column of context.columns.workerTypes) {
    const value = cellAt(cells, column);
    if (!isOnLeave(value) && isInactive(value, true)) inactive = true;
  }
  for (const column of context.columns.inactiveFlags) {
    if (isTrue(cellAt(cells, column))) inactive = true;
  }
  return inactive ? { active: false } : { active: true, ...(leave ? { leave } : {}) };
}

function reportUnknownStatus(context: ImportContext, value: string, row: number): void {
  const key = statusKey(value);
  if (context.unknownStatuses.has(key)) return;
  context.unknownStatuses.add(key);
  context.issues.push({ row, message: `Status "${value}" not recognised; treated as active` });
}

function readTenure(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): number | undefined {
  const { columns, today } = context;
  const tenureValue = cellAt(cells, columns.tenure);
  if (tenureValue) {
    const parsed = Number.parseFloat(tenureValue);
    if (Number.isFinite(parsed)) return Math.min(60, Math.max(0, parsed));
    context.issues.push({ row, message: "Tenure is not a valid number" });
    return undefined;
  }
  const raw = cellAt(cells, columns.hireDate);
  if (!raw) return undefined;
  const hired = readHireDate(raw, { dayFirst: context.dayFirst, today });
  if (!hired) {
    context.issues.push({ row, message: `Hire date not understood: ${raw}` });
    return undefined;
  }
  if (hired > today.toISOString().slice(0, 10)) {
    context.issues.push({ row, message: `Hire date is in the future: ${raw}` });
    return undefined;
  }
  return tenureFromHireDate(hired, today);
}

function readLastDay(
  context: ImportContext,
  cells: readonly string[],
  row: number,
  existing: Person | undefined,
): string | undefined {
  // A file without the column keeps whatever last day the matched person
  // already has; a blank cell in a file that has the column clears it.
  if (context.columns.lastDay === undefined) return existing?.lastDay;
  const raw = cellAt(cells, context.columns.lastDay);
  if (!raw) return undefined;
  const day = readHireDate(raw, { dayFirst: context.dayFirst, today: context.today });
  if (day) return day;
  context.issues.push({ row, message: `Last day not understood: ${raw}` });
  return existing?.lastDay;
}

/** True when the row has a status or inactive-flag cell with something in it. */
function hasStatus(context: ImportContext, cells: readonly string[]): boolean {
  return [...context.columns.statuses, ...context.columns.inactiveFlags].some((column) =>
    Boolean(cellAt(cells, column)),
  );
}

/** Duties listed in the file's own duties column, with unknown names reported. */
function readListedDuties(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): EntitlementId[] {
  const entitlements: EntitlementId[] = [];
  const unknown: string[] = [];
  for (const token of cellAt(cells, context.columns.entitlements).split(/[;|]/)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const entitlement = findEntitlement(trimmed);
    if (entitlement) {
      if (!entitlements.includes(entitlement)) entitlements.push(entitlement);
      continue;
    }
    unknown.push(trimmed);
    if (!context.unknownEntitlements.some((seen) => normalize(seen) === normalize(trimmed))) {
      context.unknownEntitlements.push(trimmed);
    }
  }
  if (unknown.length) {
    context.issues.push({ row, message: `Unknown entitlement(s): ${unknown.join(", ")}` });
  }
  return entitlements;
}

/**
 * The title the duties are read from. Title columns are tried in rank order
 * (the standard classification, such as Workday's Job Profile or Oracle's Job
 * Name, before the free-text Business Title or Position), and the first with
 * a catalog match wins, except that a column naming the owner's seat wins
 * wherever it sits: Oracle lists an owner veterinarian's Job as
 * "Veterinarian" and only the Position says "Owner & Medical Director".
 */
function catalogHit(titleValues: readonly string[], industry: string) {
  const hits = titleValues.flatMap((value) => {
    const match = matchJobTitle(value, industry);
    return match ? [{ value, match }] : [];
  });
  return hits.find((hit) => hit.match.entry.id === "owner") ?? hits[0];
}

interface EmployeeSeat {
  person: Person;
  titleKeys: Set<string>;
}

/**
 * A repeated row that differs only in its department or location: one person
 * working at two stores keeps both ("Oakridge Mall; Riverside"). Returns
 * false when the location adds nothing, so the row is an ordinary repeat.
 */
function joinLocation(
  context: ImportContext,
  person: Person,
  department: string,
  row: number,
): boolean {
  if (!department) return false;
  const held = (person.department ?? "").split("; ").filter(Boolean);
  if (held.some((place) => nameKey(place) === nameKey(department))) return false;
  const joined = [...held, department].join("; ");
  if (joined.length > 120) return false;
  person.department = joined;
  context.issues.push({
    row,
    message: `"${person.name}" is listed at ${held.join(", ") || "no location"} and ${department} with the same title; kept as one person at both`,
  });
  return true;
}

/**
 * How a row relates to the rows before it. When both rows carry an employee
 * id, the id decides: the same id and title is a repeat, the same id with
 * another title is a second position of one person, and another id is
 * another person even with the same name and title. Otherwise the same name
 * and title is a repeat. Every kind of repeat is reported.
 */
function repeatOf(
  context: ImportContext,
  name: string,
  title: string,
  employeeId: string,
  department: string,
  row: number,
): "new" | "duplicate" | EmployeeSeat {
  const key = nameKey(name);
  const titleKey = nameKey(title);
  const idKey = nameKey(employeeId);
  const sameId = idKey ? context.byEmployeeId.get(idKey) : undefined;
  if (sameId && nameKey(sameId.person.name) === key) {
    if (!sameId.titleKeys.has(titleKey)) return sameId;
    if (!joinLocation(context, sameId.person, department, row)) {
      context.issues.push({ row, message: `"${name}" appears twice; second copy skipped` });
    }
    return "duplicate";
  }
  // Every row of this app's own export is a person, even two with one name.
  if (context.ownExport && !idKey) return "new";
  if (sameId) {
    context.issues.push({
      row,
      message: `Employee ID "${employeeId}" is on rows for "${sameId.person.name}" and "${name}"; kept both, check which is right`,
    });
  }
  const earlier = context.seenNames.get(key);
  if (!earlier) {
    context.seenNames.set(key, { titleKeys: new Set([titleKey]), idKeys: new Set([idKey]) });
    return "new";
  }
  if (idKey && [...earlier.idKeys].some((other) => other && other !== idKey)) {
    context.issues.push({
      row,
      message: `"${name}" appears twice with different employee IDs; kept as two people`,
    });
  } else if (earlier.titleKeys.has(titleKey)) {
    const first = context.byNameTitle.get(`${key}|${titleKey}`);
    if (!first || !joinLocation(context, first, department, row)) {
      context.issues.push({ row, message: `"${name}" appears twice; second copy skipped` });
    }
    return "duplicate";
  } else {
    context.issues.push({
      row,
      message: `"${name}" appears twice with different titles; check whether this is one person`,
    });
  }
  earlier.titleKeys.add(titleKey);
  earlier.idKeys.add(idKey);
  return "new";
}

/**
 * A second position for someone already read under the same employee id:
 * one person holding both jobs, so the duties of both are checked together.
 * An inactive second position is left out; an active one replaces an
 * inactive first one.
 */
function addPosition(
  context: ImportContext,
  seat: EmployeeSeat,
  position: { title: string; role: string; duties: readonly string[]; active: boolean },
  employeeId: string,
  row: number,
): void {
  const { person } = seat;
  seat.titleKeys.add(nameKey(position.title));
  const who = `"${person.name}" (employee ID ${employeeId})`;
  if (!position.active) {
    context.issues.push({
      row,
      message: `${who}: the ${position.role} position is marked inactive, so its duties are left out`,
    });
    return;
  }
  const earlierDuties = person.entitlements ?? context.tpl.roleTemplates[person.role] ?? [];
  if (!person.active) {
    person.active = true;
    person.role = tidyCut(position.role, MAX_ROLE_LENGTH);
    person.entitlements = position.duties.length ? [...position.duties] : undefined;
    return;
  }
  const union = Array.from(new Set([...earlierDuties, ...position.duties]));
  context.issues.push({
    row,
    message: `${who} holds two positions, ${person.role} and ${position.role}; read as one person with the duties of both`,
  });
  person.role = tidyCut(`${person.role} / ${position.role}`, MAX_ROLE_LENGTH);
  person.entitlements = union.length ? union : undefined;
}

type RowRead = { person: Person; mapping: TitleMapping } | { position: TitleMapping };

export function readPerson(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): RowRead | "skip" | "duplicate" {
  const { tpl, columns } = context;
  const { name, idInName } = readName(cells, columns, context.ownExport);
  if (!name) {
    context.issues.push({ row, message: "Name is required" });
    return "skip";
  }
  const titleValues = columns.titles.map((column) => cellAt(cells, column)).filter(Boolean);
  // The role shown is the title the duties were read from, so each tick has
  // its reason in front of the owner.
  const hit = catalogHit(titleValues, tpl.id);
  const roleValue = hit?.value ?? titleValues[0] ?? "";
  const employeeId = (cellAt(cells, columns.employeeId) || idInName).slice(0, 40);
  const department = tidyCut(cellAt(cells, columns.department), 60);
  const repeat = repeatOf(context, name, roleValue, employeeId, department, row);
  if (repeat === "duplicate") return "duplicate";

  // A row naming someone already on the team takes over that person's
  // identity: by employee id first, else by name, each person once. Fields
  // the file has no column for keep that person's values.
  const existing = existingPerson(context, name, employeeId);
  const hasTitle = columns.titles.length > 0;
  const role =
    hasTitle || !existing
      ? canonicalRole(roleValue || "Team member", tpl.roleTemplates)
      : existing.role;
  const tenureYears =
    columns.tenure === undefined && columns.hireDate === undefined
      ? existing?.tenureYears
      : readTenure(context, cells, row);
  const statusColumns =
    columns.statuses.length + columns.workerTypes.length + columns.inactiveFlags.length > 0;
  const status: { active: boolean; leave?: string } =
    statusColumns || !existing ? readActive(context, cells, row) : { active: existing.active };
  let lastDay = readLastDay(context, cells, row, existing);
  // A last day already past means the person has left, unless a status says
  // otherwise (a rehire can keep an old termination date).
  if (lastDay && lastDay < context.today.toISOString().slice(0, 10) && status.active) {
    if (hasStatus(context, cells)) {
      context.issues.push({
        row,
        message: `"${name}" has a past last day (${lastDay}) but an active status; the last day was not kept`,
      });
      lastDay = undefined;
    } else {
      status.active = false;
      delete status.leave;
      context.issues.push({
        row,
        message: `"${name}" left on ${lastDay}, so is read as no longer working here`,
      });
    }
  }

  // Duties listed in the file win; else a person already on the team with
  // the same title keeps the duties set for them; else the catalog of common
  // titles; else a template role keeps its duties by leaving entitlements unset.
  const listed = readListedDuties(context, cells, row);
  const templateRole = Object.hasOwn(tpl.roleTemplates, role);
  const sameSeat = existing !== undefined && nameKey(existing.role) === nameKey(role);
  const catalogDuties = hit ? entitlementsForTitle(hit.value, tpl.id) : [];
  const duties = listed.length ? listed : sameSeat ? (existing.entitlements ?? []) : catalogDuties;
  const mapping: TitleMapping = {
    row,
    name,
    title: roleValue,
    catalogTitle: hit?.match.entry.title ?? (templateRole ? role : undefined),
    confidence: hit?.match.confidence ?? (templateRole ? "exact" : undefined),
  };
  if (!listed.length && !hit && !templateRole && !sameSeat) {
    context.issues.push({
      row,
      message: roleValue
        ? `Title "${roleValue}" is not in the catalog; duties left for you to tick`
        : "No job title; duties left for you to tick",
    });
  }

  if (repeat !== "new") {
    const positionDuties = duties.length ? duties : templateRole ? tpl.roleTemplates[role] : [];
    addPosition(
      context,
      repeat,
      { title: roleValue, role, duties: positionDuties, active: status.active },
      employeeId,
      row,
    );
    return { position: mapping };
  }

  const baseId = existing
    ? existing.id
    : employeeId
      ? `emp-${slug(employeeId) || slug(name)}`
      : `p-${slug(name)}`;
  let id = baseId;
  let suffix = 2;
  while (context.usedIds.has(id)) id = `${baseId}-${suffix++}`;
  context.usedIds.add(id);
  // A blank department or employee id keeps the one on record: a pasted
  // "Name, Title" list has a department column only for the lines that name one.
  const keptDepartment = department || existing?.department;
  const keptEmployeeId = employeeId || existing?.employeeId;
  // The owner's mark from setup is not in an HR export: a person already on
  // the team keeps theirs unless this app's own export says otherwise.
  const ownerCell = yesNo(cellAt(cells, context.columns.ownsBusiness));
  const keptOwner = ownerCell ?? existing?.owner;
  // Duties still guessed from the title stay marked only while they are unchanged.
  const guessCell = yesNo(cellAt(cells, context.columns.dutiesFromTitle));
  const sameDutiesAsBefore =
    existing !== undefined &&
    [...(existing.entitlements ?? [])].sort().join("|") === [...duties].sort().join("|");
  const keptGuess =
    guessCell ??
    (existing?.dutiesFromTitle === true && (duties.length === 0 || sameDutiesAsBefore));
  const person: Person = {
    id,
    name: name.slice(0, 60),
    role: tidyCut(role, MAX_ROLE_LENGTH),
    active: status.active,
    tenureYears,
    ...(lastDay ? { lastDay } : {}),
    entitlements: duties.length ? [...duties] : undefined,
    ...(keptDepartment ? { department: keptDepartment } : {}),
    ...(keptEmployeeId ? { employeeId: keptEmployeeId } : {}),
    ...(typeof keptOwner === "boolean" ? { owner: keptOwner } : {}),
    ...(keptGuess ? { dutiesFromTitle: true as const } : {}),
  };
  const idKey = nameKey(employeeId);
  if (idKey && !context.byEmployeeId.has(idKey)) {
    context.byEmployeeId.set(idKey, { person, titleKeys: new Set([nameKey(roleValue)]) });
  }
  const nameTitle = `${nameKey(name)}|${nameKey(roleValue)}`;
  if (!context.byNameTitle.has(nameTitle)) context.byNameTitle.set(nameTitle, person);
  if (status.leave) {
    context.onLeave.push(id);
    context.issues.push({
      row,
      message: `"${person.name}" is on leave (status "${status.leave}"); kept on the team`,
    });
  }
  return { person, mapping };
}

/**
 * The team member a row names, if any and not yet taken by an earlier row:
 * the one with the row's employee id, else the first with the row's name
 * whose own employee id does not say it is someone else.
 */
function existingPerson(
  context: ImportContext,
  name: string,
  employeeId: string,
): Person | undefined {
  const idKey = nameKey(employeeId);
  const byId = idKey ? context.existingByEmployeeId.get(idKey) : undefined;
  if (byId && !context.usedIds.has(byId.id)) return byId;
  return context.existingByName
    .get(nameKey(name))
    ?.find(
      (person) =>
        !context.usedIds.has(person.id) &&
        !(idKey && person.employeeId && nameKey(person.employeeId) !== idKey),
    );
}
/** "yes"/"true"/"y"/"1" is true, "no"/"false"/"n"/"0" is false, anything else says nothing. */
function yesNo(cell: string): boolean | undefined {
  const value = cell.trim().toLowerCase();
  if (["yes", "true", "y", "1"].includes(value)) return true;
  if (["no", "false", "n", "0"].includes(value)) return false;
  return undefined;
}
