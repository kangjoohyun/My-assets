
// ══════════════════════════════════════════════════
// 무한매수법 V4.0 — 정확한 로직 구현
// ══════════════════════════════════════════════════

function loadMumuDB() {
  try { return JSON.parse(localStorage.getItem('mumuDB') || '[]'); }
  catch(e) { return []; }
}
function saveMumuDB(data) { localStorage.setItem('mumuDB', JSON.stringify(data)); }

let mumuList = loadMumuDB();
let mumuCurId = null;

// ── Star% 공식 ────────────────────────────────────
function calcStarPct(ticker, splits, T) {
  const isSoxl = ticker === 'SOXL';
  if (splits === 40) return isSoxl ? (20 - T) : (15 - 0.75 * T);
  if (splits === 30) return isSoxl ? (20 - (4/3) * T) : (15 - T);  // 30분할
  if (splits === 20) return isSoxl ? (20 - 2 * T) : (15 - 1.5 * T);
  // 기타: 비례 계산
  return isSoxl ? (20 - (40 / splits) * T) : (15 - (30 / splits) * T);
}

// ── T값 계산 ──────────────────────────────────────
// 거래 내역에서 T값을 직접 누적
function calcTFromTrades(port) {
  if (!port.trades || !port.trades.length) return 0;
  let T = 0;
  let holdings = 0; // 실시간 보유수량 추적
  const splits = port.splits;
  port.trades.forEach(tr => {
    if (tr.type === '매수') {
      if (tr.tTag === 'T+1') T += 1;
      else if (tr.tTag === 'T+0.5') T += 0.5;
      else if (tr.tTag === 'T+0.25') T += 0.25;
      else T += 1; // 기본값
      holdings += tr.qty;
    } else if (tr.type === '매도') {
      if (tr.tTag === '퀴터매도') {
        // 퀴터매도: T × 0.75
        T = T * 0.75;
      } else if (tr.tTag === 'MOC') {
        // 리버스 첫날 MOC: 전체 기준 비율
        const divN = splits === 20 ? 10 : 20;
        T = T * (1 - 1 / divN);
      } else {
        // 일반 매도: 매도 비율만큼 T 감소
        // T × (1 - 매도수량/보유수량)
        if (holdings > 0 && tr.qty > 0) {
          const ratio = Math.min(tr.qty / holdings, 1);
          T = T * (1 - ratio);
        }
      }
      holdings = Math.max(0, holdings - tr.qty);
    }
  });
  return Math.round(T * 1000000) / 1000000;
}

// T값을 수동으로 직접 입력하는 경우도 지원
function getT(port) {
  if (port.tManual !== undefined && port.tManual !== null) return port.tManual;
  return calcTFromTrades(port);
}

// ── 보유수량 계산 ──────────────────────────────────
function calcHoldings(port) {
  if (!port.trades) return 0;
  let shares = 0;
  port.trades.forEach(t => {
    if (t.type === '매수') shares += t.qty;
    else shares -= t.qty;
  });
  return Math.max(0, shares);
}

// ── 매입금액 계산 ─────────────────────────────────
function calcInvested(port) {
  if (!port.trades) return 0;
  let invested = 0;
  let holdings = 0;
  port.trades.forEach(t => {
    if (t.type === '매수') {
      invested += t.price * t.qty;
      holdings += t.qty;
    } else {
      // 매도시 평단 기준으로 매입금액 감소
      if (holdings > 0) {
        const avg = invested / holdings;
        invested -= avg * t.qty;
        holdings -= t.qty;
      }
    }
  });
  return Math.max(0, invested);
}

// ── 평단가 계산 ───────────────────────────────────
function calcAvgPrice(port) {
  const invested = calcInvested(port);
  const holdings = calcHoldings(port);
  return holdings > 0 ? invested / holdings : 0;
}

// ── 잔금 계산 ────────────────────────────────────
function calcRemaining(port) {
  if (!port.trades) return port.seed;
  let cash = port.seed;
  port.trades.forEach(t => {
    if (t.type === '매수') cash -= t.price * t.qty * (1 + port.fee/100);
    else cash += t.price * t.qty * (1 - port.fee/100);
  });
  return cash;
}

// ── 1회 매수금 계산 (잔금/(분할-T)) ──────────────
function calcUnitBuy(port) {
  const T = getT(port);
  const remaining = calcRemaining(port);
  const denom = port.splits - T;
  if (denom <= 0) return 0;
  return remaining / denom;
}

// ── 모드 판단 ─────────────────────────────────────
function getMode(port) {
  const T = getT(port);
  const threshold = port.splits - 1; // 40분할→T>39, 20분할→T>19
  if (T > threshold) return 'reverse';
  return 'normal';
}

function getPhase(port) {
  const T = getT(port);
  const half = port.splits / 2;
  if (T === 0) return 'init';
  if (T < half) return 'first';  // 전반전
  if (T < port.splits - 1) return 'second'; // 후반전
  return 'exhaust'; // 소진→리버스
}

// ── 별지점 계산 ───────────────────────────────────
function calcStarPrice(port) {
  const T = getT(port);
  const avg = calcAvgPrice(port);
  if (avg === 0) return 0;
  const starPct = calcStarPct(port.ticker, port.splits, T);
  return Math.round(avg * (1 + starPct / 100) * 100) / 100;
}

// ── 거미줄 매수 (폭락 대비 LOC) ─────────────────────
// 하루 예산 고정, 가격이 낮아질수록 살 수 있는 주수 증가분만 추가 LOC
// 예: 예산 360, 90달러→4주 기준, 72달러→5주 가능이면 1주 추가, 60달러→6주이면 1주 추가...
function calcCrashLOCs(port, starPrice, unitBuy) {
  // 구버전 호환용 (사용 안함)
  return calcCrashLOCsNew(port, starPrice, unitBuy);
}

function calcCrashLOCsNew(port, refPrice, unitBuy) {
  if (!refPrice || !unitBuy || refPrice <= 0) return [];

  // 기준 주수: 현재 기준가에서 살 수 있는 주수
  const baseQty = Math.floor(unitBuy / refPrice);
  if (baseQty <= 0) return [];

  // 패턴: unitBuy / n → n주를 살 수 있는 최대 가격
  // 즉 n주째부터 1주 추가로 살 수 있는 LOC 가격 = unitBuy / n
  const result = [];
  const maxQty = Math.ceil(unitBuy / 10); // 최소 $10까지만 (무한 방지)

  for (let n = baseQty + 2; n <= maxQty && result.length < 8; n++) {
    const price = Math.floor(unitBuy / n * 100) / 100; // 내림 (살 수 있는 최대가)
    if (price <= 0) break;
    result.push({ price, qty: 1 }); // 항상 1주씩 추가
  }

  return result;
}

