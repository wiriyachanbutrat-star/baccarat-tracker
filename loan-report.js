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
  borrowerChart: document.getElementById('borrowerChart'),
  periodChart: document.getElementById('periodChart'),
};

// One shared tooltip element, repositioned/reused across both charts
// instead of creating a new node per hover.
const tooltip = document.createElement('div');
tooltip.className = 'chart-tooltip';
document.body.appendChild(tooltip);

function showTooltip(evt, html){
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');
  moveTooltip(evt);
}
function moveTooltip(evt){
  tooltip.style.left = (evt.clientX + 14 + window.scrollX) + 'px';
  tooltip.style.top = (evt.clientY + 14 + window.scrollY) + 'px';
}
function hideTooltip(){
  tooltip.classList.remove('visible');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs){
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}

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

// Shared by both the tables and the charts, so the two never disagree.
// Returns [{ key, count, principal, interest, total, paid, unpaid }],
// sorted by key descending (most-recent/most-relevant first — charts
// re-sort their own copy where a different order reads better).
function computeGroups(filtered, keyFn){
  const groups = new Map();
  filtered.forEach(l => {
    const key = keyFn(l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  });

  return [...groups.entries()]
    .map(([key, items]) => {
      const principal = items.reduce((s, l) => s + l.principal, 0);
      const interest = items.reduce((s, l) => s + l.principal * (rate / 100), 0);
      const total = principal + interest;
      const paid = items.filter(l => l.paid).reduce((s, l) => s + loanTotal(l), 0);
      return { key, count: items.length, principal, interest, total, paid, unpaid: total - paid };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

function renderTable(tbody, groups){
  tbody.innerHTML = '';
  if (groups.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">ไม่มีรายการตรงกับตัวกรองนี้</td></tr>';
    return;
  }
  groups.forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${g.key}</td>
      <td>${g.count}</td>
      <td class="amount">${formatMoney(g.principal)}</td>
      <td class="amount">${formatMoney(g.interest)}</td>
      <td class="amount"><strong>${formatMoney(g.total)}</strong></td>
      <td class="amount">${formatMoney(g.paid)}</td>
      <td class="amount ${g.unpaid > 0 ? 'overdue' : ''}">${formatMoney(g.unpaid)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Stacked bar chart (paid + unpaid) across time, oldest-to-newest left to
// right so it reads as "change over time". Thin bars, 4px rounded
// data-ends only on the outward-facing corners of each stack, 2px surface
// gap between the two segments, recessive gridlines, a value label on the
// total only (not every segment — selective labeling).
function renderStackedBarChart(container, groups){
  container.innerHTML = '';
  if (groups.length === 0){
    container.innerHTML = '<div class="chart-empty">ไม่มีข้อมูลให้แสดงกราฟ</div>';
    return;
  }

  const chrono = [...groups].sort((a, b) => a.key.localeCompare(b.key));
  const maxTotal = Math.max(...chrono.map(g => g.total), 1);

  const barW = 34, gap = 18, padL = 48, padR = 16, padT = 28, padB = 34;
  const plotH = 180;
  const width = padL + padR + chrono.length * (barW + gap) - gap;
  const height = padT + plotH + padB;

  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'กราฟแท่งยอดชำระแล้ว/ค้างชำระตามช่วงเวลา' });

  // gridlines (4 horizontal steps)
  for (let i = 0; i <= 4; i++){
    const y = padT + plotH - (plotH * i / 4);
    svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, class: 'chart-grid-line' }));
    const label = svgEl('text', { x: padL - 8, y: y + 3, class: 'chart-axis-label', 'text-anchor': 'end' });
    label.textContent = formatMoney(maxTotal * i / 4);
    svg.appendChild(label);
  }

  chrono.forEach((g, i) => {
    const x = padL + i * (barW + gap);
    const paidH = maxTotal ? (g.paid / maxTotal) * plotH : 0;
    const unpaidH = maxTotal ? (g.unpaid / maxTotal) * plotH : 0;
    const baseY = padT + plotH;

    if (g.paid > 0){
      const paidY = baseY - paidH;
      const rect = svgEl('rect', {
        x, y: paidY, width: barW, height: Math.max(paidH, 1),
        class: 'chart-bar-paid', rx: 4,
      });
      wireTooltip(rect, g, 'ชำระแล้ว', g.paid);
      svg.appendChild(rect);
    }
    if (g.unpaid > 0){
      const gapPx = g.paid > 0 ? 2 : 0;
      const unpaidY = baseY - paidH - unpaidH - gapPx;
      const rect = svgEl('rect', {
        x, y: unpaidY, width: barW, height: Math.max(unpaidH, 1),
        class: 'chart-bar-unpaid', rx: 4,
      });
      wireTooltip(rect, g, 'ค้างชำระ', g.unpaid);
      svg.appendChild(rect);
    }

    const totalLabel = svgEl('text', {
      x: x + barW / 2, y: baseY - paidH - unpaidH - 8,
      class: 'chart-value-label', 'text-anchor': 'middle',
    });
    totalLabel.textContent = formatMoney(g.total);
    svg.appendChild(totalLabel);

    const axisLabel = svgEl('text', {
      x: x + barW / 2, y: baseY + 18,
      class: 'chart-axis-label', 'text-anchor': 'middle',
    });
    axisLabel.textContent = g.key.length > 10 ? g.key.slice(0, 9) + '…' : g.key;
    svg.appendChild(axisLabel);
  });

  container.appendChild(svg);
}

// Ranked horizontal bar chart — one hue (magnitude by identity, not a
// fixed small category set), sorted descending by total, value labeled at
// the bar's end.
function renderRankedBarChart(container, groups){
  container.innerHTML = '';
  if (groups.length === 0){
    container.innerHTML = '<div class="chart-empty">ไม่มีข้อมูลให้แสดงกราฟ</div>';
    return;
  }

  const ranked = [...groups].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(...ranked.map(g => g.total), 1);

  const barH = 22, gap = 12, padL = 96, padR = 64, padT = 8;
  const plotW = 360;
  const width = padL + plotW + padR;
  const height = padT + ranked.length * (barH + gap) - gap + 8;

  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'กราฟแท่งยอดรวมแยกตามผู้กู้' });

  ranked.forEach((g, i) => {
    const y = padT + i * (barH + gap);
    const w = maxTotal ? Math.max((g.total / maxTotal) * plotW, 2) : 2;

    const nameLabel = svgEl('text', {
      x: padL - 10, y: y + barH / 2 + 4, class: 'chart-axis-label', 'text-anchor': 'end',
    });
    nameLabel.textContent = g.key.length > 14 ? g.key.slice(0, 13) + '…' : g.key;
    svg.appendChild(nameLabel);

    const rect = svgEl('rect', { x: padL, y, width: w, height: barH, class: 'chart-bar-single', rx: 4 });
    wireTooltip(rect, g, 'ยอดรวม', g.total);
    svg.appendChild(rect);

    const valueLabel = svgEl('text', {
      x: padL + w + 8, y: y + barH / 2 + 4, class: 'chart-value-label',
    });
    valueLabel.textContent = formatMoney(g.total);
    svg.appendChild(valueLabel);
  });

  container.appendChild(svg);
}

