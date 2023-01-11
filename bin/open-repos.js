#!/usr/bin/env node
import { getStudents } from "../src/shared.js";

getStudents().then((students) => {
  console.log(students);
});
