import {
  copyFileSync,
  mkdirSync,
} from "node:fs";

const roles = [
  "before",
  "action",
  "reload",
  "fresh-context",
];
const sourceDirectory = new URL("../profiles/", import.meta.url);
const outputDirectory = new URL("../dist/profiles/", import.meta.url);

mkdirSync(outputDirectory, { recursive: true });
for (const role of roles) {
  copyFileSync(
    new URL(`${role}.json`, sourceDirectory),
    new URL(`${role}.json`, outputDirectory),
  );
}
