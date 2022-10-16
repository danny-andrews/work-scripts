#!/usr/bin/env node
import { shuffle, partition, readJSONFile } from "./shared.js";
import { pipe, map, join } from "ramda";

const [, , groupSize] = process.argv;

const format = pipe(map(join(" - ")), join("\n"));

readJSONFile("./students.json").then(
  pipe(shuffle, partition(groupSize || 2), format, console.log)
);
