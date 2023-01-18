#!/usr/bin/env node
import "../src/fetch-polyfill.js";
import dotenv from "dotenv";
import chalk from "chalk";
import {
  readJSONFile,
  difference,
  getEnvVar,
  AsanaClient,
  InternalError,
  formatScore,
} from "../src/shared.js";
import minimist from "minimist";

dotenv.config();

const GRADE_WARNING_THRESHOLD = 0.7;

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

const asanaClient = AsanaClient(asanaToken);

const isDryRun = Boolean(args["dry-run"]);

const getAssessmentGrades = () =>
  readJSONFile(new URL("../data/grades.json", import.meta.url))
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

/* Main */
Promise.all([asanaClient.getStudents(asanaProjectId), getAssessmentGrades()])
  .then(([students, grades]) => {
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

    const learnStudents = new Set(grades.map((grade) => grade.email));
    const asanaStudents = new Set(students.map((task) => task.email));

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

    const taskIds = new Map(students.map((task) => [task.name, task.gid]));

    const gradesToPost = grades.filter(
      (grade) => taskIds.has(grade.studentName) && grade.score !== null
    );

    if (isDryRun) {
      console.log("The following Asana subtasks would be posted:");
      grades.forEach(({ assessmentName, studentName, score }) => {
        console.log(
          '%s -> "[Assessment - %s]: %s"',
          studentName,
          assessmentName,
          formatScore(score)
        );
      });
      return Promise.resolve();
    }

    return Promise.all(
      gradesToPost.map((grade) =>
        asanaClient.postAssessmentGrade(taskIds.get(grade.studentName), grade)
      )
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
