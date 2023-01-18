import { readFile } from "node:fs/promises";
import { curryN } from "ramda";
import ky, { HTTPError } from "ky";

const div = (x, y) => Math.floor(x / y);

export const shuffle = (array) => {
  let i = array.length - 1;

  while (i > 0) {
    const randIndex = Math.floor(Math.random() * (i + 1));
    [array[i], array[randIndex]] = [array[randIndex], array[i]];
    i--;
  }

  return array;
};

export const partition = curryN(2, (size, items) => {
  const result = [];

  items.forEach((item, i) => {
    (result[div(i, size)] ||= []).push(item);
  });

  return result;
});

export const readJSONFile = (filepath) =>
  readFile(filepath, "utf-8").then((file) => JSON.parse(file));

export const getStudents = () =>
  readJSONFile(new URL("../data/students.json", import.meta.url));

export const difference = (setA, setB) =>
  new Set([...setA].filter((element) => !setB.has(element)));

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

export class InternalError extends Error {}

export const formatScore = (score) => `${Math.round(score * 100)}%`;

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

  const postAssessmentGrade = (taskId, grade) => {
    const { assessmentName, score } = grade;

    return makeRequest(`/tasks/${taskId}/subtasks`, {
      data: {
        name: `[Assessment - ${assessmentName}]: ${formatScore(score)}`,
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
