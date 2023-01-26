#!/usr/bin/env node
import { shuffle, partition } from "../util.js";
import { readStudents } from "../effects.js";
import { pipe, map, join, difference, __ } from "ramda";

const format = pipe(map(join(" - ")), join("\n"));

export default ([size = 2], { exclude }) => {
  return readStudents().then(
    pipe(
      map((a) => a.name),
      difference(__, exclude),
      shuffle,
      partition(size),
      format,
      console.log
    )
  );
};
