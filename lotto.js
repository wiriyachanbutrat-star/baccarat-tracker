const POSITION_NAMES = ['หลักพัน', 'หลักร้อย', 'หลักสิบ', 'หลักหน่วย'];

const els = {
  errorLine: document.getElementById('errorLine'),
  trendNumber: document.getElementById('trendNumber'),
  trendReason: document.getElementById('trendReason'),
  trendDetail: document.getElementById('trendDetail'),
  modeNumber: document.getElementById('modeNumber'),
  avgNumber: document.getElementById('avgNumber'),
  reverseNumber: document.getElementById('reverseNumber'),
  freqGrid: document.getElementById('freqGrid'),
  hotDigits: document.getElementById('hotDigits'),
  coldDigits: document.getElementById('coldDigits'),
};

const inputs = Array.from(document.querySelectorAll('.draw-input'));

document.getElementById('btn-calc').addEventListener('click', calculate);
document.getElementById('btn-clear').addEventListener('click', clearAll);

function clearAll(){
  inputs.forEach(inp => { inp.value = ''; inp.classList.remove('invalid'); });
  els.errorLine.textContent = '';
  els.trendNumber.textContent = '— — — —';
  els.trendReason.textContent = 'กรอกผลย้อนหลังให้ครบ 5 งวดแล้วกดคำนวณ';
  els.trendDetail.innerHTML = '';
  els.modeNumber.textContent = '—';
  els.avgNumber.textContent = '—';
  els.reverseNumber.textContent = '—';
  els.hotDigits.textContent = '—';
  els.coldDigits.textContent = '—';
  renderFreqGrid(new Array(10).fill(0));
}

function readDraws(){
  const draws = [];
  let ok = true;
  inputs.forEach(inp => {
    const v = inp.value.trim();
    const valid = /^\d{4}$/.test(v);
    inp.classList.toggle('invalid', v.length > 0 && !valid);
    if (valid) draws.push(v.split('').map(Number));
    else ok = false;
  });
  return ok ? draws : null;
}

function calculate(){
  const draws = readDraws();
  if (!draws){
    els.errorLine.textContent = 'กรอกเลข 4 หลักให้ครบทั้ง 5 งวดก่อนครับ (เช่น 3452)';
    return;
  }
  els.errorLine.textContent = '';

  const trend = trendPrediction(draws);
  const trendStr = trend.map(p => p.predicted).join('');
  els.trendNumber.textContent = trendStr;

  const consistentCount = trend.filter(p => p.consistent).length;
  els.trendReason.textContent = consistentCount === 4
    ? 'ทั้ง 4 หลักมีผลต่างระหว่างงวดสม่ำเสมอ (ค่าเดิมซ้ำทุกช่วง) จึงต่อแนวโน้มจากงวดล่าสุดตรง ๆ'
    : `เทียบผลต่างระหว่างงวดที่ติดกันทีละคู่ในแต่ละหลัก แล้วใช้ผลต่างที่พบบ่อยที่สุดบวกต่อจากงวดล่าสุด (${consistentCount}/4 หลักมีจังหวะสม่ำเสมอ ที่เหลือเลือกจากผลต่างที่ซ้ำบ่อยสุด)`;

  renderTrendDetail(trend);

  const positional = positionalMode(draws);
  els.modeNumber.textContent = positional.map(p => p.digit).join('');

  const avgValue = Math.round(draws.reduce((sum, d) => sum + Number(d.join('')), 0) / draws.length);
  els.avgNumber.textContent = String(avgValue).padStart(4, '0');

  els.reverseNumber.textContent = trendStr.split('').reverse().join('');

  const freq = overallFrequency(draws);
  renderFreqGrid(freq);

  const maxCount = Math.max(...freq);
  const hot = freq.map((c, d) => ({ d, c })).filter(x => x.c === maxCount && maxCount > 0).map(x => x.d);
  const cold = freq.map((c, d) => ({ d, c })).filter(x => x.c === 0).map(x => x.d);
  els.hotDigits.textContent = hot.length ? hot.join(', ') : 'ไม่มี (ทุกเลขออกเท่า ๆ กัน)';
  els.coldDigits.textContent = cold.length ? cold.join(', ') : 'ไม่มี (ครบทุกเลข 0-9)';
}

// For each of the 4 positions, compares each draw to the one right before
// it (mod 10, since digits wrap 0-9) to get a sequence of 4 differences.
// The most common difference in that sequence is treated as "the trend" and
// added to the newest draw's digit to project the next one. If every
// difference in the sequence matches, the trend is fully consistent.
function trendPrediction(draws){
  const result = [];
  for (let pos = 0; pos < 4; pos++){
    const diffs = [];
    for (let i = 1; i < draws.length; i++){
      diffs.push(((draws[i][pos] - draws[i - 1][pos]) % 10 + 10) % 10);
    }
    const counts = new Array(10).fill(0);
    diffs.forEach(d => counts[d]++);
    const maxCount = Math.max(...counts);
    const bestDiff = counts.findIndex(c => c === maxCount);
    const consistent = diffs.every(d => d === diffs[0]);
    const lastDigit = draws[draws.length - 1][pos];
    const predicted = (lastDigit + bestDiff) % 10;
    result.push({ pos, diffs, bestDiff, consistent, lastDigit, predicted });
  }
  return result;
}

function renderTrendDetail(trend){
  els.trendDetail.innerHTML = '';
  trend.forEach(p => {
    const row = document.createElement('div');
    row.className = 'trend-row';
    const diffText = p.diffs.map(d => '+' + d).join(', ');
    row.innerHTML = `
      <span class="trend-pos">${POSITION_NAMES[p.pos]}</span>
      <span class="trend-diffs">Δ ${diffText}</span>
      <span class="trend-calc">${p.lastDigit} ${p.bestDiff >= 0 ? '+' : ''}${p.bestDiff} → <strong>${p.predicted}</strong></span>
    `;
    els.trendDetail.appendChild(row);
  });
}

// For each of the 4 positions (thousands, hundreds, tens, units), finds the
// digit that appeared most often across the 5 draws at that position. Ties
// are broken by picking the smallest digit, but reported so the UI can be
// upfront about it.
function positionalMode(draws){
  const result = [];
  for (let pos = 0; pos < 4; pos++){
    const counts = new Array(10).fill(0);
    draws.forEach(d => counts[d[pos]]++);
    const maxCount = Math.max(...counts);
    const tied = counts.map((c, digit) => ({ digit, c })).filter(x => x.c === maxCount).map(x => x.digit);
    result.push({ digit: tied[0], tied, count: maxCount });
  }
  return result;
}

function overallFrequency(draws){
  const counts = new Array(10).fill(0);
  draws.forEach(d => d.forEach(digit => counts[digit]++));
  return counts;
}

function renderFreqGrid(freq){
  els.freqGrid.innerHTML = '';
  const maxCount = Math.max(...freq, 1);
  for (let digit = 0; digit <= 9; digit++){
    const tile = document.createElement('div');
    tile.className = 'freq-tile';
    const pct = Math.round((freq[digit] / maxCount) * 100);
    tile.innerHTML = `
      <div class="freq-digit">${digit}</div>
      <div class="freq-count">${freq[digit]} ครั้ง</div>
      <div class="freq-bar"><span style="width:${pct}%"></span></div>
    `;
    els.freqGrid.appendChild(tile);
  }
}

// initial
renderFreqGrid(new Array(10).fill(0));
