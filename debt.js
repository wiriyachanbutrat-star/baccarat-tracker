// Same Google Sheet backend as loan.js (a second "Debts" sheet, added by
// the shared Apps Script). POST bodies go as text/plain, same reasoning
// as loan.js: GAS web apps don't handle CORS preflight requests.
const API_URL = 'https://script.google.com/macros/s/AKfycbz5cJ14OH-0qwkLPqDMbD7qwoKLxjZ6F2XIL5eCt9aau4KGc51P5z-XVdkM7bJUiI_j/exec';

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

let entries = []; // { id, name, debtAmount, payDate, payAmount }

function todayISO(){
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso){
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '—';
  return `${Number(d)}/${Number(m)}/${y}`;
}

function monthLabel(iso){
  if (!iso) return '—';
  const [y, m] = iso.split('-');
  const idx = Number(m) - 1;
  return `${THAI_MONTHS[idx] || m} ${y}`;
}

function formatMoney(n){
  return '฿' + Math.round(n).toLocaleString('th-TH');
}

let saveTimer = null;

async function loadState(){
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    entries = Array.isArray(data.debts) ? data.debts : [];
  } catch (e){
    els.errorLine.textContent = 'โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ (เช็คอินเทอร์เน็ต/URL) — ใช้ข้อมูลว่างไปก่อน';
  }
}

// Debounced so quick successive edits don't fire a request each time --
// waits 500ms after the last change before writing.
function saveState(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ debts: entries }),
    }).then(res => {
      if (!res.ok) throw new Error('bad status ' + res.status);
    }).catch(() => {
      els.errorLine.textContent = 'บันทึกขึ้น Google Sheet ไม่สำเร็จ (เช็คอินเทอร์เน็ต) — ลองใหม่อีกครั้ง';
    });
  }, 500);
}

const els = {
  debtName: document.getElementById('debtName'),
  debtAmount: document.getElementById('debtAmount'),
  payDate: document.getElementById('payDate'),
  payAmount: document.getElementById('payAmount'),
  debtNameList: document.getElementById('debtNameList'),
  debtHint: document.getElementById('debtHint'),
  btnAdd: document.getElementById('btn-add'),
  btnClear: document.getElementById('btn-clear'),
  errorLine: document.getElementById('errorLine'),
  debtBody: document.getElementById('debtBody'),
  emptyRow: document.getElementById('emptyRow'),
  summaryByItemBody: document.getElementById('summaryByItemBody'),
};

// Latest known debtAmount for a given item name — new entries for an
// existing item reuse this instead of asking the user again.
function debtAmountFor(name){
  const matches = entries.filter(e => e.name === name);
  if (matches.length === 0) return null;
  return matches[matches.length - 1].debtAmount;
}

function addEntry(){
  const name = els.debtName.value.trim();
  const payDate = els.payDate.value || todayISO();
  const payAmount = Number(els.payAmount.value);
  let debtAmount = Number(els.debtAmount.value);

  if (!name){
    els.errorLine.textContent = 'กรอกชื่อรายการหนี้สินก่อนครับ';
    return;
  }
  const existingAmount = debtAmountFor(name);
  if (!debtAmount && existingAmount != null) debtAmount = existingAmount;
  if (!debtAmount || debtAmount <= 0){
    els.errorLine.textContent = 'กรอกจำนวนหนี้สินก่อนครับ';
    return;
  }
  if (!payAmount || payAmount <= 0){
    els.errorLine.textContent = 'กรอกจำนวนเงินจ่ายก่อนครับ';
    return;
  }

  entries.push({
    id: Date.now(),
    name,
    debtAmount,
    payDate,
    payAmount,
  });

  els.errorLine.textContent = '';
  els.debtName.value = '';
  els.debtAmount.value = '';
  els.payAmount.value = '';

  saveState();
  render();
}

function deleteEntry(id){
  entries = entries.filter(e => e.id !== id);
  saveState();
  render();
}

// Running totals are per debt item (by name), computed in chronological
// order regardless of the table's display order.
function computeRows(){
  const sorted = [...entries].sort((a, b) => a.payDate.localeCompare(b.payDate) || a.id - b.id);
  const cumByName = {};
  const rows = sorted.map(e => {
    cumByName[e.name] = (cumByName[e.name] || 0) + e.payAmount;
    return { ...e, cumulativePaid: cumByName[e.name], remaining: e.debtAmount - cumByName[e.name] };
  });
  return rows.sort((a, b) => b.payDate.localeCompare(a.payDate) || b.id - a.id);
}

