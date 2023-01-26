#!/usr/bin/env node
import "./fetch-polyfill.js";
import cla from "command-line-args";
import dotenv from "dotenv";
import { error, InternalError } from "./util.js";
import downloadStudents from "./commands/download-students.js";
import makeGroups from "./commands/make-groups.js";
import postGrades from "./commands/post-grades.js";

dotenv.config();

export const getEnvVar = (envVar) => {
  const value = process.env[envVar];
  if (!value) {
    console.error(
      `Missing ${envVar} environment variable. Add it to .env or set when running this command.`
    );
    process.exit(1);
  } else {
    return value;
  }
};

const subcommands = new Map([
  [
    "make-groups",
    {
      handler: makeGroups,
      options: [
        {
          name: "positional",
          defaultOption: true,
          multiple: true,
          defaultValue: [2],
        },
        { name: "exclude", multiple: true, defaultValue: [] },
      ],
    },
  ],
  [
    "post-grades",
    {
      handler: postGrades,
      options: [
        {
          name: "positional",
          defaultOption: true,
          multiple: true,
          defaultValue: [],
        },
        { name: "dry-run", type: Boolean, defaultValue: false },
        { name: "asana-token", defaultValue: getEnvVar("ASANA_TOKEN") },
        {
          name: "asana-project-id",
          defaultValue: getEnvVar("ASANA_PROJECT_ID"),
        },
      ],
    },
  ],
  [
    "download-students",
    {
      handler: downloadStudents,
      options: [
        { name: "asana-token", defaultValue: getEnvVar("ASANA_TOKEN") },
        {
          name: "asana-project-id",
          defaultValue: getEnvVar("ASANA_PROJECT_ID"),
        },
      ],
    },
  ],
]);

const subcommandName = process.argv[2];
const subcommand = subcommands.get(subcommandName);

if (!subcommand) {
  error(`Unrecognized subcommand "${subcommandName}"!`);
  process.exit(1);
}

const {
  positional = [],
  _unknown: unknown,
  ...rest
} = cla(subcommand.options, {
  argv: process.argv.slice(3),
  partial: true,
  camelCase: true,
});

if (unknown) {
  unknown.forEach((argument) => {
    error(`Unknown argument "${argument}"!`);
  });
  process.exit(1);
}

try {
  await subcommand.handler(positional, rest);
} catch (err) {
  if (!(err instanceof InternalError)) throw err;

  error(err.message);
  process.exit(1);
}
