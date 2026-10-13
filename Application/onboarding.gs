// DPC ONBOARDING RESPONSE SHEET
// Appends the form response, then adds the player to Player_ID in the
// Rating&Ranking sheet (phone, name, self-rating, and Girls if that column exists).
// Phone is normalized to bare 10 digits so it matches login.
// Replies { ok, groups }: the WhatsApp group buttons this applicant sees (groupsFor).
// Invite links live in Script Properties (Project Settings → Script Properties),
// never in code: GROUP_FIRST_SERVE, GROUP_BREAK_POINT, GROUP_BREAK_POINT_2,
// GROUP_GIRLS_101, GROUP_GIRLS_BEGINNER, GROUP_GIRLS_INTER, GROUP_NOIDA, GROUP_40_PLUS.
// A group whose link isn't set is simply not shown.

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

  // The response is saved above; a problem adding to Player_ID must not
  // make the form tell the applicant it failed.
  try { addToPlayerId(data); } catch (err) { console.error('Player_ID: ' + err); }

  let groups = [];
  try { groups = groupLinks(groupsFor(data)); } catch (err) { console.error('Groups: ' + err); }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, groups: groups }))
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

  // Last row that actually has a player (number or name). Google's getLastRow()
  // also counts rows that only hold formulas, which put new players far below.
  let lastPlayerRow = 1;
  const lastRow = tab.getLastRow();
  if (lastRow > 1) {
    const phones = tab.getRange(2, cPhone, lastRow - 1, 1).getValues();
    const names  = tab.getRange(2, cName,  lastRow - 1, 1).getValues();
    // No duplicate players (compare on the normalized 10-digit form).
    if (phones.some(r => tenDigit(r[0]) === phone)) return;
    phones.forEach((r, i) => {
      if (String(r[0]).trim() || String(names[i][0]).trim()) lastPlayerRow = i + 2;
    });
  }

  // Write only our cells, so formula columns (Ranking, Rating) are left alone.
  const row = lastPlayerRow + 1;
  tab.getRange(row, cPhone).setValue(phone);
  tab.getRange(row, cName).setValue(name);
  if (cSelf) tab.getRange(row, cSelf).setValue(selfRatingNumerator(data.onboardingRating));
  if (cGirl) tab.getRange(row, cGirl).setValue(data.girl === true ? 'yes' : 'no');   // matches the column's yes/no dropdown

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

// Which groups an applicant joins (keys only; links come from Script Properties).
//  Men:   rating < 3 → First Serve · 3 to under 4 → Break Point · 4+ → Break Point 2.0
//  Women: never played → Girls 101 · 0-3 months → Girls Beginner · rating above 3 → Inter Girls
//         · anyone else → Girls Beginner
//  Everyone: Noida in their locations → Noida · ticked 40+ → 40+
function groupsFor(data) {
  const rating = Number(data.rating) || parseFloat(data.onboardingRating) || 0;
  const out = [];
  if (data.girl === true) {
    if (data.experience === 'Never played') out.push('GIRLS_101');
    else if (data.experience === '0-3 months') out.push('GIRLS_BEGINNER');
    else if (rating > 3) out.push('GIRLS_INTER');
    else out.push('GIRLS_BEGINNER');
  } else {
    out.push(rating < 3 ? 'FIRST_SERVE' : rating < 4 ? 'BREAK_POINT' : 'BREAK_POINT_2');
  }
  if (/noida/i.test(String(data.location || ''))) out.push('NOIDA');
  if (data.age40 === true) out.push('40_PLUS');
  return out;
}

const GROUP_NAMES = {
  FIRST_SERVE: 'First Serve', BREAK_POINT: 'Break Point', BREAK_POINT_2: 'Break Point 2.0',
  GIRLS_101: 'Girls 101', GIRLS_BEGINNER: 'Girls Beginner', GIRLS_INTER: 'Inter Girls',
  NOIDA: 'Noida', '40_PLUS': '40+',
};
function groupLinks(keys) {
  const props = PropertiesService.getScriptProperties();
  return keys.map(k => ({ name: GROUP_NAMES[k], link: String(props.getProperty('GROUP_' + k) || '').trim() }))
    .filter(g => /^https:\/\/chat\.whatsapp\.com\//.test(g.link));
}
