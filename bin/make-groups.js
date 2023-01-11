#!/usr/bin/env node
import { shuffle, partition, getStudents } from "../src/shared.js";
import { pipe, map, join, difference, __ } from "ramda";
import minimist from "minimist";

const args = minimist(process.argv.slice(2), {
  string: ["exclude"],
});

const exclude = args.exclude ? args.exclude.split(",") : [];

const [groupSize] = args._;

const format = pipe(map(join(" - ")), join("\n"));

getStudents().then(
  pipe(
    map((a) => a.name),
    difference(__, exclude),
    shuffle,
    partition(groupSize || 2),
    format,
    console.log
  )
);
