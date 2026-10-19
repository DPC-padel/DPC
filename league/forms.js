// Forms save to Supabase league_inbox first (fast); the "DPL Interest" Apps Script
// (league/interest.gs) copies each entry into the Google Sheet within seconds. If
// Supabase can't be reached, the entry goes straight to the Apps Script instead.
// The thank-you shows only once one of them confirms the save.
const INTEREST_API = "https://script.google.com/macros/s/AKfycbxeWfHin0MasnfTZFuVLEnP7q1DNWpu-OfIfUeppAfJczKvbxiF_uYnLDGThUNr1lCF/exec";
const SB = { url: "https://zruqzybdpniofxbcwuat.supabase.co", key: "sb_publishable_O5kl7By_s23gMXNULck-yw_cksU-9Oy" };
const INBOX_FIELDS = ["name", "phone", "email", "area", "level", "instagram", "company", "designation", "interest", "message",
  "gender", "dob", "experience", "side", "tournament", "availability", "tshirt", "consent"];
async function saveEntry(form, fields) {
  const row = { form };
  INBOX_FIELDS.forEach(k => { if (k in fields) row[k] = String(fields[k] || "").trim(); });
  if (row.phone) row.phone = row.phone.replace(/[^\d+ ]/g, "");
  try {
    const res = await fetch(`${SB.url}/rest/v1/league_inbox`, { method: "POST",
      headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row) });
    if (res.ok) return;
    if (res.status === 400) throw Object.assign(new Error("rejected 400"), { invalid: true });   // a check failed (bad phone or email); anything else falls back
  } catch (x) { if (x.invalid) throw x; }   // network trouble → fall back below
  const res = await fetch(INTEREST_API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ form, ...fields }) });
  const data = await res.json();
  if (!data || data.ok !== true) throw new Error(data && data.error || "not saved");
}
// Register blocked: mark every unanswered question in red, say how many are left,
// and scroll to the first one. (Browser bubbles don't show reliably on iPhones.)
const MISSING_MSG = { radio: 'Pick one to continue.', checkbox: 'Tick this to continue.' };
function showMissing(f) {
  const groups = [];
  f.querySelectorAll('input:invalid, select:invalid, textarea:invalid').forEach(el => {
    const box = el.closest('.field');
    if (!box || groups.includes(box)) return;
    groups.push(box);
    box.classList.add('missing');
    let msg = box.querySelector(':scope > .err, :scope > .miss');
    if (!msg) { msg = document.createElement('p'); msg.className = 'miss'; msg.textContent = el.closest('#days') ? "Tick the days you can't play." : (MISSING_MSG[el.type] || 'Answer this to continue.'); box.append(msg); }
  });
  let sum = f.querySelector('.missing-sum');
  if (!sum) { sum = document.createElement('p'); sum.className = 'missing-sum'; sum.setAttribute('role', 'alert'); f.querySelector('button:not([type=button])').before(sum); }
  sum.textContent = groups.length === 1 ? '1 question still needs an answer.' : `${groups.length} questions still need an answer.`;
  if (groups[0]) { groups[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); groups[0].querySelector('input, select, textarea')?.focus({ preventScroll: true }); }
}
// Answering clears that question's red mark, and the count once nothing is left.
document.addEventListener('change', e => clearMissing(e.target));
document.addEventListener('input', e => clearMissing(e.target));
function clearMissing(el) {
  const box = el.closest?.('.field.missing'), f = el.closest?.('form');
  if (box && !box.querySelector(':invalid')) box.classList.remove('missing');
  const sum = f?.querySelector('.missing-sum');
  if (!sum) return;
  const left = f.querySelectorAll('.field.missing').length;
  if (!left) sum.remove(); else sum.textContent = left === 1 ? '1 question still needs an answer.' : `${left} questions still need an answer.`;
}

document.querySelectorAll('form[data-form]').forEach(f => f.addEventListener('submit', async e => {
  e.preventDefault();
  if (f.dataset.busy) return;   // already sending: extra taps on Register must not save it twice
  if (!f.checkValidity()) { showMissing(f); return; }
  f.dataset.busy = '1';
  const btn = f.querySelector('button:not([type=button])'), label = btn.textContent;
  let err = f.querySelector('.ferr');
  if (!err) { err = document.createElement('p'); err.className = 'ferr err'; err.setAttribute('role', 'alert'); btn.before(err); }
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    // Multi-choice answers (consent) become one comma-separated cell.
    const fd = new FormData(f), fields = {};
    for (const k of new Set(fd.keys())) fields[k] = fd.getAll(k).join(', ');
    await saveEntry(f.dataset.form, fields);
    f.classList.add('sent');
    window.dplTrack?.('success', f.dataset.form);
  } catch (x) {
    window.DPC?.report('League: ' + f.dataset.form + ' form', x);
    window.dplTrack?.('error', x.invalid ? 'bad phone/email' : 'not saved');
    err.textContent = x.invalid ? "Please check your phone number and email, then try again." : "We couldn't send that. Check your connection and try again.";
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = label;
  } finally {
    delete f.dataset.busy;
  }
}));