// ── 오늘의 가이드 계산 ────────────────────────────
function calcGuide(port, currentPrice) {
  const T = getT(port);
  const avg = calcAvgPrice(port);
  const holdings = calcHoldings(port);
  const remaining = calcRemaining(port);
  const unitBuy = calcUnitBuy(port);
  const starPct = calcStarPct(port.ticker, port.splits, T);
  const starPrice = calcStarPrice(port);
  const starBuyPrice = Math.round((starPrice - 0.01) * 100) / 100; // 매수점 = 별지점 - 0.01
  const phase = getPhase(port);
  const mode = getMode(port);
  const targetPct = port.targetPct; // SOXL 20%, TQQQ 15%

  let buyGuides = [];
  let sellGuides = [];
  const crashLOCs = calcCrashLOCsNew(port, starBuyPrice, unitBuy);

  if (mode === 'normal') {
    if (phase === 'init') {
      // 초기: 큰수(현재가 10~15% 위) LOC
      const bigPrice = currentPrice ? Math.round(currentPrice * 1.125 * 100) / 100 : 0;
      const bigQty = bigPrice > 0 ? Math.max(1, Math.floor(unitBuy / bigPrice)) : 0;
      buyGuides = [
        { label: '큰수 LOC (현재가 10~15% 위)', price: bigPrice, qty: bigQty },
      ];
      const crashForInit = calcCrashLOCsNew(port, currentPrice || bigPrice, unitBuy);
      sellGuides = [];
      return { mode, phase, T, starPct, starPrice, buyGuides, sellGuides, crashLOCs: crashForInit };
    }

    if (phase === 'first') {
      // 전반전: 예산 절반씩 → 별지점 / 평단
      // 홀수 주 발생 시 큰금액(별지점) 쪽에 +1
      const halfBudget = unitBuy / 2;
      let starQty = starBuyPrice > 0 ? Math.floor(halfBudget / starBuyPrice) : 0;
      let avgQty  = avg > 0          ? Math.floor(halfBudget / avg)          : 0;

      // 예산 내에서 총비용 계산
      const totalCost = starBuyPrice * starQty + avg * avgQty;
      const leftover = unitBuy - totalCost;

      // 남은 예산으로 주수 추가 (홀수 처리)
      // 큰금액(별지점)에 1주 더 살 수 있는지 먼저 확인
      if (starBuyPrice > 0 && leftover >= starBuyPrice) {
        starQty += 1;
      } else if (avg > 0 && leftover >= avg) {
        // 못 사면 작은금액(평단)에 1주 추가
        avgQty += 1;
      }

      buyGuides = [
        { label: `★or큰수 LOC`, price: starBuyPrice, qty: Math.max(1, starQty) },
        { label: '평단 LOC',     price: Math.round(avg * 100) / 100, qty: Math.max(1, avgQty) },
      ];
    } else {
      // 후반전: 예산 전체를 별지점 LOC
      const starQty = starBuyPrice > 0 ? Math.max(1, Math.floor(unitBuy / starBuyPrice)) : 0;
      buyGuides = [
        { label: `★or큰수 LOC`, price: starBuyPrice, qty: starQty },
      ];
    }

    // 매도 (공통): 퀴터매도 + 지정가(나머지)
    if (holdings > 0 && avg > 0) {
      const quarterQty = Math.floor(holdings / 4);           // 1/4 퀴터매도
      const remainQty  = holdings - quarterQty;              // 나머지 전량 지정가
      const finalTargetPrice = Math.round(avg * (1 + targetPct / 100) * 100) / 100;
      sellGuides = [
        { label: `LOC ★${starPct.toFixed(2)}% (퀴터매도)`, price: starPrice, qty: quarterQty, note: '보유수량의 1/4' },
        { label: `지정가 +${targetPct}% (최종매도)`,       price: finalTargetPrice, qty: remainQty, note: `나머지 ${remainQty}주` },
      ];
    }

  } else {
    // 리버스 모드
    const divN = port.splits === 20 ? 10 : 20;

    // 리버스 별지점: 직전 5거래일 종가 평균 (없으면 현재가 사용)
    const recentPrices = port.recentPrices || [];
    const reverseStarPrice = recentPrices.length >= 5
      ? Math.round(recentPrices.slice(-5).reduce((s,p)=>s+p,0)/5 * 100) / 100
      : (currentPrice || starPrice);

    if (!port._reverseFirstDone) {
      // 첫날: MOC 매도만 (보유수량 / divN)
      const mocQty = Math.floor(holdings / divN);
      sellGuides = [
        { label: `MOC 매도 (1/${divN})`, price: 0, qty: mocQty, note: '무조건 시장가 매도' },
      ];
      buyGuides = [{ label: '첫날은 매수 없음', price: 0, qty: 0 }];
    } else {
      // 두번째 이후: LOC 별지점 위에서 매도 + 잔금/4 매수
      const sellQty = Math.floor(holdings / divN);
      sellGuides = [
        { label: `LOC ★% 매도`, price: reverseStarPrice, qty: sellQty },
      ];
      const buyAmt = remaining / 4;
      const buyQty = reverseStarPrice > 0 ? Math.max(1, Math.floor(buyAmt / reverseStarPrice)) : 0;
      buyGuides = [
        { label: `퀴터매수 (잔금/4)`, price: Math.round((reverseStarPrice - 0.01) * 100)/100, qty: buyQty },
      ];
    }

    return { mode, phase: 'reverse', T, starPct, starPrice: reverseStarPrice, buyGuides, sellGuides, crashLOCs: [] };
  }

  return { mode, phase, T, starPct, starPrice, buyGuides, sellGuides, crashLOCs };
}

// ── 유틸 ──────────────────────────────────────────
function fmtUSD(n, d=2) {
  if (n === null || n === undefined || isNaN(n) || n === 0) return '—';
  return '$' + parseFloat(n).toFixed(d);
}

// ── 렌더 메인 ──────────────────────────────────────
let mumuSubTab = 'active'; // 'active' | 'history'

function renderMumu() {
  mumuList = loadMumuDB();
  const page = document.getElementById('page-mumu');
  if (!page) return;
  page.style.padding = '14px 14px 0';

  // 상세 화면이면 서브탭 없이 바로 렌더
  if (mumuCurId) {
    renderMumuDetail(mumuCurId);
    return;
  }

  // 서브탭 헤더
  const allCycles = loadCycles();
  page.innerHTML = `
    <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:14px">
      <div onclick="mumuSubTab='active';renderMumu()" style="flex:1;padding:9px 4px;font-size:12px;text-align:center;cursor:pointer;border-bottom:2px solid ${mumuSubTab==='active'?'var(--accent)':'transparent'};color:${mumuSubTab==='active'?'var(--accent)':'var(--text3)'}">
        진행중 ${mumuList.length ? '('+mumuList.length+')' : ''}
      </div>
      <div onclick="mumuSubTab='history';renderMumu()" style="flex:1;padding:9px 4px;font-size:12px;text-align:center;cursor:pointer;border-bottom:2px solid ${mumuSubTab==='history'?'var(--accent)':'transparent'};color:${mumuSubTab==='history'?'var(--accent)':'var(--text3)'}">
        이력 ${allCycles.length ? '('+allCycles.length+')' : ''}
      </div>
    </div>
    <div id="mumu-subtab-content"></div>`;

  if (mumuSubTab === 'active') renderMumuList();
  else renderMumuHistory();
}