function renderSummary(rows){
  const latestByName = new Map();
  rows.forEach(r => {
    const prev = latestByName.get(r.name);
    if (!prev || r.payDate > prev.payDate || (r.payDate === prev.payDate && r.id > prev.id)){
      latestByName.set(r.name, r);
    }
  });
  renderSummaryByItem(latestByName);
}

function renderSummaryByItem(latestByName){
  const items = [...latestByName.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  if (items.length === 0){
    els.summaryByItemBody.innerHTML = '<tr class="empty-row"><td colspan="6">ยังไม่มีรายการ</td></tr>';
    return;
  }
  els.summaryByItemBody.innerHTML = items.map(r => {
    const isSettled = r.remaining <= 0;
    const pct = r.debtAmount > 0 ? Math.min(100, Math.round((r.cumulativePaid / r.debtAmount) * 100)) : 0;
    return `
      <tr>
        <td><strong>${r.name}</strong></td>
        <td class="amount">${formatMoney(r.debtAmount)}</td>
        <td class="amount">${formatMoney(r.cumulativePaid)}</td>
        <td class="amount ${r.remaining > 0 ? 'overdue' : ''}">${formatMoney(r.remaining)}</td>
        <td>
          <div class="progress-row">
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <span class="progress-pct">${pct}%</span>
          </div>
        </td>
        <td><span class="status-pill ${isSettled ? 'paid' : 'unpaid'}">${isSettled ? 'ชำระครบแล้ว' : 'คงค้าง'}</span></td>
      </tr>
    `;
  }).join('');
}

function populateDatalist(){
  const names = [...new Set(entries.map(e => e.name))].sort();
  els.debtNameList.innerHTML = names.map(n => `<option value="${n}"></option>`).join('');
}

function render(){
  populateDatalist();
  const rows = computeRows();
  renderSummary(rows);

  els.debtBody.innerHTML = '';
  if (rows.length === 0){
    els.debtBody.innerHTML = '<tr class="empty-row"><td colspan="10">ยังไม่มีรายการ เพิ่มรายการแรกด้านบนได้เลย</td></tr>';
    return;
  }

  rows.forEach((r, i) => {
    const isSettled = r.remaining <= 0;
    const tr = document.createElement('tr');
    if (isSettled) tr.classList.add('paid-row');
    tr.innerHTML = `
      <td>${rows.length - i}</td>
      <td><strong>${r.name}</strong></td>
      <td class="amount">${formatMoney(r.debtAmount)}</td>
      <td>${formatDate(r.payDate)}</td>
      <td>${monthLabel(r.payDate)}</td>
      <td class="amount">${formatMoney(r.payAmount)}</td>
      <td class="amount">${formatMoney(r.cumulativePaid)}</td>
      <td class="amount ${r.remaining > 0 ? 'overdue' : ''}">${formatMoney(r.remaining)}</td>
      <td><span class="status-pill ${isSettled ? 'paid' : 'unpaid'}">${isSettled ? 'ชำระครบแล้ว' : 'คงค้าง'}</span></td>
      <td><button type="button" class="row-delete" title="ลบรายการนี้">✕</button></td>
    `;
    tr.querySelector('.row-delete').addEventListener('click', () => {
      const msg = `ลบรายการนี้?\n\nรายการ: ${r.name}\nวันที่จ่าย: ${formatDate(r.payDate)}\nจำนวนเงินจ่าย: ${formatMoney(r.payAmount)}`;
      if (!confirm(msg)) return;
      deleteEntry(r.id);
    });
    els.debtBody.appendChild(tr);
  });
}

els.debtName.addEventListener('input', () => {
  const existingAmount = debtAmountFor(els.debtName.value.trim());
  els.debtHint.textContent = existingAmount != null
    ? `รายการนี้มีอยู่แล้ว จำนวนหนี้สิน ${formatMoney(existingAmount)}`
    : '';
});

els.btnAdd.addEventListener('click', addEntry);
els.btnClear.addEventListener('click', () => {
  if (!confirm('ลบรายการชำระหนี้ทั้งหมด?')) return;
  entries = [];
  saveState();
  render();
});

els.payDate.value = todayISO();

async function init(){
  await loadState();
  render();
}
init();
