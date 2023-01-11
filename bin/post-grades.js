#!/usr/bin/env node
import "../src/fetch-polyfill.js";
import ky, { HTTPError } from "ky";
import dotenv from "dotenv";
import chalk from "chalk";
import { readJSONFile, difference, getEnvVar } from "../src/shared.js";
import minimist from "minimist";

dotenv.config();

const GRADE_WARNING_THRESHOLD = 0.7;

class InternalError extends Error {}

const printError = (message) => {
  console.error(chalk.red(`Error: ${message}`));
};

const printWarning = (message) => {
  console.warn(chalk.yellow(`Warning: ${message}`));
};

const args = minimist(process.argv.slice(2), {
  boolean: ["dry-run"],
});

const asanaToken = getEnvVar("ASANA_TOKEN");
const asanaProjectId = getEnvVar("ASANA_PROJECT_ID");
const [assessmentName] = args._;

if (!assessmentName) {
  printError("Missing assessmentName parameter.");
  console.log("\n$ ./post-grades.js [assessmentName]");
  process.exit(1);
}

const isDryRun = Boolean(args["dry-run"]);

/* Effects */
const makeAsanaRequest = (
  path,
  { headers, data, method = "GET", ...options } = {}
) =>
  ky(`https://app.asana.com/api/1.0${path}`, {
    headers: {
      Authorization: `Bearer ${asanaToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    method,
    ...(method !== "GET" ? { json: { data } } : {}),
    ...options,
  })
    .then((res) => res.json())
    .then((res) => res.data)
    .catch((err) => {
      if (!(err instanceof HTTPError)) throw err;
      const { status } = err.response;

      if (status === 401) {
        throw new InternalError(
          "Could not authorize with Asana API. Ensure your Personal Access Token is correct."
        );
      } else if (status === 429) {
        throw new InternalError(
          "Got rate-limited by Asana. Wait a minute before running again."
        );
      } else {
        throw err;
      }
    });

const getTasks = () =>
  makeAsanaRequest(
    `/projects/${asanaProjectId}/tasks?opt_fields=custom_fields`
  ).catch((err) => {
    if (!(err instanceof HTTPError)) throw err;
    const { status } = err.response;

    if (status === 404) {
      throw new InternalError(
        "Could not find Asana project. Double-check your Asana project id."
      );
    } else {
      throw err;
    }
  });

const getAssessmentGrades = () =>
  readJSONFile("./grades.json")
    .catch(() => {
      throw new InternalError(
        'Could not read Learn grades file. Ensure grades are downloaded to "./data/grades.json."'
      );
    })
    .then((grades) =>
      grades
        .map((grade) => ({
          assessmentName: grade["Standard Title"],
          score: grade.score,
          studentName: grade["Full Name"],
          email: grade["Email"],
        }))
        .filter((grade) => grade.assessmentName === assessmentName)
    );

const formatScore = (score) => `${Math.round(score * 100)}%`;

const createSubtask = (taskId, grade) => {
  const { assessmentName, score } = grade;

  return makeAsanaRequest(`/tasks/${taskId}/subtasks`, {
    data: {
      name: `[ASSESSMENT]: ${assessmentName} - ${formatScore(score)}`,
    },
    method: "POST",
  });
};

/* Main */
Promise.all([getTasks(), getAssessmentGrades()])
  .then(([tasks, grades]) => {
    if (grades.length === 0) {
      throw new InternalError(
        `No grades found for assessment "${assessmentName}." Ensure assessment name matches those in Learn.`
      );
    }

    grades.forEach(({ score, studentName }) => {
      if (score === null) {
        printWarning(
          `No score found for "${studentName}." Grades will not be posted for this student`
        );
      } else if (score < GRADE_WARNING_THRESHOLD) {
        printWarning(
          `"${studentName}" scored below a ${formatScore(
            GRADE_WARNING_THRESHOLD
          )} (${formatScore(score)}).`
        );
      }
    });

    const learnStudents = new Set(grades.map((grade) => grade.studentName));
    const asanaStudents = new Set(tasks.map((task) => task.name));

    difference(asanaStudents, learnStudents).forEach((name) => {
      printWarning(
        `"${name}" was found in Asana but not in Learn grades file.`
      );
    });
    difference(learnStudents, asanaStudents).forEach((name) => {
      printWarning(
        `"${name}" was found in Learn grades but not in Asana. Grades will not be posted for this student.`
      );
    });

    const taskIds = new Map(tasks.map((task) => [task.name, task.gid]));

    if (isDryRun) return Promise.resolve();

    return Promise.all(
      grades
        .filter(
          (grade) => taskIds.has(grade.studentName) && grade.score !== null
        )
        .map((grade) => createSubtask(taskIds.get(grade.studentName), grade))
    );
  })
  .catch((err) => {
    if (err instanceof InternalError) {
      printError(err.message);
    } else {
      printError(err);
    }
    process.exit(1);
  });
