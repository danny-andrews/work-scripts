#!/usr/bin/env node
import "../fetch-polyfill.js";
import { InternalError, formatScore, warn, info } from "../util.js";
import { AsanaClient, getGrades } from "../effects.js";

const GRADE_WARNING_THRESHOLD = 0.7;

export default ([assessment], { dryRun, asanaToken, asanaProjectId }) => {
  if (!assessment) {
    throw InternalError("Missing 'assessment' parameter.");
  }
  if (!dryRun) {
    console.log("early");
    return;
  }

  const asanaClient = AsanaClient(asanaToken);

  return Promise.all([
    asanaClient.getStudents(asanaProjectId),
    getGrades(),
  ]).then(([students, allGrades]) => {
    const grades = allGrades.filter((grade) => grade.assessment === assessment);
    if (grades.length === 0) {
      throw new InternalError(
        `No grades found for assessment "${assessment}." Ensure assessment name matches those in Learn.`
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
      .map(({ email, score, assessment, studentName }) => ({
        gid: studentMap.get(email).gid,
        score,
        assessment,
        studentName,
      }))
      .sort((a, b) => b.score - a.score);

    if (dryRun) {
      info("\nInfo: Without --dry-run, the following grades will be posted:\n");
      filteredGrades.forEach(({ assessment, studentName, score }) => {
        info(`${studentName} -> ${assessment} - ${formatScore(score)}`);
      });

      return Promise.resolve();
    }

    return Promise.all(
      filteredGrades.map(({ gid, assessment, score }) =>
        asanaClient.postAssessmentGrade(gid, assessment, score)
      )
    );
  });
};
