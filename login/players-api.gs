// ============================================================
//  Delhi//PadelCollective — Players API (login / register)
//  Bound to the Players sheet ("Data" tab). Deployed as a web app (Anyone).
//
//  Forgot password: a player can only set a new password after an admin clears
//  their Password cell (column C) in Data — they message DPC, you clear it.
//
//  Login also returns `key`, the player's dashboard key (HMAC of their 10-digit
//  number with the DASH_SECRET Script Property — the same value as in the Ratings
//  script). The Dashboard needs it to read their data.
//
//  POST { action: 'visit', phone } → one row per player per day in the
//  Dashboard_Visits tab (Date, Phone, Name, First open). The Dashboard sends it
//  on every open, so this shows who opens it each day.
// ============================================================
const TAB = 'Data';
const VISITS_TAB = 'Dashboard_Visits';

const C = {
  PHONE:        1,  // A
  NAME:         2,  // B
  PASSWORD:     3,  // C
  JOINING_DATE: 4,  // D
};

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'getPlayer')    return respond(getPlayer(e.parameter.phone));
  return respond({ success: false, message: 'Unknown action' });
}

function doPost(e) {
  const body   = JSON.parse(e.postData.contents);
  const action = body.action;
  if (action === 'login')          return respond(login(body.phone, body.password));
  if (action === 'register')       return respond(register(body));
  if (action === 'updatePassword') return respond(updatePassword(body.phone, body.newPassword));
  if (action === 'visit')          return respond(visit(body.phone));
  return respond({ success: false, message: 'Unknown action' });
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// LOGIN
function login(phone, password) {
  if (!phone || !password)
    return { success: false, message: 'Phone and password required' };

  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (normalise(row[C.PHONE - 1]) !== normalise(phone)) continue;

    const storedHash = String(row[C.PASSWORD - 1]).trim();
    if (!storedHash || storedHash.length !== 64)
      return { success: false, message: 'Account not registered yet. Please register first.' };

    if (storedHash !== hashPassword(password))
      return { success: false, message: 'Incorrect password.' };

    return { success: true, player: buildPlayerObj(row), key: dashKey(row[C.PHONE - 1]) };
  }

  return { success: false, message: 'Phone number not found. Please register first.' };
}

// REGISTER
// Only works if phone is pre-added to the sheet by admin

  function register(body) {

  const { phone, name, password } = body;

  if (!phone || !name || !password) {
    return {
      success: false,
      message: 'Phone, name, and password are required.'
    };
  }

  if (password.length < 8) {
    return {
      success: false,
      message: 'Password must be at least 8 characters.'
    };
  }

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();

  // CHECK IF PHONE ALREADY EXISTS
  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    if (normalise(row[C.PHONE - 1]) === normalise(phone)) {

      return {
        success: false,
        message: 'This number is already registered. Please log in.'
      };
    }
  }

  // CREATE NEW USER
  const joiningDate = new Date().toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }
  );

  sheet.appendRow([
    phone,
    name,
    hashPassword(password),
    joiningDate
  ]);

  return {
    success: true,
    message: `Welcome to DPC, ${name}!`,
    player: {
      phone,
      name,
      joiningDate
    }
  };
}

// GET SINGLE PLAYER
function getPlayer(phone) {
  if (!phone) return { success: false, message: 'Phone required' };
  const data = getSheet().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalise(data[i][C.PHONE - 1]) === normalise(phone))
      return { success: true, player: buildPlayerObj(data[i]) };
  }
  return { success: false, message: 'Player not found' };
}

// UPDATE PASSWORD
function updatePassword(phone, newPassword) {
  if (!phone || !newPassword)
    return { success: false, message: 'Phone and new password required.' };
  if (newPassword.length < 8)
    return { success: false, message: 'Password must be at least 8 characters.' };

  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalise(data[i][C.PHONE - 1]) !== normalise(phone)) continue;
    // Only after an admin has cleared the old password, so nobody can take over an account with just a phone number.
    if (String(data[i][C.PASSWORD - 1]).trim())
      return { success: false, message: 'To reset your password, message DPC on WhatsApp first. We\'ll unlock it, then try again here.' };
    sheet.getRange(i + 1, C.PASSWORD).setValue(hashPassword(newPassword));
    return { success: true, message: 'Password updated.' };
  }
  return { success: false, message: 'Player not found.' };
}

// DASHBOARD VISIT — first open of the day per player; later opens that day are skipped.
function visit(phone) {
  if (!phone) return { success: false, message: 'Phone required' };
  const data = getSheet().getDataRange().getValues();
  const row = data.slice(1).find(function (r) { return normalise(r[C.PHONE - 1]) === normalise(phone); });
  if (!row) return { success: false, message: 'Player not found' };   // only registered players are logged

  const ss = SpreadsheetApp.getActiveSpreadsheet(), tz = ss.getSpreadsheetTimeZone(), now = new Date();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let log = ss.getSheetByName(VISITS_TAB);
    if (!log) { log = ss.insertSheet(VISITS_TAB); log.appendRow(['Date', 'Phone', 'Name', 'First open']); }
    // Rows are appended in time order, so today's are at the bottom.
    const last = log.getLastRow(), n = Math.min(last - 1, 1000);
    const recent = n > 0 ? log.getRange(last - n + 1, 1, n, 2).getDisplayValues() : [];
    for (let i = recent.length - 1; i >= 0 && recent[i][0] === today; i--)
      if (normalise(recent[i][1]) === normalise(phone)) return { success: true, logged: false };
    // Plain text, so Sheets doesn't turn the date into a locale date the check above can't match.
    log.getRange(last + 1, 1, 1, 4).setNumberFormat('@')
      .setValues([[today, String(row[C.PHONE - 1]), row[C.NAME - 1], Utilities.formatDate(now, tz, 'HH:mm')]]);
    return { success: true, logged: true };
  } finally {
    lock.releaseLock();
  }
}

// HELPERS
function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB);
}

function buildPlayerObj(row) {
  return {
    phone:       String(row[C.PHONE - 1]),
    name:        row[C.NAME - 1],
    joiningDate: row[C.JOINING_DATE - 1],
  };
}

function dashKey(phone) {
  const secret = PropertiesService.getScriptProperties().getProperty('DASH_SECRET');
  if (!secret) throw new Error('Set the DASH_SECRET Script Property');
  const d = String(phone).replace(/\D/g, ''), ten = d.length > 10 ? d.slice(-10) : d;
  return Utilities.computeHmacSha256Signature(ten, secret)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function normalise(val) {
  return String(val).trim().replace(/\s+/g, '');
}

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password)
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
