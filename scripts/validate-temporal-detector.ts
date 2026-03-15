const SAFE_PATTERN =
  /\b(reports|reported|no record(?:ed)?|based on available records|cannot confirm|can't confirm|timing is uncertain|no explicit date|approx(?:imation)?|likely|appears|may|suggests)\b/i;
const UNSAFE_PATTERN =
  /\b(as of\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|on\s+\d{4}-\d{2}-\d{2}|on\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}|was shipped on|arrived on|delivered on|confirmed on)\b/i;

const fixtures = [
  {
    name: "cautious_safe",
    text: "Based on available records, Pacific Packaging reports production is complete, but I can't confirm a shipment timeline.",
    expectedSafe: true,
  },
  {
    name: "definitive_unsafe",
    text: "The order was delivered on March 12, 2026, even though timing is uncertain.",
    expectedSafe: false,
  },
  {
    name: "awkward_but_safe",
    text: "No shipment record found. Timing is uncertain because no explicit date was captured in the source material.",
    expectedSafe: true,
  },
] as const;

let failed = false;

for (const fixture of fixtures) {
  const hasSafeLanguage = SAFE_PATTERN.test(fixture.text);
  const hasUnsafeLanguage = UNSAFE_PATTERN.test(fixture.text);
  const actualSafe = !hasUnsafeLanguage && hasSafeLanguage;

  if (actualSafe !== fixture.expectedSafe) {
    failed = true;
    console.error(`FAIL ${fixture.name}: expected ${fixture.expectedSafe ? "safe" : "unsafe"}, got ${actualSafe ? "safe" : "unsafe"}`);
  } else {
    console.log(`PASS ${fixture.name}`);
  }
}

if (failed) {
  process.exit(1);
}
