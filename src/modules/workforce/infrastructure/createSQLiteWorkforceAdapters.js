"use strict";

const { SQLiteTeacherRepository } = require("./SQLiteTeacherRepository");
const {
  SQLiteTeacherWorkingHourRepository,
} = require("./SQLiteTeacherWorkingHourRepository");

function createSQLiteWorkforceAdapters(db) {
  const teacherStore = new SQLiteTeacherRepository(db);
  const workingHourStore = new SQLiteTeacherWorkingHourRepository(db);
  return Object.freeze({
    teacherRepository: teacherStore,
    workingHourRepository: workingHourStore,
    teacherDirectoryQuery: teacherStore,
    teacherProfileQuery: teacherStore,
    teacherReferenceQuery: teacherStore,
  });
}

module.exports = { createSQLiteWorkforceAdapters };
