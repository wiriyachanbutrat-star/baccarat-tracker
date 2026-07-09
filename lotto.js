const els = {
  errorLine: document.getElementById('errorLine'),
  modeNumber: document.getElementById('modeNumber'),
  modeReason: document.getElementById('modeReason'),
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
  els.modeNumber.textContent = '— — — —';
  els.modeReason.textContent = 'กรอกผลย้อนหลังให้ครบ 5 งวดแล้วกดคำนวณ';
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

  const positional = positionalMode(draws);
  const modeDigits = positional.map(p => p.digit);
  const modeStr = modeDigits.join('');
  els.modeNumber.textContent = modeStr;

  const tieCount = positional.filter(p => p.tied.length > 1).length;
  els.modeReason.textContent = tieCount === 0
    ? `นำเลขที่ออกบ่อยที่สุดในแต่ละหลัก (พัน-ร้อย-สิบ-หน่วย) จาก 5 งวดที่กรอกมาต่อกัน`
    : `นำเลขที่ออกบ่อยที่สุดในแต่ละหลักมาต่อกัน — มี ${tieCount} หลักที่คะแนนเท่ากันหลายตัว ระบบเลือกเลขที่น้อยที่สุดในกลุ่มที่เท่ากันให้`;

  const avgValue = Math.round(draws.reduce((sum, d) => sum + Number(d.join('')), 0) / draws.length);
  els.avgNumber.textContent = String(avgValue).padStart(4, '0');

  els.reverseNumber.textContent = modeStr.split('').reverse().join('');

  const freq = overallFrequency(draws);
  renderFreqGrid(freq);

  const maxCount = Math.max(...freq);
  const hot = freq.map((c, d) => ({ d, c })).filter(x => x.c === maxCount && maxCount > 0).map(x => x.d);
  const cold = freq.map((c, d) => ({ d, c })).filter(x => x.c === 0).map(x => x.d);
  els.hotDigits.textContent = hot.length ? hot.join(', ') : 'ไม่มี (ทุกเลขออกเท่า ๆ กัน)';
  els.coldDigits.textContent = cold.length ? cold.join(', ') : 'ไม่มี (ครบทุกเลข 0-9)';
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
