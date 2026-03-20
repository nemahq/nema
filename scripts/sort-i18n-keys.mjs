import { readFileSync, writeFileSync } from "node:fs";

function sortKeysRecursive(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return obj;
  }
  return Object.keys(obj)
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = sortKeysRecursive(obj[key]);
      return sorted;
    }, {});
}

for (const filePath of process.argv.slice(2)) {
  const content = JSON.parse(readFileSync(filePath, "utf8"));
  const sorted = sortKeysRecursive(content);
  writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
}
