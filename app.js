// ═══════════════════════════════════════════════════
// ASSET MANAGER — app.js
// ═══════════════════════════════════════════════════

const SK = 'assetApp_v3';
const CAT_COLORS = {
  '미국주식':'#4a9eff','레버리지':'#e85444','신흥국':'#e8a020',
  '현금':'#666','채권':'#9b7fe8','국내주식':'#3cb878','기타':'#888'
};
const COLORS = ['#4a9eff','#3cb878','#e8a020','#e85444','#9b7fe8','#2ab8a0','#e87040','#50c0e0'];

// ── DB ─────────────────────────────────────────────
function loadDB() {
  try { return JSON.parse(localStorage.getItem(SK)) || defDB(); }
  catch(e) { return defDB(); }
}
function saveDB(db) {
  localStorage.setItem(SK, JSON.stringify(db));
  scheduleAutoBackup();
}
function defDB() {
  return {
    accounts: [
      { id:'a1', owner:'아들', broker:'키움', type:'일반주식', name:'키움 주식(아들)', color:'#3cb878',
        holdings:[
          {id:'h1',name:'SPYM',ticker:'SPYM',category:'미국주식',qty:10,avgPrice:68000,curPrice:72000},
          {id:'h2',name:'QQQM',ticker:'QQQM',category:'미국주식',qty:8,avgPrice:220000,curPrice:206000},
          {id:'h3',name:'QLD',ticker:'QLD',category:'레버리지',qty:0,avgPrice:0,curPrice:163000},
          {id:'h4',name:'Tiger 인도 Nifty50',ticker:'069500',category:'신흥국',qty:15,avgPrice:89000,curPrice:88000},
          {id:'h5',name:'예수금',ticker:'CASH',category:'현금',qty:1,avgPrice:4000000,curPrice:4000000},
        ]},
      {id:'a2',owner:'본인',broker:'키움',type:'일반주식',name:'키움 주식(본인)',color:'#4a9eff',holdings:[]},
      {id:'a3',owner:'본인',broker:'미래에셋',type:'IRP',name:'미래에셋 IRP',color:'#9b7fe8',holdings:[]},
      {id:'a4',owner:'본인',broker:'미래에셋',type:'연금저축',name:'미래에셋 연금저축',color:'#2ab8a0',holdings:[]},
      {id:'a5',owner:'본인',broker:'메리츠',type:'일반주식',name:'메리츠 주식',color:'#e8a020',holdings:[]},
      {id:'a6',owner:'본인',broker:'우리투자증권',type:'일반주식',name:'우리투자 주식',color:'#e85444',holdings:[]},
    ],
    savingPlans: [
      { id:'sp1', accountId:'a1', amount:100000, day:25, memo:'균형형 적립',
        allocations:[
          {name:'QLD',ticker:'QLD',amount:40000},
          {name:'Tiger 인도',ticker:'069500',amount:30000},
          {name:'SPYM/QQQM',ticker:'QQQM',amount:30000},
        ]},
    ],
    trades: [],
    targets: [
      {category:'미국주식',target:0.45},
      {category:'레버리지',target:0.25},
      {category:'신흥국',target:0.20},
      {category:'현금',target:0.10},
    ],
    checklist: [
      {id:'c1',text:'뱅크샐러드 내보내기 → 현재가 업데이트',done:false},
      {id:'c2',text:'IRP·연금저축 납입 한도 확인',done:false},
      {id:'c3',text:'해외주식 양도세 공제(250만) 확인',done:false},
      {id:'c4',text:'리밸런싱 필요 종목 확인',done:false},
      {id:'c5',text:'다음달 적립 계획 확정',done:false},
    ],
    settings: { birthYear: 1980 }
  };
}

let DB = loadDB();
let activeCats = ['전체'];
let activeDashTab = 'acct';
let logFilter = '전체';
let simSelectedAccts = [];

// ── Helpers ────────────────────────────────────────
function fmt(n, u='') {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 100000000) return (n/100000000).toFixed(1) + '억' + u;
  if (a >= 10000) return Math.round(n/10000) + '만' + u;
  return n.toLocaleString('ko-KR') + u;
}
function fmtW(n) { return fmt(n, '원'); }
function fmtPct(n, d=1) { if (!n && n!==0) return ''; return (n>0?'+':'') + n.toFixed(d) + '%'; }
function tod() { return new Date().toISOString().slice(0,10); }
function thisMonth() { return new Date().toISOString().slice(0,7); }
function pctCls(n) { return n > 0.5 ? 'pos' : n < -0.5 ? 'neg' : 'neu'; }
function hval(h) { return h.qty * (h.ticker==='CASH' ? h.avgPrice : h.curPrice) || 0; }
function acctVal(a) { return a.holdings.reduce((s,h) => s + hval(h), 0); }
function allH() {
  return DB.accounts.flatMap(a => a.holdings.map(h => ({
    ...h, owner:a.owner, broker:a.broker, acctType:a.type,
    acctName:a.name, acctId:a.id, acctColor:a.color
  })));
}
function ownerTotal(o) { return DB.accounts.filter(a=>a.owner===o).reduce((s,a) => s+acctVal(a), 0); }
function grandTotal() { return DB.accounts.reduce((s,a) => s+acctVal(a), 0); }
function currentAge() {
  const by = DB.settings?.birthYear || 1980;
  return new Date().getFullYear() - by;
}

// ── Navigation ─────────────────────────────────────
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('on'));
  document.getElementById('page-' + name).classList.add('on');
  if (el) el.classList.add('on');
  renderPage(name);
}
function renderPage(name) {
  if (name==='dashboard') renderDashboard();
  if (name==='saving') renderSaving();
  if (name==='log') renderLog();
  if (name==='sim') renderSimPage();
  if (name==='risk') renderRisk();
}
function refreshAll() {
  const cur = document.querySelector('.page.on').id.replace('page-','');
  renderPage(cur); updateTopbar(); toast('✓ 새로고침');
}
function updateTopbar() {
  document.getElementById('tb-total').textContent = fmtW(grandTotal()) + ' 총 자산';
}

// ══════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════
function renderDashboard() {
  const total = grandTotal(), me = ownerTotal('본인'), son = ownerTotal('아들');
  document.getElementById('d-total').textContent = fmtW(total);
  document.getElementById('d-me').textContent = fmtW(me);
  document.getElementById('d-son').textContent = fmtW(son);
  document.getElementById('d-date').textContent = tod() + ' 기준';
  document.getElementById('d-me-cnt').textContent = DB.accounts.filter(a=>a.owner==='본인').length + '개 계좌';
  document.getElementById('d-son-cnt').textContent = DB.accounts.filter(a=>a.owner==='아들').length + '개 계좌';
  updateTopbar();

  const cats = ['전체', ...new Set(DB.accounts.flatMap(a=>[a.owner, a.type]))];
  const chipsEl = document.getElementById('cat-chips');
  chipsEl.innerHTML = '';
  [...new Set(cats)].forEach(c => {
    const el = document.createElement('div');
    el.className = 'chip' + (activeCats.includes(c) ? ' on' : '');
    el.textContent = c;
    el.onclick = () => toggleCat(c);
    chipsEl.appendChild(el);
  });
  renderDashTab(activeDashTab);
}
function toggleCat(cat) {
  if (cat==='전체') { activeCats = ['전체']; }
  else {
    activeCats = activeCats.filter(c => c!=='전체');
    if (activeCats.includes(cat)) activeCats = activeCats.filter(c => c!==cat);
    else activeCats.push(cat);
    if (!activeCats.length) activeCats = ['전체'];
  }
  renderDashboard();
}
function filteredAccts() {
  if (activeCats.includes('전체')) return DB.accounts;
  return DB.accounts.filter(a => activeCats.includes(a.owner) || activeCats.includes(a.type));
}
function dashTab(tab, el) {
  activeDashTab = tab;
  document.querySelectorAll('#page-dashboard .tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  ['acct','asset','chart'].forEach(t => {
    document.getElementById('dt-' + t).style.display = t===tab ? 'block' : 'none';
  });
  renderDashTab(tab);
}
function renderDashTab(tab) {
  if (tab==='acct') renderAcctList();
  if (tab==='asset') renderAssetTab();
  if (tab==='chart') renderChartTab();
}

// ── 순서 조정 헬퍼 ────────────────────────────────────

