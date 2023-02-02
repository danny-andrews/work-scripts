#!/usr/bin/env node
import "../fetch-polyfill.js";
import { InternalError, formatScore, warn, info } from "../util.js";
import { AsanaClient, getGrades } from "../effects.js";

const GRADE_WARNING_THRESHOLD = 70;

export default ([assessment], { dryRun, asanaToken, asanaProjectId }) => {
  if (!assessment) {
    throw InternalError("Missing 'assessment' parameter.");
  }

  const asanaClient = AsanaClient(asanaToken);

  return Promise.all([
    asanaClient.getStudents(asanaProjectId),
    getGrades(),
  ]).then(([students, grades]) => {
    const studentMap = new Map(
      students.map((student) => [student.email, student])
    );
    const gradeMap = new Map(grades.map((grade) => [grade.email, grade]));

    const filteredGrades = [...gradeMap.values()]
      .filter(({ fullName, score }) => {
        if (score === null) {
          warn(
            `No score found for "${fullName}." Have they taken the assessment?"`
          );
          return false;
        }

        return true;
      })
      .map((grade) => {
        const { score, fullName } = grade;
        if (score < GRADE_WARNING_THRESHOLD) {
          warn(
            `"${fullName}" scored below a ${formatScore(
              GRADE_WARNING_THRESHOLD
            )} (${formatScore(score)}).`
          );
        }

        return grade;
      })
      .filter(({ email, fullName }) => {
        if (!studentMap.has(email)) {
          warn(`${fullName} (${email}) was not found in Asana.`);
          return false;
        }

        return true;
      })
      .map(({ email, score, fullName }) => ({
        gid: studentMap.get(email).gid,
        score,
        fullName,
      }))
      .sort((a, b) => b.score - a.score);

    if (dryRun) {
      info(
        "\nInfo: Without --dry-run, the following grades will be posted to Asana:\n"
      );
      filteredGrades.forEach(({ fullName, score }) => {
        info(`${fullName} -> ${assessment} - ${formatScore(score)}`);
      });

      return Promise.resolve();
    }

    return Promise.all(
      filteredGrades.map(({ gid, score }) =>
        asanaClient.postAssessmentGrade(gid, assessment, score)
      )
    );
  });
};
