// --- หวยช่อง 1: แยกเลขแต่ละหลัก -----------------------------------------
const channel1Input = document.getElementById('channel1');
const channel1Digits = document.getElementById('channel1Digits');

function renderChannel1Digits(){
  const value = channel1Input.value.trim();
  const tiles = channel1Digits.querySelectorAll('.freq-digit');
  tiles.forEach((tile, idx) => {
    tile.textContent = value[idx] ?? '—';
  });
}

channel1Input.addEventListener('input', renderChannel1Digits);
renderChannel1Digits();

// --- คำนวณผล 3 ตัว: หลักแสน + หลักหมื่น + หลักสิบ ------------------------
const result3 = document.getElementById('result3');
const result3Old = document.getElementById('result3Old');

function renderResult3(){
  const value = channel1Input.value.trim();
  if (!/^\d{6}$/.test(value)){
    result3Old.textContent = '—';
    result3.textContent = '— — —';
    return;
  }
  const digits = value.split('').map(Number);
  const sum = digits[0] + digits[1] + digits[4];
  const units = sum % 10;
  result3Old.textContent = units;
  result3.textContent = (units + 1) % 10;
}

channel1Input.addEventListener('input', renderResult3);
renderResult3();

// --- สูตรชุดที่สอง: หลักหมื่น + หลักสิบ + หลักหน่วย ----------------------
const result3b = document.getElementById('result3b');
const result3bOld = document.getElementById('result3bOld');

function renderResult3b(){
  const value = channel1Input.value.trim();
  if (!/^\d{6}$/.test(value)){
    result3bOld.textContent = '—';
    result3b.textContent = '—';
    return;
  }
  const digits = value.split('').map(Number);
  const sum = digits[1] + digits[4] + digits[5];
  const plus3 = (sum + 3) % 10;
  result3bOld.textContent = plus3;
  result3b.textContent = (plus3 + 1) % 10;
}

channel1Input.addEventListener('input', renderResult3b);
renderResult3b();

// --- สูตรชุดที่สาม: หลักร้อย + หลักสิบ + หลักหน่วย ------------------------
const result3c = document.getElementById('result3c');
const result3cOld = document.getElementById('result3cOld');

function renderResult3c(){
  const value = channel1Input.value.trim();
  if (!/^\d{6}$/.test(value)){
    result3cOld.textContent = '—';
    result3c.textContent = '—';
    return;
  }
  const digits = value.split('').map(Number);
  const sum = digits[3] + digits[4] + digits[5];
  const units = sum % 10;
  result3cOld.textContent = units;
  result3c.textContent = (units + 1) % 10;
}

channel1Input.addEventListener('input', renderResult3c);
renderResult3c();

// --- ผล 3 ตัว: จับคู่ทุกชุด (เดิม/+1) -------------------------------------
const comboGroupOld = document.getElementById('comboGroupOld');
const comboGroupNew = document.getElementById('comboGroupNew');

function renderCombos(){
  if (!/^\d{6}$/.test(channel1Input.value.trim())){
    comboGroupOld.innerHTML = '';
    comboGroupNew.innerHTML = '';
    return;
  }

  const aOld = Number(result3Old.textContent);
  const aNew = Number(result3.textContent);
  const bOld = Number(result3bOld.textContent);
  const bNew = Number(result3b.textContent);
  const cOld = Number(result3cOld.textContent);
  const cNew = Number(result3c.textContent);

  function buildCombos(a){
    const combos = [];
    for (const b of [bOld, bNew]){
      for (const c of [cOld, cNew]){
        combos.push(`${a}${b}${c}`);
      }
    }
    return combos;
  }

  comboGroupOld.innerHTML = buildCombos(aOld)
    .map(c => `<div class="combo-tile">${c}</div>`).join('');
  comboGroupNew.innerHTML = buildCombos(aNew)
    .map(c => `<div class="combo-tile">${c}</div>`).join('');
}

channel1Input.addEventListener('input', renderCombos);
renderCombos();

// --- คำนวณหวย 2 ตัว สูตรแรก: หลักแสน x 3 + หลักหน่วย ----------------------
const result2a = document.getElementById('result2a');
const result2aOld = document.getElementById('result2aOld');

function renderResult2a(){
  const value = channel1Input.value.trim();
  if (!/^\d{6}$/.test(value)){
    result2aOld.textContent = '—';
    result2a.textContent = '—';
    return;
  }
  const digits = value.split('').map(Number);
  const sum = digits[0] * 3 + digits[5];
  const units = sum % 10;
  result2aOld.textContent = units;
  result2a.textContent = (units + 1) % 10;
}

channel1Input.addEventListener('input', renderResult2a);
renderResult2a();

// --- คำนวณหวย 2 ตัว สูตรสอง: หลักหมื่น x 2 + หลักหน่วย --------------------
const result2b = document.getElementById('result2b');
const result2bOld = document.getElementById('result2bOld');
const result2bPlus2 = document.getElementById('result2bPlus2');

function renderResult2b(){
  const value = channel1Input.value.trim();
  if (!/^\d{6}$/.test(value)){
    result2bOld.textContent = '—';
    result2b.textContent = '—';
    result2bPlus2.textContent = '—';
    return;
  }
  const digits = value.split('').map(Number);
  const sum = digits[1] * 2 + digits[5];
  const units = sum % 10;
  result2bOld.textContent = units;
  result2b.textContent = (units + 1) % 10;
  result2bPlus2.textContent = (units + 2) % 10;
}

channel1Input.addEventListener('input', renderResult2b);
renderResult2b();

// --- คำนวณหวย 2 ตัว: จับคู่สูตรแรก x สูตรสอง ------------------------------
const combo2GroupOld = document.getElementById('combo2GroupOld');
const combo2GroupNew = document.getElementById('combo2GroupNew');

function renderCombos2(){
  if (!/^\d{6}$/.test(channel1Input.value.trim())){
    combo2GroupOld.innerHTML = '';
    combo2GroupNew.innerHTML = '';
    return;
  }

  const aOld = result2aOld.textContent;
  const aNew = result2a.textContent;
  const bValues = [result2bOld.textContent, result2b.textContent, result2bPlus2.textContent];

  function buildCombos(a){
    return bValues.map(b => `${a}${b}`);
  }

  combo2GroupOld.innerHTML = buildCombos(aOld)
    .map(c => `<div class="combo-tile">${c}</div>`).join('');
  combo2GroupNew.innerHTML = buildCombos(aNew)
    .map(c => `<div class="combo-tile">${c}</div>`).join('');
}

channel1Input.addEventListener('input', renderCombos2);
renderCombos2();
