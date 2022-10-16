#!/usr/bin/env node
import "./fetch-polyfill.js";
import ky, { HTTPError } from "ky";
import dotenv from "dotenv";
import { readJSONFile, difference, getEnvVar } from "./shared.js";
dotenv.config();

class InternalError extends Error {}

const asanaToken = getEnvVar("ASANA_TOKEN");
const asanaProjectId = getEnvVar("ASANA_PROJECT_ID");
const [, , assessmentName] = process.argv;

if (!assessmentName) {
  console.error("Missing assessmentName parameter.");
  console.error("$ ./post-grades.js Arrays");
  process.exit(1);
}

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
          "Could not authorize with Asana API. Ensure your Personal " +
            "Access Token is correct."
        );
      } else if (status === 429) {
        throw new InternalError(
          "Got Rate-limited by Asana. Wait a minute before running again."
        );
      } else {
        throw err;
      }
    });

const getTasks = () =>
  makeAsanaRequest(`/projects/${asanaProjectId}/tasks`).catch((err) => {
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

const getGrades = () =>
  readJSONFile("./grades.json").then((grades) =>
    grades.map((grade) => ({
      assessmentName: grade["Standard Title"],
      score: grade.score,
      studentName: grade["Full Name"],
    }))
  );

const createSubtask = (taskId, grade) => {
  const formatScore = (score) => `${Math.round(score * 100)}%`;
  const { assessmentName, score } = grade;

  return makeAsanaRequest(`/tasks/${taskId}/subtasks`, {
    data: {
      name: `[ASSESSMENT]: ${assessmentName} - ${formatScore(score)}`,
    },
    method: "POST",
  });
};

/* Main */
Promise.all([getTasks(), getGrades()])
  .then(([tasks, grades]) => {
    const learnStudents = new Set(grades.map((grade) => grade.studentName));
    const asanaStudents = new Set(tasks.map((task) => task.name));

    difference(asanaStudents, learnStudents).forEach((name) => {
      console.log(
        `Warning: ${name} was found in Asana but not in Learn grades.`
      );
    });
    difference(learnStudents, asanaStudents).forEach((name) => {
      console.log(
        `Warning: ${name} was found in Learn grades but not in Asana. Grades will not be posted for this student`
      );
    });

    const taskIds = new Map(tasks.map((task) => [task.name, task.gid]));

    return Promise.all(
      grades
        .filter(
          (grade) =>
            grade.assessmentName === assessmentName &&
            taskIds.has(grade.studentName)
        )
        .map((grade) => createSubtask(taskIds.get(grade.studentName), grade))
    );
  })
  .catch((err) => {
    if (err instanceof InternalError) {
      console.error(err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
