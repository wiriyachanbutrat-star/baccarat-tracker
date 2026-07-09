const rounds = [];
const MULTIPLIERS = [1, 2, 4]; // ทบ 3 ไม้: x1 -> x2 -> x4 แล้วตัดจบกลับไม้ 1
const WARMUP_ROUNDS = 6; // ต้องบันทึกผลอย่างน้อย 6 ตาก่อน ถึงจะเริ่มแนะนำ/แทงจริง

// Standard 8-deck baccarat probabilities (widely published reference odds).
// House edge per 1 unit staked, after Banker's 5% commission on wins.
const ODDS = {
  P: 0.4462, B: 0.4586, T: 0.0952,
  edgeP: 0.0124, edgeB: 0.0106, edgeT: 0.1436,
};

const els = {
  total: document.getElementById('total'),
  playerCount: document.getElementById('player-count'),
  bankerCount: document.getElementById('banker-count'),
  tieCount: document.getElementById('tie-count'),
  playerPct: document.getElementById('player-pct'),
  bankerPct: document.getElementById('banker-pct'),
  suggestCall: document.getElementById('suggest-call'),
  suggestReason: document.getElementById('suggest-reason'),
  chipIcon: document.getElementById('chipIcon'),
  rounds: document.getElementById('rounds'),
  beadGrid: document.getElementById('beadGrid'),
  streakLine: document.getElementById('streakLine'),
  barP: document.getElementById('barP'),
  barB: document.getElementById('barB'),
  barT: document.getElementById('barT'),
  btnUndo: document.getElementById('btn-undo'),
  baseBet: document.getElementById('baseBet'),
  stepsIndicator: document.getElementById('stepsIndicator'),
  nextBetAmount: document.getElementById('nextBetAmount'),
  stepTag: document.getElementById('stepTag'),
  moneyWins: document.getElementById('moneyWins'),
  moneyLosses: document.getElementById('moneyLosses'),
  moneyPushes: document.getElementById('moneyPushes'),
  netProfit: document.getElementById('netProfit'),
  hitRate: document.getElementById('hitRate'),
  maxStep: document.getElementById('maxStep'),
  moneyLog: document.getElementById('moneyLog'),
  tableStatus: document.getElementById('tableStatus'),
  tableStatusTitle: document.getElementById('tableStatusTitle'),
  tableStatusReasons: document.getElementById('tableStatusReasons'),
}

document.getElementById('btn-player').addEventListener('click', ()=>addResult('P'))
document.getElementById('btn-banker').addEventListener('click', ()=>addResult('B'))
document.getElementById('btn-tie').addEventListener('click', ()=>addResult('T'))
document.getElementById('btn-undo').addEventListener('click', undo)
document.getElementById('btn-clear').addEventListener('click', clearAll)
els.baseBet.addEventListener('input', updateUI)

function addResult(r){
  rounds.push({r,winner:r});
  updateUI();
}

function undo(){
  rounds.pop();
  updateUI();
}

function clearAll(){
  rounds.length = 0;
  updateUI();
}

function computeStats(){
  let player=0,banker=0,tie=0;
  for(const x of rounds){
    if(x.winner==='P') player++;
    else if(x.winner==='B') banker++;
    else if(x.winner==='T') tie++;
  }
  const total = player+banker+tie;
  const pPct = total? Math.round((player/total)*100):0;
  const bPct = total? Math.round((banker/total)*100):0;
  return {player,banker,tie,total,pPct,bPct};
}

function currentStreakFor(winners){
  let len = 0;
  let side = null;
  for (let i = winners.length - 1; i >= 0; i--){
    const r = winners[i];
    if (r === 'T') continue;
    if (side === null){ side = r; len = 1; continue; }
    if (r === side){ len++; } else { break; }
  }
  return { side, len };
}

