#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import dotenv from "dotenv";
import { getEnvVar, AsanaClient } from "../src/shared.js";

dotenv.config();

const asanaToken = getEnvVar("ASANA_TOKEN");
const asanaProjectId = getEnvVar("ASANA_PROJECT_ID");

const asanaClient = AsanaClient(asanaToken);

asanaClient
  .getStudents(asanaProjectId)
  .then((students) =>
    writeFile(
      new URL("../data/students.json", import.meta.url),
      JSON.stringify(students, null, 2)
    )
  );
