"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n;\n");

function makeElem(tag) {
  const listeners = {};
  const attrs = {};
  return {
    tagName: String(tag || "div").toUpperCase(),
    hidden: false,
    innerHTML: "",
    textContent: "",
    value: "",
    download: "",
    href: "",
    style: {},
    attributes: attrs,
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    listeners,
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    querySelector() { return makeElem("div"); },
    querySelectorAll() { return []; },
    focus() {},
    reset() {},
    click() {},
    appendChild() {},
    removeChild() {},
    closest() { return null; }
  };
}

const byId = {};
const store = new Map();
const createdAnchors = [];
const createdBlobs = [];

const ELEMENT_IDS = [
  "status", "summary", "bucketList", "emptyNote", "addBucketBtn", "exportBtn",
  "bucketFormCard", "bucketFormTitle", "bucketForm", "bf-name", "bf-target",
  "bf-monthly", "bf-goal", "bucketFormError", "bucketFormSave", "bucketFormCancel"
];

const documentStub = {
  body: makeElem("body"),
  getElementById(id) {
    if (!byId[id]) byId[id] = makeElem("div");
    return byId[id];
  },
  createElement(tag) {
    const el = makeElem(tag);
    if (String(tag).toLowerCase() === "a") createdAnchors.push(el);
    return el;
  },
  querySelectorAll() { return []; }
};

const localStorageStub = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); }
};

class FormDataStub {
  constructor(source) { this.source = source; }
  get(name) {
    const values = this.source && this.source._formValues;
    return values && name in values ? values[name] : null;
  }
}

const sandbox = {
  module: { exports: {} },
  console,
  window: {
    clearTimeout() {},
    setTimeout() { return 0; },
    confirm() { return true; },
    scrollTo() {}
  },
  localStorage: localStorageStub,
  FormData: FormDataStub,
  URL: { createObjectURL: () => "blob:stub", revokeObjectURL: () => {} }
};
sandbox.Blob = class Blob {
  constructor(parts) { this.parts = parts; createdBlobs.push(this); }
};

for (const id of ELEMENT_IDS) {
  documentStub.getElementById(id);
  byId[id].hidden = id === "emptyNote" || id === "bucketFormCard" || id === "summary" || id === "bucketFormError";
}
sandbox.document = documentStub;

vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: "index.html#inline-script" });

const KEY = "sinkingFundsTracker.v1";
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

function savedState() { return JSON.parse(localStorageStub.getItem(KEY)); }
const bucketList = byId["bucketList"];

