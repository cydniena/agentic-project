import test from "node:test";
import assert from "node:assert/strict";
import { loadSkill, skillDefaults } from "./skill.js";

test("parses every section of the skill", () => {
  const s = loadSkill();
  assert.match(s.brandName, /Defence Science and Technology Agency/);
  assert.match(s.guidelines, /engineers in public service/);
  assert.ok(s.dos.length >= 3, "expected do's");
  assert.ok(s.donts.length >= 3, "expected don'ts");
  assert.ok(s.bannedWords.includes("guarantee"));
});

test("examples carry their fields", () => {
  const s = loadSkill();
  assert.ok(s.replyExamples.length >= 3 && s.replyExamples.length <= 5);
  assert.ok(s.postExamples.length >= 3 && s.postExamples.length <= 5);
  for (const ex of s.replyExamples) {
    assert.ok(ex.title, "example needs a title");
    assert.ok(ex.fields.comment, `${ex.title}: missing Comment`);
    assert.ok(ex.fields.reply, `${ex.title}: missing Reply`);
  }
  for (const ex of s.postExamples) assert.ok(ex.fields.post, `${ex.title}: missing Post`);
});

test("no example demonstrates a banned phrase", () => {
  const s = loadSkill();
  const all = [...s.replyExamples.map((e) => e.fields.reply), ...s.postExamples.map((e) => e.fields.post)];
  for (const text of all)
    for (const w of s.bannedWords)
      assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `example uses banned "${w}": ${text}`);
});

test("example replies obey the 400-character tone rule", () => {
  for (const ex of loadSkill().replyExamples)
    assert.ok(ex.fields.reply.length <= 400, `${ex.title} is ${ex.fields.reply.length} chars`);
});

test("skillDefaults exposes only the four overridable fields", () => {
  assert.deepEqual(Object.keys(skillDefaults()).sort(), ["bannedWords", "brandName", "guidelines", "toneRules"]);
});
