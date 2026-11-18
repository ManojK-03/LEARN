
/**
 * ============================================================
 * LEARN FORGE — REGISTRATION BACKEND
 * ============================================================
 * Platform : Google Apps Script
 * Database : Google Sheets
 * Capacity : 40 Students
 *
 * GET  ?action=count
 * POST JSON registration
 *
 * Features:
 * - Secure registration handling
 * - Duplicate email prevention
 * - Seat limit enforcement
 * - Spam protection
 * - Input sanitization
 * - Automatic sheet initialization
 * - Consistent API responses
 * ============================================================
 */

"use strict";

// ================= CONFIGURATION =================

const CONFIG = {
  SHEET_NAME: "Registrations",
  CAPACITY: 40,
  LOCK_TIMEOUT: 20000,

  HEADERS: [
    "Timestamp",
    "Name",
    "Email",
    "College",
    "Year",
    "Branch",
    "Interests"
  ],

  MAX_LENGTH: {
    NAME: 100,
    EMAIL: 120,
    COLLEGE: 140,
    YEAR: 40,
    BRANCH: 100,
    INTEREST: 60,
    INTEREST_COUNT: 10
  }
};

// Personal email providers are not accepted.
const FREE_MAIL_REGEX =
  /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|proton|protonmail)\./i;


// ================= RESPONSE HANDLER =================

function response_(ok, status, extra) {
  return ContentService
    .createTextOutput(JSON.stringify(
      Object.assign({
        ok: ok,
        status: status
      }, extra || {})
    ))
    .setMimeType(ContentService.MimeType.JSON);
}


// ================= SPREADSHEET HANDLER =================

function getSheet_() {

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Spreadsheet unavailable.");
  }

  let sheet =
    spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  // Initialize sheet only once.
  if (sheet.getLastRow() === 0) {

    sheet
      .getRange(1, 1, 1, CONFIG.HEADERS.length)
      .setValues([CONFIG.HEADERS]);

    sheet.setFrozenRows(1);

    sheet
      .getRange(1, 1, 1, CONFIG.HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#14213D")
      .setFontColor("#FFFFFF");

    sheet.autoResizeColumns(
      1,
      CONFIG.HEADERS.length
    );
  }

  return sheet;
}


// ================= INPUT SANITIZATION =================

function clean_(value, maxLength) {

  let result = String(
    value == null ? "" : value
  );

  result = result
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);

  // Prevent spreadsheet formula injection.
  if (/^[=+\-@]/.test(result)) {
    result = "'" + result;
  }

  return result;
}


// ================= EMAIL VALIDATION =================

function validateEmail_(email) {

  const validFormat =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

  if (!validFormat) {
    return false;
  }

  if (FREE_MAIL_REGEX.test(email)) {
    return false;
  }

  return true;
}


// ================= REGISTRATION COUNT =================

function countRows_(sheet) {

  return Math.max(
    0,
    sheet.getLastRow() - 1
  );
}


// ================= DUPLICATE CHECK =================

function emailExists_(sheet, email, count) {

  if (count <= 0) {
    return false;
  }

  const emailValues = sheet
    .getRange(2, 3, count, 1)
    .getValues();

  const target = email.toLowerCase();

  return emailValues.some(function(row) {

    return String(row[0])
      .trim()
      .toLowerCase() === target;

  });
}


// ================= REQUEST VALIDATION =================

