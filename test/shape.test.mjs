import assert from "node:assert";
import { countryStars } from "../src/shape.js";
for (const c of ["RU", "US", "IT", "JP", "KZ", "BY"]) {
  const p = countryStars(c, 14);
  assert.ok(p && p.length === 14, c);
  assert.ok(p.every(([x, y]) => x >= 0 && x <= 320 && y >= 0 && y <= 140), c + " в рамке");
}
assert.strictEqual(countryStars("XX"), null);
assert.strictEqual(countryStars(""), null);
const ru = countryStars("RU", 14);
const w = Math.max(...ru.map((p) => p[0])) - Math.min(...ru.map((p) => p[0]));
assert.ok(w > 200, "Россия во всю ширину " + w);
console.log("shape: ok");