function togglePlan(id) {
  const detail = document.getElementById('plan-detail-' + id);
  const chevron = document.getElementById('plan-chevron-' + id);
  if (!detail) return;
  const isOpen = detail.style.display !== 'none';
  detail.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function moveItem(arr, id, dir) {
  const idx = arr.findIndex(x => x.id === id);
  if (idx === -1) return arr;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return arr;
  const copy = [...arr];
  [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
  return copy;
}

function moveAcct(id, dir) {
  DB.accounts = moveItem(DB.accounts, id, dir);
  saveDB(DB); renderAcctList();
}
function moveHolding(acctId, hid, dir) {
  const a = DB.accounts.find(a => a.id === acctId);
  if (!a) return;
  a.holdings = moveItem(a.holdings, hid, dir);
  saveDB(DB);
  // 상세 열린 상태 유지
  renderAcctList();
  document.getElementById('det-' + acctId).style.display = 'block';
}
function movePlan(id, dir) {
  DB.savingPlans = moveItem(DB.savingPlans, id, dir);
  saveDB(DB); renderSaving();
}
function moveTrade(id, dir) {
  DB.trades = moveItem(DB.trades, id, dir);
  saveDB(DB); renderLog();
}
function moveTarget(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= DB.targets.length) return;
  [DB.targets[idx], DB.targets[newIdx]] = [DB.targets[newIdx], DB.targets[idx]];
  saveDB(DB); renderRebalancing();
}

function renderAcctList() {
  const list = document.getElementById('acct-list');
  list.innerHTML = '';
  const fa = filteredAccts();
  if (!fa.length) { list.innerHTML = '<div class="empty"><div class="empty-icon">🏦</div>조건에 맞는 계좌 없음</div>'; return; }
  const subTotal = fa.reduce((s,a) => s + acctVal(a), 0);
  if (!activeCats.includes('전체')) {
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:11px;color:var(--text3);margin-bottom:8px;font-family:var(--mono)';
    sub.textContent = '선택 합계: ' + fmtW(subTotal);
    list.appendChild(sub);
  }
  fa.forEach(a => {
    const val = acctVal(a);
    const pct = subTotal > 0 ? (val/subTotal*100).toFixed(1) + '%' : '';
    const oc = a.owner==='아들' ? 'var(--accent3)' : 'var(--accent2)';
    const el = document.createElement('div');
    el.className = 'tbl drag-item';
    el.dataset.id = a.id;
    el.style.marginBottom = '10px';
    let h = `<div style="padding:10px 12px;background:var(--bg3);border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="drag-handle" style="color:var(--text3);font-size:18px;cursor:grab;touch-action:none;padding:2px 4px">⠿</span>
          <div onclick="toggleDet('${a.id}')" style="cursor:pointer">
            <div style="font-size:13px;font-weight:600">${a.name}</div>
            <div style="font-size:10px;color:var(--text2);margin-top:1px"><span style="color:${oc}">${a.owner}</span> · ${a.broker} · ${a.type}</div>
          </div>
        </div>
        <div style="text-align:right" onclick="toggleDet('${a.id}')" style="cursor:pointer">
          <div style="font-family:var(--mono);font-size:14px;font-weight:600">${fmtW(val)}</div>
          <div style="font-size:10px;color:var(--text3)">${pct}</div>
        </div>
      </div></div>`;
    let d = `<div id="det-${a.id}" style="display:none">`;
    if (!a.holdings.length) {
      d += `<div style="padding:12px;font-size:12px;color:var(--text3);text-align:center">종목 없음</div>`;
    } else {
      d += `<div class="tbl-hd col3"><span>종목</span><span style="text-align:right">평가금액</span><span style="text-align:right">수익률</span></div>`;
      a.holdings.forEach(h2 => {
        const hv = hval(h2);
        const ret = h2.avgPrice>0 && h2.ticker!=='CASH' ? (h2.curPrice-h2.avgPrice)/h2.avgPrice*100 : null;
        d += `<div class="drag-item" data-id="${h2.id}" data-acct="${a.id}" data-type="holding" style="display:flex;align-items:center;border-bottom:1px solid var(--border);padding:0 8px 0 0">
          <div class="drag-handle" style="padding:0 10px;color:var(--text3);font-size:16px;cursor:grab;touch-action:none;flex-shrink:0">⠿</div>
          <div onclick="showHoldingModal('${a.id}','${h2.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;flex:1;gap:8px;cursor:pointer">
            <div style="flex:1;min-width:0"><div class="tbl-nm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h2.name}</div><div class="tbl-sub">${h2.category} · ${h2.qty.toLocaleString()}주</div></div>
            <div class="tbl-val" style="flex-shrink:0">${fmtW(hv)}</div>
            <div class="tbl-pct ${ret!==null ? pctCls(ret) : 'neu'}" style="flex-shrink:0;min-width:44px;text-align:right">${ret!==null ? fmtPct(ret) : ''}</div>
          </div>
        </div>`;
      });
    }
    d += `<div style="padding:8px 12px;display:flex;gap:6px;border-top:1px solid var(--border);flex-wrap:wrap">
      <button class="btn-sm" style="flex:1" onclick="showAddHoldingModal('${a.id}')">＋ 종목</button>
      <button class="btn-sm" style="flex:1" onclick="showEditAcctModal('${a.id}')">수정</button>
      <button class="btn-sm" style="color:var(--red)" onclick="deleteAcct('${a.id}')">삭제</button>
    </div></div>`;
    el.innerHTML = h + d;
    list.appendChild(el);
  });
  afterRender(setupDragAccts);
}
function toggleDet(id) {
  const el = document.getElementById('det-' + id);
  const opening = el.style.display === 'none';
  el.style.display = opening ? 'block' : 'none';
  if (opening) afterRender(() => setupDragHoldings(id));
}
function renderAssetTab() {
  const total = grandTotal(); const byCat = {};
  allH().forEach(h => { const v = hval(h); if(!byCat[h.category]) byCat[h.category]=0; byCat[h.category]+=v; });
  const sorted = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const maxV = sorted[0]?.[1] || 1;
  const bc = document.createElement('div'); bc.className = 'bar-chart';
  sorted.forEach(([cat,val]) => {
    const p = val/maxV*100; const color = CAT_COLORS[cat] || '#888';
    bc.innerHTML += `<div class="bc-row"><div class="bc-top"><span class="bc-nm">${cat}</span><span class="bc-val">${fmtW(val)} <span style="color:var(--text3)">${(val/total*100).toFixed(1)}%</span></span></div><div class="bc-bg"><div class="bc-fill" style="width:${p}%;background:${color}"></div></div></div>`;
  });
  document.getElementById('asset-chart').innerHTML = '';
  document.getElementById('asset-chart').appendChild(bc);
  const rows = document.getElementById('asset-rows'); rows.innerHTML = '';
  sorted.forEach(([cat,val]) => {
    const color = CAT_COLORS[cat] || '#888';
    rows.innerHTML += `<div class="tbl-row col3"><div class="tbl-nm" style="display:flex;align-items:center;gap:7px"><span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>${cat}</div><div class="tbl-val">${fmtW(val)}</div><div class="tbl-pct neu">${(val/total*100).toFixed(1)}%</div></div>`;
  });
}
function renderChartTab() {
  const owners = {}; DB.accounts.forEach(a => { const v=acctVal(a); if(!owners[a.owner])owners[a.owner]=0; owners[a.owner]+=v; });
  drawDonut('donut-owner','donut-owner-legend', Object.entries(owners), grandTotal());
  const types = {}; DB.accounts.forEach(a => { const v=acctVal(a); const g=['IRP','연금저축','개인연금'].includes(a.type)?'연금':a.type; if(!types[g])types[g]=0; types[g]+=v; });
  drawDonut('donut-type','donut-type-legend', Object.entries(types), grandTotal());
  const cats = {}; allH().forEach(h => { const v=hval(h); if(!cats[h.category])cats[h.category]=0; cats[h.category]+=v; });
  drawDonut('donut-cat','donut-cat-legend', Object.entries(cats).sort((a,b)=>b[1]-a[1]), grandTotal());
}
function drawDonut(svgId, legendId, data, total) {
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  if (!svg || !legend) return;
  const cx=55, cy=55, r=38; let sa = -Math.PI/2; let svgC = '';
  const filtered = data.filter(([,v]) => v > 0);
  if (!filtered.length) { svg.innerHTML=''; legend.innerHTML=''; return; }
  filtered.forEach(([name,val],i) => {
    const angle = (val/total)*2*Math.PI; const ea = sa+angle;
    const x1=cx+r*Math.cos(sa), y1=cy+r*Math.sin(sa), x2=cx+r*Math.cos(ea), y2=cy+r*Math.sin(ea);
    const large = angle>Math.PI?1:0; const color = CAT_COLORS[name] || COLORS[i%COLORS.length];
    svgC += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${color}" opacity=".85"/>`;
    sa = ea;
  });
  svgC += `<circle cx="${cx}" cy="${cy}" r="22" fill="var(--bg2)"/>`;
  svg.innerHTML = svgC; legend.innerHTML = '';
  filtered.forEach(([name,val],i) => {
    const color = CAT_COLORS[name] || COLORS[i%COLORS.length];
    const pct = (val/total*100).toFixed(1);
    legend.innerHTML += `<div class="dl-row"><span class="dl-dot" style="background:${color}"></span><span class="dl-nm">${name}</span><span class="dl-val">${fmt(val)}</span><span class="dl-pct">${pct}%</span></div>`;
  });
}

// ══════════════════════════════════════════════════
// SAVING PAGE (with ETF search + portfolio breakdown)
// ══════════════════════════════════════════════════
function renderSaving() {
  const total = DB.savingPlans.reduce((s,p) => s+p.amount, 0);
  document.getElementById('sv-total').textContent = fmtW(total);
  document.getElementById('sv-cnt').textContent = DB.savingPlans.length + '개';
  const list = document.getElementById('saving-list');
  list.innerHTML = '';
  if (!DB.savingPlans.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📅</div>적립 계획이 없습니다<br>+ 계획 추가로 시작하세요</div>';
    return;
  }
  DB.savingPlans.forEach(plan => {
    const a = DB.accounts.find(a => a.id===plan.accountId);
    if (!a) return;
    const av = acctVal(a);
    const totalHoldings = a.holdings.reduce((s,h) => s+hval(h), 0);

    // ── 현재 종목별 잔액 & 비율 ──
    let holdingRows = '';
    const nonCash = a.holdings.filter(h => h.ticker !== 'CASH');
    const cashH = a.holdings.find(h => h.ticker === 'CASH');
    const cashVal = cashH ? hval(cashH) : 0;

    nonCash.forEach(h => {
      const v = hval(h);
      const pct = totalHoldings > 0 ? v/totalHoldings*100 : 0;
      const color = CAT_COLORS[h.category] || '#888';
      holdingRows += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>
          <span style="font-size:12px">${h.name}</span>
        </div>
        <div style="text-align:right">
          <span style="font-family:var(--mono);font-size:12px">${fmtW(v)}</span>
          <span style="font-size:10px;color:var(--text3);margin-left:6px">${pct.toFixed(1)}%</span>
        </div></div>`;
    });
    holdingRows += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:7px;height:7px;border-radius:50%;background:#666;flex-shrink:0"></span>
        <span style="font-size:12px">예수금</span>
      </div>
      <div style="text-align:right">
        <span style="font-family:var(--mono);font-size:12px">${fmtW(cashVal)}</span>
        <span style="font-size:10px;color:var(--text3);margin-left:6px">${totalHoldings>0?(cashVal/totalHoldings*100).toFixed(1):0}%</span>
      </div></div>`;

    // ── 적립 후 예상 비중 ──
    let allocRows = '';
    plan.allocations.forEach(alloc => {
      const h = a.holdings.find(h => h.name.includes(alloc.name) || alloc.name.includes(h.name));
      const cv = h ? hval(h) : 0;
      const cp = av > 0 ? cv/av*100 : 0;
      const np = (av+plan.amount) > 0 ? (cv+alloc.amount)/(av+plan.amount)*100 : 0;
      const color = CAT_COLORS[h?.category||'기타'] || '#888';
      allocRows += `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span style="color:var(--text2)">${alloc.name}</span>
          <span style="font-family:var(--mono)">${fmt(alloc.amount)} → <span style="color:var(--accent3)">${np.toFixed(1)}%</span></span>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <div style="flex:1;height:4px;background:var(--border2);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${cp.toFixed(0)}%;background:${color};border-radius:2px"></div>
          </div>
          <span style="font-size:9px;color:var(--text3);font-family:var(--mono);min-width:28px">${cp.toFixed(0)}%</span>
        </div></div>`;
    });

    const el = document.createElement('div');
    el.className = 'card drag-item'; el.dataset.id = plan.id; el.style.marginBottom = '10px';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="togglePlan('${plan.id}')">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="drag-handle" style="color:var(--text3);font-size:18px;cursor:grab;touch-action:none" onclick="event.stopPropagation()">⠿</span>
          <div>
            <div style="font-size:13px;font-weight:600">${a.name}</div>
            <div style="font-size:10px;color:var(--text2);margin-top:2px">${plan.memo||''} · 매월 ${plan.day}일</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:15px;font-weight:600;color:var(--accent)">${fmtW(plan.amount)}</div>
            <div style="font-size:10px;color:var(--text3)">월 적립액</div>
          </div>
          <span id="plan-chevron-${plan.id}" style="color:var(--text3);font-size:14px;transition:transform .2s">▼</span>
        </div>
      </div>

      <div id="plan-detail-${plan.id}" style="display:none;margin-top:12px">
        <div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:10px">
          <div style="font-size:10px;color:var(--text3);font-family:var(--mono);letter-spacing:.08em;margin-bottom:6px">현재 잔액 / 비중</div>
          ${holdingRows}
          <div style="display:flex;justify-content:flex-end;margin-top:6px;font-size:10px;color:var(--text3)">합계 ${fmtW(totalHoldings)}</div>
        </div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);letter-spacing:.08em;margin-bottom:8px">이번달 배분 → 적립 후 예상 비중</div>
        ${allocRows}
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="btn-sm" style="flex:1" onclick="showEditPlanModal('${plan.id}')">수정</button>
          <button class="btn-sm" style="color:var(--red)" onclick="deletePlan('${plan.id}')">삭제</button>
        </div>
      </div>`;
    list.appendChild(el);
  });
}

// ── ETF 현재가 조회 (Yahoo Finance via allorigins proxy) ──
async function fetchETFPrice(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    const data = await res.json();
    const parsed = JSON.parse(data.contents);
    const price = parsed?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const name = parsed?.chart?.result?.[0]?.meta?.shortName || ticker;
    const currency = parsed?.chart?.result?.[0]?.meta?.currency || 'USD';
    return { price, name, currency, ticker };
  } catch(e) {
    return null;
  }
}

// ── ETF search modal for saving plan ──
async function showETFSearchModal(targetInputId, targetAmtId) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">ETF 검색</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">해외 ETF 티커 입력 (예: QLD, QQQM, SPYG)<br>국내 ETF는 앱에서 직접 현재가 입력 필요</div>
    <div style="display:flex;gap:6px;margin-bottom:12px">
      <input class="fi" id="etf-search-input" placeholder="티커 입력 (예: QLD)" style="flex:1">
      <button class="btn-sm" onclick="doETFSearch('${targetInputId}','${targetAmtId}')" style="white-space:nowrap;padding:0 14px">조회</button>
    </div>
    <div id="etf-search-result"></div>
  `);
}

async function doETFSearch(targetInputId, targetAmtId) {
  const ticker = document.getElementById('etf-search-input').value.trim().toUpperCase();
  if (!ticker) { toast('티커를 입력해 주세요'); return; }
  const resultEl = document.getElementById('etf-search-result');
  resultEl.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">조회 중...</div>';
  const result = await fetchETFPrice(ticker);
  if (!result || !result.price) {
    resultEl.innerHTML = '<div style="font-size:12px;color:var(--red);padding:8px">조회 실패. 티커를 확인해 주세요.<br>국내 ETF는 직접 입력하세요.</div>';
    return;
  }
  const usdKrw = 1484;
  const krwPrice = result.currency === 'USD' ? Math.round(result.price * usdKrw) : Math.round(result.price);
  const currencyNote = result.currency === 'USD' ? `$${result.price.toFixed(2)} × ${usdKrw} = ` : '';
  resultEl.innerHTML = `
    <div style="background:var(--bg3);border-radius:8px;padding:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">${result.name}</div>
      <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--accent);margin-bottom:4px">${fmtW(krwPrice)}</div>
      <div style="font-size:10px;color:var(--text3)">${currencyNote}${fmtW(krwPrice)} (USD/KRW 1,484 기준)</div>
      <button class="btn btn-p" style="margin-top:10px" onclick="applyETFPrice('${targetInputId}','${result.name}','${ticker}',${krwPrice})">이 가격 적용</button>
    </div>`;
}

function applyETFPrice(targetInputId, name, ticker, price) {
  const input = document.getElementById(targetInputId);
  if (input) {
    input.value = name + ' (' + ticker + ')';
    input.dataset.ticker = ticker;
    input.dataset.price = price;
  }
  toast('✓ 적용됨: ' + fmtW(price));
  closeModal();
}

// ══════════════════════════════════════════════════
// LOG PAGE
// ══════════════════════════════════════════════════
function renderLog() {
  const mon = thisMonth();
  const mt = DB.trades.filter(t => t.date && t.date.startsWith(mon));
  document.getElementById('lg-buy').textContent = fmtW(mt.filter(t=>t.type==='매수').reduce((s,t)=>s+t.amount,0));
  document.getElementById('lg-sell').textContent = fmtW(mt.filter(t=>t.type==='매도').reduce((s,t)=>s+t.amount,0));
  const filterEl = document.getElementById('log-filter-chips');
  filterEl.innerHTML = '';
  ['전체','매수','매도'].forEach(f => {
    const c = document.createElement('div');
    c.className = 'chip' + (logFilter===f ? ' on' : '');
    c.textContent = f;
    c.onclick = () => { logFilter=f; renderLog(); };
    filterEl.appendChild(c);
  });
  const list = document.getElementById('log-list');
  list.innerHTML = '';
  const trades = [...DB.trades].filter(t => logFilter==='전체' || t.type===logFilter).sort((a,b) => b.date.localeCompare(a.date));
  if (!trades.length) { list.innerHTML = '<div class="empty"><div class="empty-icon">📋</div>거래 기록 없음</div>'; return; }
  const grouped = {};
  trades.forEach(t => { const m=t.date.slice(0,7); if(!grouped[m])grouped[m]=[]; grouped[m].push(t); });
  Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0])).forEach(([month, ts]) => {
    const h = document.createElement('div');
    h.style.cssText = 'font-size:10px;color:var(--text3);font-family:var(--mono);letter-spacing:.08em;margin:10px 0 6px;display:flex;justify-content:space-between';
    const net = ts.reduce((s,t) => s+(t.type==='매수'?t.amount:-t.amount), 0);
    h.innerHTML = `<span>${month}</span><span>${fmt(Math.abs(net))} ${net>=0?'순매수':'순매도'}</span>`;
    list.appendChild(h);
    ts.forEach(t => {
      const el = document.createElement('div');
      el.className = 'card'; el.style.marginBottom = '6px';
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
            <span style="font-size:13px;font-weight:500">${t.name}</span>
            <span class="badge ${t.type==='매수'?'badge-green':'badge-red'}">${t.type}</span>
          </div>
          <div style="font-size:10px;color:var(--text2)">${t.date} · ${t.broker} · ${t.owner}</div>
          ${t.memo ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${t.memo}</div>` : ''}
        </div>
        <div style="text-align:right;margin-left:8px">
          <div style="font-family:var(--mono);font-size:13px;font-weight:500">${fmtW(t.amount)}</div>
          <div style="font-size:10px;color:var(--text2)">${t.qty?t.qty+'주':''}${t.price?' @'+fmt(t.price):''}</div>
        </div></div>
        <button class="btn-sm" style="margin-top:8px;color:var(--red)" onclick="deleteTrade('${t.id}')">삭제</button>`;
      list.appendChild(el);
    });
  });
}

// ══════════════════════════════════════════════════
// SIMULATION PAGE (enhanced)
// ══════════════════════════════════════════════════
function renderSimPage() {
  // Pre-fill
  const total = grandTotal();
  if (total > 0) document.getElementById('sim-init').value = Math.round(total/10000);
  const plans = DB.savingPlans.reduce((s,p) => s+p.amount, 0);
  if (plans > 0) document.getElementById('sim-monthly').value = Math.round(plans/10000);
  if (DB.settings?.birthYear) document.getElementById('sim-birthyear').value = DB.settings.birthYear;

  // Build account selector
  const sel = document.getElementById('sim-acct-sel');
  sel.innerHTML = '';
  DB.accounts.forEach(a => {
    const v = acctVal(a);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)';
    const checked = simSelectedAccts.includes(a.id) || simSelectedAccts.length===0;
    if (simSelectedAccts.length===0) simSelectedAccts.push(a.id);
    row.innerHTML = `
      <input type="checkbox" id="sc-${a.id}" ${simSelectedAccts.includes(a.id)?'checked':''} onchange="toggleSimAcct('${a.id}')" style="width:16px;height:16px;accent-color:var(--accent)">
      <label for="sc-${a.id}" style="flex:1;font-size:12px;cursor:pointer">${a.name}</label>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${fmtW(v)}</span>`;
    sel.appendChild(row);
  });
}