function validateRegistration_(data) {

  if (!data || typeof data !== "object" ||
      Array.isArray(data)) {
    return null;
  }

  const name = clean_(
    data.name,
    CONFIG.MAX_LENGTH.NAME
  );

  const email = String(data.email || "")
    .trim()
    .toLowerCase()
    .slice(0, CONFIG.MAX_LENGTH.EMAIL);

  const college = clean_(
    data.college,
    CONFIG.MAX_LENGTH.COLLEGE
  );

  const year = clean_(
    data.year,
    CONFIG.MAX_LENGTH.YEAR
  );

  const branch = clean_(
    data.branch,
    CONFIG.MAX_LENGTH.BRANCH
  );

  const interests = Array.isArray(data.interests)
    ? data.interests
        .slice(0, CONFIG.MAX_LENGTH.INTEREST_COUNT)
        .map(function(item) {
          return clean_(
            item,
            CONFIG.MAX_LENGTH.INTEREST
          );
        })
        .filter(Boolean)
    : [];

  if (
    name.length < 2 ||
    college.length < 3 ||
    !year ||
    branch.length < 2 ||
    interests.length === 0 ||
    !validateEmail_(email)
  ) {
    return null;
  }

  return {
    name: name,
    email: email,
    college: college,
    year: year,
    branch: branch,
    interests: interests
  };
}


// ================= PUBLIC API: GET =================

function doGet(e) {

  try {

    const action =
      e && e.parameter
        ? e.parameter.action
        : "";

    if (action !== "count") {
      return response_(false, "invalid_action");
    }

    const sheet = getSheet_();
    const count = countRows_(sheet);

    return response_(true, "success", {

      count: count,

      capacity: CONFIG.CAPACITY,

      remaining: Math.max(
        0,
        CONFIG.CAPACITY - count
      ),

      open: count < CONFIG.CAPACITY

    });

  } catch (error) {

    console.error("GET Error:", error);

    return response_(false, "server_error");

  }
}


// ================= PUBLIC API: POST =================

function doPost(e) {

  const lock =
    LockService.getScriptLock();

  let lockAcquired = false;

  try {

    // Prevent simultaneous registrations.
    lock.waitLock(CONFIG.LOCK_TIMEOUT);

    lockAcquired = true;

    // Check request body.
    if (
      !e ||
      !e.postData ||
      !e.postData.contents
    ) {
      return response_(false, "missing_data");
    }

    // Parse incoming JSON.
    let data;

    try {

      data = JSON.parse(
        e.postData.contents
      );

    } catch (error) {

      return response_(false, "invalid_json");

    }

    // Honeypot spam protection.
    // Legitimate users must leave website empty.
    if (
      data.website &&
      String(data.website).trim() !== ""
    ) {

      return response_(true, "saved");

    }

    // Validate registration fields.
    const registration =
      validateRegistration_(data);

    if (!registration) {

      return response_(false, "invalid");

    }

    const sheet = getSheet_();

    const count = countRows_(sheet);

    // Check duplicate email.
    if (
      emailExists_(
        sheet,
        registration.email,
        count
      )
    ) {

      return response_(true, "duplicate", {
        count: count
      });

    }

    // Check available seats.
    if (count >= CONFIG.CAPACITY) {

      return response_(false, "full", {
        count: count,
        capacity: CONFIG.CAPACITY
      });

    }

    // Save registration.
    const timestamp = new Date();

    sheet.appendRow([

      timestamp,

      registration.name,

      registration.email,

      registration.college,

      registration.year,

      registration.branch,

      registration.interests.join("; ")

    ]);

    // Return success.
    return response_(true, "saved", {

      count: count + 1,

      remaining:
        CONFIG.CAPACITY - (count + 1),

      capacity: CONFIG.CAPACITY

    });

  } catch (error) {

    console.error("POST Error:", error);

    return response_(false, "server_error");

  } finally {

    if (lockAcquired) {
      lock.releaseLock();
    }

  }

}


// ================= ADMINISTRATIVE UTILITIES =================

// Run manually from Apps Script editor.
// Displays current registration statistics.

function getRegistrationStats() {

  const sheet = getSheet_();

  const count = countRows_(sheet);

  const stats = {

    registered: count,

    capacity: CONFIG.CAPACITY,

    remaining: Math.max(
      0,
      CONFIG.CAPACITY - count
    ),

    open: count < CONFIG.CAPACITY

  };

  console.log(
    JSON.stringify(stats, null, 2)
  );

  return stats;

}


// ================= END OF LEARN FORGE API =================
