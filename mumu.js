
// ══════════════════════════════════════════════════
// 무한매수법 (무매) — 전체 로직
// ══════════════════════════════════════════════════

// ── DB 헬퍼 ───────────────────────────────────────
function loadMumuDB() {
  try { return JSON.parse(localStorage.getItem('mumuDB') || '[]'); }
  catch(e) { return []; }
}
function saveMumuDB(data) {
  localStorage.setItem('mumuDB', JSON.stringify(data));
}

let mumuList = loadMumuDB(); // 포트폴리오 목록
let mumuCurId = null;        // 현재 보고 있는 포트폴리오 ID

// ── 버전별 기본값 ──────────────────────────────────
const MUMU_VERSIONS = {
  'v2.2': { splits: 40, targetPct: 10, soxlTarget: 12 },
  'v3.0': { splits: 20, targetPct: 15, soxlTarget: 20 },
  'v4.0': { splits: 40, targetPct: 20, soxlTarget: 20, autoTarget: true },
};

// ── 유틸 ──────────────────────────────────────────
function fmtUSD(n, d=2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + n.toFixed(d);
}
function fmtPctMu(n, d=2) {
  if (!n && n!==0) return '—';
  return (n>0?'+':'') + n.toFixed(d) + '%';
}

// ── T값 계산 (v4.0 기준) ──────────────────────────
// T = 매입금액 / (1회 투자금)
// Star = 목표 수익률 조정값
function calcT(port) {
  const unit = port.seed / port.splits; // 1회 투자금
  const t = port.totalInvested / unit;
  return Math.round(t * 10) / 10;
}
function calcStar(port) {
  const t = calcT(port);
  const halfSplits = port.splits / 2;
  if (t <= halfSplits) {
    // 전반전: Star = 목표수익률
    return port.targetPct;
  } else {
    // 후반전: Star 감소
    const ratio = (port.splits - t) / halfSplits;
    return Math.round(port.targetPct * ratio * 100) / 100;
  }
}
function calcState(port) {
  const t = calcT(port);
  const half = port.splits / 2;
  if (t === 0) return '초기 매수 (T=0)';
  if (t < half) return '전반전';
  if (t === half) return '반환점';
  if (t < port.splits) return '후반전';
  return '만기 (전량 매도)';
}
function calcAvgPrice(port) {
  if (!port.trades || !port.trades.length) return 0;
  const buys = port.trades.filter(t => t.type === '매수');
  const totalShares = buys.reduce((s,t) => s + t.qty, 0);
  const totalAmt = buys.reduce((s,t) => s + t.price * t.qty, 0);
  return totalShares > 0 ? totalAmt / totalShares : 0;
}
function calcHoldings(port) {
  if (!port.trades) return 0;
  let shares = 0;
  port.trades.forEach(t => {
    if (t.type === '매수') shares += t.qty;
    else shares -= t.qty;
  });
  return Math.max(0, shares);
}
function calcTotalInvested(port) {
  if (!port.trades) return 0;
  return port.trades.filter(t => t.type === '매수').reduce((s,t) => s + t.price * t.qty, 0);
}

// ── 오늘의 가이드 계산 ─────────────────────────────
function calcTodayGuide(port, currentPrice) {
  const unit = port.seed / port.splits;
  const avg = calcAvgPrice(port);
  const t = calcT(port);
  const star = calcStar(port);
  const holdings = calcHoldings(port);
  const fee = port.fee / 100;

  if (t === 0 || avg === 0) {
    // 초기 매수: LOC로 1단위 매수
    const locPrice = currentPrice || 0;
    const locQty = locPrice > 0 ? Math.floor(unit / locPrice) : 0;
    return {
      state: '초기 매수',
      buyGuides: [{ label: 'LOC', price: locPrice, qty: locQty }],
      sellGuides: [],
      crashGuides: calcCrashGuide(port, currentPrice)
    };
  }

  const starPrice = avg * (1 + star / 100); // Star% 목표가
  const targetPrice = avg * (1 + port.targetPct / 100); // 목표 익절가

  const buyGuides = [];
  const sellGuides = [];

  // 매수 가이드
  if (currentPrice && currentPrice < avg) {
    // 평단 아래: LOC 평단 + LOC star%
    const locQty = Math.floor(unit / avg);
    const locStarQty = Math.floor(unit / starPrice);
    buyGuides.push({ label: 'LOC 평단', price: avg, qty: locQty });
    buyGuides.push({ label: `LOC ★${star.toFixed(2)}%`, price: starPrice, qty: locStarQty > 0 ? locStarQty : 1 });
  } else {
    // 평단 위: LOC 평단 (절반)
    const locQty = Math.max(1, Math.floor(unit / (avg || currentPrice || 1)));
    buyGuides.push({ label: 'LOC 평단', price: avg, qty: locQty });
    buyGuides.push({ label: `LOC ★${star.toFixed(2)}%`, price: starPrice, qty: 1 });
  }

  // 매도 가이드
  if (holdings > 0) {
    sellGuides.push({ label: `LOC ★${star.toFixed(2)}%`, price: starPrice, qty: holdings });
    sellGuides.push({ label: `지정가 +${port.targetPct}%`, price: targetPrice, qty: holdings });
  }

  return {
    state: calcState(port),
    buyGuides,
    sellGuides,
    crashGuides: calcCrashGuide(port, currentPrice)
  };
}

