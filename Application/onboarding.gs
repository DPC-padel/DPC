// DPC ONBOARDING RESPONSE SHEET
// Appends the form response, then adds the player to Player_ID in the
// Rating&Ranking sheet (phone, name, self-rating, and Girls if that column exists).
// Phone is normalized to bare 10 digits so it matches login.

const RATINGS_SHEET_ID = '1N1X86vzB7kZYO0JzXIxEYl6kw5U6qBKt3w75h2Din0A';
const PLAYER_TAB       = 'Player_ID';
const RATINGS_API      = 'https://script.google.com/macros/s/AKfycbxxg8sKLWTWvnLcHuBONDC1Q5M8nksdrM6xC2dFBDVfNEi7kJmIstK1wnh_xvF5MqXYvA/exec';

function doPost(e) {
  const data  = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  sheet.appendRow([
    new Date(),              // A Timestamp
    data.name,               // B Name
    data.girl === true,      // C Girl — TRUE when the applicant selected Female, else FALSE
    data.phone,              // D Phone (kept raw in the response log)
    data.location,           // E Location
    data.experience,         // F Experience
    data.level,              // G Level
    data.communityValue,     // H CommunityValue
    data.instagram,          // I Instagram
    data.vision,             // J Vision
    data.instagramFollowing, // K instagramFollowing
    data.onboardingRating || "N/A", // L onboardingRating
    data.age40 === true,     // M 40+ — TRUE when the applicant ticked the 40+ box
  ]);

  addToPlayerId(data);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// "3.5/7" -> 3.5 ; "" for "N/A" or anything non-numeric
function selfRatingNumerator(val) {
  const n = parseFloat(String(val || '').split('/')[0]);
  return isNaN(n) ? '' : n;
}

function addToPlayerId(data) {
  const name  = String(data.name || '').trim();
  const phone = tenDigit(data.phone);
  if (!name || !phone) return;

  const tab = SpreadsheetApp.openById(RATINGS_SHEET_ID).getSheetByName(PLAYER_TAB);
  if (!tab) return;

  // Columns by header, so the sheet's layout can change.
  const head = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
  const col  = label => head.findIndex(h => h.indexOf(label) === 0) + 1;   // 1-based, 0 = missing
  const cPhone = col('contact number'), cName = col('name'), cSelf = col('self rating'), cGirl = col('girls');
  if (!cPhone || !cName) return;

  // No duplicate players (compare on the normalized 10-digit form).
  const lastRow = tab.getLastRow();
  if (lastRow > 1) {
    const phones = tab.getRange(2, cPhone, lastRow - 1, 1).getValues();
    if (phones.some(r => tenDigit(r[0]) === phone)) return;
  }

  // Write only our cells, so formula columns (Ranking, Rating) are left alone.
  const row = lastRow + 1;
  tab.getRange(row, cPhone).setValue(phone);
  tab.getRange(row, cName).setValue(name);
  if (cSelf) tab.getRange(row, cSelf).setValue(selfRatingNumerator(data.onboardingRating));
  if (cGirl) tab.getRange(row, cGirl).setValue(data.girl === true);

  // New player added → rebuild the dashboards.
  try {
    UrlFetchApp.fetch(RATINGS_API + '?action=sync', { muteHttpExceptions: true });
  } catch (e) {}
}

// Strip +, spaces, dashes and any country code (91 / 1 / 44 / …) → last 10 digits.
function tenDigit(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}