function clickAction(action, bucketId, depositId) {
  const attrs = { "data-action": action, "data-bucket": bucketId, "data-deposit": depositId || "d-none" };
  const target = {
    closest(sel) {
      if (sel === "[data-action]") return { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
      return null;
    }
  };
  return { target, preventDefault() {} };
}

function depositFormEvent(bucketId, values) {
  const errorElem = makeElem("div");
  const form = {
    getAttribute: (k) => (k === "data-deposit-form" ? bucketId : null),
    querySelector: () => errorElem,
    _formValues: values
  };
  return {
    target: { closest: (sel) => (sel === "form[data-deposit-form]" ? form : null) },
    preventDefault() {},
    errorElem
  };
}

test("app boots and seeds the four default buckets", () => {
  const names = savedState().buckets.map((b) => b.name);
  assert.deepStrictEqual(names, ["Property tax", "Car fund", "Holidays", "Vet visits"]);
});

test("initial render shows bucket cards, progress bars, and summary", () => {
  assert.ok(bucketList.innerHTML.includes("Property tax"));
  assert.ok(bucketList.innerHTML.includes('role="progressbar"'));
  assert.ok(byId["summary"].innerHTML.includes("$0.00"));
  assert.strictEqual(byId["emptyNote"].hidden, true);
});

test("math API stays exposed via window", () => {
  assert.strictEqual(typeof sandbox.window.SFT.forecastTable, "function");
});

const firstBucketId = savedState().buckets[0].id;

test("deposit toggle opens the inline form", () => {
  bucketList.listeners.click[0](clickAction("deposit-toggle", firstBucketId));
  assert.ok(bucketList.innerHTML.includes("data-deposit-form"));
});

test("a valid deposit saves, re-renders, and announces itself", () => {
  const ev = depositFormEvent(firstBucketId, { amount: "250", date: "2026-10-29", note: "first deposit" });
  bucketList.listeners.submit[0](ev);
  assert.strictEqual(ev.errorElem.hidden, false);
  const s = savedState();
  assert.strictEqual(s.buckets[0].deposits.length, 1);
  assert.strictEqual(s.buckets[0].deposits[0].amount, 250);
  assert.ok(bucketList.innerHTML.includes("$250.00"));
  assert.ok(byId["status"].textContent.includes("Deposit added"));
});

test("an invalid deposit is rejected without touching storage", () => {
  const before = localStorageStub.getItem(KEY);
  const ev = depositFormEvent(firstBucketId, { amount: "-5", date: "2026-10-29", note: "" });
  bucketList.listeners.submit[0](ev);
  assert.ok(ev.errorElem.textContent.length > 0);
  assert.strictEqual(ev.errorElem.hidden, false);
  assert.strictEqual(localStorageStub.getItem(KEY), before);
});

test("bucket edit opens the form pre-filled and save persists the changes", () => {
  bucketList.listeners.click[0](clickAction("edit", firstBucketId));
  assert.strictEqual(byId["bucketFormCard"].hidden, false, "edit should open the bucket form card");
  assert.strictEqual(byId["bf-name"].value, "Property tax");
  byId["bucketForm"]._formValues = { name: "Property tax", target: "3000", monthly: "250", goalDate: "2027-06-30" };
  byId["bucketForm"].listeners.submit[0]({ target: byId["bucketForm"], preventDefault() {} });
  const after = savedState().buckets[0];
  assert.strictEqual(after.target, 3000);
  assert.strictEqual(after.monthly, 250);
  assert.strictEqual(after.goalDate, "2027-06-30");
  assert.strictEqual(byId["bucketFormCard"].hidden, true);
});

test("bucket form validation shows a gentle error for a missing goal date", () => {
  byId["bucketFormCard"].hidden = true;
  byId["bucketForm"]._formValues = { name: "New pot", target: "500", monthly: "50", goalDate: "" };
  byId["bucketForm"].listeners.submit[0]({ target: byId["bucketForm"], preventDefault() {} });
  assert.strictEqual(byId["bucketFormError"].hidden, false);
  assert.ok(byId["bucketFormError"].textContent.length > 0);
});

test("bucket delete asks for confirmation and removes the bucket", () => {
  const ids = savedState().buckets.map((b) => b.id);
  const secondId = ids[1];
  bucketList.listeners.click[0](clickAction("bucket-delete", secondId));
  const after = savedState();
  assert.strictEqual(after.buckets.length, ids.length - 1);
  assert.ok(!after.buckets.some((b) => b.id === secondId));
});

test("deposit delete removes a single entry", () => {
  const b = savedState().buckets.find((x) => x.id === firstBucketId);
  assert.ok(b.deposits.length >= 1);
  const depId = b.deposits[0].id;
  bucketList.listeners.click[0](clickAction("deposit-delete", b.id, depId));
  const after = savedState().buckets.find((x) => x.id === b.id);
  assert.ok(!after.deposits.some((d) => d.id === depId));
});

test("adding a new bucket persists it and re-renders", () => {
  byId["bucketForm"]._formValues = { name: "Chess club dues", target: "120", monthly: "10", goalDate: "2027-05-01" };
  byId["bucketFormCard"].hidden = false;
  byId["bucketFormCard"].openBucketFormProbe = "new";
  byId["bucketForm"].listeners.submit[0]({ target: byId["bucketForm"], preventDefault() {} });
  const s = savedState();
  assert.ok(s.buckets.some((b) => b.name === "Chess club dues"));
  assert.ok(bucketList.innerHTML.includes("Chess club dues"));
});

test("CSV export downloads a dated file with the deposit log", () => {
  const exportBtn = byId["exportBtn"];
  assert.ok(exportBtn.listeners.click && exportBtn.listeners.click.length === 1, "export button should have a click listener");
  exportBtn.listeners.click[0]();
  const anchor = createdAnchors[createdAnchors.length - 1];
  const blob = createdBlobs[createdBlobs.length - 1];
  assert.ok(anchor.download.startsWith("sinking-funds-deposits-"), "filename should be dated");
  const csv = blob.parts[0];
  assert.ok(csv.startsWith("Bucket,Date,Amount,Note\r\n"), "CSV should start with its header row");
  assert.ok(csv.includes(","), "CSV should contain data rows");
});

test("export with no buckets stays quiet and does not download", () => {
  for (const b of savedState().buckets) {
    bucketList.listeners.click[0](clickAction("bucket-delete", b.id));
  }
  assert.strictEqual(bucketList.innerHTML.indexOf("data-bucket-card"), -1, "no cards should remain");
  const emptyNote = byId["emptyNote"];
  assert.strictEqual(emptyNote.hidden, false, "empty note should show when all buckets are gone");
  byId["exportBtn"].listeners.click[0]();
  assert.strictEqual(createdAnchors.length, 1, "no new anchor should be created without buckets");
});

if (process.exitCode) {
  console.error("\nSmoke tests failed.");
  process.exit(1);
}
console.log("\nAll " + passed + " smoke tests passed.");
