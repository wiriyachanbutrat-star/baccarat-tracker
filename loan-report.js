// Reads the same Google Sheet backend as loan.js (read-only here — this
// page never writes).
const API_URL = 'https://script.google.com/macros/s/AKfycbz5cJ14OH-0qwkLPqDMbD7qwoKLxjZ6F2XIL5eCt9aau4KGc51P5z-XVdkM7bJUiI_j/exec';

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

let rate = 10;
let loans = [];
let view = 'month'; // 'month' | 'year'

const els = {
  yearFilter: document.getElementById('yearFilter'),
  monthFilter: document.getElementById('monthFilter'),
  monthFilterWrap: document.getElementById('monthFilterWrap'),
  borrowerFilter: document.getElementById('borrowerFilter'),
  repCount: document.getElementById('repCount'),
  repPrincipal: document.getElementById('repPrincipal'),
  repInterest: document.getElementById('repInterest'),
  repTotal: document.getElementById('repTotal'),
  repPaid: document.getElementById('repPaid'),
  repUnpaid: document.getElementById('repUnpaid'),
  borrowerReportBody: document.getElementById('borrowerReportBody'),
  periodReportBody: document.getElementById('periodReportBody'),
  periodTableTitle: document.getElementById('periodTableTitle'),
  periodColHeader: document.getElementById('periodColHeader'),
  viewBtns: document.querySelectorAll('.view-btn'),
};

function formatMoney(n){
  return '฿' + Math.round(n).toLocaleString('th-TH');
}

// loanDate is stored as plain ISO 'YYYY-MM-DD' (see loan.js) so slicing is
// enough — no timezone-sensitive Date parsing needed.
function yearOf(loan){ return (loan.loanDate || '').slice(0, 4); }
function monthKeyOf(loan){ return (loan.loanDate || '').slice(0, 7); }
function monthLabel(key){
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  return `${THAI_MONTHS[idx] || m} ${y}`;
}

function populateFilterOptions(){
  const years = [...new Set(loans.map(yearOf).filter(Boolean))].sort().reverse();
  els.yearFilter.innerHTML = '<option value="">ทั้งหมด</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');

  const months = [...new Set(loans.map(monthKeyOf).filter(Boolean))].sort().reverse();
  els.monthFilter.innerHTML = '<option value="">ทั้งหมด</option>' +
    months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');

  const borrowers = [...new Set(loans.map(l => l.name))].sort();
  els.borrowerFilter.innerHTML = '<option value="">ทั้งหมด</option>' +
    borrowers.map(n => `<option value="${n}">${n}</option>`).join('');
}

function loanTotal(loan){ return loan.principal * (1 + rate / 100); }

function applyFilters(){
  const year = els.yearFilter.value;
  const month = els.monthFilter.value;
  const borrower = els.borrowerFilter.value;

  return loans.filter(l => {
    if (year && yearOf(l) !== year) return false;
    if (view === 'month' && month && monthKeyOf(l) !== month) return false;
    if (borrower && l.name !== borrower) return false;
    return true;
  });
}

function renderSummary(filtered){
  const principal = filtered.reduce((s, l) => s + l.principal, 0);
  const interest = filtered.reduce((s, l) => s + l.principal * (rate / 100), 0);
  const total = principal + interest;
  const paid = filtered.filter(l => l.paid).reduce((s, l) => s + loanTotal(l), 0);
  const unpaid = total - paid;

  els.repCount.textContent = filtered.length;
  els.repPrincipal.textContent = formatMoney(principal);
  els.repInterest.textContent = formatMoney(interest);
  els.repTotal.textContent = formatMoney(total);
  els.repPaid.textContent = formatMoney(paid);
  els.repUnpaid.textContent = formatMoney(unpaid);
}

function groupAndRender(tbody, filtered, keyFn){
  const groups = new Map();
  filtered.forEach(l => {
    const key = keyFn(l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  });

  const rows = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  tbody.innerHTML = '';
  if (rows.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">ไม่มีรายการตรงกับตัวกรองนี้</td></tr>';
    return;
  }

  rows.forEach(([key, items]) => {
    const principal = items.reduce((s, l) => s + l.principal, 0);
    const interest = items.reduce((s, l) => s + l.principal * (rate / 100), 0);
    const total = principal + interest;
    const paid = items.filter(l => l.paid).reduce((s, l) => s + loanTotal(l), 0);
    const unpaid = total - paid;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${key}</td>
      <td>${items.length}</td>
      <td class="amount">${formatMoney(principal)}</td>
      <td class="amount">${formatMoney(interest)}</td>
      <td class="amount"><strong>${formatMoney(total)}</strong></td>
      <td class="amount">${formatMoney(paid)}</td>
      <td class="amount ${unpaid > 0 ? 'overdue' : ''}">${formatMoney(unpaid)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function render(){
  const filtered = applyFilters();
  renderSummary(filtered);

  groupAndRender(els.borrowerReportBody, filtered, l => l.name);

  if (view === 'month'){
    els.periodTableTitle.textContent = 'แยกตามเดือน';
    els.periodColHeader.textContent = 'เดือน';
    groupAndRender(els.periodReportBody, filtered, l => monthKeyOf(l) ? monthLabel(monthKeyOf(l)) : 'ไม่ระบุวันที่');
  } else {
    els.periodTableTitle.textContent = 'แยกตามปี';
    els.periodColHeader.textContent = 'ปี';
    groupAndRender(els.periodReportBody, filtered, l => yearOf(l) || 'ไม่ระบุวันที่');
  }
}

els.viewBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    view = btn.dataset.view;
    els.viewBtns.forEach(b => b.classList.toggle('active', b === btn));
    els.monthFilterWrap.style.display = view === 'month' ? '' : 'none';
    render();
  });
});

els.yearFilter.addEventListener('change', render);
els.monthFilter.addEventListener('change', render);
els.borrowerFilter.addEventListener('change', render);

async function init(){
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (typeof data.rate === 'number') rate = data.rate;
    if (Array.isArray(data.loans)) loans = data.loans;
  } catch (e){
    els.borrowerReportBody.innerHTML = '<tr class="empty-row"><td colspan="7">โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ</td></tr>';
    els.periodReportBody.innerHTML = '<tr class="empty-row"><td colspan="7">โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ</td></tr>';
    return;
  }
  populateFilterOptions();
  render();
}

init();
