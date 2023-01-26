#!/usr/bin/env node
import { AsanaClient, writeStudents } from "../effects.js";

export default (_, { asanaToken, asanaProjectId }) =>
  AsanaClient(asanaToken).getStudents(asanaProjectId).then(writeStudents);
