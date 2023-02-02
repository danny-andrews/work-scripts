import { readFile, writeFile } from "node:fs/promises";
import ky, { HTTPError } from "ky";
import { InternalError } from "./util.js";
import { parse } from "csv-parse/sync";

const rel = (path) => new URL(path, import.meta.url);

export const readJSONFile = (filepath) =>
  readFile(filepath, "utf-8").then((file) => JSON.parse(file));

export const readCSVFile = (filepath) =>
  readFile(filepath, "utf-8").then((file) => parse(file, { columns: true }));

export const readStudents = () => readJSONFile(rel("../data/students.json"));

export const writeStudents = (students) =>
  writeFile(rel("../data/students.json"), JSON.stringify(students, null, 2));

const EMAIL_CUSTOM_FIELD_GID = "1203266261019373";

export const AsanaClient = (asanaToken) => {
  const makeRequest = (
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

  const postAssessmentGrade = (taskId, assessment, score) => {
    return makeRequest(`/tasks/${taskId}/subtasks`, {
      data: {
        name: `[Assessment: ${assessment}] - ${formatScore(score)}`,
      },
      method: "POST",
    });
  };

  const getStudents = (projectId) =>
    makeRequest(`/projects/${projectId}/tasks?opt_fields=custom_fields,name`)
      .catch((err) => {
        if (!(err instanceof HTTPError)) throw err;
        const { status } = err.response;

        if (status === 404) {
          throw new InternalError(
            "Could not find Asana project. Double-check your Asana project id."
          );
        } else {
          throw err;
        }
      })
      .then((tasks) => {
        const getEmailField = (task) =>
          task.custom_fields.find(
            (field) => field.gid === EMAIL_CUSTOM_FIELD_GID
          );

        const isStudentTask = (task) => getEmailField(task).text_value !== null;

        return tasks.filter(isStudentTask).map((task) => ({
          name: task.name,
          gid: task.gid,
          email: getEmailField(task).text_value,
        }));
      });

  return { postAssessmentGrade, getStudents };
};

export const getGrades = async () => {
  const grades = await readCSVFile(rel("../data/grades.csv")).catch(() => {
    throw new InternalError(
      'Could not read Learn grades file. Ensure grades are downloaded to "./data/grades.csv."'
    );
  });

  return grades.map((grade) => ({
    score: Number(grade.score_percentage),
    fullName: [grade.first_name, grade.last_name].join(" "),
    email: grade.email,
  }));
};
