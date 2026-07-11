const rounds = [];
// ทบ 3 ไม้: x1 -> x1.5 -> x2 แล้วตัดจบกลับไม้ 1. Softened from the original
// [1,2,4] (a full 3-step loss cost 7x baseBet) to [1,1.5,2] (4.5x) -- same
// idea (bigger bet after a loss), but a losing cycle now costs about 36%
// less, since a full 3-step loss is common enough (~10% of cycles from
// testing) that its size matters more than the win-side upside.
const MULTIPLIERS = [1, 1.5, 2];
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
  accGauge: document.getElementById('accGauge'),
  accGaugeArc: document.getElementById('accGaugeArc'),
  accGaugePct: document.getElementById('accGaugePct'),
  accGaugeSub: document.getElementById('accGaugeSub'),
  suggestReason: document.getElementById('suggest-reason'),
  chipIcon: document.getElementById('chipIcon'),
  rounds: document.getElementById('rounds'),
  beadGrid: document.getElementById('beadGrid'),
  bigRoadGrid: document.getElementById('bigRoadGrid'),
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
  roomFit: document.getElementById('roomFit'),
  roomFitTitle: document.getElementById('roomFitTitle'),
  roomFitGood: document.getElementById('roomFitGood'),
  roomFitBad: document.getElementById('roomFitBad'),
  tieStreakText: document.getElementById('tieStreakText'),
  gameFix: document.getElementById('gameFix'),
  gameFixTitle: document.getElementById('gameFixTitle'),
  gameFixText: document.getElementById('gameFixText'),
  bebStrip: document.getElementById('bebStrip'),
  bebLatest: document.getElementById('bebLatest'),
  oddEvenLine: document.getElementById('oddEvenLine'),
}

document.getElementById('btn-player').addEventListener('click', ()=>addResult('P'))
document.getElementById('btn-banker').addEventListener('click', ()=>addResult('B'))
document.getElementById('btn-tie').addEventListener('click', ()=>addResult('T'))
document.getElementById('btn-undo').addEventListener('click', undo)
document.getElementById('btn-clear').addEventListener('click', clearAll)
document.getElementById('btn-reset-stats').addEventListener('click', clearAll)
document.getElementById('btn-reset-money').addEventListener('click', resetMoney)
els.baseBet.addEventListener('input', updateUI)

// Keyboard shortcuts for fast entry while watching a live table: P/B/T add a
// result, Z or Backspace undoes the last one. Ignored while typing in an
// input (e.g. the base-bet field) so they don't hijack normal text entry.
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = e.key.toLowerCase();
  if (key === 'p'){ e.preventDefault(); addResult('P'); }
  else if (key === 'b'){ e.preventDefault(); addResult('B'); }
  else if (key === 't'){ e.preventDefault(); addResult('T'); }
  else if (key === 'z' || key === 'backspace'){ e.preventDefault(); undo(); }
});

function addResult(r){
  rounds.push({r,winner:r});
  updateUI();
}

function undo(){
  rounds.pop();
  updateUI();
}

