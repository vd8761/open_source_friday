const { types } = require('pg');
// PostgreSQL DATE is a calendar day, not an instant. Keep it stable in every API response.
const databaseTypes = {
  getTypeParser(oid, format) {
    return oid === 1082 ? value => value : types.getTypeParser(oid, format);
  },
};
module.exports = { databaseTypes };
