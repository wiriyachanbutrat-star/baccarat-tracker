// Google Sheet (via Apps Script Web App) is the database now, replacing
// localStorage. GAS web apps don't handle CORS preflight requests, so POST
// bodies are sent as text/plain (not application/json) to avoid triggering
// one -- the Apps Script side just JSON.parses the raw text regardless.
const API_URL = 'https://script.google.com/macros/s/AKfycbz5cJ14OH-0qwkLPqDMbD7qwoKLxjZ6F2XIL5eCt9aau4KGc51P5z-XVdkM7bJUiI_j/exec';

let state = {
  rate: 10,
  loans: [], // { id, name, principal, paid, loanDate, dueDate, paidDate }
};

function todayISO(){
  return new Date().toISOString().slice(0, 10);
}

// Displays as D/M/YYYY (Gregorian) — input/storage stays plain ISO
// (YYYY-MM-DD) from <input type="date">, this is just for the table.
function formatDate(iso){
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '—';
  return `${Number(d)}/${Number(m)}/${y}`;
}

function addMonths(iso, n){
  const base = iso ? new Date(iso + 'T00:00:00') : new Date();
  base.setMonth(base.getMonth() + n);
  return base.toISOString().slice(0, 10);
}

let saveTimer = null;

async function loadState(){
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (typeof data.rate === 'number') state.rate = data.rate;
    if (Array.isArray(data.loans)) state.loans = data.loans;
  } catch (e){
    els.errorLine.textContent = 'โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ (เช็คอินเทอร์เน็ต/URL) — ใช้ข้อมูลว่างไปก่อน';
  }
}

// Debounced so typing in the rate box or renaming doesn't fire a request
// per keystroke -- waits 500ms after the last change before writing.
function saveState(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(state),
    }).then(res => {
      if (!res.ok) throw new Error('bad status ' + res.status);
      els.errorLine.textContent = '';
    }).catch(() => {
      els.errorLine.textContent = 'บันทึกขึ้น Google Sheet ไม่สำเร็จ (เช็คอินเทอร์เน็ต) — ลองใหม่อีกครั้ง';
    });
  }, 500);
}

const els = {
  rateInput: document.getElementById('rateInput'),
  borrowerName: document.getElementById('borrowerName'),
  borrowerAmount: document.getElementById('borrowerAmount'),
  loanDate: document.getElementById('loanDate'),
  dueDate: document.getElementById('dueDate'),
  borrowerList: document.getElementById('borrowerList'),
  borrowerHint: document.getElementById('borrowerHint'),
  btnAdd: document.getElementById('btn-add'),
  btnClear: document.getElementById('btn-clear'),
  errorLine: document.getElementById('errorLine'),
  loanBody: document.getElementById('loanBody'),
  emptyRow: document.getElementById('emptyRow'),
  sumPrincipal: document.getElementById('sumPrincipal'),
  sumInterest: document.getElementById('sumInterest'),
  sumTotal: document.getElementById('sumTotal'),
  sumPaid: document.getElementById('sumPaid'),
  sumUnpaid: document.getElementById('sumUnpaid'),
};

function formatMoney(n){
  return '฿' + Math.round(n).toLocaleString('th-TH');
}

function addLoan(){
  const name = els.borrowerName.value.trim();
  const amount = Number(els.borrowerAmount.value);

  if (!name){
    els.errorLine.textContent = 'กรอกชื่อผู้กู้ก่อนครับ';
    return;
  }
  if (!amount || amount <= 0){
    els.errorLine.textContent = 'กรอกจำนวนเงินกู้ให้ถูกต้อง (มากกว่า 0)';
    return;
  }

  els.errorLine.textContent = '';
  state.loans.push({
    id: Date.now() + Math.random(),
    name,
    principal: amount,
    paid: false,
    loanDate: els.loanDate.value || todayISO(),
    dueDate: els.dueDate.value || '',
    paidDate: null,
  });
  els.borrowerName.value = '';
  els.borrowerAmount.value = '';
  els.loanDate.value = todayISO();
  els.dueDate.value = '';
  els.borrowerHint.textContent = '';
  els.borrowerName.focus();
  saveState();
  render();
}

function deleteLoan(id){
  state.loans = state.loans.filter(l => l.id !== id);
  saveState();
  render();
}

function toggleStatus(id){
  const loan = state.loans.find(l => l.id === id);
  if (loan){
    loan.paid = !loan.paid;
    loan.paidDate = loan.paid ? todayISO() : null;
  }
  saveState();
  render();
}

function renameLoan(id, name){
  const loan = state.loans.find(l => l.id === id);
  if (loan) loan.name = name;
  saveState();
}

function clearAll(){
  if (state.loans.length === 0) return;
  state.loans = [];
  saveState();
  render();
}

