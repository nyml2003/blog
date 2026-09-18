import { createVelocityTracker } from "../packages/nested-gesture/src/index.ts";
const t = createVelocityTracker();
for (let x = 0; x <= 100; x += 20) t.add(x, x * 0.5);
console.log("ramp v:", t.velocityAt(100), "px/s:", t.velocityAt(100, 1000));
const j = createVelocityTracker();
[[0,0],[30,30],[60,60],[90,120],[100,100]].forEach(([a,b]) => j.add(a,b));
console.log("jitter(up-spike) lsq:", j.velocityAt(100));