function wireTooltip(el, group, segmentLabel, segmentValue){
  el.addEventListener('mousemove', (evt) => {
    showTooltip(evt, `
      <div class="tt-title">${group.key}</div>
      <div>${segmentLabel}: ${formatMoney(segmentValue)}</div>
      <div>ยอดรวมทั้งหมด: ${formatMoney(group.total)} (${group.count} รายการ)</div>
    `);
  });
  el.addEventListener('mouseleave', hideTooltip);
}

function render(){
  const filtered = applyFilters();
  renderSummary(filtered);

  const borrowerGroups = computeGroups(filtered, l => l.name);
  renderTable(els.borrowerReportBody, borrowerGroups);
  renderRankedBarChart(els.borrowerChart, borrowerGroups);

  const periodKeyFn = view === 'month'
    ? (l => monthKeyOf(l) ? monthLabel(monthKeyOf(l)) : 'ไม่ระบุวันที่')
    : (l => yearOf(l) || 'ไม่ระบุวันที่');

  els.periodTableTitle.textContent = view === 'month' ? 'แยกตามเดือน' : 'แยกตามปี';
  els.periodColHeader.textContent = view === 'month' ? 'เดือน' : 'ปี';

  const periodGroups = computeGroups(filtered, periodKeyFn);
  renderTable(els.periodReportBody, periodGroups);
  renderStackedBarChart(els.periodChart, periodGroups);
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