function renderMumuList() {
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <div class="slbl" style="margin:0">진행중 포트폴리오</div>
    <button class="btn-sm" onclick="showMumuSetup()">＋ 추가</button>
  </div>`;

  if (!mumuList.length) {
    html += `<div class="empty" style="padding:2rem 1rem">
      <div style="font-size:36px;margin-bottom:8px">∞</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">진행중인 포트폴리오 없음</div>
      <div>새 포트폴리오를 시작해보세요</div>
    </div>
    <button class="btn btn-p" style="margin-bottom:12px" onclick="showMumuSetup()">＋ 새 포트폴리오 시작</button>`;
    document.getElementById('mumu-subtab-content').innerHTML = html;
    return;
  }

  mumuList.forEach(port => {
    const T = getT(port);
    const avg = calcAvgPrice(port);
    const holdings = calcHoldings(port);
    const starPct = calcStarPct(port.ticker, port.splits, T);
    const starPrice = avg > 0 ? Math.round(avg * (1 + starPct/100) * 100)/100 : 0;
    const mode = getMode(port);
    const phase = getPhase(port);
    const progress = Math.min(100, T / port.splits * 100);
    const modeLabel = mode === 'reverse' ? '🔴 리버스' : phase === 'second' ? '🟡 후반전' : phase === 'init' ? '⚪ 초기' : '🟢 전반전';

    html += `<div class="card" style="margin-bottom:10px;cursor:pointer" onclick="mumuCurId='${port.id}';renderMumu()">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:15px;font-weight:700">${port.ticker} <span style="font-size:10px;font-family:var(--mono);color:var(--text3);background:var(--bg3);padding:2px 6px;border-radius:4px">${port.version}</span></div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">${port.nickname||''} · ${port.currency} · 시드 $${port.seed.toLocaleString()}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px">${modeLabel}</div>
          <div style="font-family:var(--mono);font-size:12px;margin-top:2px;color:var(--accent)">T=${T.toFixed(2)}</div>
        </div>
      </div>
      <div style="height:4px;background:var(--border2);border-radius:2px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${progress}%;background:${mode==='reverse'?'var(--red)':'var(--accent2)'};border-radius:2px"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;font-size:11px">
        <div><div style="color:var(--text3)">평단</div><div style="font-family:var(--mono);font-weight:600">${avg>0?fmtUSD(avg):'—'}</div></div>
        <div><div style="color:var(--text3)">보유</div><div style="font-family:var(--mono);font-weight:600">${holdings}주</div></div>
        <div><div style="color:var(--text3)">★%</div><div style="font-family:var(--mono);font-weight:600;color:var(--accent2)">${starPct.toFixed(2)}%</div></div>
        <div><div style="color:var(--text3)">★가격</div><div style="font-family:var(--mono);font-weight:600;color:var(--accent3)">${starPrice>0?fmtUSD(starPrice):'—'}</div></div>
      </div>

    </div>`;
  });

  document.getElementById('mumu-subtab-content').innerHTML = html;
}

function renderMumuHistory() {
  const allCycles = loadCycles();
  const container = document.getElementById('mumu-subtab-content');
  if (!container) return;

  if (!allCycles.length) {
    container.innerHTML = `
      <div class="empty" style="padding:3rem 1rem">
        <div style="font-size:36px;margin-bottom:8px">📋</div>
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">완료된 사이클 없음</div>
        <div>사이클이 종료되면 여기에 기록됩니다</div>
      </div>`;
    return;
  }

  // 전체 요약
  const totalProfit = allCycles.reduce((s, cy) => s + cy.profitAmt, 0);
  const winCount = allCycles.filter(cy => cy.profitAmt >= 0).length;
  const totalBuy = allCycles.reduce((s, cy) => s + cy.buyTotal, 0);
  const totalSell = allCycles.reduce((s, cy) => s + cy.sellTotal, 0);

  let html = `
    <div class="stat-grid" style="margin-bottom:12px">
      <div class="stat-card span2" style="border-color:${totalProfit>=0?'rgba(60,184,120,.3)':'rgba(232,84,68,.3)'};background:${totalProfit>=0?'rgba(60,184,120,.05)':'rgba(232,84,68,.05)'}">
        <div class="sc-lbl">누적 실현 손익</div>
        <div class="sc-val" style="color:${totalProfit>=0?'var(--accent3)':'var(--red)'}">${totalProfit>=0?'+':''}${fmtUSD(totalProfit,2)}</div>
        <div class="sc-sub">${allCycles.length}사이클 완료 · 승률 ${Math.round(winCount/allCycles.length*100)}%</div>
      </div>
      <div class="stat-card">
        <div class="sc-lbl">총 매수금</div>
        <div class="sc-val" style="font-size:17px">${fmtUSD(totalBuy,0)}</div>
      </div>
      <div class="stat-card">
        <div class="sc-lbl">총 매도금</div>
        <div class="sc-val" style="font-size:17px">${fmtUSD(totalSell,0)}</div>
      </div>
    </div>`;

  // 종목별 그룹핑
  const grouped = {};
  allCycles.forEach(cy => {
    const key = cy.portId;
    if (!grouped[key]) grouped[key] = { label: cy.ticker + (cy.nickname?' · '+cy.nickname:''), cycles: [] };
    grouped[key].cycles.push(cy);
  });

  Object.values(grouped).forEach(group => {
    const gProfit = group.cycles.reduce((s,cy)=>s+cy.profitAmt, 0);
    const gWin = group.cycles.filter(cy=>cy.profitAmt>=0).length;

    html += `
      <div class="tbl" style="margin-bottom:10px">
        <div style="padding:10px 12px;background:var(--bg3);border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:13px;font-weight:700">${group.label}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:2px">${group.cycles.length}사이클 · 승률 ${Math.round(gWin/group.cycles.length*100)}%</div>
            </div>
            <div style="text-align:right">
              <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:${gProfit>=0?'var(--accent3)':'var(--red)'}">${gProfit>=0?'+':''}${fmtUSD(gProfit,2)}</div>
              <div style="font-size:10px;color:var(--text3)">누적 손익</div>
            </div>
          </div>
        </div>
        ${group.cycles.slice().reverse().map(cy => {
          const days = cy.startDate && cy.endDate
            ? Math.round((new Date(cy.endDate)-new Date(cy.startDate))/(1000*60*60*24))
            : 0;
          return `
          <div style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer" onclick="showCycleDetail('${cy.id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                  <span style="font-size:12px;font-weight:600">사이클 ${cy.cycleNo}</span>
                  <span style="font-size:9px;background:${cy.profitAmt>=0?'rgba(60,184,120,.15)':'rgba(232,84,68,.15)'};color:${cy.profitAmt>=0?'var(--accent3)':'var(--red)'};padding:1px 6px;border-radius:10px">${cy.reason}</span>
                </div>
                <div style="font-size:10px;color:var(--text3)">${cy.startDate} ~ ${cy.endDate} (${days}일)</div>
                <div style="font-size:10px;color:var(--text2);margin-top:2px">매수 ${fmtUSD(cy.buyTotal,0)} · ${cy.trades.length}건 · T=${cy.finalT.toFixed(2)}</div>
              </div>
              <div style="text-align:right;margin-left:10px">
                <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:${cy.profitAmt>=0?'var(--accent3)':'var(--red)'}">${cy.profitAmt>=0?'+':''}${fmtUSD(cy.profitAmt,2)}</div>
                <div style="font-size:10px;color:var(--text3)">${cy.profitPct>=0?'+':''}${cy.profitPct.toFixed(2)}%</div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  });

  // 버튼들
  html += `
    <button class="btn btn-d" style="margin-top:4px;font-size:12px" onclick="clearAllCycles()">이력 전체 삭제</button>
    <button class="btn btn-s" style="margin-top:8px;font-size:11px;color:var(--accent)" onclick="fixCycleData()">🔧 사이클1 데이터 수정 (임시)</button>`;
  container.innerHTML = html;
}

function showCycleDetail(cycleId) {
  const cy = loadCycles().find(c => c.id === cycleId);
  if (!cy) return;
  const days = cy.startDate && cy.endDate
    ? Math.round((new Date(cy.endDate)-new Date(cy.startDate))/(1000*60*60*24))
    : 0;

  const tradesHTML = [...cy.trades].reverse().map((tr, i) => {
    const no = cy.trades.length - i;
    return `<div style="display:grid;grid-template-columns:24px 1fr auto auto auto;gap:4px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
      <span style="color:var(--text3);font-family:var(--mono);font-size:9px">#${no}</span>
      <span style="color:var(--text2)">${tr.date.slice(5)}</span>
      <span class="badge ${tr.type==='매수'?'badge-red':'badge-blue'}" style="font-size:9px">${tr.type} ${tr.tTag||''}</span>
      <span style="font-family:var(--mono)">${fmtUSD(tr.price)}</span>
      <span style="font-family:var(--mono)">${tr.qty}주</span>
    </div>`;
  }).join('');

  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${cy.ticker} ${cy.nickname||''} · 사이클 ${cy.cycleNo}</div>
    <div style="background:var(--bg3);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div><div style="color:var(--text3)">기간</div><div style="font-family:var(--mono);font-size:11px">${cy.startDate}<br>~ ${cy.endDate} (${days}일)</div></div>
        <div><div style="color:var(--text3)">종료 사유</div><div style="font-weight:600">${cy.reason}</div></div>
        <div><div style="color:var(--text3)">최종 T값</div><div style="font-family:var(--mono);font-weight:600;color:var(--accent)">${cy.finalT.toFixed(4)}</div></div>
        <div><div style="color:var(--text3)">거래 건수</div><div style="font-family:var(--mono)">${cy.trades.length}건</div></div>
        <div><div style="color:var(--text3)">총 매수금</div><div style="font-family:var(--mono)">${fmtUSD(cy.buyTotal,2)}</div></div>
        <div><div style="color:var(--text3)">총 매도금</div><div style="font-family:var(--mono)">${fmtUSD(cy.sellTotal,2)}</div></div>
        <div><div style="color:var(--text3)">실현 손익</div><div style="font-family:var(--mono);font-weight:700;color:${cy.profitAmt>=0?'var(--accent3)':'var(--red)'}">${cy.profitAmt>=0?'+':''}${fmtUSD(cy.profitAmt,2)}</div></div>
        <div><div style="color:var(--text3)">수익률</div><div style="font-family:var(--mono);font-weight:700;color:${cy.profitPct>=0?'var(--accent3)':'var(--red)'}">${cy.profitPct>=0?'+':''}${cy.profitPct.toFixed(2)}%</div></div>
      </div>
    </div>
    <div style="font-size:11px;font-weight:600;margin-bottom:6px">거래 내역 (${cy.trades.length}건)</div>
    <div style="max-height:200px;overflow-y:auto">${tradesHTML}</div>
    <button class="btn btn-s" style="margin-top:12px" onclick="closeModal()">닫기</button>
    <button class="btn btn-d" style="margin-top:8px;font-size:12px" onclick="deleteCycle('${cy.id}')">이 사이클 삭제</button>
  `);
}

function deleteCycle(cycleId) {
  if (!confirm('이 사이클 이력을 삭제할까요?')) return;
  const cycles = loadCycles().filter(c => c.id !== cycleId);
  saveCycles(cycles);
  closeModal();
  renderMumu();
  toast('삭제됨');
}

function clearAllCycles() {
  if (!confirm('모든 사이클 이력을 삭제할까요?')) return;
  saveCycles([]);
  renderMumu();
  toast('이력 전체 삭제됨');
}

function renderMumuDetail(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) { mumuCurId = null; renderMumu(); return; }

  const T = getT(port);
  const avg = calcAvgPrice(port);
  const holdings = calcHoldings(port);
  const invested = calcInvested(port);
  const remaining = calcRemaining(port);
  const unitBuy = calcUnitBuy(port);
  const starPct = calcStarPct(port.ticker, port.splits, T);
  const starPrice = calcStarPrice(port);
  const mode = getMode(port);
  const phase = getPhase(port);
  const progress = Math.min(100, T / port.splits * 100);
  const targetPct = port.targetPct;

  const curP = port.lastPrice || 0;
  const guide = calcGuide(port, curP);

  // 수익률
  const retPct = avg > 0 && curP > 0 ? (curP - avg) / avg * 100 : null;
  const retCls = retPct === null ? '' : retPct >= 0 ? 'color:var(--accent3)' : 'color:var(--red)';

  const modeColor = mode === 'reverse' ? 'var(--red)' : 'var(--accent2)';
  const modeTxt = mode === 'reverse' ? '리버스모드' : phase === 'second' ? '후반전' : phase === 'init' ? '초기 매수' : '전반전';

  // 매수 가이드 HTML
  let buyHTML = '';
  if (guide.buyGuides.length && guide.buyGuides[0].price > 0) {
    buyHTML = `<div style="background:rgba(232,84,68,.06);border:1px solid rgba(232,84,68,.2);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="font-size:11px;color:var(--red);font-weight:700;margin-bottom:8px">● 매수 가이드 <span style="font-size:9px;color:var(--text3)">(LOC)</span></div>`;
    guide.buyGuides.forEach(g => {
      if (!g.price) return;
      buyHTML += `<div style="background:rgba(0,0,0,.2);border-radius:8px;padding:10px 12px;margin-bottom:6px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">${g.label}</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--red)">${fmtUSD(g.price)}</div>
          <div style="font-family:var(--mono);font-size:15px;font-weight:600">× ${g.qty}주</div>
        </div>
        ${g.note?`<div style="font-size:10px;color:var(--text3);margin-top:2px">${g.note}</div>`:''}
      </div>`;
    });
    // 폭락 대비
    if (guide.crashLOCs.length) {
      buyHTML += `<div style="margin-top:6px;padding:8px;background:rgba(0,0,0,.15);border-radius:6px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">+@ 폭락 대비 추가 LOC</div>`;
      guide.crashLOCs.forEach(l => {
        buyHTML += `<div style="font-size:12px;color:var(--text2);padding:2px 0;font-family:var(--mono)">- LOC ${fmtUSD(l.price)} × ${l.qty}주</div>`;
      });
      buyHTML += '</div>';
    }
    buyHTML += '</div>';
  }

  // 매도 가이드 HTML
  let sellHTML = '';
  if (guide.sellGuides.length && guide.sellGuides.some(g => g.qty > 0)) {
    sellHTML = `<div style="background:rgba(74,158,255,.06);border:1px solid rgba(74,158,255,.2);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="font-size:11px;color:var(--accent2);font-weight:700;margin-bottom:8px">● 매도 가이드</div>`;
    guide.sellGuides.forEach(g => {
      if (!g.qty) return;
      sellHTML += `<div style="background:rgba(0,0,0,.2);border-radius:8px;padding:10px 12px;margin-bottom:6px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">${g.label}</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--accent2)">${g.price > 0 ? fmtUSD(g.price) : 'MOC'}</div>
          <div style="font-family:var(--mono);font-size:15px;font-weight:600">× ${g.qty}주</div>
        </div>
        ${g.note?`<div style="font-size:10px;color:var(--text3);margin-top:2px">${g.note}</div>`:''}
      </div>`;
    });
    sellHTML += '</div>';
  }

  // 거래 내역
  const trades = [...(port.trades||[])].reverse();
  let tradeHTML = '';
  if (trades.length) {
    tradeHTML = `<div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:5px 4px;color:var(--text3);font-family:var(--mono);font-size:9px;letter-spacing:.08em">NO</th>
        <th style="text-align:left;padding:5px 4px;color:var(--text3)">날짜</th>
        <th style="padding:5px 4px;color:var(--text3)">구분</th>
        <th style="text-align:right;padding:5px 4px;color:var(--text3)">체결가</th>
        <th style="text-align:right;padding:5px 4px;color:var(--text3)">수량</th>
        <th style="text-align:right;padding:5px 4px;color:var(--text3)">T</th>
      </tr></thead><tbody>`;
    trades.forEach((tr, i) => {
      const no = port.trades.length - i;
      const typeCls = tr.type==='매수' ? 'badge-red' : 'badge-blue';
      tradeHTML += `<tr style="border-bottom:1px solid var(--border)" onclick="showMumuTradeDetail('${portId}','${tr.id}')">
        <td style="padding:7px 4px;color:var(--text3);font-family:var(--mono)">#${no}</td>
        <td style="padding:7px 4px;color:var(--text2)">${tr.date.slice(5)}</td>
        <td style="padding:7px 4px;text-align:center"><span class="badge ${typeCls}" style="font-size:9px">${tr.type} ${tr.tTag||''}</span></td>
        <td style="padding:7px 4px;text-align:right;font-family:var(--mono)">${fmtUSD(tr.price)}</td>
        <td style="padding:7px 4px;text-align:right;font-family:var(--mono)">${tr.qty}주</td>
        <td style="padding:7px 4px;text-align:right;font-family:var(--mono);font-size:10px;color:var(--accent)">${tr.tAfter !== undefined ? tr.tAfter.toFixed(2) : ''}</td>
      </tr>`;
    });
    tradeHTML += '</tbody></table></div>';
  } else {
    tradeHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:var(--text3)">거래 내역 없음</div>';
  }

  const page = document.getElementById('page-mumu');
  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button class="icon-btn" onclick="mumuCurId=null;renderMumu()">←</button>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:16px;font-weight:700">${port.ticker}</span>
          <span style="font-size:10px;font-family:var(--mono);color:var(--text3);background:var(--bg3);padding:2px 6px;border-radius:4px">${port.version}</span>
          <span style="font-size:11px;font-weight:600;color:${modeColor}">${modeTxt}</span>
        </div>
        ${port.nickname?`<div style="font-size:10px;color:var(--text3)">${port.nickname}</div>`:''}
      </div>
      <button class="icon-btn" onclick="showMumuMenu('${port.id}')">⋯</button>
    </div>

    <!-- 진행 상황 -->
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600">진행 상황</span>
        <span style="font-family:var(--mono);font-size:12px;color:${modeColor}">${progress.toFixed(1)}%</span>
      </div>
      <div style="height:6px;background:var(--border2);border-radius:3px;overflow:hidden;margin-bottom:12px">
        <div style="height:100%;width:${progress}%;background:${modeColor};border-radius:3px"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px">
        <div><div style="font-size:10px;color:var(--text3)">시드</div><div style="font-family:var(--mono);font-size:13px;font-weight:600">${fmtUSD(port.seed,0)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">매입 금액</div><div style="font-family:var(--mono);font-size:13px;font-weight:600">${fmtUSD(invested,2)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">평단가</div><div style="font-family:var(--mono);font-size:13px;font-weight:600">${avg>0?fmtUSD(avg):'—'}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">보유 수량</div><div style="font-family:var(--mono);font-size:13px;font-weight:600">${holdings}주</div></div>
        <div><div style="font-size:10px;color:var(--text3)">잔금</div><div style="font-family:var(--mono);font-size:13px;font-weight:600">${fmtUSD(remaining,2)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">현재 수익률</div><div style="font-family:var(--mono);font-size:13px;font-weight:600;${retCls}">${retPct!==null?((retPct>=0?'+':'')+retPct.toFixed(2)+'%'):'—'}</div></div>
      </div>
    </div>

    <!-- T값 / Star값 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div class="stat-card" style="background:rgba(232,160,32,.06);border-color:rgba(232,160,32,.2)">
        <div style="font-size:10px;color:var(--text3)">T 값 (진행 회차)</div>
        <div style="font-family:var(--mono);font-size:24px;font-weight:700;color:var(--accent)">${T.toFixed(2)}<span style="font-size:11px">회</span></div>
        <div style="font-size:10px;color:var(--text3)">1회 매수금: ${fmtUSD(unitBuy,2)}</div>
      </div>
      <div class="stat-card" style="background:rgba(74,158,255,.06);border-color:rgba(74,158,255,.2)">
        <div style="font-size:10px;color:var(--text3)">★ 별% / 별지점</div>
        <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--accent2)">${starPct.toFixed(2)}<span style="font-size:11px">%</span></div>
        <div style="font-size:11px;font-family:var(--mono);color:var(--accent3)">${avg>0?fmtUSD(starPrice):'—'}</div>
      </div>
    </div>

    <!-- T값 직접 수정 -->
    <div class="card" style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">T값 수동 수정</div>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="fi" id="mumu-t-manual" type="number" step="0.5" value="${port.tManual !== undefined ? port.tManual : T.toFixed(2)}" style="flex:1">
        <button class="btn-sm" style="white-space:nowrap" onclick="setMumuT('${port.id}')">적용</button>
        <button class="btn-sm" style="white-space:nowrap;color:var(--text3)" onclick="clearMumuT('${port.id}')">자동</button>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">자동: 거래내역 기반 계산 / 수동: 직접 입력</div>
    </div>

    <!-- 현재가 & 가이드 -->
    <div class="card" style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">오늘의 주문 가이드</div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <input class="fi" id="mumu-cur-price" type="number" step="0.01" placeholder="오늘 현재가 (USD)" value="${port.lastPrice||''}" style="flex:1">
        <button id="mumu-price-btn" class="btn-sm" style="padding:0 10px" onclick="autoFillMumuPrice('${port.id}')">🔍</button>
        <button class="btn-sm" style="padding:0 10px" onclick="updateMumuPrice('${port.id}')">계산</button>
      </div>
      ${buyHTML}
      ${sellHTML}
    </div>

    <!-- 거래 내역 -->
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600">거래 내역 (${port.trades?.length||0}건)</span>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="showMumuSmsInput('${port.id}')">📱 문자</button>
          <button class="btn-sm" onclick="showMumuTradeModal('${port.id}')">＋ 입력</button>
        </div>
      </div>
      ${tradeHTML}
    </div>

    <!-- 설정 요약 -->
    <div class="card" style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">설정 & 목표치</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px">
        <div style="color:var(--text3)">분할</div><div style="font-family:var(--mono);text-align:right">${port.splits}일</div>
        <div style="color:var(--text3)">1회 투자금</div><div style="font-family:var(--mono);text-align:right">${fmtUSD(port.seed/port.splits,2)}</div>
        <div style="color:var(--text3)">목표 수익률</div><div style="font-family:var(--mono);text-align:right;color:var(--accent2)">+${port.targetPct}%</div>
        <div style="color:var(--text3)">수수료율</div><div style="font-family:var(--mono);text-align:right">${port.fee}%</div>
        <div style="color:var(--text3)">리버스 발동</div><div style="font-family:var(--mono);text-align:right">T > ${port.splits-1}</div>
        <div style="color:var(--text3)">현재 사이클</div><div style="font-family:var(--mono);text-align:right">${port.cycleNo||1}회차</div>
      </div>
    </div>

    <!-- 사이클 관리 -->
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button class="btn btn-s" style="flex:1;font-size:12px;color:var(--accent3)" onclick="endCycle('${port.id}','수동 종료')">↻ 사이클 종료 & 새 시작</button>
      <button class="btn btn-s" style="flex:1;font-size:12px" onclick="showCycleHistory('${port.id}')">📋 이력</button>
    </div>`;
}

// ── T값 수동 설정 ──────────────────────────────────
function setMumuT(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  const val = parseFloat(document.getElementById('mumu-t-manual').value);
  if (isNaN(val)) { toast('올바른 T값을 입력해 주세요'); return; }
  port.tManual = val;
  saveMumuDB(mumuList);
  renderMumuDetail(portId);
  toast('✓ T값 적용됨: ' + val);
}
function clearMumuT(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  delete port.tManual;
  saveMumuDB(mumuList);
  renderMumuDetail(portId);
  toast('✓ T값 자동 계산으로 전환');
}

// ── 현재가 업데이트 ───────────────────────────────
function updateMumuPrice(portId) {
  const price = parseFloat(document.getElementById('mumu-cur-price').value);
  if (isNaN(price) || price <= 0) { toast('현재가를 입력해 주세요'); return; }
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  port.lastPrice = price;
  // 최근 5거래일 종가 저장
  if (!port.recentPrices) port.recentPrices = [];
  port.recentPrices.push(price);
  if (port.recentPrices.length > 5) port.recentPrices.shift();
  saveMumuDB(mumuList);
  renderMumuDetail(portId);
  toast('✓ 가이드 업데이트됨');
}

// ── 메뉴 ──────────────────────────────────────────
function showMumuMenu(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${port.ticker} ${port.nickname||''}</div>
    <button class="btn btn-s" style="margin-bottom:8px" onclick="closeModal();setTimeout(()=>showMumuSetup('${portId}'),200)">설정 수정</button>
    <button class="btn btn-s" style="margin-bottom:8px;color:var(--accent3)" onclick="closeModal();completeMumu('${portId}')">✓ 사이클 종료 & 새 시작</button>
    <button class="btn btn-s" style="margin-bottom:8px" onclick="closeModal();showCycleHistory('${portId}')">📋 사이클 이력</button>
    <button class="btn btn-d" style="margin-bottom:8px" onclick="closeModal();deleteMumu('${portId}')">포트폴리오 삭제</button>
    <button class="btn btn-s" onclick="closeModal()">취소</button>`);
}
function completeMumu(portId) {
  endCycle(portId, '수동 종료');
}
function deleteMumu(portId) {
  if (!confirm('삭제하시겠습니까?')) return;
  mumuList = mumuList.filter(p => p.id !== portId);
  saveMumuDB(mumuList); mumuCurId = null; renderMumu(); toast('삭제됨');
}

// ── 거래 입력 모달 ────────────────────────────────
function showMumuTradeModal(portId) {
  const port = mumuList.find(p => p.id === portId);
  const T = getT(port);
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">거래 입력</div>
    <div style="font-size:11px;color:var(--accent);margin-bottom:10px">현재 T값: ${T.toFixed(2)}</div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">날짜</div><input class="fi" id="mt-date" type="date" value="${tod()}"></div>
      <div class="form-row"><div class="form-lbl">구분</div>
        <select class="fsel" id="mt-type"><option>매수</option><option>매도</option></select>
      </div>
    </div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">체결가 (USD)</div><input class="fi" id="mt-price" type="number" step="0.01" placeholder="0.00"></div>
      <div class="form-row"><div class="form-lbl">수량 (주)</div><input class="fi" id="mt-qty" type="number" placeholder="0"></div>
    </div>
    <div class="form-row"><div class="form-lbl">T 태그 <span style="font-size:9px;color:var(--text3)" id="mt-tag-hint"></span></div>
      <select class="fsel" id="mt-tag" onchange="updateTTagHint()">
        <option value="T+1">매수 T+1 (1회 전체)</option>
        <option value="T+0.5" selected>매수 T+0.5 (절반)</option>
        <option value="퀴터매도">매도 — 퀴터매도 (T×0.75)</option>
        <option value="지정가매도">매도 — 지정가 (비율만큼 T감소)</option>
        <option value="전량매도">매도 — 전량매도 (T→0)</option>
        <option value="MOC">매도 — MOC (리버스 첫날)</option>
      </select>
    </div>
    <div id="mt-tag-preview" style="font-size:11px;color:var(--accent);font-family:var(--mono);margin:-6px 0 10px;padding:0 2px"></div>
    <button class="btn btn-p" onclick="saveMumuTrade('${portId}')">저장</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}

function saveMumuTrade(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  const price = parseFloat(document.getElementById('mt-price').value);
  const qty = parseInt(document.getElementById('mt-qty').value);
  const type = document.getElementById('mt-type').value;
  const tTag = document.getElementById('mt-tag').value;
  if (!price || !qty) { toast('체결가와 수량을 입력해 주세요'); return; }
  if (!port.trades) port.trades = [];

  // T값 계산 (거래 후)
  let tBefore = getT(port);
  let holdingsBefore = calcHoldings(port);
  let tAfter = tBefore;
  if (type === '매수') {
    if (tTag === 'T+1') tAfter = tBefore + 1;
    else if (tTag === 'T+0.5') tAfter = tBefore + 0.5;
    else if (tTag === 'T+0.25') tAfter = tBefore + 0.25;
    else tAfter = tBefore + 1;
  } else {
    // 매도: tTag에 따라 T 계산
    if (tTag === '퀴터매도') {
      tAfter = tBefore * 0.75;
    } else if (tTag === 'MOC') {
      const divN = port.splits === 20 ? 10 : 20;
      tAfter = tBefore * (1 - 1 / divN);
    } else if (tTag === '지정가매도' || tTag === '') {
      // 일반/지정가 매도: 보유 비율만큼 T 감소
      if (holdingsBefore > 0 && qty > 0) {
        const ratio = Math.min(qty / holdingsBefore, 1);
        tAfter = tBefore * (1 - ratio);
      }
    } else if (tTag === '전량매도') {
      tAfter = 0;
    }
  }

  port.trades.push({ id:'t'+Date.now(), date:document.getElementById('mt-date').value, type, price, qty, tTag, tAfter: Math.round(tAfter*1000000)/1000000, amount:price*qty });
  // tManual 초기화 (거래 입력하면 자동계산으로)
  // delete port.tManual;  // 주석처리: 수동값 유지 원하면 삭제하지 않음
  saveMumuDB(mumuList);
  closeModal();

  // 전량매도 후 보유수량 0 되면 사이클 종료 자동 감지
  if (type === '매도') {
    const newHoldings = calcHoldings(port);
    if (newHoldings === 0) {
      setTimeout(() => endCycle(portId, '전량매도 완료'), 300);
      return;
    }
  }

  renderMumuDetail(portId);
  toast('✓ T: ' + tBefore.toFixed(2) + ' → ' + tAfter.toFixed(2));
}

function showMumuTradeDetail(portId, tradeId) {
  const port = mumuList.find(p => p.id === portId);
  const tr = port?.trades.find(t => t.id === tradeId);
  if (!tr) return;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">거래 상세</div>
    <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <div style="color:var(--text3)">날짜</div><div style="text-align:right">${tr.date}</div>
      <div style="color:var(--text3)">구분</div><div style="text-align:right"><span class="badge ${tr.type==='매수'?'badge-red':'badge-blue'}">${tr.type} ${tr.tTag||''}</span></div>
      <div style="color:var(--text3)">체결가</div><div style="font-family:var(--mono);text-align:right">${fmtUSD(tr.price)}</div>
      <div style="color:var(--text3)">수량</div><div style="font-family:var(--mono);text-align:right">${tr.qty}주</div>
      <div style="color:var(--text3)">거래금액</div><div style="font-family:var(--mono);text-align:right">${fmtUSD(tr.price*tr.qty,2)}</div>
      <div style="color:var(--text3)">T값(후)</div><div style="font-family:var(--mono);text-align:right;color:var(--accent)">${tr.tAfter !== undefined ? tr.tAfter.toFixed(4) : '—'}</div>
    </div>
    <button class="btn btn-d" onclick="deleteMumuTrade('${portId}','${tradeId}')">거래 삭제</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">닫기</button>`);
}

function deleteMumuTrade(portId, tradeId) {
  if (!confirm('이 거래를 삭제하시겠습니까?')) return;
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  port.trades = port.trades.filter(t => t.id !== tradeId);
  saveMumuDB(mumuList);
  closeModal();
  renderMumuDetail(portId);
  toast('삭제됨');
}

// ── 체결문자 → 무매 ───────────────────────────────
function showMumuSmsInput(portId) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📱 체결 문자 입력</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">카카오톡 체결 알림 복사 후 붙여넣기 · 해외주식 USD만 적용</div>
    <textarea class="fi" id="mumu-sms" rows="7" placeholder="[메리츠증권] 해외주식 주문체결 안내..." style="resize:vertical;font-size:12px;line-height:1.6"></textarea>
    <div class="form-row" style="margin-top:8px"><div class="form-lbl">T 태그</div>
      <select class="fsel" id="mumu-sms-tag">
        <option value="T+0.5" selected>매수 T+0.5 (절반)</option>
        <option value="T+1">매수 T+1 (1회 전체)</option>
        <option value="퀴터매도">매도 — 퀴터매도 (T×0.75)</option>
        <option value="지정가매도">매도 — 지정가 (비율만큼 T감소)</option>
        <option value="전량매도">매도 — 전량매도 (T→0)</option>
      </select>
    </div>
    <button class="btn btn-p" style="margin-top:4px" onclick="parseMumuSms('${portId}')">파싱 →</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}