// Baccarat hands are independent draws from a freshly-tracked shoe: no
// streak, chop, or ratio read from past results shifts the probability of
// the next hand. The only lever that is actually "accurate" in expectation
// is picking the side with the better long-run edge — Banker, even after
// its 5% commission, edges out Player (-1.06% vs -1.24% per unit staked).
// The recommendation is therefore constant and does not depend on history.
function getSuggestion(){
  return {
    pick: 'B',
    confidence: 'อิง Expected Value',
    reasonText: `อิงความน่าจะเป็นมาตรฐานของบาคาร่า 8 副 ไม่ใช่การอ่านแนวโน้มจากประวัติ เพราะแต่ละตาเป็นอิสระทางสถิติ: Banker ชนะ ${(ODDS.B*100).toFixed(2)}% ต่อ Player ${(ODDS.P*100).toFixed(2)}% แม้หักค่าคอมมิชชัน 5% แล้ว Banker ยังขาดทุนคาดหวังต่อหน่วยน้อยกว่า (${(-ODDS.edgeB*100).toFixed(2)}% เทียบ ${(-ODDS.edgeP*100).toFixed(2)}%)`,
  };
}

// Replays the history: the first WARMUP_ROUNDS results are observation only
// (no bet placed, nothing tallied) so there's a baseline read on the room
// before any money moves. From round 7 onward every round is bet on the
// fixed EV pick above, compared to the actual result to drive the 3-step
// (1x/2x/4x) progression. A cycle only counts as "เสีย" once all 3 steps
// have lost in a row — a loss on step 1 or 2 just carries it forward.
function simulateMoney(baseBet){
  let step = 0; // 0-indexed into MULTIPLIERS
  let netProfit = 0;
  let wins = 0, losses = 0, pushes = 0, maxStep = 1;
  let consecutiveLosses = 0, maxConsecutiveLosses = 0;
  const log = [];
  const sugg = getSuggestion();

  for (let i = WARMUP_ROUNDS; i < rounds.length; i++){
    const actual = rounds[i].winner;
    const betAmount = baseBet * MULTIPLIERS[step];
    maxStep = Math.max(maxStep, step + 1);

    if (actual === 'T'){
      pushes++;
      log.push({ round: i + 1, step: step + 1, pick: sugg.pick, actual, betAmount, outcome: 'push', profit: 0 });
      continue;
    }

    if (actual === sugg.pick){
      wins++;
      consecutiveLosses = 0;
      const commission = actual === 'B' ? 0.95 : 1;
      const profit = betAmount * commission;
      netProfit += profit;
      log.push({ round: i + 1, step: step + 1, pick: sugg.pick, actual, betAmount, outcome: 'win', profit });
      step = 0;
    } else {
      netProfit -= betAmount;
      const isFinalStep = step === MULTIPLIERS.length - 1;
      if (isFinalStep){
        losses++;
        consecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      }
      log.push({ round: i + 1, step: step + 1, pick: sugg.pick, actual, betAmount, outcome: isFinalStep ? 'loss' : 'carry', profit: -betAmount });
      step = isFinalStep ? 0 : step + 1;
    }
  }

  return { step, netProfit, wins, losses, pushes, maxStep, log, consecutiveLosses, maxConsecutiveLosses };
}

// Bankroll-management guardrail: flags when this table looks bad enough
// that the honest advice is to stop and walk away, not "bet smarter".
// None of these thresholds change the underlying math (still independent
// hands) — they're a practical stop-loss/tilt check on the session so far.
function evaluateTableHealth(sim, baseBet){
  const decided = sim.wins + sim.losses;
  const hitRatePct = decided ? (sim.wins / decided) * 100 : null;
  const lossMultiple = baseBet > 0 ? -sim.netProfit / baseBet : 0;
  const reasons = [];

  if (sim.consecutiveLosses >= 2){
    reasons.push(`แพ้ครบ 3 ไม้ติดต่อกัน ${sim.consecutiveLosses} รอบซ้อน`);
  }
  if (decided >= 5 && hitRatePct < 35){
    reasons.push(`อัตราถูกแค่ ${Math.round(hitRatePct)}% จาก ${decided} รอบที่ตัดสินแล้ว (ต่ำกว่าเกณฑ์ 35%)`);
  }
  if (lossMultiple >= 5){
    reasons.push(`ขาดทุนสะสมแล้ว ${formatMoney(lossMultiple)} เท่าของเงินเดิมพันตั้งต้น`);
  }

  return { shouldStop: reasons.length > 0, reasons, decided, hitRatePct };
}