function calcCrashGuide(port, currentPrice) {
  if (!currentPrice) return [];
  const unit = port.seed / port.splits;
  // 폭락 기준가: 현재가의 75%, 50%, 25% 등
  const levels = [0.875, 0.75, 0.625, 0.5, 0.4375, 0.375, 0.3125, 0.25];
  return levels.map(ratio => {
    const price = parseFloat((currentPrice * ratio).toFixed(2));
    const qty = Math.max(1, Math.floor(unit / price));
    return { price, qty };
  });
}

// ── 렌더 메인 ──────────────────────────────────────
function renderMumu() {
  mumuList = loadMumuDB();
  const page = document.getElementById('page-mumu');
  if (!page) return;

  if (!mumuList.length) {
    page.innerHTML = `
      <div class="empty" style="padding:3rem 1rem">
        <div class="empty-icon">∞</div>
        <div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:8px">무한매수법 포트폴리오</div>
        <div>아직 포트폴리오가 없습니다</div>
      </div>
      <button class="btn btn-p" style="margin:0 14px" onclick="showMumuSetup()">＋ 새 포트폴리오 시작</button>`;
    return;
  }

  // 목록 화면 or 상세 화면
  if (mumuCurId) {
    renderMumuDetail(mumuCurId);
  } else {
    renderMumuList();
  }
}

