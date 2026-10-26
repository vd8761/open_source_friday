const { parse } = require("csv-parse/sync");
class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const validEmail = (value) =>
  value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
const header = (value) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
function readCsv(csv) {
  if (
    typeof csv !== "string" ||
    !csv.trim() ||
    Buffer.byteLength(csv) > 5 * 1024 * 1024
  )
    throw new InputError("Choose a non-empty CSV file up to 5 MB.");
  try {
    const records = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 100000,
    });
    if (records.length < 2 || records.length > 10001)
      throw new InputError("CSV must contain a header and 1–10,000 data rows.");
    const columns = records.shift().map(header);
    if (records.some((row) => row.length !== columns.length))
      throw new InputError(
        "CSV rows must have the same number of columns as the header.",
      );
    if (new Set(columns).size !== columns.length)
      throw new InputError("CSV contains duplicate column headers.");
    return {
      columns,
      rows: records.map((values) =>
        Object.fromEntries(columns.map((key, i) => [key, values[i] || ""])),
      ),
    };
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(
      "Invalid CSV. Check quotes, separators and column counts.",
    );
  }
}
function contactImport(csv, filters = {}) {
  const { columns, rows } = readCsv(csv);
  if (!columns.some((key) => ["email", "email_address"].includes(key)))
    throw new InputError(
      "CSV needs an Email column. Optional: Full Name, College, Department, Year of Study.",
    );
  const contacts = [],
    rejected = [],
    seen = new Set();
  let duplicates = 0,
    filtered = 0;
  for (const [index, row] of rows.entries()) {
    const email = normalizeEmail(row.email || row.email_address);
    if (!validEmail(email)) {
      rejected.push({ row: index + 2, reason: "Invalid email" });
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    const contact = {
      email,
      full_name: (row.full_name || row.name || "").slice(0, 255),
      college: (row.college || "").slice(0, 255),
      department: (row.department || "").slice(0, 255),
      year: (row.year_of_study || row.year || "").slice(0, 80),
    };
    if (
      ["college", "department", "year"].some(
        (key) =>
          filters[key] &&
          !contact[key]
            .toLowerCase()
            .includes(String(filters[key]).trim().toLowerCase()),
      )
    ) {
      filtered++;
      continue;
    }
    // A prior opt-out in an exported list must not become permission on re-import.
    if (
      /unsubscribed|bounced|complaint|suppressed|inactive/i.test(
        row.status || row.subscription_status || "",
      )
    ) {
      rejected.push({ row: index + 2, reason: "Suppressed in CSV" });
      continue;
    }
    contacts.push(contact);
  }
  return { contacts, total: rows.length, duplicates, filtered, rejected };
}
function csvExport(rows, columns) {
  const cell = (value) =>
    `"${String(value ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""')}"`;
  return [
    columns.map((c) => cell(c.label)).join(","),
    ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(",")),
  ].join("\r\n");
}
module.exports = {
  InputError,
  normalizeEmail,
  validEmail,
  readCsv,
  contactImport,
  csvExport,
};
