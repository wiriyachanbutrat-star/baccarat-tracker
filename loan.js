const STORAGE_KEY = 'loanTrackerData';

let state = {
  rate: 10,
  loans: [], // { id, name, principal, paid }
};

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.rate === 'number') state.rate = data.rate;
    if (Array.isArray(data.loans)) state.loans = data.loans;
  } catch (e){ /* corrupt/unreadable data — start fresh instead of crashing */ }
}

function saveState(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e){ /* storage unavailable — proceed without persistence */ }
}

const els = {
  rateInput: document.getElementById('rateInput'),
  borrowerName: document.getElementById('borrowerName'),
  borrowerAmount: document.getElementById('borrowerAmount'),
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
  });
  els.borrowerName.value = '';
  els.borrowerAmount.value = '';
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
  if (loan) loan.paid = !loan.paid;
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
  saveState();

  els.loanBody.innerHTML = '';

  if (state.loans.length === 0){
    els.loanBody.appendChild(els.emptyRow);
  } else {
    state.loans.forEach((loan, idx) => {
      const interest = loan.principal * (rate / 100);
      const total = loan.principal + interest;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><input type="text" class="borrower-name-input" value="${loan.name.replace(/"/g, '&quot;')}"></td>
        <td class="amount">${formatMoney(loan.principal)}</td>
        <td class="amount">${formatMoney(interest)}</td>
        <td class="amount"><strong>${formatMoney(total)}</strong></td>
        <td><button class="status-btn ${loan.paid ? 'paid' : 'pending'}">${loan.paid ? 'ชำระแล้ว' : 'รอชำระ'}</button></td>
        <td><button class="row-delete" title="ลบรายการนี้">✕</button></td>
      `;

      tr.querySelector('.borrower-name-input').addEventListener('change', (e) => {
        renameLoan(loan.id, e.target.value.trim() || loan.name);
      });
      tr.querySelector('.status-btn').addEventListener('click', () => toggleStatus(loan.id));
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

els.btnAdd.addEventListener('click', addLoan);
els.borrowerAmount.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLoan(); });
els.borrowerName.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLoan(); });
els.btnClear.addEventListener('click', clearAll);
els.rateInput.addEventListener('input', render);

// initial
loadState();
els.rateInput.value = state.rate;
render();