function toggleSimAcct(id) {
  const cb = document.getElementById('sc-'+id);
  if (cb.checked) { if (!simSelectedAccts.includes(id)) simSelectedAccts.push(id); }
  else { simSelectedAccts = simSelectedAccts.filter(i => i!==id); }
}

function selectAllSimAccts(val) {
  simSelectedAccts = val ? DB.accounts.map(a=>a.id) : [];
  renderSimPage();
  document.getElementById('sim-results').style.display = 'none';
}

function runSim() {
  const birthYear = parseInt(document.getElementById('sim-birthyear').value) || 1980;
  DB.settings = DB.settings || {};
  DB.settings.birthYear = birthYear;
  saveDB(DB);

  const selectedIds = simSelectedAccts.length ? simSelectedAccts : DB.accounts.map(a=>a.id);
  const selectedAccts = DB.accounts.filter(a => selectedIds.includes(a.id));

  // Per-account monthly savings
  const acctPlans = {};
  DB.savingPlans.forEach(p => { acctPlans[p.accountId] = (acctPlans[p.accountId]||0) + p.amount; });

  const r1 = parseFloat(document.getElementById('sim-r1').value||8)/100;
  const r2 = parseFloat(document.getElementById('sim-r2').value||11)/100;
  const r3 = parseFloat(document.getElementById('sim-r3').value||14)/100;
  const yrs = Math.min(40, parseInt(document.getElementById('sim-yrs').value||20));
  const curYear = new Date().getFullYear();
  const curAge = curYear - birthYear;

  function calcFV(initVal, monthly, r, years) {
    let v = initVal;
    for (let m=0; m<years*12; m++) v = v*(1+r/12) + monthly;
    return v;
  }

  // ── 1. 개별 계좌 결과 ──
  const acctResults = selectedAccts.map(a => {
    const init = acctVal(a);
    const monthly = acctPlans[a.id] || 0;
    const keyYrs = [1,3,5,10,15,20].filter(y=>y<=yrs);
    return {
      name: a.name,
      color: a.color,
      init,
      monthly,
      rows: keyYrs.map(y => ({
        y, age: curAge+y, year: curYear+y,
        c: calcFV(init, monthly, r1, y),
        m: calcFV(init, monthly, r2, y),
        a2: calcFV(init, monthly, r3, y),
      }))
    };
  });

  // ── 2. 통합 결과 ──
  const totalInit = selectedAccts.reduce((s,a) => s+acctVal(a), 0);
  const totalMonthly = selectedAccts.reduce((s,a) => s+(acctPlans[a.id]||0), 0);
  const combinedRows = [];
  for (let y=1; y<=yrs; y++) {
    combinedRows.push({
      y, age: curAge+y, year: curYear+y,
      c: calcFV(totalInit, totalMonthly, r1, y),
      m: calcFV(totalInit, totalMonthly, r2, y),
      a2: calcFV(totalInit, totalMonthly, r3, y),
    });
  }

  // ── Render summary ──
  const last = combinedRows[combinedRows.length-1];
  document.getElementById('sim-summary').innerHTML = `
    <div class="stat-card"><div class="sc-lbl">보수 연${(r1*100).toFixed(0)}%</div><div class="sc-val" style="font-size:16px;color:var(--text2)">${fmt(last.c)}</div><div class="sc-sub">${last.age}세 (${last.year}년)</div></div>
    <div class="stat-card highlight"><div class="sc-lbl">균형 연${(r2*100).toFixed(0)}%</div><div class="sc-val" style="font-size:16px">${fmt(last.m)}</div><div class="sc-sub">${last.age}세 (${last.year}년)</div></div>
    <div class="stat-card"><div class="sc-lbl">낙관 연${(r3*100).toFixed(0)}%</div><div class="sc-val" style="font-size:16px;color:var(--accent3)">${fmt(last.a2)}</div><div class="sc-sub">${last.age}세 (${last.year}년)</div></div>
    <div class="stat-card span2"><div class="sc-lbl">초기 자산 합계</div><div class="sc-val" style="font-size:16px">${fmtW(totalInit)}</div><div class="sc-sub">월 적립 ${fmtW(totalMonthly)}</div></div>`;

  // ── Chart (combined) ──
  const canvas = document.getElementById('sim-canvas');
  const W = Math.max(canvas.parentElement.clientWidth - 28, 300);
  canvas.width = W; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,W,160);
  const pL=8, pR=8, pT=10, pB=20, cW=W-pL-pR, cH=130;
  [[combinedRows.map(r=>r.c),'#444'],[combinedRows.map(r=>r.m),'#e8a020'],[combinedRows.map(r=>r.a2),'#3cb878']].forEach(([vals, color]) => {
    ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=1.5;
    vals.forEach((v,i) => { const x=pL+i/(yrs-1||1)*cW; const y=pT+cH-(v/last.a2)*cH; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.stroke();
  });
  // Age milestones
  const milestones = [40,50,60,65,70].filter(age => age > curAge && age <= curAge+yrs);
  milestones.forEach(age => {
    const yr = age - curAge;
    const x = pL + (yr-1)/(yrs-1||1)*cW;
    ctx.strokeStyle = 'rgba(136,136,136,0.3)'; ctx.lineWidth=0.5;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(x, pT); ctx.lineTo(x, pT+cH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(136,136,136,0.6)'; ctx.font = '9px monospace';
    ctx.fillText(age+'세', x+2, pT+12);
  });
  const labelsEl = document.getElementById('sim-xlabels');
  labelsEl.innerHTML = '';
  [curAge+1, curAge+Math.floor(yrs/2), curAge+yrs].forEach(age => {
    const sp = document.createElement('span'); sp.className = 'lc-lbl';
    sp.textContent = age + '세 (' + (curYear+(age-curAge)) + ')';
    labelsEl.appendChild(sp);
  });

  // ── Age milestone table ──
  const ageRows = [40,50,55,60,65].filter(age => age > curAge && age <= curAge+yrs);
  let ageTableHTML = '';
  if (ageRows.length) {
    ageTableHTML = `
      <div class="slbl">나이별 예상 자산</div>
      <div class="card" style="overflow-x:auto">
        <table class="sim-tbl">
          <thead><tr><th>나이</th><th>연도</th><th>보수</th><th>균형</th><th>낙관</th></tr></thead>
          <tbody>${ageRows.map(age => {
            const yr = age - curAge;
            const r = combinedRows.find(r=>r.y===yr) || combinedRows[combinedRows.length-1];
            return `<tr class="${age===60||age===65?'hl':''}">
              <td style="color:var(--accent)">${age}세</td>
              <td>${curYear+yr}년</td>
              <td>${fmt(r.c)}</td><td>${fmt(r.m)}</td><td>${fmt(r.a2)}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }
  document.getElementById('sim-age-table').innerHTML = ageTableHTML;

  // ── Per-account tables ──
  const perAcctEl = document.getElementById('sim-per-acct');
  perAcctEl.innerHTML = '';
  acctResults.forEach(ar => {
    if (!ar.rows.length) return;
    const div = document.createElement('div');
    div.style.marginBottom = '12px';
    div.innerHTML = `
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${ar.color};display:inline-block"></span>${ar.name}
        <span style="font-size:10px;color:var(--text3)">초기 ${fmt(ar.init)} · 월 ${fmt(ar.monthly)}</span>
      </div>
      <div class="card" style="overflow-x:auto;padding:10px">
        <table class="sim-tbl">
          <thead><tr><th>기간</th><th>나이</th><th>보수</th><th>균형</th><th>낙관</th></tr></thead>
          <tbody>${ar.rows.map(r=>`<tr ${r.y===10||r.y===yrs?'class="hl"':''}>
            <td>${r.y}년</td><td style="color:var(--accent)">${r.age}세</td>
            <td>${fmt(r.c)}</td><td>${fmt(r.m)}</td><td>${fmt(r.a2)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    perAcctEl.appendChild(div);
  });

  // ── Combined detail table ──
  const keyYrs = [1,3,5,10,15,20,25,30].filter(y=>y<=yrs);
  document.getElementById('sim-table').innerHTML = `
    <thead><tr><th>기간</th><th>나이</th><th>보수</th><th>균형</th><th>낙관</th><th>누적납입</th></tr></thead>
    <tbody>${keyYrs.map(y => {
      const r = combinedRows.find(r=>r.y===y) || combinedRows[combinedRows.length-1];
      const inv = totalInit + totalMonthly*12*y;
      return `<tr ${y===10||y===yrs?'class="hl"':''}>
        <td>${y}년</td><td style="color:var(--accent)">${r.age}세</td>
        <td>${fmt(r.c)}</td><td>${fmt(r.m)}</td><td>${fmt(r.a2)}</td><td>${fmt(inv)}</td></tr>`;
    }).join('')}</tbody>`;

  document.getElementById('sim-results').style.display = 'block';
  toast('✓ 시뮬레이션 완료');
}

// ══════════════════════════════════════════════════
// RISK PAGE
// ══════════════════════════════════════════════════
function renderRisk() { renderRebalancing(); renderRiskItems(); renderChecklist(); }
function renderRebalancing() {
  const list = document.getElementById('rebal-list'); list.innerHTML = '';
  if (!DB.targets.length) { list.innerHTML = '<div class="empty" style="padding:1.5rem">목표 비중 없음<br>목표 설정을 눌러주세요</div>'; return; }
  const son = ownerTotal('아들'); const ah = allH().filter(h=>h.owner==='아들');
  DB.targets.forEach(t => {
    const val = ah.filter(h=>h.category===t.category).reduce((s,h)=>s+hval(h),0);
    const actual = son>0 ? val/son : 0;
    const diff = (actual-t.target)*100; const abs = Math.abs(diff);
    const color = CAT_COLORS[t.category] || '#888';
    let sc='st-ok', st='✓ 정상';
    if (abs>10) { sc='st-bad'; st='✗ 이탈 '+fmtPct(diff); }
    else if (abs>5) { sc='st-warn'; st='△ 주의 '+fmtPct(diff); }
    const fw = Math.min(100, Math.round(actual/Math.max(t.target*1.5, 0.01)*100));
    const el = document.createElement('div');
    el.className = 'alloc-item drag-item';
    el.dataset.id = t.category;
    el.dataset.type = 'target';
    el.innerHTML = `<div class="alloc-top"><div style="display:flex;align-items:center;gap:8px"><span class="drag-handle" style="color:var(--text3);font-size:16px;cursor:grab;touch-action:none">⠿</span><span class="alloc-nm">${t.category}</span></div><div class="alloc-nums"><span class="alloc-cur" style="color:${color}">${(actual*100).toFixed(1)}%</span><span class="alloc-tgt">/ ${(t.target*100).toFixed(0)}%</span></div></div><div class="alloc-bg"><div class="alloc-fill" style="width:${fw}%;background:${color}"></div></div><div class="alloc-foot"><span class="${sc}">${st}</span><span style="color:var(--text3)">${fmtW(val)}</span></div>`;
    list.appendChild(el);
  });
  afterRender(setupDragTargets);
}
function renderRiskItems() {
  const son = ownerTotal('아들'); const ah = allH().filter(h=>h.owner==='아들');
  const getPct = cat => son>0 ? ah.filter(h=>h.category===cat).reduce((s,h)=>s+hval(h),0)/son*100 : 0;
  const us=getPct('미국주식')+getPct('레버리지'), lev=getPct('레버리지'), cash=getPct('현금'), india=getPct('신흥국');
  const items = [
    {icon:'🇺🇸',title:'미국 기술주 집중도',val:us.toFixed(1)+'%',ok:us<=70,warn:us<=80,desc:us>80?'미국 기술주가 매우 높습니다. 인도·현금 비중 확대를 검토하세요.':us>70?'다소 높은 편입니다.':'정상 범위입니다.'},
    {icon:'⚡',title:'QLD 레버리지 비중',val:lev.toFixed(1)+'%',ok:lev<=30,warn:lev<=35,desc:lev>30?'레버리지 비중이 목표를 초과했습니다.':'정상 범위입니다.'},
    {icon:'💵',title:'현금 쿠션',val:cash.toFixed(1)+'%',ok:cash>=8,warn:cash>=5,desc:cash<5?'현금이 부족합니다. 하락장 대응 여력이 없습니다.':cash<8?'현금이 다소 부족합니다.':'정상 범위입니다.'},
    {icon:'🇮🇳',title:'인도 환율 리스크',val:india.toFixed(1)+'%',ok:india<=25,warn:india<=30,desc:india>25?'인도 비중이 높습니다. Tiger 인도는 환헤지 없으니 주의하세요.':'정상 범위입니다.'},
  ];
  const el = document.getElementById('risk-list'); el.innerHTML = '';
  items.forEach(item => {
    const icon = item.ok?'✅':item.warn?'🟡':'🔴';
    const color = item.ok?'var(--accent3)':item.warn?'var(--accent)':'var(--red)';
    el.innerHTML += `<div class="risk-item"><span class="risk-icon">${item.icon}</span><div class="risk-body"><div class="risk-title">${item.title}</div><div class="risk-desc">${item.desc}</div></div><div class="risk-val" style="color:${color}">${icon}<br>${item.val}</div></div>`;
  });
}
function renderChecklist() {
  const el = document.getElementById('checklist'); el.innerHTML = '';
  DB.checklist.forEach(item => {
    const tr = document.createElement('div'); tr.className = 'toggle-row';
    tr.innerHTML = `<span class="toggle-lbl" style="${item.done?'color:var(--text3);text-decoration:line-through':''}">${item.text}</span><div class="toggle-track${item.done?' on':''}" onclick="toggleCheck('${item.id}')"><div class="toggle-thumb"></div></div>`;
    el.appendChild(tr);
  });
  el.innerHTML += `<button class="btn btn-s" style="margin-top:12px;font-size:12px" onclick="resetChecklist()">체크리스트 초기화</button>`;
}
function toggleCheck(id) { const i=DB.checklist.find(c=>c.id===id); if(i){i.done=!i.done;saveDB(DB);renderChecklist();} }
function resetChecklist() { DB.checklist.forEach(c=>c.done=false); saveDB(DB); renderChecklist(); toast('초기화'); }

// ══════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════
function showAddAcctModal() {
  openModal(`<div class="modal-handle"></div><div class="modal-title">계좌 추가</div>
    <div class="form-row"><div class="form-lbl">계좌주</div><select class="fsel" id="m-owner"><option>본인</option><option>아들</option></select></div>
    <div class="form-row"><div class="form-lbl">증권사</div><input class="fi" id="m-broker" placeholder="예: 키움"></div>
    <div class="form-row"><div class="form-lbl">계좌 유형</div><select class="fsel" id="m-type"><option>일반주식</option><option>IRP</option><option>연금저축</option><option>CMA</option><option>개인연금</option></select></div>
    <div class="form-row"><div class="form-lbl">계좌 별명</div><input class="fi" id="m-name" placeholder="예: 키움 주식(아들)"></div>
    <button class="btn btn-p" style="margin-top:4px" onclick="addAcct()">추가</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
function addAcct() {
  const o=document.getElementById('m-owner').value, b=document.getElementById('m-broker').value,
        t=document.getElementById('m-type').value, n=document.getElementById('m-name').value||b+' '+t;
  if (!b) { toast('증권사 입력'); return; }
  DB.accounts.push({id:'a'+Date.now(),owner:o,broker:b,type:t,name:n,color:COLORS[DB.accounts.length%COLORS.length],holdings:[]});
  saveDB(DB); closeModal(); renderDashboard(); toast('✓ 계좌 추가');
}
function showEditAcctModal(id) {
  const a=DB.accounts.find(a=>a.id===id); if(!a)return;
  openModal(`<div class="modal-handle"></div><div class="modal-title">계좌 수정</div>
    <div class="form-row"><div class="form-lbl">계좌 별명</div><input class="fi" id="m-name" value="${a.name}"></div>
    <div class="form-row"><div class="form-lbl">증권사</div><input class="fi" id="m-broker" value="${a.broker}"></div>
    <button class="btn btn-p" style="margin-top:4px" onclick="editAcct('${id}')">저장</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
function editAcct(id) {
  const a=DB.accounts.find(a=>a.id===id); if(!a)return;
  a.name=document.getElementById('m-name').value||a.name;
  a.broker=document.getElementById('m-broker').value||a.broker;
  saveDB(DB); closeModal(); renderDashboard(); toast('✓ 저장');
}
function deleteAcct(id) {
  if (!confirm('계좌와 보유 종목을 삭제합니다. 계속?')) return;
  DB.accounts=DB.accounts.filter(a=>a.id!==id); saveDB(DB); renderDashboard(); toast('삭제');
}
function showAddHoldingModal(aid) {
  openModal(`<div class="modal-handle"></div><div class="modal-title">종목 추가</div>
    <div style="display:flex;gap:6px;margin-bottom:12px">
      <button class="btn-sm" style="flex:1;padding:10px" onclick="showAddCashModal('${aid}')">💵 예수금/현금</button>
      <button class="btn-sm" style="flex:1;padding:10px;color:var(--accent)" onclick="showAddStockModal('${aid}')">📈 주식/ETF</button>
    </div>`);
}

function showAddCashModal(aid) {
  openModal(`<div class="modal-handle"></div><div class="modal-title">예수금 / 현금 추가</div>
    <div class="form-row"><div class="form-lbl">이름</div><input class="fi" id="m-hname" value="예수금"></div>
    <div class="form-row"><div class="form-lbl">잔액 (원)</div><input class="fi" id="m-cash-amt" type="number" placeholder="0"></div>
    <button class="btn btn-p" style="margin-top:4px" onclick="addCash('${aid}')">추가</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}

function addCash(aid) {
  const a=DB.accounts.find(a=>a.id===aid); if(!a)return;
  const name = document.getElementById('m-hname').value || '예수금';
  const amt = parseFloat(document.getElementById('m-cash-amt').value)||0;
  a.holdings.push({id:'h'+Date.now(),name,ticker:'CASH',category:'현금',qty:1,avgPrice:amt,curPrice:amt});
  saveDB(DB); closeModal(); renderDashboard(); toast('✓ 추가');
}

function showAddStockModal(aid) {
  openModal(`<div class="modal-handle"></div><div class="modal-title">주식 / ETF 추가</div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">종목명</div><input class="fi" id="m-hname" placeholder="예: QLD"></div>
      <div class="form-row"><div class="form-lbl">티커 / 관리코드</div><input class="fi" id="m-ticker" placeholder="예: QLD, 069500"></div>
    </div>
    <div style="margin-bottom:10px">
      <button class="btn-sm" onclick="showETFSearchForHolding()">🔍 해외 ETF 현재가 조회</button>
    </div>
    <div class="form-row"><div class="form-lbl">카테고리</div>
      <select class="fsel" id="m-cat"><option>미국주식</option><option>레버리지</option><option>신흥국</option><option>채권</option><option>국내주식</option><option>기타</option></select></div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">보유 수량</div><input class="fi" id="m-qty" type="number" placeholder="0"></div>
      <div class="form-row"><div class="form-lbl">평균 단가</div><input class="fi" id="m-avg" type="number" placeholder="0"></div>
    </div>
    <div class="form-row"><div class="form-lbl">현재가</div><input class="fi" id="m-cur" type="number" placeholder="0"></div>
    <button class="btn btn-p" style="margin-top:4px" onclick="addHolding('${aid}')">추가</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
async function showETFSearchForHolding() {
  const ticker = document.getElementById('m-ticker').value.trim().toUpperCase();
  if (!ticker) { toast('티커를 먼저 입력해 주세요'); return; }
  toast('조회 중...');
  const result = await fetchETFPrice(ticker);
  if (!result || !result.price) { toast('조회 실패. 직접 입력해 주세요'); return; }
  const krwPrice = result.currency==='USD' ? Math.round(result.price * 1484) : Math.round(result.price);
  document.getElementById('m-hname').value = result.name || ticker;
  document.getElementById('m-cur').value = krwPrice;
  toast('✓ ' + fmtW(krwPrice) + ' 적용됨');
}
function addHolding(aid) {
  const a=DB.accounts.find(a=>a.id===aid); if(!a)return;
  const n=document.getElementById('m-hname').value;
  if (!n) { toast('종목명 입력'); return; }
  a.holdings.push({id:'h'+Date.now(),name:n,ticker:document.getElementById('m-ticker').value||n,category:document.getElementById('m-cat').value,qty:parseFloat(document.getElementById('m-qty').value)||0,avgPrice:parseFloat(document.getElementById('m-avg').value)||0,curPrice:parseFloat(document.getElementById('m-cur').value)||0});
  saveDB(DB); closeModal(); renderDashboard(); toast('✓ 종목 추가');
}
function showHoldingModal(aid, hid) {
  const a=DB.accounts.find(a=>a.id===aid); const h=a?.holdings.find(h=>h.id===hid); if(!h)return;
  const isCash = h.ticker==='CASH' || h.category==='현금' || h.name==='예수금';

  if (isCash) {
    // 현금/예수금 — 금액만 입력
    openModal(`<div class="modal-handle"></div><div class="modal-title">${h.name}</div>
      <div class="form-row">
        <div class="form-lbl">잔액 (원)</div>
        <input class="fi" id="m-cash-amt" type="number" value="${h.avgPrice}" placeholder="0">
      </div>
      <div class="form-row">
        <div class="form-lbl">이름</div>
        <input class="fi" id="m-hname" value="${h.name}">
      </div>
      <button class="btn btn-p" style="margin-top:4px" onclick="editCash('${aid}','${hid}')">저장</button>
      <button class="btn btn-d" style="margin-top:8px" onclick="deleteHolding('${aid}','${hid}')">삭제</button>
      <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
    return;
  }

  openModal(`<div class="modal-handle"></div><div class="modal-title">${h.name} 수정</div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">종목명</div><input class="fi" id="m-hname" value="${h.name}"></div>
      <div class="form-row"><div class="form-lbl">티커 / 관리코드</div><input class="fi" id="m-ticker" value="${h.ticker}" placeholder="예: QLD, 069500"></div>
    </div>
    <div style="font-size:10px;color:var(--text3);margin:-6px 0 10px">국내 ETF는 6자리 코드 (예: 069500), 해외는 티커 (예: QLD)</div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">수량</div><input class="fi" id="m-qty" type="number" value="${h.qty}"></div>
      <div class="form-row"><div class="form-lbl">평균 단가</div><input class="fi" id="m-avg" type="number" value="${h.avgPrice}"></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <div class="form-row" style="flex:1;margin-bottom:0"><div class="form-lbl">현재가 ← 업데이트</div><input class="fi" id="m-cur" type="number" value="${h.curPrice}"></div>
      <button class="btn-sm" style="margin-top:14px;white-space:nowrap" onclick="fetchAndFillPrice('${h.ticker}')">🔍 조회</button>
    </div>
    <div class="form-row"><div class="form-lbl">카테고리</div>
      <select class="fsel" id="m-cat">${['미국주식','레버리지','신흥국','현금','채권','국내주식','기타'].map(c=>`<option${c===h.category?' selected':''}>${c}</option>`).join('')}</select></div>
    <button class="btn btn-p" style="margin-top:4px" onclick="editHolding('${aid}','${hid}')">저장</button>
    <button class="btn btn-d" style="margin-top:8px" onclick="deleteHolding('${aid}','${hid}')">종목 삭제</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
async function fetchAndFillPrice(ticker) {
  if (!ticker || ticker==='CASH') { toast('해외 ETF만 자동 조회 가능'); return; }
  toast('조회 중...');
  const result = await fetchETFPrice(ticker);
  if (!result || !result.price) { toast('조회 실패. 직접 입력해 주세요'); return; }
  const krwPrice = result.currency==='USD' ? Math.round(result.price * 1484) : Math.round(result.price);
  document.getElementById('m-cur').value = krwPrice;
  toast('✓ ' + fmtW(krwPrice) + ' 적용됨');
}

function editCash(aid, hid) {
  const a=DB.accounts.find(a=>a.id===aid); const h=a?.holdings.find(h=>h.id===hid); if(!h)return;
  const amt = parseFloat(document.getElementById('m-cash-amt').value)||0;
  const name = document.getElementById('m-hname')?.value || h.name;
  h.name = name;
  h.avgPrice = amt;
  h.curPrice = amt;
  h.qty = 1;
  saveDB(DB); closeModal(); renderDashboard(); toast('✓ 저장');
}

function editHolding(aid, hid) {
  const a=DB.accounts.find(a=>a.id===aid); const h=a?.holdings.find(h=>h.id===hid); if(!h)return;
  const newName = document.getElementById('m-hname')?.value; if(newName) h.name = newName;
  const newTicker = document.getElementById('m-ticker')?.value?.trim(); if(newTicker) h.ticker = newTicker;
  h.qty=parseFloat(document.getElementById('m-qty').value)||0;
  h.avgPrice=parseFloat(document.getElementById('m-avg').value)||0;
  h.curPrice=parseFloat(document.getElementById('m-cur').value)||0;
  h.category=document.getElementById('m-cat').value;
  saveDB(DB); closeModal(); renderDashboard(); toast('✓ 저장');
}
function deleteHolding(aid, hid) {
  const a=DB.accounts.find(a=>a.id===aid); if(!a)return;
  a.holdings=a.holdings.filter(h=>h.id!==hid);
  saveDB(DB); closeModal(); renderDashboard(); toast('삭제');
}
function showAddPlanModal() {
  const opts=DB.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  openModal(`<div class="modal-handle"></div><div class="modal-title">적립 계획 추가</div>
    <div class="form-row"><div class="form-lbl">계좌</div><select class="fsel" id="m-acct">${opts}</select></div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">월 적립액(원)</div><input class="fi" id="m-amt" type="number" placeholder="100000"></div>
      <div class="form-row"><div class="form-lbl">적립일</div><input class="fi" id="m-day" type="number" value="25" min="1" max="31"></div>
    </div>
    <div class="form-row"><div class="form-lbl">메모</div><input class="fi" id="m-memo" placeholder="예: 균형형 적립"></div>
    <button class="btn btn-p" onclick="addPlan()">추가</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
function addPlan() {
  const aid=document.getElementById('m-acct').value, amt=parseFloat(document.getElementById('m-amt').value)||0;
  if (!amt) { toast('적립액 입력'); return; }
  DB.savingPlans.push({id:'sp'+Date.now(),accountId:aid,amount:amt,day:parseInt(document.getElementById('m-day').value)||25,memo:document.getElementById('m-memo').value,allocations:[]});
  saveDB(DB); closeModal(); renderSaving(); toast('✓ 추가');
}
function showEditPlanModal(pid) {
  const p = DB.savingPlans.find(p => p.id === pid); if (!p) return;
  const acct = DB.accounts.find(a => a.id === p.accountId);

  // 해당 계좌의 종목 목록 (현금 제외)
  const holdings = acct ? acct.holdings.filter(h => h.ticker !== 'CASH' && h.category !== '현금') : [];

  // 기존 배분에 없는 종목도 추가 가능하도록 전체 종목 옵션
  const allHoldings = DB.accounts.flatMap(a =>
    a.holdings.filter(h => h.ticker !== 'CASH' && h.category !== '현금')
      .map(h => ({ name: h.name, ticker: h.ticker }))
  );
  const uniqueHoldings = [...new Map(allHoldings.map(h => [h.ticker, h])).values()];

  const optionsHTML = uniqueHoldings.map(h =>
    `<option value="${h.name}">${h.name} (${h.ticker})</option>`
  ).join('');

  const ar = p.allocations.map((a, i) => `
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center" id="al-row-${i}">
      <select class="fsel" id="al-n-${i}" style="flex:2">
        <option value="${a.name}" selected>${a.name}</option>
        ${optionsHTML}
      </select>
      <input class="fi" id="al-a-${i}" type="number" value="${a.amount}" placeholder="금액" style="flex:1;min-width:80px">
      <button class="btn-sm" style="color:var(--red);flex-shrink:0;padding:8px" onclick="removeAlRow('al-row-${i}')">✕</button>
    </div>`).join('');

  openModal(`<div class="modal-handle"></div><div class="modal-title">적립 계획 수정</div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">월 적립액</div><input class="fi" id="m-amt" type="number" value="${p.amount}"></div>
      <div class="form-row"><div class="form-lbl">적립일</div><input class="fi" id="m-day" type="number" value="${p.day}"></div>
    </div>
    <div class="form-row"><div class="form-lbl">메모</div><input class="fi" id="m-memo" value="${p.memo||''}"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 6px">
      <div class="slbl" style="margin:0">종목별 배분</div>
      <div id="al-remain" style="font-family:var(--mono);font-size:11px;color:var(--accent3)"></div>
    </div>
    <div id="al-rows">${ar}</div>
    <button class="btn-sm" style="margin-bottom:10px;width:100%" onclick="addAlRow('${p.accountId}')">＋ 종목 추가</button>
    <button class="btn btn-p" onclick="savePlan('${pid}')">저장</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);

  // 잔여 금액 실시간 표시
  updateAlRemain();
}

function updateAlRemain() {
  const total = parseFloat(document.getElementById('m-amt')?.value) || 0;
  let used = 0;
  for (let i = 0;; i++) {
    const a = document.getElementById('al-a-' + i);
    if (!a) break;
    used += parseFloat(a.value) || 0;
  }
  const remain = total - used;
  const el = document.getElementById('al-remain');
  if (el) {
    el.textContent = remain === 0 ? '✓ 배분 완료' : (remain > 0 ? `잔여 ${fmt(remain)}원` : `${fmt(Math.abs(remain))}원 초과`);
    el.style.color = remain === 0 ? 'var(--accent3)' : remain > 0 ? 'var(--accent)' : 'var(--red)';
  }
}

function removeAlRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) { row.remove(); updateAlRemain(); }
}

function addAlRow(acctId) {
  const acct = DB.accounts.find(a => a.id === acctId);
  const allHoldings = DB.accounts.flatMap(a =>
    a.holdings.filter(h => h.ticker !== 'CASH' && h.category !== '현금')
      .map(h => ({ name: h.name, ticker: h.ticker }))
  );
  const uniqueHoldings = [...new Map(allHoldings.map(h => [h.ticker, h])).values()];
  const optionsHTML = uniqueHoldings.map(h =>
    `<option value="${h.name}">${h.name} (${h.ticker})</option>`
  ).join('');

  const c = document.getElementById('al-rows');
  const cnt = c.children.length;
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center';
  d.id = 'al-row-' + cnt;
  d.innerHTML = `
    <select class="fsel" id="al-n-${cnt}" style="flex:2">
      <option value="">종목 선택</option>
      ${optionsHTML}
    </select>
    <input class="fi" id="al-a-${cnt}" type="number" placeholder="금액" style="flex:1;min-width:80px" oninput="updateAlRemain()">
    <button class="btn-sm" style="color:var(--red);flex-shrink:0;padding:8px" onclick="removeAlRow('al-row-${cnt}')">✕</button>`;
  c.appendChild(d);
  updateAlRemain();
}
function savePlan(pid) {
  const p=DB.savingPlans.find(p=>p.id===pid); if(!p)return;
  p.amount=parseFloat(document.getElementById('m-amt').value)||p.amount;
  p.day=parseInt(document.getElementById('m-day').value)||p.day;
  p.memo=document.getElementById('m-memo').value;
  const al=[];
  for(let i=0;;i++){const n=document.getElementById('al-n-'+i),a=document.getElementById('al-a-'+i);if(!n)break;if(n.value)al.push({name:n.value,amount:parseFloat(a?.value)||0});}
  p.allocations=al; saveDB(DB); closeModal(); renderSaving(); toast('✓ 저장');
}
function deletePlan(pid) {
  DB.savingPlans=DB.savingPlans.filter(p=>p.id!==pid); saveDB(DB); renderSaving(); toast('삭제');
}
function showTradeModal() {
  const brokers=[...new Set(DB.accounts.map(a=>a.broker))];
  openModal(`<div class="modal-handle"></div><div class="modal-title">거래 기록</div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">거래일</div><input class="fi" id="t-date" type="date" value="${tod()}"></div>
      <div class="form-row"><div class="form-lbl">구분</div><select class="fsel" id="t-type"><option>매수</option><option>매도</option></select></div>
    </div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">계좌주</div><select class="fsel" id="t-owner"><option>아들</option><option>본인</option></select></div>
      <div class="form-row"><div class="form-lbl">증권사</div><select class="fsel" id="t-broker">${brokers.map(b=>`<option>${b}</option>`).join('')}</select></div>
    </div>
    <div class="form-row"><div class="form-lbl">종목명</div><input class="fi" id="t-name" placeholder="예: QLD"></div>
    <div class="fg2">
      <div class="form-row"><div class="form-lbl">수량</div><input class="fi" id="t-qty" type="number" placeholder="0"></div>
      <div class="form-row"><div class="form-lbl">단가(원)</div><input class="fi" id="t-price" type="number" placeholder="0"></div>
    </div>
    <div class="form-row"><div class="form-lbl">메모</div><input class="fi" id="t-memo" placeholder="선택"></div>
    <button class="btn btn-p" onclick="saveTrade()">저장</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
function saveTrade() {
  const n=document.getElementById('t-name').value; if(!n){toast('종목명 입력');return;}
  const q=parseFloat(document.getElementById('t-qty').value)||0, pr=parseFloat(document.getElementById('t-price').value)||0;
  DB.trades.push({id:'t'+Date.now(),date:document.getElementById('t-date').value,owner:document.getElementById('t-owner').value,broker:document.getElementById('t-broker').value,type:document.getElementById('t-type').value,name:n,qty:q,price:pr,amount:q*pr,memo:document.getElementById('t-memo').value});
  saveDB(DB); closeModal(); renderLog(); toast('✓ 저장');
}
function deleteTrade(id) { DB.trades=DB.trades.filter(t=>t.id!==id); saveDB(DB); renderLog(); toast('삭제'); }
function showTargetModal() {
  const rows=DB.targets.map((t,i)=>`<div class="fg2" style="margin-bottom:6px"><input class="fi" id="tc-${i}" value="${t.category}" placeholder="카테고리"><input class="fi" id="tp-${i}" type="number" value="${(t.target*100).toFixed(0)}" placeholder="목표(%)"></div>`).join('');
  openModal(`<div class="modal-handle"></div><div class="modal-title">리밸런싱 목표 비중</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">아들 계좌 기준 · 합계 100% 권장<br>카테고리는 종목 추가 시 지정한 카테고리와 동일하게 입력</div>
    <div id="tgt-rows">${rows}</div>
    <button class="btn-sm" style="margin-bottom:8px" onclick="addTgtRow(${DB.targets.length})">＋ 항목 추가</button>
    <button class="btn btn-p" onclick="saveTargets()">저장</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
function addTgtRow(cnt) {
  const c=document.getElementById('tgt-rows'); const d=document.createElement('div');
  d.className='fg2'; d.style.marginBottom='6px';
  d.innerHTML=`<input class="fi" id="tc-${cnt}" placeholder="카테고리"><input class="fi" id="tp-${cnt}" type="number" placeholder="%">`;
  c.appendChild(d);
}
function saveTargets() {
  const t=[];
  for(let i=0;;i++){const c=document.getElementById('tc-'+i),p=document.getElementById('tp-'+i);if(!c)break;if(c.value)t.push({category:c.value,target:parseFloat(p?.value||0)/100});}
  DB.targets=t; saveDB(DB); closeModal(); renderRisk(); toast('✓ 저장');
}
function openModal(html) { document.getElementById('modal-box').innerHTML=html; document.getElementById('modal-overlay').classList.add('show'); document.getElementById('modal-box').scrollTop=0; }
function closeModal(e) { if(e&&e.target!==document.getElementById('modal-overlay'))return; document.getElementById('modal-overlay').classList.remove('show'); }
function toast(msg) { const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }


// ══════════════════════════════════════════════════
// 현재가 자동 업데이트 (구글 시트 GOOGLEFINANCE 활용)
// ══════════════════════════════════════════════════

const PRICE_SHEET = '현재가';

// 앱의 모든 티커를 구글 시트 '현재가' 탭에 자동 기록
async function exportTickersToSheet() {
  if (!isGConnected() || !loadGConfig().sheetId) {
    toast('구글 시트 연결 필요');
    return false;
  }

  // 모든 종목 티커 수집 (중복 제거, CASH 제외)
  const tickerMap = {};
  DB.accounts.forEach(a => {
    a.holdings.forEach(h => {
      if (h.ticker && h.ticker !== 'CASH' && !tickerMap[h.ticker]) {
        tickerMap[h.ticker] = { name: h.name, ticker: h.ticker };
      }
    });
  });

  const tickers = Object.values(tickerMap);
  if (!tickers.length) { toast('티커가 없습니다'); return false; }

  // 시트 생성 확인
  try {
    const id = loadGConfig().sheetId;
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}`, {
      headers: { Authorization: 'Bearer ' + getToken() }
    });
    const meta = await r.json();
    const exists = meta.sheets?.some(s => s.properties.title === PRICE_SHEET);
    if (!exists) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: PRICE_SHEET } } }] })
      });
    }
  } catch(e) {}

  // 헤더 + 티커 + GOOGLEFINANCE 수식 기록
  const rows = [
    ['티커', '현재가(원)', '종목명', '업데이트시간'],
    ...tickers.map(t => {
      // 국내 ETF: 6자리 숫자 → KRX:티커
      // 해외 ETF: 그대로 사용
      const isKorean = /^\d{6}$/.test(t.ticker);
      const gfTicker = isKorean ? `KRX:${t.ticker}` : t.ticker;
      // 국내는 원화 그대로, 해외는 USD→KRW 환산 (1484 기준)
      const priceFormula = isKorean
        ? `=IFERROR(GOOGLEFINANCE("${gfTicker}","price"),"")`
        : `=IFERROR(ROUND(GOOGLEFINANCE("${gfTicker}","price")*GOOGLEFINANCE("CURRENCY:USDKRW"),0),"")`;
      return [t.ticker, priceFormula, t.name, `=NOW()`];
    })
  ];

  const ok = await sheetsPut(`${PRICE_SHEET}!A1`, rows);
  return ok;
}

// 구글 시트 '현재가' 탭에서 현재가 읽어서 앱에 반영
async function importPricesFromSheet() {
  if (!isGConnected() || !loadGConfig().sheetId) {
    toast('구글 시트 연결 필요');
    return;
  }

  toast('티커 전송 중...');

  try {
    // 티커 내보내기
    await exportTickersToSheet();

    // GOOGLEFINANCE 계산 대기 (최대 3회 재시도)
    let priceMap = {};
    for (let attempt = 1; attempt <= 3; attempt++) {
      toast(`현재가 조회 중... (${attempt}/3)`);
      await new Promise(r => setTimeout(r, attempt * 2000));

      const values = await sheetsGet(`${PRICE_SHEET}!A2:D100`);
      if (values && values.length) {
        values.forEach(row => {
          if (row[0] && row[1]) {
            const price = parseFloat(row[1]);
            if (!isNaN(price) && price > 0) priceMap[row[0]] = price;
          }
        });
      }
      if (Object.keys(priceMap).length > 0) break;
    }

    // 조회된 것만 업데이트 (부분 업데이트 허용)
    let updated = 0;
    let skipped = 0;
    DB.accounts.forEach(a => {
      a.holdings.forEach(h => {
        if (h.ticker && h.ticker !== 'CASH') {
          if (priceMap[h.ticker]) {
            h.curPrice = priceMap[h.ticker];
            updated++;
          } else {
            skipped++;
          }
        }
      });
    });

    if (updated > 0) {
      saveDB(DB);
      renderDashboard();
      const msg = skipped > 0
        ? `✓ ${updated}개 업데이트 (${skipped}개 조회 실패)`
        : `✓ ${updated}개 종목 현재가 업데이트됨`;
      toast(msg);
    } else {
      // 전부 실패한 경우 — 시트 직접 확인 안내
      toast('조회 실패 — 시트에서 직접 확인 후 다시 시도');
      // 구글 시트 바로 열기 버튼 제공
      const sheetId = loadGConfig().sheetId;
      if (sheetId) {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
        if (confirm('구글 시트 현재가 탭을 열어서 수식이 계산됐는지 확인하시겠어요?')) {
          window.open(url, '_blank');
        }
      }
    }

  } catch(e) {
    toast('오류: ' + e.message);
  }
}

// 구글 시트 현재가 탭 안내 모달
function showPriceSheetGuide() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">현재가 시트 확인 필요</div>
    <div style="font-size:12px;color:var(--text2);line-height:1.8;margin-bottom:12px">
      구글 시트 <b style="color:var(--accent)">'현재가'</b> 탭의 B열 수식이 아직 계산 중이거나 오류일 수 있습니다.<br><br>
      <b style="color:var(--text)">확인 방법:</b><br>
      1. 구글 시트 열기<br>
      2. <b>'현재가'</b> 탭 클릭<br>
      3. B열에 숫자가 표시되는지 확인<br>
      4. 숫자가 보이면 앱에서 다시 시도
    </div>
    <div style="background:var(--bg3);border-radius:8px;padding:10px;font-size:11px;color:var(--text3);margin-bottom:12px">
      국내 ETF 예시: <span style="color:var(--accent2)">KRX:069500</span><br>
      해외 ETF 예시: <span style="color:var(--accent2)">QLD, QQQM, SPYM</span><br>
      환율 자동 적용: USD → KRW 실시간 환산
    </div>
    <button class="btn btn-p" onclick="importPricesFromSheet();closeModal()">다시 시도</button>
    <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">닫기</button>
  `);
}

// INIT
renderDashboard();
updateTopbar();

// ══════════════════════════════════════════════════
// GOOGLE SHEETS BACKUP
// ══════════════════════════════════════════════════

const BACKUP_SHEET_NAME = '앱백업';
let gToken = null;
let gSheetId = null;
let autoBackupTimer = null;

// ── 설정 로드/저장 ─────────────────────────────────
function loadGConfig() {
  return JSON.parse(localStorage.getItem('gConfig') || '{}');
}
function saveGConfig(cfg) {
  localStorage.setItem('gConfig', JSON.stringify(cfg));
}

// ── 구글 로그인 ────────────────────────────────────
function gSignIn() {
  const cfg = loadGConfig();
  if (!cfg.clientId || cfg.clientId === 'YOUR_CLIENT_ID_HERE') {
    toast('⚠️ config.js에 Client ID를 먼저 입력해 주세요');
    return;
  }
  const tc = google.accounts.oauth2.initTokenClient({
    client_id: cfg.clientId,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    callback: async (resp) => {
      if (resp.error) { toast('로그인 실패: ' + resp.error); return; }
      gToken = resp.access_token;
      sessionStorage.setItem('gToken', gToken);
      toast('✓ 구글 계정 연결됨');
      updateBackupUI();
    }
  });
  tc.requestAccessToken({ prompt: '' });
}

function gSignOut() {
  gToken = null;
  sessionStorage.removeItem('gToken');
  toast('구글 연결 해제됨');
  updateBackupUI();
}

function isGConnected() {
  return !!(gToken || sessionStorage.getItem('gToken'));
}
function getToken() {
  return gToken || sessionStorage.getItem('gToken');
}

// ── 시트 API 헬퍼 ──────────────────────────────────
async function sheetsGet(range) {
  const id = loadGConfig().sheetId;
  if (!id) return null;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.values;
}

async function sheetsPut(range, values) {
  const id = loadGConfig().sheetId;
  if (!id || !getToken()) return false;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
  return r.ok;
}

async function ensureBackupSheet() {
  const id = loadGConfig().sheetId;
  if (!id || !getToken()) return false;
  // 시트 목록 확인
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}`, {
    headers: { Authorization: 'Bearer ' + getToken() }
  });
  if (!r.ok) return false;
  const meta = await r.json();
  const exists = meta.sheets?.some(s => s.properties.title === BACKUP_SHEET_NAME);
  if (!exists) {
    // 시트 추가
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: BACKUP_SHEET_NAME } } }] })
    });
  }
  return true;
}

// ── 백업 실행 ──────────────────────────────────────
async function backupToSheets(silent = false) {
  if (!isGConnected()) {
    if (!silent) toast('먼저 구글 계정을 연결해 주세요');
    return false;
  }
  if (!loadGConfig().sheetId) {
    if (!silent) toast('시트 ID를 먼저 입력해 주세요');
    return false;
  }
  try {
    if (!silent) toast('백업 중...');
    await ensureBackupSheet();
    const now = new Date().toLocaleString('ko-KR');
    const payload = JSON.stringify(DB);
    const ok = await sheetsPut(`${BACKUP_SHEET_NAME}!A1:B2`, [
      ['마지막 백업', now],
      ['데이터', payload]
    ]);
    if (ok) {
      if (!silent) toast('✓ 구글 시트 백업 완료');
      localStorage.setItem('lastBackup', now);
      updateBackupUI();
      return true;
    } else {
      if (!silent) toast('백업 실패 — 연결 상태 확인');
      return false;
    }
  } catch(e) {
    if (!silent) toast('백업 오류: ' + e.message);
    return false;
  }
}

// ── 복원 실행 ──────────────────────────────────────
async function restoreFromSheets() {
  if (!isGConnected()) { toast('먼저 구글 계정을 연결해 주세요'); return; }
  if (!confirm('구글 시트에서 데이터를 불러옵니다.\n현재 로컬 데이터는 덮어씌워집니다. 계속할까요?')) return;
  try {
    toast('복원 중...');
    const values = await sheetsGet(`${BACKUP_SHEET_NAME}!A1:B2`);
    if (!values || !values[1]?.[1]) { toast('복원할 데이터가 없습니다'); return; }
    const restored = JSON.parse(values[1][1]);
    DB = restored;
    saveDB(DB);
    toast('✓ 복원 완료 — ' + (values[0]?.[1] || ''));
    renderDashboard();
    updateBackupUI();
  } catch(e) {
    toast('복원 오류: ' + e.message);
  }
}

// ── 자동 백업 (변경 시 30초 후) ────────────────────
function scheduleAutoBackup() {
  if (!loadGConfig().autoBackup) return;
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(() => backupToSheets(true), 30000);
}

// 자동 백업은 saveDB 내부에서 직접 호출됨

// ── 백업 UI 업데이트 ───────────────────────────────
function updateBackupUI() {
  const cfg = loadGConfig();
  const connected = isGConnected();
  const lastBackup = localStorage.getItem('lastBackup') || '없음';

  const statusEl = document.getElementById('backup-status');
  const btnEl = document.getElementById('backup-btn');
  const restoreEl = document.getElementById('restore-btn');
  const signEl = document.getElementById('g-sign-btn');
  const lastEl = document.getElementById('last-backup');

  if (statusEl) statusEl.textContent = connected ? '✓ 연결됨' : '미연결';
  if (statusEl) statusEl.style.color = connected ? 'var(--accent3)' : 'var(--text3)';
  if (btnEl) btnEl.disabled = !connected;
  if (restoreEl) restoreEl.disabled = !connected;
  if (signEl) signEl.textContent = connected ? '구글 연결 해제' : 'Google로 연결';
  if (lastEl) lastEl.textContent = '마지막 백업: ' + lastBackup;

  // auto backup toggle
  const autoEl = document.getElementById('auto-backup-toggle');
  if (autoEl) autoEl.classList.toggle('on', !!cfg.autoBackup);
}

function toggleAutoBackup() {
  const cfg = loadGConfig();
  cfg.autoBackup = !cfg.autoBackup;
  saveGConfig(cfg);
  updateBackupUI();
  toast(cfg.autoBackup ? '✓ 자동 백업 켜짐' : '자동 백업 꺼짐');
}

function saveBackupSettings() {
  const cfg = loadGConfig();
  const sheetId = document.getElementById('backup-sheet-id')?.value?.trim();
  const clientId = document.getElementById('backup-client-id')?.value?.trim();
  if (sheetId) {
    const match = sheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    cfg.sheetId = match ? match[1] : sheetId;
  }
  if (clientId) cfg.clientId = clientId;
  saveGConfig(cfg);
  toast('✓ 설정 저장됨');
  updateBackupUI();
}

// ── 백업 설정 모달 ─────────────────────────────────
function showBackupModal() {
  const cfg = loadGConfig();
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">☁ 구글 시트 동기화</div>

    <div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px">연결 상태</span>
        <span id="backup-status" style="font-size:12px;font-family:var(--mono)">${isGConnected()?'✓ 연결됨':'미연결'}</span>
      </div>
      <div style="font-size:10px;color:var(--text3)" id="last-backup">마지막 백업: ${localStorage.getItem('lastBackup')||'없음'}</div>
      <div style="font-size:10px;color:var(--accent2);margin-top:4px">앱 시작 시 자동으로 최신 데이터 로드 · 변경 후 30초 자동 저장</div>
    </div>

    <div class="form-row">
      <div class="form-lbl">Google Client ID</div>
      <input class="fi" id="backup-client-id" placeholder="기존 config.js의 Client ID" value="${cfg.clientId||''}">
    </div>
    <div class="form-row">
      <div class="form-lbl">구글 시트 ID (또는 URL 전체)</div>
      <input class="fi" id="backup-sheet-id" placeholder="스프레드시트 URL 또는 ID" value="${cfg.sheetId||''}">
      <div style="font-size:10px;color:var(--text3);margin-top:3px">URL에서 /d/ 뒤 ~ /edit 앞 부분 · 전체 URL 붙여넣어도 자동 추출</div>
    </div>
    <button class="btn btn-s" style="margin-bottom:8px" onclick="saveBackupSettings()">설정 저장</button>

    <div class="toggle-row">
      <span class="toggle-lbl">자동 백업 (변경 후 30초)</span>
      <div class="toggle-track${cfg.autoBackup?' on':''}" id="auto-backup-toggle" onclick="toggleAutoBackup()">
        <div class="toggle-thumb"></div>
      </div>
    </div>

    <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-s" id="g-sign-btn" onclick="${isGConnected()?'gSignOut()':'gSignIn()'}">
        ${isGConnected()?'구글 연결 해제':'Google로 연결'}
      </button>
      <button class="btn btn-p" id="backup-btn" onclick="backupToSheets()" ${isGConnected()?'':'disabled'}>
        지금 백업하기
      </button>
      <button class="btn btn-s" id="restore-btn" onclick="autoLoadFromSheets().then(()=>closeModal())" ${isGConnected()?'':'disabled'}
        style="border-color:rgba(74,158,255,.3);color:var(--accent2)">
        ↓ 지금 최신 데이터 가져오기
      </button>
      <button class="btn btn-s" onclick="restoreFromSheets()" ${isGConnected()?'':'disabled'}
        style="border-color:rgba(155,127,232,.3);color:var(--purple)">
        구글 시트에서 강제 복원
      </button>
    </div>

    <div style="font-size:10px;color:var(--text3);margin-top:14px;line-height:1.7">
      ※ 백업 데이터는 구글 시트 <b style="color:var(--text)">'앱백업'</b> 탭에 저장됩니다<br>
      ※ Client ID는 기존에 발급받은 것 그대로 사용 가능<br>
      ※ 자동 저장: 데이터 변경 30초 후 자동 백업<br>
      ※ 자동 로드: 앱 시작 시 구글 시트가 더 최신이면 자동 적용
    </div>
    <button class="btn btn-s" style="margin-top:10px" onclick="closeModal()">닫기</button>
  `);
}

// ── 초기화 시 구글 토큰 복원 + 자동 로드 ──────────
async function initBackup() {
  const storedToken = sessionStorage.getItem('gToken');
  if (storedToken) gToken = storedToken;

  const cfg = loadGConfig();
  if (!cfg.sheetId || !cfg.clientId) return;
  if (!gToken) {
    // 토큰 없으면 자동 재발급 시도 (silent)
    try {
      await new Promise((resolve, reject) => {
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: cfg.clientId,
          scope: 'https://www.googleapis.com/auth/spreadsheets',
          callback: (resp) => {
            if (resp.error) reject(resp.error);
            else { gToken = resp.access_token; sessionStorage.setItem('gToken', gToken); resolve(); }
          },
          error_callback: reject
        });
        tc.requestAccessToken({ prompt: '' });
      });
    } catch(e) {
      // 자동 로그인 실패 — 로컬 데이터 사용
      return;
    }
  }

  // 구글 시트에서 최신 데이터 로드
  await autoLoadFromSheets();
}

async function autoLoadFromSheets() {
  try {
    const values = await sheetsGet(`${BACKUP_SHEET_NAME}!A1:B2`);
    if (!values || !values[1]?.[1]) return; // 백업 데이터 없으면 로컬 유지

    const sheetData = JSON.parse(values[1][1]);
    const sheetTime = values[0]?.[1] || '';
    const localBackup = localStorage.getItem('lastBackup') || '';

    // 구글 시트가 로컬보다 최신이면 자동 로드
    if (!localBackup || sheetTime > localBackup) {
      DB = sheetData;
      saveDB(DB);
      localStorage.setItem('lastBackup', sheetTime);
      renderDashboard();
      updateBackupUI();
      toast('☁ 최신 데이터 로드됨');
    }
  } catch(e) {
    // 실패 시 조용히 로컬 데이터 사용
  }
}

// 앱 시작
window.addEventListener('load', () => {
  // google gsi 라이브러리 로드 후 실행
  const tryInit = () => {
    if (window.google?.accounts?.oauth2) {
      initBackup();
    } else {
      setTimeout(tryInit, 500);
    }
  };
  setTimeout(tryInit, 1000);
});

// ══════════════════════════════════════════════════
// DRAG & DROP SORT (touch + mouse)
// ══════════════════════════════════════════════════

let dragState = null;

function initDrag(container, onReorder) {
  if (!container) return;
  let items = () => [...container.querySelectorAll('.drag-item')];
  let dragging = null;
  let placeholder = null;
  let startY = 0;
  let offsetY = 0;

  function getY(e) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

  function onStart(e) {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const item = handle.closest('.drag-item');
    if (!item) return;

    e.preventDefault();
    dragging = item;
    startY = getY(e);
    offsetY = item.getBoundingClientRect().top - startY;

    // placeholder
    placeholder = document.createElement('div');
    placeholder.style.cssText = `height:${item.offsetHeight}px;background:rgba(232,160,32,.08);border:1px dashed rgba(232,160,32,.3);border-radius:8px;margin-bottom:6px`;
    item.parentNode.insertBefore(placeholder, item.nextSibling);

    item.style.cssText += `;position:fixed;z-index:500;width:${item.offsetWidth}px;opacity:.9;box-shadow:0 8px 24px rgba(0,0,0,.4);pointer-events:none;top:${item.getBoundingClientRect().top}px;left:${item.getBoundingClientRect().left}px`;

    document.addEventListener('mousemove', onMove, {passive:false});
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const y = getY(e);
    dragging.style.top = (y + offsetY) + 'px';

    // find insert position
    const its = items().filter(i => i !== dragging);
    let insertBefore = null;
    for (const it of its) {
      const rect = it.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { insertBefore = it; break; }
    }
    if (insertBefore) container.insertBefore(placeholder, insertBefore);
    else container.appendChild(placeholder);
  }

  function onEnd() {
    if (!dragging) return;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);

    // restore style
    dragging.style.position = '';
    dragging.style.zIndex = '';
    dragging.style.width = '';
    dragging.style.opacity = '';
    dragging.style.boxShadow = '';
    dragging.style.pointerEvents = '';
    dragging.style.top = '';
    dragging.style.left = '';

    // insert at placeholder position
    container.insertBefore(dragging, placeholder);
    placeholder.remove();

    // collect new order
    const newOrder = items().map(i => i.dataset.id);
    onReorder(newOrder);
    dragging = null;
  }

  container.addEventListener('mousedown', onStart);
  container.addEventListener('touchstart', onStart, {passive:false});
}

function setupDragAccts() {
  const c = document.getElementById('acct-list');
  if (!c) return;
  initDrag(c, (order) => {
    DB.accounts = order.map(id => DB.accounts.find(a => a.id === id)).filter(Boolean);
    saveDB(DB);
  });
}

function setupDragHoldings(acctId) {
  const c = document.getElementById('det-' + acctId);
  if (!c) return;
  initDrag(c, (order) => {
    const a = DB.accounts.find(a => a.id === acctId);
    if (!a) return;
    a.holdings = order.map(id => a.holdings.find(h => h.id === id)).filter(Boolean);
    saveDB(DB);
  });
}

function setupDragPlans() {
  const c = document.getElementById('saving-list');
  if (!c) return;
  initDrag(c, (order) => {
    DB.savingPlans = order.map(id => DB.savingPlans.find(p => p.id === id)).filter(Boolean);
    saveDB(DB);
  });
}

function setupDragTargets() {
  const c = document.getElementById('rebal-list');
  if (!c) return;
  initDrag(c, (order) => {
    DB.targets = order.map(cat => DB.targets.find(t => t.category === cat)).filter(Boolean);
    saveDB(DB);
  });
}

// 각 render 함수 뒤에 drag 초기화 — MutationObserver로 DOM 생성 후 실행
function afterRender(fn) { requestAnimationFrame(() => requestAnimationFrame(fn)); }