function parseMumuSms(portId) {
  const text = document.getElementById('mumu-sms').value.trim();
  const tTag = document.getElementById('mumu-sms-tag').value;
  if (!text) return;
  const parsed = parseSmsText(text);
  if (!parsed.length) { toast('파싱 실패'); return; }
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  if (!port.trades) port.trades = [];
  let count = 0;
  parsed.forEach(r => {
    if (!r.price || r.currency !== 'USD') return; // USD만
    let tBefore = getT(port);
    let holdingsBefore = calcHoldings(port);
    let tAfter = tBefore;
    if (r.type === '매수') {
      if (tTag === 'T+1') tAfter = tBefore + 1;
      else if (tTag === 'T+0.5') tAfter = tBefore + 0.5;
      else tAfter = tBefore + 0.5; // 기본값
    } else {
      // 매도
      if (tTag === '퀴터매도') tAfter = tBefore * 0.75;
      else if (tTag === 'MOC') tAfter = tBefore * (1 - 1/(port.splits===20?10:20));
      else if (tTag === '지정가매도' && holdingsBefore > 0) tAfter = tBefore * (1 - Math.min(r.qty/holdingsBefore, 1));
      else if (tTag === '전량매도') tAfter = 0;
    }
    port.trades.push({ id:'t'+Date.now()+Math.random(), date:r.date, type:r.type, price:r.price, qty:r.qty, tTag, tAfter:Math.round(tAfter*1000000)/1000000, amount:r.price*r.qty });
    count++;
  });
  saveMumuDB(mumuList);
  closeModal();
  renderMumuDetail(portId);
  toast(`✓ ${count}건 저장됨`);
}

