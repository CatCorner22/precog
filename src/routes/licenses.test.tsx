import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LicenseReference } from "@/lib/licenses/types";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));

import { LicenseReferencePage } from "./licenses";

const source = [{ url: "https://example.com/rule", label: "Example rule" }];
const verified = "2026-01-01";
const laserScopeText =
  "Only dentists licensed by the Tennessee Board of Dentistry shall be authorized to perform procedures involving laser technology.";
const entries: LicenseReference[] = [
  {
    id: "dentist",
    tabLabel: "Dentist",
    title: "Dentist",
    status: "verified",
    last_verified: verified,
    review_days: 365,
    sources: source,
    blocks: [],
  },
  {
    id: "dentist-sedation-permits",
    tabLabel: "Sedation permits",
    title: "Sedation permits",
    status: "verified",
    last_verified: verified,
    review_days: 365,
    sources: source,
    blocks: [],
  },
  {
    id: "dental-hygienist",
    tabLabel: "Hygienist",
    title: "Hygienist",
    status: "verified",
    last_verified: verified,
    review_days: 365,
    sources: source,
    blocks: [],
  },
  {
    id: "dental-assistant-registered",
    tabLabel: "Registered assistant",
    title: "Registered assistant",
    status: "verified",
    last_verified: verified,
    review_days: 365,
    sources: source,
    blocks: [
      {
        type: "list",
        ordered: false,
        items: [laserScopeText],
      },
    ],
  },
  {
    id: "dental-assistant-practical",
    tabLabel: "Practical assistant",
    title: "Practical assistant",
    status: "verified",
    last_verified: verified,
    review_days: 365,
    sources: source,
    blocks: [],
  },
  {
    id: "certifications-and-specialties",
    tabLabel: "Certifications",
    title: "Certifications and specialties (Tennessee)",
    status: "verified",
    last_verified: verified,
    review_days: 365,
    sources: source,
    blocks: [{ type: "heading", level: 2, text: "Orofacial pain" }],
  },
  {
    id: "treatments",
    tabLabel: "Who may do it",
    title: "Who may do it",
    status: "verified",
    last_verified: verified,
    review_days: 365,
    sources: source,
    blocks: [],
  },
];
const html = renderToStaticMarkup(createElement(LicenseReferencePage, { entries }));

describe("Each license page", () => {
  it("server-renders the seven tabs, disclaimer, and hidden license content", () => {
    expect(html).toContain("Each license");
    expect(html.match(/role="tab"/g)).toHaveLength(7);
    for (const label of [
      "Dentist",
      "Sedation permits",
      "Hygienist",
      "Registered assistant",
      "Practical assistant",
      "Certifications",
      "Who may do it",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Orofacial pain");
    expect(html).toContain(
      "Research aid, not legal advice. Check the cited rule before relying on it.",
    );
    const registeredPanel =
      html.split('id="license-panel-dental-assistant-registered"')[1]?.split("</section>")[0] ?? "";
    expect(registeredPanel).toContain('hidden=""');
    expect(registeredPanel).toContain(laserScopeText);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
  });
});
