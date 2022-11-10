import { readFile } from "node:fs/promises";
import { curryN } from "ramda";

const div = (x, y) => Math.floor(x / y);

export const shuffle = (array) => {
  let currIndex = array.length;

  while (currIndex != 0) {
    const randIndex = Math.floor(Math.random() * currIndex);
    currIndex--;
    [array[currIndex], array[randIndex]] = [array[randIndex], array[currIndex]];
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

export const difference = (setA, setB) =>
  new Set([...setA].filter((element) => !setB.has(element)));

export const getEnvVar = (envVar) => {
  const value = process.env[envVar];
  if (!value) {
    console.error(
      `Missing ${envVar} env var. Add it to .env or set when running this command.`
    );
    process.exit(1);
  } else {
    return value;
  }
};