// ── 세팅 마법사 ───────────────────────────────────
let mumuSetup = {};

function showMumuSetup(editId) {
  const existing = editId ? mumuList.find(p => p.id === editId) : null;
  mumuSetup = existing ? {...existing, editId} : {
    editId: null, step:1, version:'v4.0', currency:'USD',
    ticker:'SOXL', splits:40, targetPct:20, fee:0.07, seed:0, nickname:''
  };
  showMumuStep(1);
}

function showMumuStep(step) {
  mumuSetup.step = step;
  const steps = {
    1: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 1 / 6 · 버전 선택</div>
      <div class="modal-title">무한매수법 버전</div>
      ${[['v2.2','📈','40일 / 목표 10% (SOXL 12%)'],['v3.0','🚀','20일 / 목표 15% (SOXL 20%)'],['v4.0','⭐','TQQQ/SOXL 전용 · ★% 자동계산']].map(([ver,ic,desc])=>`
      <div onclick="mumuSetup.version='${ver}';showMumuStep(1)" style="border:2px solid ${mumuSetup.version===ver?'var(--accent2)':'var(--border2)'};border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;background:${mumuSetup.version===ver?'rgba(74,158,255,.06)':'var(--bg3)'}">
        <div style="font-size:14px;font-weight:700">${ic} 버전 ${ver}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">${desc}</div>
      </div>`).join('')}
      <button class="btn btn-p" onclick="showMumuStep(2)">다음</button>`,

    2: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 2 / 6 · 통화</div>
      <div class="modal-title">투자 통화</div>
      ${[['USD','💵','미국 달러 (SOXL, TQQQ 등)'],['KRW','₩','원화 (국내 ETF)']].map(([cur,ic,desc])=>`
      <div onclick="mumuSetup.currency='${cur}';showMumuStep(2)" style="border:2px solid ${mumuSetup.currency===cur?'var(--accent2)':'var(--border2)'};border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;background:${mumuSetup.currency===cur?'rgba(74,158,255,.06)':'var(--bg3)'}">
        <div style="font-size:14px;font-weight:700">${ic} ${cur}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">${desc}</div>
      </div>`).join('')}
      <div class="btn-row"><button class="btn btn-s" onclick="showMumuStep(1)">이전</button><button class="btn btn-p" onclick="showMumuStep(3)">다음</button></div>`,

    3: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 3 / 6 · 종목</div>
      <div class="modal-title">투자 종목</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${['TQQQ','SOXL','FNGU','NAIL','기타'].map(tk=>`<div onclick="mumuSetup.ticker='${tk}';showMumuStep(3)" style="flex:1;min-width:60px;border:2px solid ${mumuSetup.ticker===tk?'var(--accent2)':'var(--border2)'};border-radius:10px;padding:12px 6px;text-align:center;cursor:pointer;font-weight:700;font-size:13px;background:${mumuSetup.ticker===tk?'rgba(74,158,255,.06)':'var(--bg3)'}">${tk}</div>`).join('')}
      </div>
      ${mumuSetup.ticker==='기타'?'<div class="form-row"><div class="form-lbl">직접 입력</div><input class="fi" id="mu-ticker-custom" placeholder="예: LABU" value=""></div>':''}
      <div class="btn-row"><button class="btn btn-s" onclick="showMumuStep(2)">이전</button><button class="btn btn-p" onclick="const ct=document.getElementById(\'mu-ticker-custom\');if(ct&&ct.value)mumuSetup.ticker=ct.value;showMumuStep(4)">다음</button></div>`,

    4: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 4 / 6 · 총 시드</div>
      <div class="modal-title">총 시드 입력</div>
      <div class="form-row"><div class="form-lbl">총 시드 (${mumuSetup.currency})</div><input class="fi" id="mu-seed" type="number" value="${mumuSetup.seed||''}" placeholder="예: 15000"></div>
      <div style="font-size:11px;color:var(--text3);margin:-6px 0 12px">1회 매수금 = 총 시드 ÷ 분할 일수</div>
      <div class="btn-row"><button class="btn btn-s" onclick="showMumuStep(3)">이전</button><button class="btn btn-p" onclick="const s=parseFloat(document.getElementById(\'mu-seed\').value);if(!s){toast(\'시드 입력\');return;}mumuSetup.seed=s;showMumuStep(5)">다음</button></div>`,

    5: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 5 / 6 · 분할 & 목표</div>
      <div class="modal-title">분할 일수 & 목표 수익률</div>
      <div style="margin-bottom:12px">
        <div class="form-lbl" style="margin-bottom:8px">분할 일수</div>
        <div style="display:flex;gap:8px">
          ${[20,30,40].map(d=>`<div onclick="mumuSetup.splits=${d};showMumuStep(5)" style="flex:1;border:2px solid ${mumuSetup.splits===d?'var(--accent2)':'var(--border2)'};border-radius:10px;padding:12px;text-align:center;cursor:pointer;font-size:15px;font-weight:700;background:${mumuSetup.splits===d?'rgba(74,158,255,.06)':'var(--bg3)'}">${d}일</div>`).join('')}
        </div>
      </div>
      <div class="form-row"><div class="form-lbl">목표 수익률 (%)</div><input class="fi" id="mu-target" type="number" value="${mumuSetup.targetPct}" placeholder="20" step="0.5"></div>
      ${mumuSetup.version==='v4.0'?'<div style="font-size:11px;color:var(--accent);margin:-6px 0 10px">v4.0: SOXL=20%, TQQQ=15% 자동 설정됨</div>':''}
      <div class="btn-row"><button class="btn btn-s" onclick="showMumuStep(4)">이전</button><button class="btn btn-p" onclick="mumuSetup.targetPct=parseFloat(document.getElementById(\'mu-target\').value)||20;showMumuStep(6)">다음</button></div>`,

    6: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 6 / 6 · 추가 정보</div>
      <div class="modal-title">별명 & 수수료</div>
      <div class="form-row"><div class="form-lbl">별명 (선택)</div><input class="fi" id="mu-nick" value="${mumuSetup.nickname||''}" placeholder="예: 메리츠1"></div>
      <div class="form-row"><div class="form-lbl">수수료율 (%)</div><input class="fi" id="mu-fee" type="number" value="${mumuSetup.fee||0.07}" step="0.001" placeholder="0.070"></div>
      <div style="background:var(--bg3);border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">
          <div style="color:var(--text3)">종목/버전</div><div style="font-weight:600">${mumuSetup.ticker} / ${mumuSetup.version}</div>
          <div style="color:var(--text3)">시드</div><div style="font-weight:600">${mumuSetup.currency==='USD'?'$':'₩'}${(mumuSetup.seed||0).toLocaleString()}</div>
          <div style="color:var(--text3)">분할 / 1회</div><div style="font-weight:600">${mumuSetup.splits}일 / ${mumuSetup.currency==='USD'?'$':'₩'}${((mumuSetup.seed||0)/(mumuSetup.splits||40)).toFixed(2)}</div>
          <div style="color:var(--text3)">목표 수익률</div><div style="font-weight:600;color:var(--accent2)">+${mumuSetup.targetPct}%</div>
        </div>
      </div>
      <div class="btn-row"><button class="btn btn-s" onclick="showMumuStep(5)">이전</button><button class="btn btn-p" onclick="saveMumuSetup()">포트폴리오 ${mumuSetup.editId?'수정':'생성'}</button></div>`
  };

  openModal(steps[step] || steps[1]);
}

