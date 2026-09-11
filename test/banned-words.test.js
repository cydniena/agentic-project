import { test } from "node:test";
import assert from "node:assert/strict";

import { findBannedWords } from "../public/banned-words.js";

const find = (text, words) => findBannedWords(text, words);

test("matches a banned word regardless of case", () => {
  assert.deepEqual(find("We GUARANTEE it", ["guarantee"]), ["guarantee"]);
});

test("does not flag a banned word buried inside a longer word", () => {
  // The regression this fixes: "ad" used to flag every one of these.
  assert.deepEqual(find("ready when you are", ["ad"]), []);
  assert.deepEqual(find("happy to give advice", ["ad"]), []);
  assert.deepEqual(find("please add milk", ["ad"]), []);
});

test("still flags the banned word itself and its plural", () => {
  assert.deepEqual(find("that ad went out", ["ad"]), ["ad"]);
  assert.deepEqual(find("our ads are live", ["ad"]), ["ad"]);
});

test("catches common inflections", () => {
  assert.deepEqual(find("the cheaper option", ["cheap"]), ["cheap"]);
  assert.deepEqual(find("guaranteed next week", ["guarantee"]), ["guarantee"]);
});

test("matches multi-word entries as a phrase, not as separate words", () => {
  assert.deepEqual(find("the best in the world", ["best in the world"]), ["best in the world"]);
  assert.deepEqual(find("the best coffee in the world", ["best in the world"]), []);
});

test("tolerates line breaks and doubled spaces inside a phrase", () => {
  assert.deepEqual(find("best in\n  the world", ["best in the world"]), ["best in the world"]);
});

test("treats curly and straight apostrophes as the same character", () => {
  assert.deepEqual(find("it’s the world’s best", ["world's best"]), ["world's best"]);
  assert.deepEqual(find("it's the world's best", ["world’s best"]), ["world’s best"]);
});

test("returns every match, in the order the words were configured", () => {
  assert.deepEqual(find("cheap and fast, we guarantee", ["guarantee", "cheap"]), [
    "guarantee",
    "cheap",
  ]);
});

test("handles punctuation next to the word", () => {
  assert.deepEqual(find("it is cheap, really", ["cheap"]), ["cheap"]);
  assert.deepEqual(find("(cheap)", ["cheap"]), ["cheap"]);
});

test("does not treat regex metacharacters in a banned entry as a pattern", () => {
  assert.deepEqual(find("anything at all", ["a.*"]), []);
  assert.deepEqual(find("we said a.* here", ["a.*"]), ["a.*"]);
});

test("empty and missing inputs are safe", () => {
  assert.deepEqual(find("", ["cheap"]), []);
  assert.deepEqual(find(null, ["cheap"]), []);
  assert.deepEqual(find("cheap", []), []);
  assert.deepEqual(find("cheap", undefined), []);
  assert.deepEqual(find("cheap", ["", "  "]), []);
});
