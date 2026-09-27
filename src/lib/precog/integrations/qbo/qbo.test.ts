import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "./client.server";
import {
  diffSnapshots,
  driftIsEmpty,
  employeesFromQuery,
  VENDOR_FIELD_LABEL,
  vendorsFromQuery,
} from "./model";
import { authorizeUrl, signState, verifyState } from "./oauth";

const vendorBody = {
  QueryResponse: {
    Vendor: [
      {
        Id: "1",
        DisplayName: "Acme Supply",
        Active: true,
        AcctNum: "A-100",
        BillAddr: {
          Line1: "1 Main St",
          City: "Austin",
          CountrySubDivisionCode: "TX",
          PostalCode: "78701",
        },
        PrimaryEmailAddr: { Address: "ap@acme.test" },
        MetaData: { LastUpdatedTime: "2026-09-01T00:00:00Z" },
      },
      { Id: "2", DisplayName: "Old Vendor", Active: false },
      { Id: "3", CompanyName: "No Display" },
      { DisplayName: "No id" },
    ],
  },
};

const employeeBody = {
  QueryResponse: {
    Employee: [
      { Id: "e1", DisplayName: "Ada Owner", Active: true, HiredDate: "2020-01-01" },
      { Id: "e2", GivenName: "Bea", FamilyName: "Books", Active: true },
      { Id: "e3", DisplayName: "Cy Gone", Active: false, ReleasedDate: "2026-09-01" },
    ],
  },
};

describe("QuickBooks readings", () => {
  it("reduces vendors and employees to the fields the map needs", () => {
    const vendors = vendorsFromQuery(vendorBody);
    expect(vendors.map((v) => [v.id, v.name, v.active])).toEqual([
      ["1", "Acme Supply", true],
      ["2", "Old Vendor", false],
      ["3", "No Display", true],
    ]);
    expect(vendors[0].address).toBe("1 Main St, Austin, TX, 78701");
    expect(employeesFromQuery(employeeBody).map((e) => e.name)).toEqual([
      "Ada Owner",
      "Bea Books",
      "Cy Gone",
    ]);
    expect(vendorsFromQuery({})).toEqual([]);
  });

  it("names what changed between two readings and against the duty map", () => {
    const previous = {
      takenAt: "2026-08-01T00:00:00.000Z",
      vendors: [
        {
          id: "1",
          name: "Acme Supply",
          active: true,
          email: null,
          address: "old address",
          accountNumber: "A-100",
        },
        {
          id: "9",
          name: "Gone Vendor",
          active: true,
          email: null,
          address: null,
          accountNumber: null,
        },
      ],
      employees: [
        { id: "e1", name: "Ada Owner", active: true, releasedOn: null },
        { id: "e3", name: "Cy Gone", active: true, releasedOn: null },
      ],
    };
    const current = {
      takenAt: "2026-09-01T00:00:00.000Z",
      vendors: vendorsFromQuery(vendorBody),
      employees: employeesFromQuery(employeeBody),
    };
    const drift = diffSnapshots(previous, current, [
      { name: "Ada Owner", active: true },
      { name: "Dee Map", active: true },
      { name: "Left Person", active: false },
    ]);
    expect(drift.since).toBe(previous.takenAt);
    expect(drift.vendorsAdded.map((v) => v.id)).toEqual(["2", "3"]);
    expect(drift.vendorsRemoved.map((v) => v.id)).toEqual(["9"]);
    expect(drift.vendorsChanged).toEqual([
      { vendor: current.vendors[0], fields: ["address", "email"] },
    ]);
    expect(drift.employeesAdded.map((e) => e.id)).toEqual(["e2"]);
    expect(drift.employeesReleased.map((e) => e.id)).toEqual(["e3"]);
    expect(drift.employeesNotOnMap.map((e) => e.name)).toEqual(["Bea Books"]);
    expect(drift.peopleNotInBooks).toEqual(["Dee Map"]);
    expect(driftIsEmpty(drift)).toBe(false);
  });

  it("a first reading reports only the map mismatch", () => {
    const current = {
      takenAt: "x",
      vendors: vendorsFromQuery(vendorBody),
      employees: employeesFromQuery(employeeBody),
    };
    const drift = diffSnapshots(null, current, [{ name: "Ada Owner" }, { name: "Bea Books" }]);
    expect(drift.vendorsAdded).toEqual([]);
    expect(drift.employeesReleased.map((e) => e.id)).toEqual(["e3"]);
    expect(drift.employeesNotOnMap).toEqual([]);
    expect(drift.peopleNotInBooks).toEqual([]);
  });
});