function saveMumuSetup() {
  const nick = document.getElementById('mu-nick')?.value || '';
  const fee = parseFloat(document.getElementById('mu-fee')?.value) || 0.07;
  mumuSetup.nickname = nick;
  mumuSetup.fee = fee;

  if (mumuSetup.editId) {
    const idx = mumuList.findIndex(p => p.id === mumuSetup.editId);
    if (idx !== -1) {
      const old = mumuList[idx];
      mumuList[idx] = { ...mumuSetup, id: mumuSetup.editId, trades: old.trades, lastPrice: old.lastPrice, tManual: old.tManual, recentPrices: old.recentPrices };
    }
  } else {
    mumuList.push({
      id: 'mu' + Date.now(), version: mumuSetup.version, currency: mumuSetup.currency,
      ticker: mumuSetup.ticker, seed: mumuSetup.seed, splits: mumuSetup.splits,
      targetPct: mumuSetup.targetPct, fee: mumuSetup.fee, nickname: mumuSetup.nickname,
      trades: [], lastPrice: 0, recentPrices: [], createdAt: tod()
    });
  }

  saveMumuDB(mumuList);
  closeModal();
  mumuCurId = mumuSetup.editId || mumuList[mumuList.length-1].id;
  renderMumu();
  toast(mumuSetup.editId ? '✓ 수정됨' : '✓ 포트폴리오 생성됨');
}

