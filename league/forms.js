// Forms save to Supabase league_inbox first (fast); the "DPL Interest" Apps Script
// (league/interest.gs) copies each entry into the Google Sheet within seconds. If
// Supabase can't be reached, the entry goes straight to the Apps Script instead.
// The thank-you shows only once one of them confirms the save.
const INTEREST_API = "https://script.google.com/macros/s/AKfycbxeWfHin0MasnfTZFuVLEnP7q1DNWpu-OfIfUeppAfJczKvbxiF_uYnLDGThUNr1lCF/exec";
const SB = { url: "https://zruqzybdpniofxbcwuat.supabase.co", key: "sb_publishable_O5kl7By_s23gMXNULck-yw_cksU-9Oy" };
const INBOX_FIELDS = ["name", "phone", "email", "area", "level", "instagram", "company", "designation", "interest", "message",
  "gender", "age", "experience", "side", "tournament", "categories", "availability", "tshirt", "consent"];
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
document.querySelectorAll('.cats').forEach(c => c.addEventListener('change', () => {
  const n = c.querySelectorAll('input:checked').length;
  c.classList.toggle('bad', n > 2);
}));
document.querySelectorAll('form[data-form]').forEach(f => f.addEventListener('submit', async e => {
  e.preventDefault();
  // Categories: one or two.
  const cats = f.querySelector('.cats');
  if (cats) {
    const n = cats.querySelectorAll('input:checked').length;
    cats.classList.toggle('bad', n < 1 || n > 2);
    if (n < 1 || n > 2) { cats.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (f.checkValidity()) return; }
  }
  if (!f.checkValidity()) { f.reportValidity(); return; }
  const btn = f.querySelector('button'), label = btn.textContent;
  let err = f.querySelector('.ferr');
  if (!err) { err = document.createElement('p'); err.className = 'ferr err'; err.setAttribute('role', 'alert'); btn.before(err); }
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    // Multi-choice answers (categories, consent) become one comma-separated cell.
    const fd = new FormData(f), fields = {};
    for (const k of new Set(fd.keys())) fields[k] = fd.getAll(k).join(', ');
    await saveEntry(f.dataset.form, fields);
    f.classList.add('sent');
  } catch (x) {
    window.DPC?.report('League: ' + f.dataset.form + ' form', x);
    err.textContent = x.invalid ? "Please check your phone number and email, then try again." : "We couldn't send that. Check your connection and try again.";
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = label;
  }
}));
