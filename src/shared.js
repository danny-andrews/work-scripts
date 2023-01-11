import { readFile } from "node:fs/promises";
import { curryN } from "ramda";

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

export const getStudents = () => readJSONFile("./data/students.json");

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