// ── SOXL/TQQQ 현재가 자동 조회 ────────────────────
async function fetchMumuPrice(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    const data = await res.json();
    const parsed = JSON.parse(data.contents);
    const price = parsed?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price || null;
  } catch(e) { return null; }
}

async function autoFillMumuPrice(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  const btn = document.getElementById('mumu-price-btn');
  if (btn) { btn.textContent = '...'; btn.disabled = true; }
  const price = await fetchMumuPrice(port.ticker);
  if (btn) { btn.textContent = '🔍'; btn.disabled = false; }
  if (!price) { toast('조회 실패 — 직접 입력'); return; }
  const input = document.getElementById('mumu-cur-price');
  if (input) input.value = price.toFixed(2);
  toast(`✓ ${port.ticker} $${price.toFixed(2)}`);
}

// ══════════════════════════════════════════════════
// 사이클 관리
// ══════════════════════════════════════════════════

function loadCycles() {
  try { return JSON.parse(localStorage.getItem('mumuCycles') || '[]'); }
  catch(e) { return []; }
}
function saveCycles(c) { localStorage.setItem('mumuCycles', JSON.stringify(c)); }

// 사이클 종료 처리
function endCycle(portId, reason) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;

  const T = getT(port);
  const avg = calcAvgPrice(port);
  const holdings = calcHoldings(port);
  const invested = calcInvested(port);
  const remaining = calcRemaining(port);

  // 매도 총액 계산
  // 정확한 수익 계산: 매도금액 - 매도한 주의 원가
  const allTrades = port.trades || [];
  let totalBuyAmt = 0; // 실제 총 매수금
  let costBasis = 0;   // 현재 보유분 원가
  let holdingsTrack = 0;
  allTrades.forEach(t => {
    if (t.type === '매수') {
      totalBuyAmt += t.price * t.qty;
      costBasis += t.price * t.qty;
      holdingsTrack += t.qty;
    } else {
      // 매도한 주의 평단 원가만큼 costBasis 감소
      if (holdingsTrack > 0) {
        const avgCost = costBasis / holdingsTrack;
        costBasis -= avgCost * t.qty;
        holdingsTrack = Math.max(0, holdingsTrack - t.qty);
      }
    }
  });
  const sellTotal = allTrades.filter(t => t.type === '매도').reduce((s,t) => s + t.price * t.qty, 0);
  const soldCost = totalBuyAmt - costBasis; // 매도한 주의 원가
  const profitAmt = sellTotal - soldCost;   // 실현 손익
  const buyTotal = totalBuyAmt;
  const profitPct = soldCost > 0 ? profitAmt / soldCost * 100 : 0;
  const startDate = port.trades?.[0]?.date || port.createdAt || tod();
  const endDate = tod();

  // 완료된 사이클 저장
  const cycles = loadCycles();
  const cycleNo = (cycles.filter(c => c.portId === portId).length) + 1;
  cycles.push({
    id: 'cy' + Date.now(),
    portId,
    cycleNo,
    ticker: port.ticker,
    nickname: port.nickname,
    version: port.version,
    seed: port.seed,
    splits: port.splits,
    targetPct: port.targetPct,
    startDate,
    endDate,
    reason,
    trades: [...(port.trades||[])],
    finalT: T,
    finalAvg: avg,
    finalHoldings: holdings,
    buyTotal,
    sellTotal,
    profitAmt,
    profitPct,
    remaining
  });
  saveCycles(cycles);

  // 사이클 종료 모달
  openModal(`
    <div class="modal-handle"></div>
    <div style="text-align:center;padding:8px 0 16px">
      <div style="font-size:28px;margin-bottom:6px">🎉</div>
      <div style="font-size:16px;font-weight:700">사이클 ${cycleNo} 종료</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">${port.ticker} ${port.nickname||''} · ${reason}</div>
    </div>

    <div style="background:var(--bg3);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div><div style="color:var(--text3)">기간</div><div style="font-family:var(--mono);font-size:11px">${startDate} ~ ${endDate}</div></div>
        <div><div style="color:var(--text3)">최종 T값</div><div style="font-family:var(--mono);font-weight:600;color:var(--accent)">${T.toFixed(2)}</div></div>
        <div><div style="color:var(--text3)">총 매수금</div><div style="font-family:var(--mono)">${fmtUSD(buyTotal,2)}</div></div>
        <div><div style="color:var(--text3)">총 매도금</div><div style="font-family:var(--mono)">${fmtUSD(sellTotal,2)}</div></div>
        <div><div style="color:var(--text3)">손익</div><div style="font-family:var(--mono);font-weight:600;${profitAmt>=0?'color:var(--accent3)':'color:var(--red)'}">${fmtUSD(profitAmt,2)} (${profitPct>=0?'+':''}${profitPct.toFixed(2)}%)</div></div>
        <div><div style="color:var(--text3)">거래 건수</div><div style="font-family:var(--mono)">${(port.trades||[]).length}건</div></div>
        ${holdings > 0 ? `<div style="grid-column:1/-1"><div style="color:var(--accent);font-size:11px">⚠️ 잔여 보유 ${holdings}주 (평단 ${fmtUSD(avg)})</div></div>` : ''}
      </div>
    </div>

    <div style="font-size:12px;font-weight:600;margin-bottom:8px">새 사이클 시작 방식</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
      <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg3);border-radius:8px;cursor:pointer">
        <input type="radio" name="cycle-mode" value="same" checked style="accent-color:var(--accent)">
        <div><div style="font-size:12px;font-weight:500">원래 시드 유지 (단리)</div><div style="font-size:10px;color:var(--text3)">시드 $${port.seed.toLocaleString()} 그대로 사용</div></div>
      </label>
      <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg3);border-radius:8px;cursor:pointer">
        <input type="radio" name="cycle-mode" value="compound" style="accent-color:var(--accent)">
        <div><div style="font-size:12px;font-weight:500">수익 포함 복리</div><div style="font-size:10px;color:var(--text3)">새 시드 $${(port.seed + profitAmt).toFixed(2)}</div></div>
      </label>
    </div>

    <button class="btn btn-p" onclick="startNewCycle('${portId}')">새 사이클 시작</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">나중에 시작</button>
  `);

  // 현재 포트 trades 초기화
  port.trades = [];
  delete port.tManual;
  port.lastPrice = 0;
  port.recentPrices = [];
  port.cycleNo = cycleNo + 1;
  saveMumuDB(mumuList);
}