describe("connect state", () => {
  it("round-trips a signed state and rejects tampering or age", async () => {
    const state = { userId: "u1", businessId: "biz_1", issuedAt: 1_000_000 };
    const token = await signState(state, "secret");
    expect(await verifyState(token, "secret", 1_000_000 + 60_000)).toEqual(state);
    expect(await verifyState(token, "other", 1_000_000)).toBeNull();
    expect(await verifyState(`${token}x`, "secret", 1_000_000)).toBeNull();
    expect(await verifyState(token, "secret", 1_000_000 + 11 * 60_000)).toBeNull();
    expect(await verifyState(null, "secret")).toBeNull();
  });

  it("accepts exactly two segments and no state issued in the future", async () => {
    const state = { userId: "u1", businessId: "biz_1", issuedAt: 1_000_000 };
    const token = await signState(state, "secret");
    expect(await verifyState(`${token}.garbage`, "secret", 1_000_000)).toBeNull();
    expect(await verifyState(`${token}.x.y`, "secret", 1_000_000)).toBeNull();
    expect(await verifyState(token, "secret", 1_000_000 - 61_000)).toBeNull();
  });

  it("builds the authorize URL Intuit expects", () => {
    const url = new URL(
      authorizeUrl({ clientId: "cid", redirectUri: "https://app/cb", state: "s" }),
    );
    expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app/cb");
  });
});

describe("diffSnapshots name matching", () => {
  it("treats 'Jose Perez' in the books as the mapped 'José Pérez'", () => {
    const drift = diffSnapshots(
      null,
      {
        takenAt: "2026-09-26T00:00:00Z",
        vendors: [],
        employees: [
          {
            id: "1",
            name: "Jose Perez",
            active: true,
            releasedOn: null,
          },
        ],
      },
      [{ name: "José Pérez" }],
    );
    expect(drift.employeesNotOnMap).toEqual([]);
  });
});

describe("token sealing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips, refuses another key and a changed tag", () => {
    vi.stubEnv("INTEGRATION_KEY", "key-a");
    const sealed = encryptSecret("refresh-token");
    expect(sealed.split(".")).toHaveLength(4);
    expect(decryptSecret(sealed)).toBe("refresh-token");
    const [kid, iv, tag, body] = sealed.split(".");
    const flipped = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
    expect(() => decryptSecret([kid, iv, flipped, body].join("."))).toThrow();
    vi.stubEnv("INTEGRATION_KEY", "key-b");
    expect(() => decryptSecret(sealed)).toThrow();
  });

  it("still opens tokens sealed under the previous key during a rotation", () => {
    vi.stubEnv("INTEGRATION_KEY", "key-a");
    const sealed = encryptSecret("refresh-token");
    const legacy = sealed.split(".").slice(1).join(".");
    vi.stubEnv("INTEGRATION_KEY", "key-b");
    vi.stubEnv("INTEGRATION_KEY_PREVIOUS", "key-a");
    expect(decryptSecret(sealed)).toBe("refresh-token");
    expect(decryptSecret(legacy)).toBe("refresh-token");
    expect(encryptSecret("x").split(".")[0]).not.toBe(sealed.split(".")[0]);
  });
});

describe("vendor field labels", () => {
  it("names every changed field in words", () => {
    expect(VENDOR_FIELD_LABEL.accountNumber).toBe("account number");
    expect(Object.values(VENDOR_FIELD_LABEL).every((label) => !/[A-Z]/.test(label))).toBe(true);
  });
});