// Scoped to the money-management card: resets the base bet back to its
// default without touching the recorded rounds, stats, or history —
// "รีเซ็ตทั้งหมด" (btn-clear) is the one that clears everything.
function resetMoney(){
  els.baseBet.value = 20;
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

function nonTieFor(winners){
  return winners.filter(r => r !== 'T');
}

// Hands since the last Tie (or since the start, if none yet). Standard
// 8-deck odds put Tie at 9.52% per hand, so it "should" land roughly every
// ~10.5 hands on average — this is just an observed gap, not a prediction:
// ties are exactly as independent as everything else in this game.
function tieGapFor(winners){
  let gap = 0;
  for (let i = winners.length - 1; i >= 0; i--){
    if (winners[i] === 'T') break;
    gap++;
  }
  return gap;
}

// Groups a winners sequence into Big Road columns: consecutive same-side
// wins stack into the same column; a change of side starts a new column;
// ties don't break a column, they're just skipped (Big Road doesn't track
// them beyond an overlay marker, which isn't needed for the road math).
function buildBigRoadColumns(winners){
  const columns = [];
  let lastSide = null;
  for (const w of winners){
    if (w === 'T') continue;
    if (lastSide === null || w !== lastSide){
      columns.push([w]);
      lastSide = w;
    } else {
      columns[columns.length - 1].push(w);
    }
  }
  return columns;
}

// Same grouping as buildBigRoadColumns, but keeps a tie counter per cell
// (attached to whichever cell was most recently plotted) purely for the
// Big Road grid's overlay marker — the road math never needs tie counts.
function buildBigRoadCells(winners){
  const columns = [];
  let lastSide = null;
  for (const w of winners){
    if (w === 'T'){
      if (columns.length){
        const col = columns[columns.length - 1];
        col[col.length - 1].ties++;
      }
      continue;
    }
    if (lastSide === null || w !== lastSide){
      columns.push([{ side: w, ties: 0 }]);
      lastSide = w;
    } else {
      columns[columns.length - 1].push({ side: w, ties: 0 });
    }
  }
  return columns;
}

const sideName = s => (s === 'B' ? 'Banker' : 'Player');

// Generalizes "สองตัดหนึ่ง" (Two-Cut-One) to any repeat-length L: if the two
// most recently COMPLETED columns both ran exactly L wins before switching,
// that's a rhythm. While the current (rightmost) column is still shorter
// than L, predict it keeps going to complete the unit; once it reaches L,
// predict the rhythm cuts to the other side next. `strength` is a confidence
// score (0-100) for how confirmed this read is — longer, stricter rhythms
// score higher — NOT a claim about the actual win probability, which stays
// at the game's fixed base rate regardless.
function detectCutRhythm(columns, L, label, strength){
  if (columns.length < 3) return null;
  const last = columns[columns.length - 1];
  const prev2 = columns[columns.length - 2];
  const prev3 = columns[columns.length - 3];
  if (prev2.length !== L || prev3.length !== L) return null;

  const lastLen = last.length;
  const lastSide = last[0];

  if (lastLen < L){
    return {
      pick: lastSide,
      label,
      strength,
      reasonText: `จังหวะก่อนหน้าออกซ้ำ ${L} ตาแล้วสลับต่อเนื่อง (${label}) คาดว่าฝั่ง ${sideName(lastSide)} จะออกซ้ำอีกตาให้ครบชุด`,
    };
  }
  if (lastLen === L){
    const pick = lastSide === 'P' ? 'B' : 'P';
    return {
      pick,
      label,
      strength,
      reasonText: `ฝั่ง ${sideName(lastSide)} ออกครบ ${L} ตาตามจังหวะ${label}แล้ว คาดว่าจะตัดสลับไปฝั่ง ${sideName(pick)}`,
    };
  }
  return null; // streak ran past L, the rhythm already broke
}

// Checks strongest/most specific reads first (Dragon, Ping-Pong, the
// confirmed cut-rhythms), each requiring a longer confirmed run before it
// counts. detectOddEven() is deliberately NOT included here — it almost
// always matches (a column's length is always even or odd), so wiring it in
// made the system bet nearly every round instead of waiting for a real
// pattern, which tested out to noticeably worse results (see git history).
// It's kept as a display-only read (renderOddEven) instead. Each match here
// carries a `strength` (0-100) confidence score reflecting how well-confirmed
// the read is (e.g. a longer dragon scores higher) — this is the pattern's
// own confidence in itself, not the game's real win probability.
function detectNamedPattern(columns){
  if (columns.length === 0) return null;
  const last = columns[columns.length - 1];
  const lastLen = last.length;
  const lastSide = last[0];

  if (lastLen >= 4){
    const strength = Math.min(90, 70 + (lastLen - 4) * 4);
    return {
      pick: lastSide,
      label: 'มังกร (Dragon)',
      strength,
      reasonText: `${sideName(lastSide)} ออกติดต่อกัน ${lastLen} ตา (มังกร) — นักเล่นแพทเทิร์นมักแทงตามมังกรต่อจนกว่าจะหัก`,
    };
  }

  if (columns.length >= 6 && columns.slice(-6).every(c => c.length === 1)){
    const pick = lastSide === 'P' ? 'B' : 'P';
    return {
      pick,
      label: 'ปิงปอง (Ping Pong)',
      strength: 65,
      reasonText: `Banker/Player สลับกันไปมาต่อเนื่องอย่างน้อย 6 ตา (ปิงปอง) จึงมองว่าจะสลับต่อไปทางฝั่ง ${sideName(pick)}`,
    };
  }

  const fourCut = detectCutRhythm(columns, 4, 'สี่ตัดหนึ่ง (Four-Cut-One)', 68);
  if (fourCut) return fourCut;

  const threeCut = detectCutRhythm(columns, 3, 'สามตัดหนึ่ง (Three-Cut-One)', 66);
  if (threeCut) return threeCut;

  const twoCut = detectCutRhythm(columns, 2, 'สองตัดหนึ่ง (Two-Cut-One)', 63);
  if (twoCut) return twoCut;

  return null;
}

// "คู่-คี่" (odd/even): weakest, last-resort read — looks at whether the
// CURRENT (still-open) column's length is even or odd. Even ("คู่") reads as
// "the streak keeps going", odd ("คี่") reads as "due to switch". Checked
// dead last, after every stronger named pattern has failed to match, and
// scored low (50-58) on the confidence gauge since it's the least-confirmed
// heuristic here — same disclaimer as every other pattern: this doesn't
// change the real win probability, which never moves off the game's fixed
// base rate no matter how this column's length parity falls.
function detectOddEven(columns){
  if (columns.length === 0) return null;
  const last = columns[columns.length - 1];
  const lastLen = last.length;
  const lastSide = last[0];
  const isEven = lastLen % 2 === 0;

  if (isEven){
    return {
      pick: lastSide,
      label: 'คู่-คี่ (Odd-Even)',
      parity: 'even',
      strength: Math.min(58, 52 + lastLen),
      reasonText: `คอลัมน์ปัจจุบันของฝั่ง ${sideName(lastSide)} ยาว ${lastLen} ตา (เลขคู่) จึงมองว่ายังไปต่อในฝั่งเดิม — เป็นการอ่านที่มั่นใจต่ำสุดในระบบนี้`,
    };
  }
  const pick = lastSide === 'P' ? 'B' : 'P';
  return {
    pick,
    label: 'คู่-คี่ (Odd-Even)',
    parity: 'odd',
    strength: 50,
    reasonText: `คอลัมน์ปัจจุบันของฝั่ง ${sideName(lastSide)} ยาว ${lastLen} ตา (เลขคี่) จึงมองว่าใกล้ถึงตาตัดสลับไปฝั่ง ${sideName(pick)} — เป็นการอ่านที่มั่นใจต่ำสุดในระบบนี้`,
  };
}

// Big Eye Boy ("เค้าตาแดง/ตาน้ำเงินเล็ก") is a road *derived* from Big Road:
// it doesn't look at P/B directly, but compares the shape of the current
// Big Road column against the column one before it. Red = the columns match
// (same length, or the gap between the last two column-lengths repeats) —
// read as "the pattern repeats" (Banker signal on physical scoreboards).
// Blue = they don't match — "the pattern breaks" (Player signal). Only
// plots once there are enough columns to compare.
function deriveBigEyeBoy(columns){
  const points = [];
  const k = 1;
  for (let c = 0; c < columns.length; c++){
    for (let r = 0; r < columns[c].length; r++){
      if (r > 0){
        if (c - k < 0) continue;
        points.push({ c, r, color: columns[c - k].length > r ? 'red' : 'blue' });
      } else {
        if (c - k - 1 < 0) continue;
        points.push({ c, r, color: columns[c - k].length === columns[c - k - 1].length ? 'red' : 'blue' });
      }
    }
  }
  return points;
}

// Only reads the strongest, clearest named Big Road patterns (Dragon,
// Ping-Pong, Four/Three/Two-Cut-One). Big Eye Boy stays as a visual-only
// strip (deriveBigEyeBoy/renderBigEyeBoy) — it's a weak derived signal and
// is deliberately NOT used to trigger a bet recommendation. The user asked
// for recommendations only when confident, not on every round, so anything
// short of a strong named pattern honestly reports "ไม่มีเค้า" (no pattern)
// rather than forcing a guess every round.
// Important: baccarat hands are independent draws — none of this actually
// shifts the probability of the next hand. Real long-run accuracy sits at
// the game's base rate (~45-50%), same as a coin flip weighted by house odds.
function getSuggestion(winners){
  if (winners.length === 0){
    return { pick: null, confidence: null, strength: null, reasonText: 'ยังไม่มีข้อมูลให้วิเคราะห์' };
  }
  const nt = nonTieFor(winners);
  if (nt.length === 0){
    return { pick: null, confidence: null, strength: null, reasonText: 'มีแต่ผลเสมอในประวัติ ลองบันทึกผล Player หรือ Banker เพิ่มอีกสักตา' };
  }

  const columns = buildBigRoadColumns(winners);
  const named = detectNamedPattern(columns);
  if (named){
    return { pick: named.pick, confidence: named.label, strength: named.strength, reasonText: named.reasonText };
  }

  return { pick: null, confidence: null, strength: null, reasonText: 'ไม่มีเค้าที่มั่นใจพอ (No Pattern) — ยังไม่เข้ารูปแบบมังกร, ปิงปอง, สี่ตัดหนึ่ง, สามตัดหนึ่ง หรือสองตัดหนึ่งที่ชัดเจนพอจะแนะนำ ระบบจะรอจนกว่าจะมั่นใจ' };
}

// "วิเคราะห์สวนทาง" (fade/contrarian): if the last full 3-step cycle lost,
// flip the freshly-read pattern's pick for the NEXT cycle instead of
// repeating it. Requested as "the technical opposite side" when the normal
// read keeps losing. Important: flipping sides doesn't change the real win
// probability at all — Banker/Player stay at their fixed base rates no
// matter which one gets picked — so this is just a different heuristic to
// choose a side, not a way to beat the math. Labeled honestly in the UI.
function getFinalSuggestion(winners, consecutiveLosses){
  const sugg = getSuggestion(winners);
  if (!sugg.pick || consecutiveLosses < 1) return { ...sugg, faded: false };

  const faded = sugg.pick === 'P' ? 'B' : 'P';
  return {
    pick: faded,
    confidence: `${sugg.confidence} (สวนทาง)`,
    strength: sugg.strength,
    faded: true,
    reasonText: `แนวทางเดิม (${sugg.confidence}) แพ้ครบ 3 ไม้มาแล้ว ${consecutiveLosses} รอบซ้อน ระบบเลยวิเคราะห์สวนทางแทน โดยกลับไปแทงฝั่งตรงข้าม (${faded === 'P' ? 'Player' : 'Banker'}) — การสวนทางไม่ได้ทำให้โอกาสชนะจริงเปลี่ยนไป ยังคงอยู่ที่ค่าพื้นฐานของเกมเหมือนเดิม`,
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

  for (let i = WARMUP_ROUNDS; i < rounds.length; i++){
    const priorWinners = rounds.slice(0, i).map(x => x.winner);
    const sugg = getFinalSuggestion(priorWinners, consecutiveLosses);
    if (!sugg.pick) continue;

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

// Compares the currently-active named pattern against what's ACTUALLY been
// coming out recently. A pattern read (e.g. "มังกร Banker") is only useful
// while reality keeps agreeing with it; if the last several non-tie hands
// are dominated by the opposite side, the pattern has likely already broken
// even though the rule that detected it hasn't caught up yet. This fires
// immediately — independent of win/loss — as soon as the mismatch appears,
// rather than waiting for a loss to surface it.
function evaluateStatMismatch(winners, sugg){
  // Skip when the current pick is already a fade: fading deliberately bets
  // against the recent trend, so comparing it to recent stats would almost
  // always "mismatch" and throw a contradictory alert right next to the
  // fade's own reasoning.
  if (!sugg.pick || sugg.faded) return null;
  const nt = nonTieFor(winners);
  const windowSize = Math.min(10, nt.length);
  if (windowSize < 6) return null;

  const recent = nt.slice(-windowSize);
  const pCount = recent.filter(r => r === 'P').length;
  const bCount = recent.filter(r => r === 'B').length;
  const pPct = (pCount / windowSize) * 100;
  const bPct = (bCount / windowSize) * 100;
  const dominant = pPct > bPct ? 'P' : bPct > pPct ? 'B' : null;
  const dominantPct = Math.max(pPct, bPct);

  if (dominant && dominant !== sugg.pick && dominantPct >= 65){
    return {
      severity: 'mismatch',
      title: 'สถิติจริงกับแพทเทิร์นไม่ตรงกัน — แก้เกมทันที',
      text: `${windowSize} ตาหลังสุด ฝั่ง ${sideName(dominant)} ออกจริงถึง ${Math.round(dominantPct)}% แต่แพทเทิร์นที่จับได้ (${sugg.confidence}) ยังชี้ไปทาง ${sideName(sugg.pick)} — สัญญาณว่าเค้าที่อ่านอยู่อาจกำลังหักเปลี่ยนไปแล้ว ควรพิจารณาความเสี่ยงก่อนแทงไม้นี้ หรือรอให้แพทเทิร์นจับสอดคล้องกับสถิติจริงก่อน`,
    };
  }
  return null;
}

// "แก้เกม" (game-fix) advisory: triggers right after a loss. Since
// getSuggestion() re-reads the Big Road from scratch every round anyway,
// there's no separate "broken strategy" to swap out — the honest fix here is
// just to surface, in plain language, what just happened and what the
// freshly re-read pattern says now, so a loss doesn't get chased blindly.
function evaluateGameFix(sim, freshSugg){
  const last = sim.log[sim.log.length - 1];
  if (!last || last.outcome === 'win' || last.outcome === 'push') return null;

  const lastSideName = last.pick === 'P' ? 'Player' : 'Banker';

  if (last.outcome === 'carry'){
    const nextPick = freshSugg.pick;

    // Lost 2 steps in a row (about to bet the final, highest-stake step) —
    // treat this as urgent: re-read the pattern right now rather than
    // waiting for the full 3-step cycle to lose before flagging it.
    if (last.step >= 2){
      const switched = nextPick && nextPick !== last.pick;
      return {
        severity: 'urgent',
        title: `ผิดมาแล้ว 2 ไม้ติด (แทง ${lastSideName}) — รีบวิเคราะห์ใหม่ด่วน`,
        text: nextPick
          ? `ไม้สุดท้าย (x4) กำลังจะมาถึง ระบบอ่าน Big Road ปัจจุบันใหม่ทันที และ${switched ? `เปลี่ยนฝั่งเป็น ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) แล้ว เพราะรูปแบบเปลี่ยนไปจากเดิม` : `ยังคงชี้ไปทาง ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) เหมือนเดิม แต่ผิดมาแล้ว 2 ไม้ ให้ทบทวนก่อนลงไม้สุดท้าย`}`
          : `ไม้สุดท้าย (x4) กำลังจะมาถึง แต่ตอนนี้อ่าน Big Road ใหม่แล้วไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์) — ควรพิจารณาหยุดไม้นี้แทนที่จะฝืนแทงต่อ`,
      };
    }

    return {
      severity: 'carry',
      title: `แพ้ไม้ ${last.step} เมื่อกี้ (แทง ${lastSideName})`,
      text: nextPick
        ? `กำลังทบไปไม้ถัดไป ระบบวิเคราะห์รูปแบบใหม่จาก Big Road ปัจจุบันแล้ว ไม้นี้ชี้ไปทาง ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) — ไม่ใช่การไล่ตามฝั่งเดิมโดยอัตโนมัติ`
        : `กำลังทบไปไม้ถัดไป แต่ตอนนี้ยังไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์) พิจารณาความเสี่ยงก่อนเดิมพันไม้ถัดไป`,
    };
  }

  // last.outcome === 'loss': lost the full 3-step cycle.
  const nextPick = freshSugg.pick;
  return {
    severity: 'loss',
    title: `แพ้ครบ 3 ไม้ล่าสุด (เสียเต็มรอบ)`,
    text: nextPick
      ? `รอบใหม่เริ่มที่ไม้ 1 ระบบวิเคราะห์ Big Road ใหม่ทั้งหมดแล้ว รอบนี้ชี้ไปทาง ${nextPick === 'P' ? 'Player' : 'Banker'} (${freshSugg.confidence}) หากแพ้ติดกันหลายรอบให้ดูสถานะห้องด้านล่างประกอบการตัดสินใจเปลี่ยนโต๊ะ`
      : `รอบใหม่เริ่มที่ไม้ 1 แต่ตอนนี้ยังไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์) หากแพ้ติดกันหลายรอบให้ดูสถานะห้องด้านล่างประกอบการตัดสินใจเปลี่ยนโต๊ะ`,
  };
}

// A "which room to sit at" read, separate from table-status (which is about
// whether to keep playing once you're already betting). Replays the whole
// session the same way simulateMoney does — for each round after the first,
// ask getSuggestion what the prior rounds implied — and scores how often a
// named pattern actually showed up (readability), how often ties interrupt
// play, and whether a pattern is live right now. A room that reads easily
// and doesn't tie constantly is what pattern players look for on the
// physical scoreboard before sitting down; this mirrors that read using the
// session recorded so far.
function evaluateRoomFit(consecutiveLosses){
  const winners = rounds.map(x => x.winner);
  const total = winners.length;

  if (total < WARMUP_ROUNDS){
    return { verdict: 'pending', remaining: WARMUP_ROUNDS - total };
  }

  let readable = 0;
  for (let i = 1; i < winners.length; i++){
    if (getSuggestion(winners.slice(0, i)).pick) readable++;
  }
  const readabilityPct = Math.round((readable / (winners.length - 1)) * 100);

  const ties = winners.filter(w => w === 'T').length;
  const tiePct = Math.round((ties / total) * 100);

  // Same fade-aware pick as the recommend card, so this box never names a
  // different side than what's actually being bet right now.
  const current = getFinalSuggestion(winners, consecutiveLosses);
  const good = [];
  const bad = [];

  if (readabilityPct >= 40){
    good.push(`รูปแบบขึ้นให้เห็นบ่อย (${readabilityPct}% ของตาที่ผ่านมาเข้ารูปแบบใดรูปแบบหนึ่ง)`);
  } else {
    bad.push(`รูปแบบยังไม่ค่อยชัดเจน (อ่านออกแค่ ${readabilityPct}% ของตาที่ผ่านมา)`);
  }

  if (tiePct > 12){
    bad.push(`เสมอบ่อยกว่าปกติ (${tiePct}% ของตาทั้งหมด ปกติควรอยู่ราว 9-10%)`);
  } else {
    good.push(`อัตราเสมออยู่ในเกณฑ์ปกติ (${tiePct}%)`);
  }

  if (current.pick){
    good.push(`ตอนนี้กำลังเข้าจังหวะ ${current.confidence}`);
  } else {
    bad.push('ตอนนี้ยังไม่เข้ารูปแบบไหนชัดเจน (รอวิเคราะห์)');
  }

  const verdict = good.length > bad.length ? 'good' : good.length === bad.length ? 'neutral' : 'bad';
  return { verdict, good, bad, readabilityPct, tiePct };
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

// Renders a faithful Big Road grid: consecutive same-side wins stack
// vertically in one column (max 6 rows); once a column hits 6 rows, a
// continuing streak overflows sideways along the bottom row (the classic
// "dragon tail") instead of growing a 7th row. Ties overlay a small count
// badge on the cell they landed on rather than taking their own cell.
function renderBigRoad(){
  const winners = rounds.map(x => x.winner);
  const columns = buildBigRoadCells(winners);
  const grid = els.bigRoadGrid;
  grid.innerHTML = '';

  const ROWS = 6;
  const cellMap = new Map();
  let visualCol = 0;

  columns.forEach(colCells => {
    const startCol = visualCol;
    colCells.forEach((cell, idx) => {
      if (idx < ROWS){
        cellMap.set(`${startCol},${idx}`, cell);
      } else {
        const overflowCol = startCol + (idx - ROWS + 1);
        cellMap.set(`${overflowCol},${ROWS - 1}`, cell);
      }
    });
    const consumed = colCells.length <= ROWS ? 1 : (colCells.length - ROWS + 1);
    visualCol = startCol + consumed;
  });

  const totalCols = Math.max(visualCol, 1) + 1;
  grid.style.gridTemplateColumns = `repeat(${totalCols}, 22px)`;

  for (let r = 0; r < ROWS; r++){
    for (let c = 0; c < totalCols; c++){
      const cell = cellMap.get(`${c},${r}`);
      const el = document.createElement('div');
      if (!cell){
        el.className = 'bigroad-empty';
      } else {
        el.className = 'bigroad-cell ' + (cell.side === 'P' ? 'player' : 'banker');
        el.textContent = cell.side;
        el.title = cell.side === 'P' ? 'Player' : 'Banker';
        if (cell.ties > 0){
          const tie = document.createElement('span');
          tie.className = 'bigroad-tie';
          tie.textContent = cell.ties > 1 ? String(cell.ties) : '';
          tie.title = `เสมอ ${cell.ties} ครั้ง`;
          el.appendChild(tie);
        }
      }
      grid.appendChild(el);
    }
  }
  grid.parentElement.scrollLeft = grid.parentElement.scrollWidth;
}

function renderBigEyeBoy(){
  const winners = rounds.map(x => x.winner);
  const columns = buildBigRoadColumns(winners);
  const points = deriveBigEyeBoy(columns);

  els.bebStrip.innerHTML = '';
  const shown = points.slice(-16);
  if (shown.length === 0){
    els.bebStrip.innerHTML = '<span class="beb-empty">ยังไม่มีข้อมูลพอ</span>';
  } else {
    shown.forEach(p => {
      const dot = document.createElement('span');
      dot.className = 'beb-dot ' + p.color;
      els.bebStrip.appendChild(dot);
    });
  }

  const latest = points.length ? points[points.length - 1].color : null;
  els.bebLatest.className = 'beb-latest' + (latest ? ' ' + latest : '');
  els.bebLatest.textContent = latest === 'red' ? 'แดง · Banker' : latest === 'blue' ? 'น้ำเงิน · Player' : 'รอข้อมูล';
}

// Display-only — not used to trigger a bet (see the comment on
// detectNamedPattern for why). Just shows what the odd/even read of the
// current column would say, for reference alongside the other roads.
function renderOddEven(){
  const winners = rounds.map(x => x.winner);
  const columns = buildBigRoadColumns(winners);
  const read = detectOddEven(columns);
  els.oddEvenLine.textContent = read
    ? `${read.parity === 'even' ? 'คู่' : 'คี่'} → มองไปทาง ${sideName(read.pick)}: ${read.reasonText}`
    : 'รอข้อมูล';
}

// Circumference of the gauge ring (r=26): 2 * PI * 26.
const ACC_GAUGE_CIRCUMFERENCE = 163.36;

// Draws the CURRENT suggestion's own confidence score (sugg.strength, 0-100)
// as a ring — how well-confirmed the pattern that fired this round is (a
// longer dragon or a twice-confirmed rhythm scores higher). This is not the
// game's real win probability, which never moves off its fixed base rate —
// it's just how strict a read this particular call is. Hidden whenever
// there's no active pick to score.
function renderConfidenceGauge(sugg){
  if (!sugg.pick || sugg.strength == null){
    els.accGauge.hidden = true;
    return;
  }

  const pct = sugg.strength;
  els.accGauge.hidden = false;
  els.accGauge.className = 'acc-gauge' + (pct >= 70 ? '' : pct >= 60 ? ' warn' : ' bad');
  els.accGaugeArc.style.strokeDashoffset =
    String(ACC_GAUGE_CIRCUMFERENCE * (1 - pct / 100));
  els.accGaugePct.textContent = Math.round(pct) + '%';
  els.accGaugeSub.textContent = `ความมั่นใจของ ${sugg.confidence}`;
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
    els.accGauge.hidden = true;
    return;
  }

  const sugg = getFinalSuggestion(rounds.map(x => x.winner), sim.consecutiveLosses);
  renderConfidenceGauge(sugg);

  if (!sugg.pick){
    chip.className = 'side-chip none';
    chip.textContent = '?';
    call.textContent = 'รอวิเคราะห์';
    reason.textContent = sugg.reasonText;
    els.nextBetAmount.textContent = '—';
    els.stepTag.textContent = `ไม้ ${sim.step + 1}/${MULTIPLIERS.length}`;
    return;
  }

  chip.className = 'side-chip ' + (sugg.pick === 'P' ? 'player' : 'banker');
  chip.textContent = sugg.pick;
  call.textContent = `แทง ${sugg.pick === 'P' ? 'Player' : 'Banker'} — ${sugg.confidence}`;
  reason.textContent = sugg.reasonText;

  const nextAmount = baseBet * MULTIPLIERS[sim.step];
  els.nextBetAmount.textContent = '฿' + formatMoney(nextAmount);
  els.stepTag.textContent = `ไม้ ${sim.step + 1}/${MULTIPLIERS.length}`;
}

function renderGameFix(sim){
  if (rounds.length < WARMUP_ROUNDS){
    els.gameFix.hidden = true;
    return;
  }

  const winners = rounds.map(x => x.winner);
  const freshSugg = getFinalSuggestion(winners, sim.consecutiveLosses);

  const mismatch = evaluateStatMismatch(winners, freshSugg);
  const fix = mismatch || evaluateGameFix(sim, freshSugg);

  if (!fix){
    els.gameFix.hidden = true;
    return;
  }

  els.gameFix.hidden = false;
  els.gameFix.className = 'game-fix ' + fix.severity;
  els.gameFixTitle.textContent = fix.title;
  els.gameFixText.textContent = fix.text;
}

function renderTieLine(){
  const winners = rounds.map(x => x.winner);
  if (winners.length === 0){
    els.tieStreakText.textContent = 'รอข้อมูล';
    return;
  }
  const gap = tieGapFor(winners);
  if (gap === 0){
    els.tieStreakText.textContent = 'เพิ่งออกเสมอตาที่แล้ว';
  } else if (gap >= 15){
    els.tieStreakText.textContent = `ไม่ออกมา ${gap} ตาแล้ว (เกินค่าเฉลี่ย ~10 ตา แต่ EV แทงเสมอแย่ที่สุด −14.36% จึงยังไม่แนะนำ)`;
  } else {
    els.tieStreakText.textContent = `ไม่ออกมา ${gap} ตาแล้ว (เฉลี่ยควรออกทุก ~10 ตา)`;
  }
}

// Note: this only judges bankroll health (losses/hit-rate/drawdown so far),
// a separate concern from evaluateRoomFit's pattern-readability read — the
// two can legitimately disagree (money still fine, but patterns unclear).
// The roomFitVerdict param exists purely so the "ok" copy here doesn't read
// like a blanket "keep playing" when the room-fit box right below is telling
// the user the opposite for a different reason.
function renderTableStatus(sim, baseBet, roomFitVerdict){
  const health = evaluateTableHealth(sim, baseBet);
  const box = els.tableStatus;

  if (!health.shouldStop){
    box.className = 'table-status ok';
    if (health.decided === 0){
      els.tableStatusTitle.textContent = 'ยังไม่มีข้อมูลพอประเมินห้องนี้';
    } else if (roomFitVerdict === 'bad'){
      els.tableStatusTitle.textContent = 'การเงินยังปกติ (ยังไม่ถึงเกณฑ์หยุด) แต่รูปแบบไพ่ยังไม่ชัด — ดูช่องประเมินห้องด้านล่างประกอบ';
    } else {
      els.tableStatusTitle.textContent = 'ห้องนี้ยังอยู่ในเกณฑ์ปกติ เล่นต่อได้';
    }
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

function renderRoomFit(fit){
  const box = els.roomFit;
  els.roomFitGood.innerHTML = '';
  els.roomFitBad.innerHTML = '';

  if (fit.verdict === 'pending'){
    box.className = 'room-fit pending';
    els.roomFitTitle.textContent = `บันทึกผลอีก ${fit.remaining} ตา เพื่อประเมินห้องนี้`;
    return;
  }

  const titles = {
    good: 'ห้องนี้เข้าข่ายน่าเล่นต่อ',
    neutral: 'ห้องนี้ยังกลาง ๆ — ตัดสินใจยากอยู่',
    bad: 'ห้องนี้ยังไม่น่าเข้า ลองพิจารณาห้องอื่น',
  };
  box.className = 'room-fit ' + fit.verdict;
  els.roomFitTitle.textContent = titles[fit.verdict];

  fit.good.forEach(g => {
    const li = document.createElement('li');
    li.className = 'good';
    li.textContent = g;
    els.roomFitGood.appendChild(li);
  });
  fit.bad.forEach(b => {
    const li = document.createElement('li');
    li.className = 'bad';
    li.textContent = b;
    els.roomFitBad.appendChild(li);
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
  renderBigRoad();
  renderBigEyeBoy();
  renderOddEven();

  const baseBet = Math.max(1, Number(els.baseBet.value) || 20);
  const sim = simulateMoney(baseBet);
  renderRecommendation(sim, baseBet);
  renderGameFix(sim);
  renderTieLine();
  renderMoney(sim);
  const fit = evaluateRoomFit(sim.consecutiveLosses);
  renderTableStatus(sim, baseBet, fit.verdict);
  renderRoomFit(fit);

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
