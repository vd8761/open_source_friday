const fields = require('./registration-profile-fields.json');
const { InputError } = require('./outreach-csv');
const columns = ['id', ...fields.map(field => field.key)].join(', ');
const text = value => typeof value === 'string' ? value.trim() : '';
const email = value => text(value).toLowerCase();
const phone = value => text(value).replace(/[\s()-]/g, '');

function profileErrors(profile) {
  const errors = {};
  for (const { key } of fields) {
    if (!text(profile[key])) errors[key] = 'This field is required';
    else if (text(profile[key]).length > (key === 'excited_topic' ? 2000 : 255)) errors[key] = 'Please shorten this value';
  }
  if (text(profile.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(profile.email))) errors.email = 'Please enter a valid email address';
  if (text(profile.whatsapp_number) && !/^\d{4,15}$/.test(phone(profile.whatsapp_number))) errors.whatsapp_number = 'Please enter a valid WhatsApp number';
  if (text(profile.country_code) && !/^\+\d{1,4}$/.test(text(profile.country_code))) errors.country_code = 'Please select a country code';
  return errors;
}
const missingProfileFields = profile => Object.keys(profileErrors(profile));

function cleanProfile(input) {
  return Object.fromEntries(fields.map(({ key }) => [key, key === 'email' ? email(input[key]) : key === 'whatsapp_number' ? phone(input[key]) : text(input[key])]));
}

async function resolveRegistrationStudent(db, input) {
  const provided = cleanProfile(input);
  let student;
  if (input.is_existing === true) {
    if (!Number.isSafeInteger(Number(input.student_id)) || Number(input.student_id) <= 0) throw new InputError('Please look up your profile again.', 400);
    student = (await db.query(`SELECT ${columns} FROM students WHERE id=$1 FOR UPDATE`, [Number(input.student_id)])).rows[0];
    if (!student) throw new InputError('Please look up your profile again.', 404);
  } else {
    const matches = (await db.query(`SELECT ${columns} FROM students WHERE LOWER(BTRIM(email))=$1 OR (whatsapp_number=$2 AND country_code=$3) FOR UPDATE`, [provided.email, provided.whatsapp_number, provided.country_code])).rows;
    if (matches.length > 1) throw new InputError('The email and WhatsApp number match different profiles. Please use your existing contact details or contact the event team.', 409);
    student = matches[0];
    if (student && ((provided.email && email(student.email) && provided.email !== email(student.email)) ||
      (provided.whatsapp_number && phone(student.whatsapp_number) && (provided.whatsapp_number !== phone(student.whatsapp_number) || (text(student.country_code) && provided.country_code !== text(student.country_code)))))) {
      throw new InputError('We found a saved profile with different contact details. Please go back and look up your saved email or WhatsApp number, or contact the event team to update it.', 409);
    }
  }

  const missing = student ? missingProfileFields(student) : fields.map(field => field.key);
  if (!missing.length) return student;
  if (student && input.is_existing === true) {
    const sameEmail = email(student.email) && email(student.email) === provided.email;
    const samePhone = phone(student.whatsapp_number) && phone(student.whatsapp_number) === provided.whatsapp_number && (!text(student.country_code) || text(student.country_code) === provided.country_code);
    if (!sameEmail && !samePhone) throw new InputError('Please use the email or WhatsApp number from your saved profile to complete your details.', 409);
  }
  // Fill gaps only. A missing phone also needs the country selected for that new number.
  const updateFields = [...new Set([...missing, ...(missing.includes('whatsapp_number') ? ['country_code'] : [])])];
  const complete = { ...student, ...Object.fromEntries(updateFields.map(key => [key, provided[key]])) };
  const errors = profileErrors(complete);
  if (Object.keys(errors).length) {
    const error = new InputError('Please complete the required profile details before confirming registration.', 422);
    error.fieldErrors = errors;
    throw error;
  }
  const conflicts = (await db.query('SELECT id FROM students WHERE (LOWER(BTRIM(email))=$1 OR whatsapp_number=$2) AND id<>$3', [email(complete.email), phone(complete.whatsapp_number), student?.id || 0])).rows;
  if (conflicts.length) throw new InputError('This email or WhatsApp number is already linked to another profile. Please use your existing contact details or contact the event team.', 409);
  if (student) {
    await db.query(`UPDATE students SET ${updateFields.map((key, index) => `${key}=$${index + 1}`).join(', ')} WHERE id=$${updateFields.length + 1}`, [...updateFields.map(key => complete[key]), student.id]);
    return complete;
  }
  const keys = fields.map(field => field.key);
  const saved = await db.query(`INSERT INTO students (${keys.join(', ')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING id`, keys.map(key => complete[key]));
  return { ...complete, id: saved.rows[0].id };
}

module.exports = { columns, missingProfileFields, profileErrors, resolveRegistrationStudent };