function renderBeadRoad(){
  els.beadGrid.innerHTML = '';
  const winners = rounds.map(x=>x.winner);
  const rows = 6;
  const cols = Math.max(1, Math.ceil(winners.length / rows) + 1);
  const cells = new Array(rows * cols).fill(null);
  winners.forEach((r, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    cells[col * rows + row] = r;
  });
  cells.forEach(r => {
    const el = document.createElement('div');
    if (r === null){
      el.className = 'bead-empty';
    } else {
      el.className = 'bead ' + (r === 'P' ? 'player' : r === 'B' ? 'banker' : 'tie');
      el.textContent = r;
      el.title = r === 'P' ? 'Player' : r === 'B' ? 'Banker' : 'เสมอ';
    }
    els.beadGrid.appendChild(el);
  });
  els.beadGrid.parentElement.scrollLeft = els.beadGrid.scrollWidth;
}

function renderRecommendation(sim, baseBet){
  const chip = els.chipIcon;
  const call = els.suggestCall;
  const reason = els.suggestReason;

  if (rounds.length < WARMUP_ROUNDS){
    const remaining = WARMUP_ROUNDS - rounds.length;
    chip.className = 'side-chip none';
    chip.textContent = String(rounds.length);
    call.textContent = `กำลังเก็บข้อมูล (${rounds.length}/${WARMUP_ROUNDS} ตา)`;
    reason.textContent = `บันทึกผลอีก ${remaining} ตาก่อน ระบบจะเริ่มแนะนำฝั่งที่ควรแทงและจำนวนเงิน`;
    els.nextBetAmount.textContent = '—';
    els.stepTag.textContent = `รออีก ${remaining} ตา`;
    return;
  }

  const sugg = getSuggestion();
  chip.className = 'side-chip ' + (sugg.pick === 'P' ? 'player' : 'banker');
  chip.textContent = sugg.pick;
  call.textContent = `แทง ${sugg.pick === 'P' ? 'Player' : 'Banker'} — ${sugg.confidence}`;
  reason.textContent = sugg.reasonText;

  const nextAmount = baseBet * MULTIPLIERS[sim.step];
  els.nextBetAmount.textContent = '฿' + formatMoney(nextAmount);
  els.stepTag.textContent = `ไม้ ${sim.step + 1}/${MULTIPLIERS.length}`;
}

function renderTableStatus(sim, baseBet){
  const health = evaluateTableHealth(sim, baseBet);
  const box = els.tableStatus;

  if (!health.shouldStop){
    box.className = 'table-status ok';
    els.tableStatusTitle.textContent = health.decided === 0
      ? 'ยังไม่มีข้อมูลพอประเมินห้องนี้'
      : 'ห้องนี้ยังอยู่ในเกณฑ์ปกติ เล่นต่อได้';
    els.tableStatusReasons.innerHTML = '';
    return;
  }

  box.className = 'table-status bad';
  els.tableStatusTitle.textContent = 'ห้องนี้ไม่ควรเล่นต่อ — แนะนำเปลี่ยนห้อง';
  els.tableStatusReasons.innerHTML = '';
  health.reasons.forEach(r => {
    const li = document.createElement('li');
    li.textContent = r;
    els.tableStatusReasons.appendChild(li);
  });
}