function renderMumuList() {
  const page = document.getElementById('page-mumu');
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="slbl" style="margin:0">포트폴리오 목록</div>
      <button class="btn-sm" onclick="showMumuSetup()">＋ 추가</button>
    </div>`;

  mumuList.forEach(port => {
    const avg = calcAvgPrice(port);
    const holdings = calcHoldings(port);
    const invested = calcTotalInvested(port);
    const t = calcT({...port, totalInvested: invested});
    const star = calcStar({...port, totalInvested: invested});
    const progress = (t / port.splits * 100).toFixed(1);
    const state = calcState({...port, totalInvested: invested});
    const targetPrice = avg * (1 + port.targetPct / 100);

    html += `
      <div class="card" style="margin-bottom:10px;cursor:pointer" onclick="mumuCurId='${port.id}';renderMumu()">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:15px;font-weight:700">${port.ticker} <span style="font-size:10px;font-family:var(--mono);color:var(--text3);background:var(--bg3);padding:2px 6px;border-radius:4px">${port.version}</span></div>
            <div style="font-size:10px;color:var(--text2);margin-top:2px">${port.nickname||''} · ${port.currency} · 시드 ${port.currency==='USD'?fmtUSD(port.seed,0):'₩'+port.seed.toLocaleString()}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--text3)">${state}</div>
            <div style="font-family:var(--mono);font-size:13px;margin-top:2px">T=${t}회</div>
          </div>
        </div>
        <div style="height:4px;background:var(--border2);border-radius:2px;overflow:hidden;margin-bottom:8px">
          <div style="height:100%;width:${Math.min(100,progress)}%;background:var(--accent2);border-radius:2px"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px">
          <div><div style="color:var(--text3)">평단</div><div style="font-family:var(--mono);font-weight:600">${avg>0?fmtUSD(avg):'—'}</div></div>
          <div><div style="color:var(--text3)">보유</div><div style="font-family:var(--mono);font-weight:600">${holdings}주</div></div>
          <div><div style="color:var(--text3)">목표가</div><div style="font-family:var(--mono);font-weight:600;color:var(--accent3)">${avg>0?fmtUSD(targetPrice):'—'}</div></div>
        </div>
      </div>`;
  });

  page.innerHTML = html;
}

function renderMumuDetail(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) { mumuCurId = null; renderMumu(); return; }

  const avg = calcAvgPrice(port);
  const holdings = calcHoldings(port);
  const invested = calcTotalInvested(port);
  port.totalInvested = invested;
  const t = calcT(port);
  const star = calcStar(port);
  const state = calcState(port);
  const progress = Math.min(100, t / port.splits * 100);
  const targetPrice = avg * (1 + port.targetPct / 100);
  const starPrice = avg * (1 + star / 100);

  const page = document.getElementById('page-mumu');

  // 매수 가이드 HTML
  let buyHTML = '';
  const curP = port.lastPrice || 0;
  const guide = calcTodayGuide(port, curP);

  if (guide.buyGuides.length) {
    buyHTML = `<div style="background:rgba(232,84,68,.05);border:1px solid rgba(232,84,68,.2);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="font-size:11px;color:var(--red);font-weight:600;margin-bottom:8px">● 매수 가이드</div>`;
    guide.buyGuides.forEach(g => {
      buyHTML += `<div style="background:var(--bg);border-radius:8px;padding:10px;margin-bottom:6px">
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${g.label}</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--red)">${g.price>0?fmtUSD(g.price):'—'} <span style="font-size:14px">× ${g.qty>0?g.qty:'?'}주</span></div>
      </div>`;
    });
    buyHTML += '</div>';
  }

  let sellHTML = '';
  if (guide.sellGuides.length && avg > 0) {
    sellHTML = `<div style="background:rgba(74,158,255,.05);border:1px solid rgba(74,158,255,.2);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="font-size:11px;color:var(--accent2);font-weight:600;margin-bottom:8px">● 매도 가이드</div>`;
    guide.sellGuides.forEach(g => {
      sellHTML += `<div style="background:var(--bg);border-radius:8px;padding:10px;margin-bottom:6px">
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${g.label}</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--accent2)">${fmtUSD(g.price)} <span style="font-size:14px">× ${g.qty}주</span></div>
      </div>`;
    });
    sellHTML += '</div>';
  }

  let crashHTML = '';
  if (guide.crashGuides.length && curP > 0) {
    crashHTML = `<div style="margin-top:4px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:6px">+@ 폭락장 대비 추가 매수</div>`;
    guide.crashGuides.forEach(g => {
      crashHTML += `<div style="font-size:12px;color:var(--text2);padding:3px 0;font-family:var(--mono)">- LOC ${fmtUSD(g.price)} × ${g.qty}주</div>`;
    });
    crashHTML += '</div>';
  }

  // 거래 내역 HTML
  const trades = [...(port.trades||[])].reverse();
  let tradeHTML = '';
  if (trades.length) {
    trades.forEach((tr, i) => {
      const no = port.trades.length - i;
      const typeCls = tr.type==='매수'?'badge-red':'badge-blue';
      tradeHTML += `<div style="display:grid;grid-template-columns:28px 1fr auto auto auto;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--text3);font-family:var(--mono);font-size:10px">#${no}</span>
        <span style="color:var(--text2)">${tr.date}</span>
        <span class="badge ${typeCls}">${tr.type} ${tr.tTag||''}</span>
        <span style="font-family:var(--mono)">${fmtUSD(tr.price)}</span>
        <span style="font-family:var(--mono)">${tr.qty}주</span>
      </div>`;
    });
  } else {
    tradeHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:var(--text3)">거래 내역 없음</div>';
  }

  page.innerHTML = `
    <!-- 헤더 -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button class="icon-btn" onclick="mumuCurId=null;renderMumu()">←</button>
      <div>
        <span style="font-size:16px;font-weight:700">${port.ticker}</span>
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);background:var(--bg3);padding:2px 6px;border-radius:4px;margin-left:6px">${port.version}</span>
        ${port.nickname?`<div style="font-size:10px;color:var(--text3);margin-top:1px">${port.nickname}</div>`:''}
      </div>
      <button class="icon-btn" style="margin-left:auto" onclick="showMumuMenu('${port.id}')">⋯</button>
    </div>

    <!-- 진행 상황 -->
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600">진행 상황</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--accent2)">${progress.toFixed(1)}%</span>
      </div>
      <div style="height:6px;background:var(--border2);border-radius:3px;overflow:hidden;margin-bottom:12px">
        <div style="height:100%;width:${progress}%;background:var(--accent2);border-radius:3px;transition:width .5s"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><div style="font-size:10px;color:var(--text3)">시드</div><div style="font-family:var(--mono);font-size:14px;font-weight:600">${fmtUSD(port.seed,0)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">매입 금액</div><div style="font-family:var(--mono);font-size:14px;font-weight:600">${fmtUSD(invested,2)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">평단가</div><div style="font-family:var(--mono);font-size:14px;font-weight:600">${avg>0?fmtUSD(avg):'—'}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">보유 수량</div><div style="font-family:var(--mono);font-size:14px;font-weight:600">${holdings}주</div></div>
      </div>
    </div>

    <!-- T값 / Star값 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div class="stat-card" style="background:rgba(232,160,32,.06);border-color:rgba(232,160,32,.2)">
        <div style="font-size:10px;color:var(--text3)">T 값</div>
        <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--accent)">${t}<span style="font-size:12px">회</span></div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${state}</div>
      </div>
      <div class="stat-card" style="background:rgba(74,158,255,.06);border-color:rgba(74,158,255,.2)">
        <div style="font-size:10px;color:var(--text3)">★ Star 값</div>
        <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--accent2)">${star.toFixed(2)}<span style="font-size:12px">%</span></div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">목표가 ${avg>0?fmtUSD(starPrice):'—'}</div>
      </div>
    </div>

    <!-- 현재가 입력 -->
    <div class="card" style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">오늘의 가이드</div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <input class="fi" id="mumu-cur-price" type="number" placeholder="오늘 현재가 입력 (USD)" value="${port.lastPrice||''}" style="flex:1">
        <button class="btn-sm" style="white-space:nowrap;padding:0 12px" onclick="updateMumuPrice('${port.id}')">계산</button>
      </div>
      ${buyHTML}
      ${sellHTML}
      ${crashHTML}
    </div>

    <!-- 거래 내역 -->
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600">거래 내역</span>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="showMumuSmsInput('${port.id}')">📱 문자</button>
          <button class="btn-sm" onclick="showMumuTradeModal('${port.id}')">＋ 직접 입력</button>
        </div>
      </div>
      ${tradeHTML}
    </div>

    <!-- 설정 -->
    <div class="card" style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">설정 & 목표치</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
        <div style="color:var(--text3)">분할 일수</div><div style="font-family:var(--mono);text-align:right">${port.splits}일</div>
        <div style="color:var(--text3)">1회 투자금</div><div style="font-family:var(--mono);text-align:right">${fmtUSD(port.seed/port.splits,2)}</div>
        <div style="color:var(--text3)">목표 수익률</div><div style="font-family:var(--mono);text-align:right;color:var(--accent2)">+${port.targetPct}%</div>
        <div style="color:var(--text3)">수수료율</div><div style="font-family:var(--mono);text-align:right">${port.fee}%</div>
        <div style="color:var(--text3)">통화 단위</div><div style="font-family:var(--mono);text-align:right">${port.currency}</div>
      </div>
    </div>`;
}