function render(){
  const rate = Math.max(0, Number(els.rateInput.value) || 0);
  state.rate = rate;

  // Autocomplete: suggest existing borrower names so a repeat borrower can
  // be picked instead of retyped (browser's native <input list> dropdown).
  const uniqueNames = [...new Set(state.loans.map(l => l.name))];
  els.borrowerList.innerHTML = uniqueNames.map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');

  els.loanBody.innerHTML = '';

  if (state.loans.length === 0){
    els.loanBody.appendChild(els.emptyRow);
  } else {
    state.loans.forEach((loan, idx) => {
      const interest = loan.principal * (rate / 100);
      const total = loan.principal + interest;
      const isOverdue = !loan.paid && loan.dueDate && loan.dueDate < todayISO();

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><input type="text" class="borrower-name-input" value="${loan.name.replace(/"/g, '&quot;')}"></td>
        <td>${formatDate(loan.loanDate)}</td>
        <td class="${isOverdue ? 'overdue' : ''}">${formatDate(loan.dueDate)}${isOverdue ? ' ⚠' : ''}</td>
        <td class="amount">${formatMoney(loan.principal)}</td>
        <td class="amount">${formatMoney(interest)}</td>
        <td class="amount"><strong>${formatMoney(total)}</strong></td>
        <td>
          <button class="status-btn ${loan.paid ? 'paid' : 'pending'}">${loan.paid ? 'ชำระแล้ว' : 'รอชำระ'}</button>
        </td>
        <td>${formatDate(loan.paidDate)}</td>
        <td><button class="row-delete" title="ลบรายการนี้">✕</button></td>
      `;

      tr.querySelector('.borrower-name-input').addEventListener('change', (e) => {
        renameLoan(loan.id, e.target.value.trim() || loan.name);
      });
      tr.querySelector('.status-btn.pending, .status-btn.paid').addEventListener('click', () => toggleStatus(loan.id));
      tr.querySelector('.row-delete').addEventListener('click', () => deleteLoan(loan.id));

      els.loanBody.appendChild(tr);
    });
  }

  const sumPrincipal = state.loans.reduce((s, l) => s + l.principal, 0);
  const sumInterest = state.loans.reduce((s, l) => s + l.principal * (rate / 100), 0);
  const sumTotal = sumPrincipal + sumInterest;
  const sumPaid = state.loans.filter(l => l.paid).reduce((s, l) => s + l.principal * (1 + rate / 100), 0);
  const sumUnpaid = sumTotal - sumPaid;

  els.sumPrincipal.textContent = formatMoney(sumPrincipal);
  els.sumInterest.textContent = formatMoney(sumInterest);
  els.sumTotal.textContent = formatMoney(sumTotal);
  els.sumPaid.textContent = formatMoney(sumPaid);
  els.sumUnpaid.textContent = formatMoney(sumUnpaid);
}

// When the typed/selected name matches an existing borrower (case-
// insensitive, trimmed), pull up their existing outstanding balance as a
// hint -- not just autocompleting the text, but surfacing their data too.
function updateBorrowerHint(){
  const typed = els.borrowerName.value.trim().toLowerCase();
  if (!typed){ els.borrowerHint.textContent = ''; return; }

  const rate = Math.max(0, Number(els.rateInput.value) || 0);
  const existing = state.loans.filter(l => l.name.trim().toLowerCase() === typed);
  if (existing.length === 0){ els.borrowerHint.textContent = ''; return; }

  const unpaidTotal = existing
    .filter(l => !l.paid)
    .reduce((s, l) => s + l.principal * (1 + rate / 100), 0);
  const paidCount = existing.filter(l => l.paid).length;

  els.borrowerHint.textContent = unpaidTotal > 0
    ? `ผู้กู้เดิม "${existing[0].name}" — มียอดค้างชำระอยู่แล้ว ${formatMoney(unpaidTotal)} (${existing.length} รายการ)`
    : `ผู้กู้เดิม "${existing[0].name}" — ชำระครบทุกยอดแล้ว (${paidCount} รายการที่ผ่านมา)`;
}

els.btnAdd.addEventListener('click', addLoan);
els.borrowerAmount.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLoan(); });
els.borrowerName.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLoan(); });
els.borrowerName.addEventListener('input', updateBorrowerHint);
els.btnClear.addEventListener('click', clearAll);
els.rateInput.addEventListener('input', () => { render(); saveState(); });

// initial — show a loading state while the Sheet data comes in
els.emptyRow.querySelector('td').textContent = 'กำลังโหลดข้อมูลจาก Google Sheet...';
els.loanDate.value = todayISO();
loadState().then(() => {
  els.rateInput.value = state.rate;
  render();
});