function renderMoney(sim){
  els.stepsIndicator.querySelectorAll('.step-chip').forEach((el, idx) => {
    el.classList.toggle('active', idx === sim.step);
  });

  els.moneyWins.textContent = sim.wins;
  els.moneyLosses.textContent = sim.losses;
  els.moneyPushes.textContent = sim.pushes;
  els.maxStep.textContent = sim.maxStep;

  const decided = sim.wins + sim.losses;
  els.hitRate.textContent = decided ? Math.round((sim.wins / decided) * 100) + '%' : '0%';

  els.netProfit.textContent = (sim.netProfit >= 0 ? '+' : '-') + '฿' + formatMoney(Math.abs(sim.netProfit));
  els.netProfit.className = sim.netProfit > 0 ? 'pos' : sim.netProfit < 0 ? 'neg' : '';

  els.moneyLog.innerHTML = '';
  if (sim.log.length === 0){
    const li = document.createElement('li');
    li.className = 'money-log-empty';
    li.textContent = rounds.length < WARMUP_ROUNDS
      ? `ยังอยู่ในช่วงเก็บข้อมูล (${rounds.length}/${WARMUP_ROUNDS} ตา) ยังไม่เริ่มแทงจริง`
      : 'ยังไม่มีตาที่เดิมพัน กดบันทึกผลด้านบนเพื่อเริ่ม';
    els.moneyLog.appendChild(li);
    return;
  }
  sim.log.slice().reverse().slice(0, 12).forEach(entry => {
    const li = document.createElement('li');
    const sideLabel = entry.pick === 'P' ? 'Player' : 'Banker';
    const outcomeLabel = entry.outcome === 'win' ? 'ถูก'
      : entry.outcome === 'loss' ? 'เสีย (ครบ 3 ไม้)'
      : entry.outcome === 'carry' ? 'แพ้ไม้นี้ (ทบต่อ)'
      : 'เสมอ';
    const signedProfit = entry.profit > 0 ? '+฿' + formatMoney(entry.profit) : entry.profit < 0 ? '-฿' + formatMoney(Math.abs(entry.profit)) : '฿0';
    li.innerHTML = `<span>ตา ${entry.round} · ไม้ ${entry.step} · แทง ${sideLabel} ฿${formatMoney(entry.betAmount)}</span><span class="tag ${entry.outcome}">${outcomeLabel} ${signedProfit}</span>`;
    els.moneyLog.appendChild(li);
  });
}

function formatMoney(n){
  return Math.round(n).toLocaleString('th-TH');
}

function updateUI(){
  const s = computeStats();
  els.total.textContent = s.total;
  els.playerCount.textContent = s.player;
  els.bankerCount.textContent = s.banker;
  els.tieCount.textContent = s.tie;
  els.playerPct.textContent = '(' + s.pPct + '%)';
  els.bankerPct.textContent = '(' + s.bPct + '%)';

  const total = s.total || 1;
  els.barP.style.width = (s.player / total * 100) + '%';
  els.barB.style.width = (s.banker / total * 100) + '%';
  els.barT.style.width = (s.tie / total * 100) + '%';

  if (s.total === 0){
    els.streakLine.innerHTML = 'รวมรอบ: <strong>0</strong>';
  } else {
    const streak = currentStreakFor(rounds.map(x=>x.winner));
    if (streak.side && streak.len > 0){
      const name = streak.side === 'P' ? 'Player' : 'Banker';
      els.streakLine.innerHTML = `รวมรอบ: <strong>${s.total}</strong> · สตรีคปัจจุบัน: <strong>${name} ${streak.len} ตาติด</strong>`;
    } else {
      els.streakLine.innerHTML = `รวมรอบ: <strong>${s.total}</strong> · เสมอเป็นผลล่าสุด`;
    }
  }

  renderBeadRoad();

  const baseBet = Math.max(1, Number(els.baseBet.value) || 100);
  const sim = simulateMoney(baseBet);
  renderRecommendation(sim, baseBet);
  renderMoney(sim);
  renderTableStatus(sim, baseBet);

  els.btnUndo.disabled = rounds.length === 0;

  els.rounds.innerHTML = '';
  rounds.slice().reverse().forEach((r)=>{
    const li = document.createElement('li');
    let text = r.winner==='P'? 'Player' : (r.winner==='B'? 'Banker' : 'เสมอ');
    li.textContent = text;
    els.rounds.appendChild(li);
  });
}

// initial
updateUI();