// ── 현재가 업데이트 & 가이드 재계산 ──────────────────
function updateMumuPrice(portId) {
  const price = parseFloat(document.getElementById('mumu-cur-price').value);
  if (isNaN(price) || price <= 0) { toast('올바른 현재가를 입력해 주세요'); return; }
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  port.lastPrice = price;
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
    <div class="modal-title">${port.ticker} ${port.nickname||''} 관리</div>
    <button class="btn btn-s" style="margin-bottom:8px" onclick="showMumuSetupEdit('${portId}');closeModal()">설정 수정</button>
    <button class="btn btn-s" style="margin-bottom:8px;color:var(--accent3)" onclick="completeMumu('${portId}')">✓ 익절/만기 완료 처리</button>
    <button class="btn btn-d" style="margin-bottom:8px" onclick="deleteMumu('${portId}')">포트폴리오 삭제</button>
    <button class="btn btn-s" onclick="closeModal()">취소</button>
  `);
}

function completeMumu(portId) {
  if (!confirm('이 포트폴리오를 완료 처리하면 보관함으로 이동됩니다. 계속할까요?')) return;
  const port = mumuList.find(p => p.id === portId);
  if (port) { port.completed = true; port.completedAt = tod(); }
  saveMumuDB(mumuList);
  closeModal();
  mumuCurId = null;
  renderMumu();
  toast('✓ 완료 처리됨');
}

function deleteMumu(portId) {
  if (!confirm('포트폴리오를 삭제합니다. 계속할까요?')) return;
  mumuList = mumuList.filter(p => p.id !== portId);
  saveMumuDB(mumuList);
  closeModal();
  mumuCurId = null;
  renderMumu();
  toast('삭제됨');
}

// ── 거래 직접 입력 모달 ────────────────────────────
function showMumuTradeModal(portId) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">거래 입력</div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">날짜</div><input class="fi" id="mt-date" type="date" value="${tod()}"></div>
      <div class="form-row"><div class="form-lbl">구분</div>
        <select class="fsel" id="mt-type"><option>매수</option><option>매도</option></select>
      </div>
    </div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">체결가 (USD)</div><input class="fi" id="mt-price" type="number" placeholder="0.00"></div>
      <div class="form-row"><div class="form-lbl">수량 (주)</div><input class="fi" id="mt-qty" type="number" placeholder="0"></div>
    </div>
    <div class="form-row"><div class="form-lbl">T 태그 (선택)</div>
      <select class="fsel" id="mt-tag">
        <option value="">없음</option>
        <option value="T+1">T+1</option>
        <option value="T+0.5">T+0.5</option>
        <option value="T+2">T+2</option>
      </select>
    </div>
    <button class="btn btn-p" onclick="saveMumuTrade('${portId}')">저장</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>
  `);
}

