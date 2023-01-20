#!/usr/bin/env node
import "../src/fetch-polyfill.js";
import dotenv from "dotenv";
import chalk from "chalk";
import {
  readJSONFile,
  getEnvVar,
  AsanaClient,
  InternalError,
  formatScore,
} from "../src/shared.js";
import minimist from "minimist";

dotenv.config();

const GRADE_WARNING_THRESHOLD = 0.7;

const error = (message) => {
  console.error(chalk.red(`Error: ${message}`));
};

const warn = (message) => {
  console.warn(chalk.yellow(`Warning: ${message}`));
};

const info = (message) => {
  console.info(chalk.green(message));
};

const args = minimist(process.argv.slice(2), {
  boolean: ["dry-run"],
});

const asanaToken = getEnvVar("ASANA_TOKEN");
const asanaProjectId = getEnvVar("ASANA_PROJECT_ID");
const [assessmentName] = args._;

if (!assessmentName) {
  error("Missing assessmentName parameter.");
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

    const studentMap = new Map(
      students.map((student) => [student.email, student])
    );
    const gradeMap = new Map(grades.map((grade) => [grade.email, grade]));

    const filteredGrades = [...gradeMap.values()]
      .filter(({ studentName, score }) => {
        if (score === null) {
          warn(
            `No score found for "${studentName}." Have they taken the assessment?"`
          );
          return false;
        }

        return true;
      })
      .map((grade) => {
        const { score, studentName } = grade;
        if (score < GRADE_WARNING_THRESHOLD) {
          warn(
            `"${studentName}" scored below a ${formatScore(
              GRADE_WARNING_THRESHOLD
            )} (${formatScore(score)}).`
          );
        }

        return grade;
      })
      .filter(({ email, studentName }) => {
        if (!studentMap.has(email)) {
          warn(`${studentName} (${email}) was not found in Asana.`);
          return false;
        }

        return true;
      })
      .map(({ email, score, assessmentName, studentName }) => ({
        gid: studentMap.get(email).gid,
        score,
        assessmentName,
        studentName,
      }))
      .sort((a, b) => b.score - a.score);

    if (isDryRun) {
      info("\nInfo: Without --dry-run, the following grades will be posted:\n");
      filteredGrades.forEach(({ assessmentName, studentName, score }) => {
        info(`${studentName} -> ${assessmentName} - ${formatScore(score)}`);
      });

      return Promise.resolve();
    }

    return Promise.all(
      filteredGrades.map(({ gid, assessmentName, score }) =>
        asanaClient.postAssessmentGrade(gid, assessmentName, score)
      )
    );
  })
  .catch((err) => {
    if (err instanceof InternalError) {
      error(err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
