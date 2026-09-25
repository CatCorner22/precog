/**
 * QuickBooks Online, reduced to what a duty map needs: who is paid (vendors)
 * and who is employed (employees), and what changed between two readings.
 * Pure: the network calls live in `client.server.ts`.
 */
export interface QboVendor {
  id: string;
  name: string;
  active: boolean;
  email: string | null;
  address: string | null;
  accountNumber: string | null;
  updatedAt: string | null;
}

export interface QboEmployee {
  id: string;
  name: string;
  active: boolean;
  hiredOn: string | null;
  releasedOn: string | null;
  email: string | null;
}

export interface QboSnapshot {
  takenAt: string;
  vendors: QboVendor[];
  employees: QboEmployee[];
}

export interface VendorChange {
  vendor: QboVendor;
  fields: Array<"name" | "address" | "email" | "accountNumber" | "active">;
}

export interface IntegrationDrift {
  since: string | null;
  vendorsAdded: QboVendor[];
  vendorsRemoved: QboVendor[];
  vendorsChanged: VendorChange[];
  employeesAdded: QboEmployee[];
  employeesReleased: QboEmployee[];
  /** Employees in the books who are not on the duty map, by name. */
  employeesNotOnMap: QboEmployee[];
  /** People on the duty map with no employee record in the books. */
  peopleNotInBooks: string[];
}

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function addressOf(addr: unknown): string | null {
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Json;
  const parts = [a.Line1, a.Line2, a.City, a.CountrySubDivisionCode, a.PostalCode]
    .map(str)
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function vendorsFromQuery(body: unknown): QboVendor[] {
  const rows = ((body as Json)?.QueryResponse as Json | undefined)?.Vendor;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row): QboVendor | null => {
      const r = row as Json;
      const id = str(r.Id);
      const name = str(r.DisplayName) ?? str(r.CompanyName);
      if (!id || !name) return null;
      return {
        id,
        name,
        active: r.Active !== false,
        email: str((r.PrimaryEmailAddr as Json | undefined)?.Address),
        address: addressOf(r.BillAddr),
        accountNumber: str(r.AcctNum),
        updatedAt: str((r.MetaData as Json | undefined)?.LastUpdatedTime),
      };
    })
    .filter((v): v is QboVendor => v !== null);
}

export function employeesFromQuery(body: unknown): QboEmployee[] {
  const rows = ((body as Json)?.QueryResponse as Json | undefined)?.Employee;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row): QboEmployee | null => {
      const r = row as Json;
      const id = str(r.Id);
      const name =
        str(r.DisplayName) ?? [str(r.GivenName), str(r.FamilyName)].filter(Boolean).join(" ");
      if (!id || !name) return null;
      return {
        id,
        name,
        active: r.Active !== false,
        hiredOn: str(r.HiredDate),
        releasedOn: str(r.ReleasedDate),
        email: str((r.PrimaryEmailAddr as Json | undefined)?.Address),
      };
    })
    .filter((e): e is QboEmployee => e !== null);
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function diffSnapshots(
  previous: QboSnapshot | null,
  current: QboSnapshot,
  mapPeople: readonly { name: string; active?: boolean }[],
): IntegrationDrift {
  const prevVendors = new Map((previous?.vendors ?? []).map((v) => [v.id, v]));
  const curVendors = new Map(current.vendors.map((v) => [v.id, v]));
  const prevEmployees = new Map((previous?.employees ?? []).map((e) => [e.id, e]));

  const vendorsAdded = previous ? current.vendors.filter((v) => !prevVendors.has(v.id)) : [];
  const vendorsRemoved = previous
    ? (previous.vendors ?? []).filter((v) => !curVendors.has(v.id))
    : [];
  const vendorsChanged: VendorChange[] = [];
  if (previous) {
    for (const vendor of current.vendors) {
      const before = prevVendors.get(vendor.id);
      if (!before) continue;
      const fields: VendorChange["fields"] = [];
      if (before.name !== vendor.name) fields.push("name");
      if (before.address !== vendor.address) fields.push("address");
      if (before.email !== vendor.email) fields.push("email");
      if (before.accountNumber !== vendor.accountNumber) fields.push("accountNumber");
      if (before.active !== vendor.active) fields.push("active");
      if (fields.length) vendorsChanged.push({ vendor, fields });
    }
  }

  const employeesAdded = previous ? current.employees.filter((e) => !prevEmployees.has(e.id)) : [];
  const employeesReleased = current.employees.filter((e) => {
    const before = prevEmployees.get(e.id);
    const releasedNow = Boolean(e.releasedOn) || !e.active;
    const releasedBefore = before ? Boolean(before.releasedOn) || !before.active : false;
    return releasedNow && (!previous || !releasedBefore);
  });

  const mapNames = new Set(mapPeople.filter((p) => p.active !== false).map((p) => nameKey(p.name)));
  const bookNames = new Set(
    current.employees.filter((e) => e.active && !e.releasedOn).map((e) => nameKey(e.name)),
  );
  const employeesNotOnMap = current.employees.filter(
    (e) => e.active && !e.releasedOn && !mapNames.has(nameKey(e.name)),
  );
  const peopleNotInBooks = mapPeople
    .filter((p) => p.active !== false && !bookNames.has(nameKey(p.name)))
    .map((p) => p.name);

  return {
    since: previous?.takenAt ?? null,
    vendorsAdded,
    vendorsRemoved,
    vendorsChanged,
    employeesAdded,
    employeesReleased,
    employeesNotOnMap,
    peopleNotInBooks,
  };
}

export function driftIsEmpty(drift: IntegrationDrift): boolean {
  return (
    drift.vendorsAdded.length === 0 &&
    drift.vendorsRemoved.length === 0 &&
    drift.vendorsChanged.length === 0 &&
    drift.employeesAdded.length === 0 &&
    drift.employeesReleased.length === 0 &&
    drift.employeesNotOnMap.length === 0 &&
    drift.peopleNotInBooks.length === 0
  );
}
