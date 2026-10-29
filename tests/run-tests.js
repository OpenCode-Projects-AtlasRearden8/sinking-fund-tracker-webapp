"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.ok(scriptMatches.length >= 1, "index.html must contain an inline <script> block");

const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(scriptMatches.map((m) => m[1]).join("\n;\n"), sandbox, { filename: "index.html#inline-script" });

const SFT = sandbox.module.exports;
assert.ok(SFT && typeof SFT.forecastTable === "function", "forecast math must be exported for tests");

const NOW = new Date(2026, 9, 28);
const D = (y, m, d) => new Date(y, m - 1, d);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("PASS " + name);
  } catch (err) {
    console.error("FAIL " + name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

function same(a, b, msg) {
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg || ("expected " + JSON.stringify(b) + " got " + JSON.stringify(a)));
}

test("round2 rounds to cents and tames float drift", () => {
  same(SFT.round2(1.234), 1.23);
  same(SFT.round2(10), 10);
  same(SFT.round2(SFT.round2(0.1) + SFT.round2(0.2)), 0.3);
  same(SFT.round2(NaN), 0);
});

test("fmtMoney formats US currency", () => {
  same(SFT.fmtMoney(1234.5), "$1,234.50");
  same(SFT.fmtMoney(0), "$0.00");
  same(SFT.fmtMoney(12.4), "$12.40");
});

test("parseISODate accepts valid dates only", () => {
  same(SFT.parseISODate("2027-01-15").getFullYear(), 2027);
  same(SFT.parseISODate("2027-02-29"), null);
  same(SFT.parseISODate("2026-13-01"), null);
  same(SFT.parseISODate("not-a-date"), null);
  same(SFT.parseISODate(""), null);
  same(SFT.parseISODate(null), null);
});

test("futureISO lands on the right month and day", () => {
  same(SFT.futureISO(12, 1, D(2026, 10, 28)), "2027-10-01");
  same(SFT.futureISO(2, 31, D(2026, 3, 31)), "2026-05-31");
  same(SFT.futureISO(2, 30, D(2026, 3, 31)), "2026-05-30");
});

test("monthsRemaining counts full months to the goal", () => {
  same(SFT.monthsRemaining(D(2026, 10, 28), "2027-01-15"), 3);
  same(SFT.monthsRemaining(D(2026, 10, 1), "2028-10-31"), 24);
  same(SFT.monthsRemaining(D(2026, 10, 28), "2026-10-31"), 0);
  same(SFT.monthsRemaining(D(2026, 10, 28), "2026-01-01"), 0);
  same(SFT.monthsRemaining(D(2026, 10, 28), "garbage"), 0);
});

test("forecastTable projects month by month", () => {
  same(SFT.forecastTable(100, 50, "2027-01-15", D(2026, 10, 28)), [
    { month: "2026-11", balance: 150 },
    { month: "2026-12", balance: 200 },
    { month: "2027-01", balance: 250 }
  ]);
});

test("forecastTable rounds running balances", () => {
  same(SFT.forecastTable(10.05, 0.3, "2027-03-05", D(2026, 10, 28)).at(-1).balance, 11.55);
  same(SFT.forecastTable(10.05, 0.3, "2027-03-05", D(2026, 10, 28)).length, 5);
});

test("forecastTable is empty for past or same-month goals", () => {
  same(SFT.forecastTable(100, 50, "2026-08-15", D(2026, 10, 28)), []);
  same(SFT.forecastTable(100, 50, "2026-10-31", D(2026, 10, 28)), []);
  same(SFT.forecastTable(100, 50, "", D(2026, 10, 28)), []);
});

test("forecastTable spans year boundaries across a full year", () => {
  const rows = SFT.forecastTable(0, 100, "2027-10-31", D(2026, 10, 28));
  same(rows.length, 12);
  same(rows[0].month, "2026-11");
  same(rows[11].month, "2027-10");
  same(rows[11].balance, 1200);
});

test("projectedTotal combines savings and remaining months", () => {
  same(SFT.projectedTotal(100, 50, D(2026, 10, 28), "2027-01-15"), 250);
  same(SFT.projectedTotal(100, 50, D(2026, 10, 28), "2020-01-01"), 100);
});

test("firstGoalMonth finds the month the goal is met", () => {
  same(SFT.firstGoalMonth(100, 50, 220, "2027-01-15", D(2026, 10, 28)), "2027-01");
  same(SFT.firstGoalMonth(100, 50, 250, "2027-01-15", D(2026, 10, 28)), "2027-01");
  same(SFT.firstGoalMonth(100, 50, 260, "2027-01-15", D(2026, 10, 28)), null);
  same(SFT.firstGoalMonth(250, 50, 200, "2027-01-15", D(2026, 10, 28)), null);
});

test("catchUpSuggestion is gentle but exact when off track", () => {
  const cu = SFT.catchUpSuggestion({ saved: 100, target: 260, monthly: 50, goalDate: "2027-01-15" }, D(2026, 10, 28));
  same(cu.monthsRemaining, 3);
  same(cu.neededPerMonth, 53.34);
  same(cu.extraPerMonth, 3.34);
  assert.ok(cu.message.includes("$3.34"), "message should mention the extra amount");
  assert.ok(cu.message.includes("$260"), "message should mention the target");
});

test("catchUpSuggestion rounds up to the cent", () => {
  const cu = SFT.catchUpSuggestion({ saved: 0, target: 100, monthly: 30, goalDate: "2027-01-15" }, D(2026, 10, 28));
  same(cu.neededPerMonth, 33.34);
  same(cu.extraPerMonth, 3.34);
});

test("catchUpSuggestion returns null when already on track", () => {
  same(SFT.catchUpSuggestion({ saved: 100, target: 250, monthly: 50, goalDate: "2027-01-15" }, D(2026, 10, 28)), null);
  same(SFT.catchUpSuggestion({ saved: 300, target: 250, monthly: 50, goalDate: "2027-01-15" }, D(2026, 10, 28)), null);
});

test("catchUpSuggestion handles a passed goal date", () => {
  const cu = SFT.catchUpSuggestion({ saved: 40, target: 100, monthly: 50, goalDate: "2026-05-01" }, D(2026, 10, 28));
  same(cu.monthsRemaining, 0);
  same(cu.needNow, 60);
  same(cu.extraPerMonth, null);
});

test("cheerFor gets more cheerful as progress grows", () => {
  const low = SFT.cheerFor(0);
  const mid = SFT.cheerFor(50);
  const done = SFT.cheerFor(100);
  assert.ok(low.length > 0 && mid.length > 0 && done.length > 0);
  assert.notStrictEqual(low, done);
  assert.notStrictEqual(mid, done);
});

test("csvEscape quotes cells with commas, quotes, and newlines", () => {
  same(SFT.csvEscape("plain"), "plain");
  same(SFT.csvEscape('has "quote"'), '"has ""quote"""');
  same(SFT.csvEscape("a,b"), '"a,b"');
  same(SFT.csvEscape("line\nbreak"), '"line\nbreak"');
  same(SFT.csvEscape(null), "");
});

test("buildDepositCSV emits the deposit log sorted by date", () => {
  const csv = SFT.buildDepositCSV([
    {
      name: "Property tax, county",
      deposits: [
        { date: "2026-11-01", amount: 200, note: "payday" },
        { date: "2026-03-15", amount: 75.5, note: "" }
      ]
    },
    {
      name: "Holidays",
      deposits: [{ date: "2026-06-10", amount: 60, note: "spare change" }]
    }
  ]);
  const lines = csv.trim().split("\r\n");
  same(lines[0], "Bucket,Date,Amount,Note");
  same(lines[1], '"Property tax, county",2026-03-15,75.50,');
  same(lines[2], "Holidays,2026-06-10,60.00,spare change");
  same(lines[3], '"Property tax, county",2026-11-01,200.00,payday');
});

test("validateBucketInput rejects bad values", () => {
  same(SFT.validateBucketInput({ name: "", target: "100", monthly: "10", goalDate: "2027-01-01" }).error !== undefined, true);
  same(SFT.validateBucketInput({ name: "Car", target: "0", monthly: "10", goalDate: "2027-01-01" }).error !== undefined, true);
  same(SFT.validateBucketInput({ name: "Car", target: "100", monthly: "10", goalDate: "nope" }).error !== undefined, true);
  const ok = SFT.validateBucketInput({ name: "  Car fund  ", target: "100.005", monthly: "-5", goalDate: "2027-01-01" });
  same(ok.error, undefined);
  same(ok.value.name, "Car fund");
  same(ok.value.target, 100.01);
  same(ok.value.monthly, 0);
});

test("validateDepositInput rejects bad deposits and keeps notes clean", () => {
  same(SFT.validateDepositInput({ amount: "0", date: "2026-10-28", note: "" }).error !== undefined, true);
  same(SFT.validateDepositInput({ amount: "50", date: "2026-02-30", note: "" }).error !== undefined, true);
  const ok = SFT.validateDepositInput({ amount: " 50.508 ", date: "2026-10-28", note: "  saved   up  " });
  same(ok.error, undefined);
  same(ok.value.amount, 50.51);
  same(ok.value.note, "saved up");
});

test("sanitizeState repairs malformed stored data", () => {
  const state = SFT.sanitizeState({
    buckets: [
      null,
      { name: "Tax", target: "1200", monthly: "-3", goalDate: "2027-06-30", deposits: [{ amount: "10", date: "2026-01-05", note: "x" }, { amount: "no", date: "zz" }] },
      { name: "", target: 5 },
      "junk"
    ]
  });
  same(state.buckets.length, 1);
  same(state.buckets[0].name, "Tax");
  same(state.buckets[0].monthly, 0);
  same(state.buckets[0].deposits.length, 1);
  same(state.buckets[0].deposits[0].amount, 10);
  same(SFT.sanitizeState(null).buckets, []);
  same(SFT.sanitizeState({ buckets: "nope" }).buckets, []);
});

test("defaultBuckets seeds the four purpose buckets", () => {
  const seeds = SFT.defaultBuckets(D(2026, 10, 28));
  const names = seeds.map((b) => b.name);
  same(names, ["Property tax", "Car fund", "Holidays", "Vet visits"]);
  for (const b of seeds) {
    assert.ok(SFT.parseISODate(b.goalDate), "seeded goal date must be valid for " + b.name);
    assert.ok(b.target > 0);
    assert.ok(b.monthly >= 0);
  }
});

test("bucketTotal sums deposits safely", () => {
  same(SFT.bucketTotal({ deposits: [{ amount: 10 }, { amount: 2.5 }, { amount: "bad" }] }), 12.5);
  same(SFT.bucketTotal({ deposits: [] }), 0);
});

const total = passed + (process.exitCode ? 1 : 0);
if (process.exitCode) {
  console.error("\nSome tests failed.");
  process.exit(1);
}
console.log("\nAll " + passed + " tests passed.");
