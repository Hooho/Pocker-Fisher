import { readFileSync, writeFileSync } from "node:fs";
import { simulateTable } from "../src/tournament";
import { hero, type Character } from "../src/engine";
let field: Character[] = [
  hero,
  ...JSON.parse(readFileSync("public/characters.json", "utf8")).slice(0, 255),
];
const stages: number[] = [field.length];
const start = Date.now();
for (let round = 0; round < 5; round++) {
  const next: Character[] = [];
  for (let i = 0; i < field.length; i += 8)
    next.push(...simulateTable(field.slice(i, i + 8), 4, 5));
  field = next;
  stages.push(field.length);
  console.log(`Stage ${round + 1}: ${field.length} qualified`);
}
for (const slots of [6, 4, 2, 1]) {
  field = simulateTable(field, slots, 5);
  stages.push(field.length);
  console.log(`Final stage: ${field.length} qualified`);
}
if (stages.join(",") !== "256,128,64,32,16,8,6,4,2,1")
  throw new Error("Incorrect bracket");
writeFileSync(
  "scripts/tournament-verification.json",
  JSON.stringify(
    { stages, seconds: (Date.now() - start) / 1000, champion: field[0].name },
    null,
    2,
  ),
);