function saveMumuTrade(portId) {
  const port = mumuList.find(p => p.id === portId);
  if (!port) return;
  const price = parseFloat(document.getElementById('mt-price').value);
  const qty = parseInt(document.getElementById('mt-qty').value);
  if (!price || !qty) { toast('체결가와 수량을 입력해 주세요'); return; }
  if (!port.trades) port.trades = [];
  port.trades.push({
    id: 't' + Date.now(),
    date: document.getElementById('mt-date').value,
    type: document.getElementById('mt-type').value,
    price, qty,
    tTag: document.getElementById('mt-tag').value,
    amount: price * qty
  });
  saveMumuDB(mumuList);
  closeModal();
  renderMumuDetail(portId);
  toast('✓ 거래 저장됨');
}

// ── 체결 문자 → 무매 거래 ─────────────────────────
function showMumuSmsInput(portId) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📱 체결 문자 입력</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">카카오톡 체결 알림 복사 후 붙여넣기</div>
    <textarea class="fi" id="mumu-sms-input" rows="7" placeholder="[메리츠증권] 해외주식 주문체결 안내..." style="resize:vertical;font-size:12px;line-height:1.6"></textarea>
    <button class="btn btn-p" style="margin-top:8px" onclick="parseMumuSms('${portId}')">파싱 →</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>
  `);
}

function parseMumuSms(portId) {
  const text = document.getElementById('mumu-sms-input').value.trim();
  if (!text) return;
  const parsed = parseSmsText(text);
  if (!parsed.length) { toast('파싱 실패'); return; }

  const port = mumuList.find(p => p.id === portId);
  if (!port) return;

  if (!port.trades) port.trades = [];
  parsed.forEach(r => {
    port.trades.push({
      id: 't' + Date.now() + Math.random(),
      date: r.date,
      type: r.type,
      price: r.price, // USD 원본가
      qty: r.qty,
      tTag: 'T+0.5',
      amount: r.price * r.qty
    });
  });
  saveMumuDB(mumuList);
  closeModal();
  renderMumuDetail(portId);
  toast(`✓ ${parsed.length}건 거래 저장됨`);
}

// ── 세팅 마법사 ───────────────────────────────────
let mumuSetup = {};

function showMumuSetup(editId) {
  mumuSetup = editId ? {...mumuList.find(p=>p.id===editId)} : {step:1, version:'v4.0', currency:'USD', ticker:'SOXL', splits:40, targetPct:20, fee:0.07, seed:0, nickname:''};
  mumuSetup.editId = editId || null;
  showMumuStep(1);
}
function showMumuSetupEdit(portId) { showMumuSetup(portId); }

function showMumuStep(step) {
  mumuSetup.step = step;
  const v = MUMU_VERSIONS[mumuSetup.version] || MUMU_VERSIONS['v4.0'];

  const stepMap = {
    1: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 1 / 6</div>
      <div class="modal-title">버전 선택</div>
      ${['v2.2','v3.0','v4.0'].map(ver=>{
        const vd = MUMU_VERSIONS[ver];
        const desc = ver==='v2.2'?'분할 40일, 목표 10% (SOXL 12%)':ver==='v3.0'?'분할 20일, 목표 15% (SOXL 20%)':'TQQQ/SOXL 전용, ★% 자동 계산';
        return `<div onclick="mumuSetup.version='${ver}';showMumuStep(1)" style="border:2px solid ${mumuSetup.version===ver?'var(--accent2)':'var(--border2)'};border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;background:${mumuSetup.version===ver?'rgba(74,158,255,.06)':'var(--bg3)'}">
          <div style="font-size:14px;font-weight:700">${ver==='v4.0'?'⭐ ':ver==='v3.0'?'🚀 ':'📈 '}버전 ${ver.replace('v','')}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:3px">${desc}</div>
        </div>`;
      }).join('')}
      <button class="btn btn-p" onclick="showMumuStep(2)">다음 단계로</button>`,

    2: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 2 / 6</div>
      <div class="modal-title">통화 선택</div>
      ${['USD','KRW'].map(cur=>`<div onclick="mumuSetup.currency='${cur}';showMumuStep(2)" style="border:2px solid ${mumuSetup.currency===cur?'var(--accent2)':'var(--border2)'};border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;background:${mumuSetup.currency===cur?'rgba(74,158,255,.06)':'var(--bg3)'}">
        <div style="font-size:14px;font-weight:700">${cur==='USD'?'💵 USD (달러)':'₩ KRW (원화)'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">${cur==='USD'?'미국 달러로 거래되는 종목에 적합':'국내 ETF에 적합'}</div>
      </div>`).join('')}
      <div class="btn-row">
        <button class="btn btn-s" onclick="showMumuStep(1)">이전</button>
        <button class="btn btn-p" onclick="showMumuStep(3)">다음</button>
      </div>`,

    3: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 3 / 6</div>
      <div class="modal-title">종목 선택</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${['TQQQ','SOXL','FNGU','NAIL','기타'].map(tk=>`<div onclick="mumuSetup.ticker='${tk}';${tk==='기타'?'':''};showMumuStep(3)" style="flex:1;min-width:70px;border:2px solid ${mumuSetup.ticker===tk?'var(--accent2)':'var(--border2)'};border-radius:10px;padding:12px 8px;text-align:center;cursor:pointer;font-weight:700;font-size:13px;background:${mumuSetup.ticker===tk?'rgba(74,158,255,.06)':'var(--bg3)'}">${tk}</div>`).join('')}
      </div>
      ${mumuSetup.ticker==='기타'?`<div class="form-row"><div class="form-lbl">티커 직접 입력</div><input class="fi" id="mu-ticker-custom" placeholder="예: LABU" value="${!['TQQQ','SOXL','FNGU','NAIL'].includes(mumuSetup.ticker)?mumuSetup.ticker:''}"></div>`:''}
      <div class="btn-row">
        <button class="btn btn-s" onclick="showMumuStep(2)">이전</button>
        <button class="btn btn-p" onclick="const ct=document.getElementById('mu-ticker-custom');if(ct)mumuSetup.ticker=ct.value||mumuSetup.ticker;showMumuStep(4)">다음</button>
      </div>`,

    4: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 4 / 6</div>
      <div class="modal-title">총 시드 입력</div>
      <div class="form-row">
        <div class="form-lbl">총 시드 (${mumuSetup.currency})</div>
        <input class="fi" id="mu-seed" type="number" value="${mumuSetup.seed||''}" placeholder="0.00">
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:-6px;margin-bottom:12px">1회 매수 금액 = 총 시드 / 분할 일수</div>
      <div class="btn-row">
        <button class="btn btn-s" onclick="showMumuStep(3)">이전</button>
        <button class="btn btn-p" onclick="const s=parseFloat(document.getElementById('mu-seed').value);if(!s||s<=0){toast('시드를 입력해 주세요');return;}mumuSetup.seed=s;showMumuStep(5)">다음</button>
      </div>`,

    5: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 5 / 6</div>
      <div class="modal-title">분할 일수 & 목표 수익률</div>
      <div style="margin-bottom:12px">
        <div class="form-lbl" style="margin-bottom:8px">분할 일수</div>
        <div style="display:flex;gap:8px">
          ${[20,40].map(d=>`<div onclick="mumuSetup.splits=${d};showMumuStep(5)" style="flex:1;border:2px solid ${mumuSetup.splits===d?'var(--accent2)':'var(--border2)'};border-radius:10px;padding:14px;text-align:center;cursor:pointer;font-size:15px;font-weight:700;background:${mumuSetup.splits===d?'rgba(74,158,255,.06)':'var(--bg3)'}">${d}일</div>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-lbl">목표 수익률 (%)</div>
        <input class="fi" id="mu-target" type="number" value="${mumuSetup.targetPct}" placeholder="20">
      </div>
      ${mumuSetup.version==='v4.0'?`<div style="font-size:11px;color:var(--accent);margin:-6px 0 10px">v4.0: 티커별 자동 설정 (TQQQ: 15%, SOXL: 20%)</div>`:''}
      <div class="btn-row">
        <button class="btn btn-s" onclick="showMumuStep(4)">이전</button>
        <button class="btn btn-p" onclick="const t=parseFloat(document.getElementById('mu-target').value)||20;mumuSetup.targetPct=t;showMumuStep(6)">다음</button>
      </div>`,

    6: `<div class="modal-handle"></div>
      <div style="font-size:10px;color:var(--accent2);font-family:var(--mono);margin-bottom:6px">STEP 6 / 6</div>
      <div class="modal-title">추가 정보 (선택)</div>
      <div class="form-row">
        <div class="form-lbl">별명</div>
        <input class="fi" id="mu-nick" value="${mumuSetup.nickname||''}" placeholder="예: 메리츠1">
      </div>
      <div class="form-row">
        <div class="form-lbl">수수료율 (%)</div>
        <input class="fi" id="mu-fee" type="number" value="${mumuSetup.fee||0.07}" step="0.001" placeholder="0.070">
      </div>
      <div style="background:var(--bg3);border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div style="color:var(--text3)">종목</div><div style="font-weight:600">${mumuSetup.ticker}</div>
          <div style="color:var(--text3)">버전</div><div style="font-weight:600">${mumuSetup.version}</div>
          <div style="color:var(--text3)">시드</div><div style="font-weight:600">${mumuSetup.currency==='USD'?'$':'₩'}${(mumuSetup.seed||0).toLocaleString()}</div>
          <div style="color:var(--text3)">분할</div><div style="font-weight:600">${mumuSetup.splits}일</div>
          <div style="color:var(--text3)">1회 투자금</div><div style="font-weight:600">${mumuSetup.currency==='USD'?'$':'₩'}${((mumuSetup.seed||0)/(mumuSetup.splits||40)).toFixed(2)}</div>
          <div style="color:var(--text3)">목표 수익률</div><div style="font-weight:600;color:var(--accent2)">+${mumuSetup.targetPct}%</div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-s" onclick="showMumuStep(5)">이전</button>
        <button class="btn btn-p" onclick="saveMumuSetup()">포트폴리오 ${mumuSetup.editId?'수정':'생성'}하기</button>
      </div>`,
  };

  openModal(stepMap[step] || stepMap[1]);
}

function saveMumuSetup() {
  const nick = document.getElementById('mu-nick')?.value || '';
  const fee = parseFloat(document.getElementById('mu-fee')?.value) || 0.07;
  mumuSetup.nickname = nick;
  mumuSetup.fee = fee;

  if (mumuSetup.editId) {
    const idx = mumuList.findIndex(p => p.id === mumuSetup.editId);
    if (idx !== -1) {
      const oldTrades = mumuList[idx].trades;
      const oldPrice = mumuList[idx].lastPrice;
      mumuList[idx] = {...mumuSetup, id: mumuSetup.editId, trades: oldTrades, lastPrice: oldPrice};
    }
  } else {
    mumuList.push({
      id: 'mu' + Date.now(),
      version: mumuSetup.version,
      currency: mumuSetup.currency,
      ticker: mumuSetup.ticker,
      seed: mumuSetup.seed,
      splits: mumuSetup.splits,
      targetPct: mumuSetup.targetPct,
      fee: mumuSetup.fee,
      nickname: mumuSetup.nickname,
      trades: [],
      lastPrice: 0,
      createdAt: tod()
    });
  }

  saveMumuDB(mumuList);
  closeModal();
  mumuCurId = mumuSetup.editId || mumuList[mumuList.length-1].id;
  renderMumu();
  toast(mumuSetup.editId ? '✓ 수정됨' : '✓ 포트폴리오 생성됨');
}
