import { curryN } from "ramda";
import chalk from "chalk";

export const error = (message) => {
  console.error(chalk.red(`Error: ${message}`));
};

export const warn = (message) => {
  console.warn(chalk.yellow(`Warning: ${message}`));
};

export const info = (message) => {
  console.info(chalk.green(message));
};

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

export const difference = (setA, setB) =>
  new Set([...setA].filter((element) => !setB.has(element)));

export class InternalError extends Error {}

export const formatScore = (score) => `${score}%`;
