import assert from "node:assert/strict";
import { imageExtension, plannedMode, preloadPlan } from "./productImage.ts";

assert.equal(imageExtension("/img/north.webp"), "webp");
assert.equal(imageExtension("/img/north.PNG?v=2"), "png");
assert.equal(imageExtension("https://cdn.example/a/photo.jpeg#x"), "jpeg");
assert.equal(imageExtension("/img/noext"), "");

assert.equal(plannedMode(undefined), "crystal");
assert.equal(plannedMode(""), "crystal");
assert.equal(plannedMode("/goods/north.webp"), "detect");
assert.equal(plannedMode("/goods/north.png"), "detect");
assert.equal(plannedMode("/goods/north.jpg"), "photo");
assert.equal(plannedMode("/goods/north.JPEG"), "photo");
assert.equal(plannedMode("/goods/north.gif"), "photo");

const plan = preloadPlan(["/a.webp", "/b.webp", "", "/a.webp", "/c.png", "/d.png", "/e.jpg", "/f.jpg"]);
assert.deepEqual(plan.soon, ["/a.webp", "/b.webp", "/c.png", "/d.png"]);
assert.deepEqual(plan.later, ["/e.jpg", "/f.jpg"]);
assert.deepEqual(preloadPlan([]), { soon: [], later: [] });

console.log("product image plan ok");