function startNewCycle(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;

  const mode = document.querySelector('input[name="cycle-mode"]:checked')?.value || 'same';
  if (mode === 'compound') {
    const cycles = loadCycles();
    const lastCycle = cycles.filter(c => c.portId === portId).pop();
    if (lastCycle) {
      port.seed = Math.round((port.seed + lastCycle.profitAmt) * 100) / 100;
    }
  }

  saveMumuDB(mumuList);
  closeModal();
  mumuCurId = portId;
  renderMumu();
  toast(`✓ 새 사이클 ${port.cycleNo||2} 시작!`);
}

// 사이클 이력 보기
function showCycleHistory(portId) {
  const cycles = loadCycles().filter(c => c.portId === portId);
  if (!cycles.length) { toast('완료된 사이클 없음'); return; }

  let html = `<div class="modal-handle"></div><div class="modal-title">사이클 이력</div>`;
  cycles.slice().reverse().forEach(cy => {
    html += `
      <div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px;font-weight:600">사이클 ${cy.cycleNo}</span>
          <span style="font-family:var(--mono);font-size:12px;font-weight:600;${cy.profitAmt>=0?'color:var(--accent3)':'color:var(--red)'}">${cy.profitPct>=0?'+':''}${cy.profitPct.toFixed(2)}%</span>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">${cy.startDate} ~ ${cy.endDate} · ${cy.reason}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px">
          <div style="color:var(--text3)">매수</div><div style="font-family:var(--mono)">${fmtUSD(cy.buyTotal,0)}</div>
          <div style="color:var(--text3)">매도</div><div style="font-family:var(--mono)">${fmtUSD(cy.sellTotal,0)}</div>
          <div style="color:var(--text3)">손익</div><div style="font-family:var(--mono);${cy.profitAmt>=0?'color:var(--accent3)':'color:var(--red)'}">${fmtUSD(cy.profitAmt,2)}</div>
          <div style="color:var(--text3)">거래</div><div style="font-family:var(--mono)">${cy.trades.length}건</div>
        </div>
      </div>`;
  });
  html += `<button class="btn btn-s" onclick="closeModal()">닫기</button>`;
  openModal(html);
}

function updateTTagHint() {
  const tag = document.getElementById('mt-tag')?.value;
  const type = document.getElementById('mt-type')?.value;
  const qty = parseInt(document.getElementById('mt-qty')?.value) || 0;
  const portId = mumuCurId;
  if (!portId) return;
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  const T = getT(port);
  const holdings = calcHoldings(port);
  let tAfter = T;
  if (type === '매수') {
    if (tag === 'T+1') tAfter = T + 1;
    else if (tag === 'T+0.5') tAfter = T + 0.5;
  } else {
    if (tag === '퀴터매도') tAfter = T * 0.75;
    else if (tag === 'MOC') tAfter = T * (1 - 1/(port.splits===20?10:20));
    else if (tag === '지정가매도' && holdings > 0 && qty > 0) tAfter = T * (1 - Math.min(qty/holdings, 1));
    else if (tag === '전량매도') tAfter = 0;
  }
  const el = document.getElementById('mt-tag-preview');
  if (el) el.textContent = T > 0 ? `T: ${T.toFixed(2)} → ${tAfter.toFixed(2)}` : '';
}

// ── 임시: 사이클 이력 수동 수정 ──────────────────
function fixCycleData() {
  const corrected = [{
    id: 'cy_soxl_1',
    portId: 'mu_soxl_init',
    cycleNo: 1,
    ticker: 'SOXL',
    nickname: '메리츠1',
    version: 'v4.0',
    seed: 15000,
    splits: 40,
    targetPct: 20,
    startDate: '2026-04-10',
    endDate: '2026-04-22',
    reason: '수동 종료',
    trades: [
      {id:'tr1',date:'2026-04-10',type:'매수',price:76.39,qty:4,tTag:'T+1',amount:305.56},
      {id:'tr2',date:'2026-04-13',type:'매수',price:81.25,qty:2,tTag:'T+0.5',amount:162.50},
      {id:'tr3',date:'2026-04-14',type:'매수',price:85.31,qty:2,tTag:'T+0.5',amount:170.62},
      {id:'tr4',date:'2026-04-15',type:'매수',price:85.96,qty:2,tTag:'T+0.5',amount:171.92},
      {id:'tr5',date:'2026-04-16',type:'매수',price:88.37,qty:2,tTag:'T+0.5',amount:176.74},
      {id:'tr6',date:'2026-04-17',type:'매수',price:94.68,qty:2,tTag:'T+0.5',amount:189.36},
      {id:'tr7',date:'2026-04-20',type:'매수',price:95.94,qty:2,tTag:'T+0.5',amount:191.88},
      {id:'tr8',date:'2026-04-21',type:'매수',price:98.09,qty:2,tTag:'T+0.5',amount:196.18},
      {id:'tr9',date:'2026-04-22',type:'매도',price:103.68,qty:4,tTag:'퀴터매도',amount:414.72},
      {id:'tr10',date:'2026-04-22',type:'매도',price:105.64,qty:14,tTag:'지정가매도',amount:1478.96}
    ],
    finalT: 4.5,
    finalAvg: 75.82,
    finalHoldings: 0,
    buyTotal: 1364.76,
    sellTotal: 1893.68,
    profitAmt: 528.92,
    profitPct: 38.76,
    remaining: 13635.24
  }];
  saveCycles(corrected);
  renderMumu();
  toast('✓ 사이클 이력 수정 완료!');
}
