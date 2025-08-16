/* Barista Tip Splitter — auto-generated payout periods (with fixed Refresh button)
 * - Enter shifts; click "Refresh periods from shifts" to build unique contiguous periods per active team
 * - Enter Cash/Card for each period, then Calculate to split evenly (optional smart rounding)
 * - Clear per-period audit
 */

(function(){
  // ------------- State -------------
  const state = {
    baristas: [], // [{id,name,shifts:[{start,end}]}]
    periods: []   // [{id, start, end, teamIds:[id], cash:0, card:0}]
  };

  // ------------- Helpers -------------
  const $ = s => document.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2,9);
  function timeToMin(t){ if(!t) return null; const [h,m]=t.split(':').map(Number); return (isNaN(h)||isNaN(m))?null:h*60+m; }
  function minToTime(mm){ const h=Math.floor(mm/60), m=mm%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
  function fmtMoney(n){ return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function assertRangeValid(s,e){ const ss=timeToMin(s), ee=timeToMin(e); return ss!=null && ee!=null && ee>ss; }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Toasts
  const toastEl = $('#toast'); let toastTimer=null;
  function toast(msg, ms=2600){ toastEl.textContent=msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('show'), ms); }

  // ------------- Baristas & Shifts (UI) -------------
  const elBaristaList = $('#baristaList');
  const baristaItemTmpl = $('#baristaItemTmpl');
  const shiftRowTmpl = $('#shiftRowTmpl');
  const periodsDirtyBadge = $('#periodsDirtyBadge');

  function markPeriodsDirty(){ periodsDirtyBadge.style.display='inline-block'; }

  function renderBaristas(){
    elBaristaList.innerHTML='';
    state.baristas.forEach(b=>{
      const node = baristaItemTmpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.barista-name').textContent = b.name;

      const shiftList = node.querySelector('.shift-list'); shiftList.innerHTML='';
      b.shifts.forEach((sh, idx)=>{
        const row = shiftRowTmpl.content.firstElementChild.cloneNode(true);
        row.querySelector('.shift-in').value = sh.start || '';
        row.querySelector('.shift-out').value = sh.end || '';
        row.querySelector('.remove-shift-btn').addEventListener('click', ()=>{
          b.shifts.splice(idx,1); renderBaristas(); markPeriodsDirty(); toast('Shift removed.');
        });
        row.querySelector('.shift-in').addEventListener('change', ev=>{
          sh.start = ev.target.value;
          if (sh.end && !assertRangeValid(sh.start, sh.end)) { alert('Shift end must be after start.'); sh.start=''; ev.target.value=''; }
          markPeriodsDirty();
        });
        row.querySelector('.shift-out').addEventListener('change', ev=>{
          sh.end = ev.target.value;
          if (sh.start && !assertRangeValid(sh.start, sh.end)) { alert('Shift end must be after start.'); sh.end=''; ev.target.value=''; }
          markPeriodsDirty();
        });
        shiftList.appendChild(row);
      });

      node.querySelector('.add-shift-btn').addEventListener('click', ()=>{
        b.shifts.push({start:'', end:''}); renderBaristas(); markPeriodsDirty();
        toast('Add each time range the barista was on window/making drinks.');
      });
      node.querySelector('.remove-barista-btn').addEventListener('click', ()=>{
        state.baristas = state.baristas.filter(x=>x!==b); renderBaristas(); markPeriodsDirty(); toast('Barista removed.');
      });

      elBaristaList.appendChild(node);
    });
  }

  $('#addBaristaBtn').addEventListener('click', ()=>{
    const name = $('#baristaName').value.trim();
    if(!name) return alert('Enter a barista name.');
    state.baristas.push({id:uid(), name, shifts:[]});
    $('#baristaName').value=''; renderBaristas(); markPeriodsDirty();
    toast('You can add multiple shifts under the same Barista below.');
  });

  // ------------- Build periods from shifts -------------
  const elPeriodList = $('#periodList');
  const periodRowTmpl = $('#periodRowTmpl');
  const noPeriodsNote = $('#noPeriodsNote');

  function activeAt(tMin, baristas){
    const ids = [];
    for(const b of baristas){
      for(const sh of b.shifts){
        const s=timeToMin(sh.start), e=timeToMin(sh.end);
        if(s!=null && e!=null && s<=tMin && tMin<e){ ids.push(b.id); break; }
      }
    }
    return ids.sort(); // canonical order
  }
  function eqArray(a,b){ if(a.length!==b.length) return false; for(let i=0;i<a.length;i++){ if(a[i]!==b[i]) return false; } return true; }

  function generatePeriodsFromShifts(){
    try{
      // Gather valid shifts and boundaries
      const baristas = state.baristas.map(b=>({
        id:b.id, name:b.name,
        shifts:b.shifts.filter(sh=>assertRangeValid(sh.start, sh.end))
      })).filter(b=>b.shifts.length>0);

      const allTimes = new Set();
      baristas.forEach(b=>b.shifts.forEach(sh=>{
        allTimes.add(timeToMin(sh.start)); allTimes.add(timeToMin(sh.end));
      }));
      const times = [...allTimes].filter(t=>t!=null).sort((a,b)=>a-b);

      const blocks = [];
      for(let i=0;i<times.length-1;i++){
        const a=times[i], b=times[i+1];
        if (a>=b) continue;
        const teamIds = activeAt(a, baristas);
        if (teamIds.length===0) continue; // skip uncovered gaps
        const last = blocks[blocks.length-1];
        if (last && last.end===a && eqArray(last.teamIds, teamIds)){
          last.end = b; // merge consecutive same-team segments
        }else{
          blocks.push({start:a, end:b, teamIds:[...teamIds]});
        }
      }

      // Preserve any existing inputs when possible
      const priorMap = new Map(state.periods.map(p => [`${p.start}-${p.end}-${p.teamIds.join('.')}`, p]));
      state.periods = blocks.map(bl=>{
        const key = `${bl.start}-${bl.end}-${bl.teamIds.join('.')}`;
        const existing = priorMap.get(key);
        return {
          id: existing?.id || uid(),
          start: bl.start, end: bl.end, teamIds: bl.teamIds.slice(),
          cash: existing?.cash || 0, card: existing?.card || 0
        };
      });

      renderPeriods();
      periodsDirtyBadge.style.display='none';
      toast('Periods updated from shifts. Enter Cash & Card for each line.');
    }catch(err){
      console.error('generatePeriodsFromShifts error:', err);
      alert('Could not build periods from shifts. Please check your times and try again.');
    }
  }

  function renderPeriods(){
    elPeriodList.innerHTML='';
    if (state.periods.length===0){ noPeriodsNote.style.display='block'; return; }
    noPeriodsNote.style.display='none';

    state.periods.forEach((p, idx)=>{
      const node = periodRowTmpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = p.id;
      node.querySelector('.when').textContent = `Period #${idx+1}: ${minToTime(p.start)} → ${minToTime(p.end)} (${p.end-p.start} min)`;
      const teamNames = p.teamIds.map(id => state.baristas.find(b=>b.id===id)?.name || id).join(', ');
      node.querySelector('.who').textContent = `Team: ${teamNames}`;

      const cashEl = node.querySelector('.cash');
      const cardEl = node.querySelector('.card');
      cashEl.value = p.cash ? Number(p.cash).toFixed(2) : '';
      cardEl.value = p.card ? Number(p.card).toFixed(2) : '';

      cashEl.addEventListener('input', e=>{ const v=parseFloat(e.target.value); p.cash=isNaN(v)?0:v; });
      cardEl.addEventListener('input', e=>{ const v=parseFloat(e.target.value); p.card=isNaN(v)?0:v; });

      node.querySelector('.remove-period-btn').addEventListener('click', ()=>{
        state.periods = state.periods.filter(x=>x.id!==p.id);
        renderPeriods(); toast('Period removed.');
      });

      elPeriodList.appendChild(node);
    });
  }

  // Make sure the button is definitely wired (explicit lookup + guard)
  (function wireRefresh(){
    const btn = document.getElementById('refreshPeriodsBtn');
    if (btn) {
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); generatePeriodsFromShifts(); }, false);
    }
  })();

  // ------------- Calculation -------------
  const roundingToggle = $('#roundingToggle');

  function calcAllocations(){
    const results = {};
    state.baristas.forEach(b=> results[b.id]={name:b.name, cash:0, card:0, total:0});

    const perPeriodAudit = [];
    let totalCash=0, totalCard=0;

    state.periods.forEach((p, idx)=>{
      const teamIds = p.teamIds.slice();
      if (teamIds.length===0) return;
      const perHeadCash = (p.cash||0) / teamIds.length;
      const perHeadCard = (p.card||0) / teamIds.length;

      totalCash += (p.cash||0); totalCard += (p.card||0);

      teamIds.forEach(id=>{
        if (results[id]) {
          results[id].cash += perHeadCash;
          results[id].card += perHeadCard;
        }
      });

      perPeriodAudit.push({
        title: `Period #${idx+1}: ${minToTime(p.start)} → ${minToTime(p.end)} (${p.end-p.start} min)`,
        teamIds, cash: p.cash||0, card: p.card||0,
        perHeadCash, perHeadCard
      });
    });

    if (roundingToggle.checked){
      ['cash','card'].forEach(type=>{
        const target = Math.round(((type==='cash')?totalCash:totalCard)*100);
        const rows = Object.entries(results).map(([id,r])=>({id, exact:r[type]}));
        const cents = rows.map(r=>({id:r.id, cents: Math.round(r.exact*100), exact:r.exact}));
        let sum = cents.reduce((a,r)=>a+r.cents,0);
        if (sum!==target){
          const delta = target - sum, direction = Math.sign(delta), count = Math.abs(delta);
          const prefs = rows.map(r=>{
            const raw=r.exact*100, frac=raw-Math.floor(raw), inv=1-frac;
            return {id:r.id, score: direction>0? frac : (frac===0?1:inv)};
          }).sort((a,b)=>b.score-a.score);
          for(let i=0;i<count;i++){
            const pick = prefs[i%prefs.length];
            const idx = cents.findIndex(x=>x.id===pick.id);
            cents[idx].cents += direction;
          }
        }
        cents.forEach(r=>{ results[r.id][type]=r.cents/100; });
      });
    }

    Object.values(results).forEach(r=> r.total = r.cash + r.card);
    return { results, totalsByType:{cash:totalCash, card:totalCard}, perPeriodAudit };
  }

  // ------------- Results UI -------------
  function renderSummary(calc){
    const table = document.createElement('table');
    const rows = Object.entries(calc.results)
      .map(([id,r])=>({name:r.name, cash:r.cash, card:r.card, total:r.total}))
      .sort((a,b)=>a.name.localeCompare(b.name));

    const sumCash = rows.reduce((a,r)=>a+r.cash,0);
    const sumCard = rows.reduce((a,r)=>a+r.card,0);
    const sumTotal = rows.reduce((a,r)=>a+r.total,0);

    table.innerHTML = `
      <thead><tr><th>Barista</th><th>Cash</th><th>Card</th><th>Total</th></tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>$${fmtMoney(r.cash)}</td>
            <td>$${fmtMoney(r.card)}</td>
            <td>$${fmtMoney(r.total)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr><td>Totals</td><td>$${fmtMoney(sumCash)}</td><td>$${fmtMoney(sumCard)}</td><td>$${fmtMoney(sumTotal)}</td></tr>
      </tfoot>`;
    $('#summary').innerHTML=''; $('#summary').appendChild(table);
  }

  const auditTmpl = $('#auditChunkTmpl');
  function renderAudit(calc){
    const wrap = $('#auditLog'); wrap.innerHTML='';
    calc.perPeriodAudit.forEach(period=>{
      const node = auditTmpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.chunk-title').textContent = period.title;

      const teamNames = period.teamIds.map(id=> state.baristas.find(b=>b.id===id)?.name || id).join(', ');
      node.querySelector('.chunk-totals').innerHTML =
        `<div><strong>Team:</strong> ${escapeHtml(teamNames)}</div>
         <div><strong>Paid Out:</strong> Cash $${fmtMoney(period.cash)} • Card $${fmtMoney(period.card)}</div>
         <div><strong>Split rule:</strong> even split among ${period.teamIds.length} active barista(s) in this period.</div>`;

      const perRows = period.teamIds.map(id=>{
        const name = state.baristas.find(b=>b.id===id)?.name || id;
        return {name, cash: period.perHeadCash, card: period.perHeadCard};
      }).sort((a,b)=>a.name.localeCompare(b.name));

      const tbl = document.createElement('table');
      tbl.innerHTML = `
        <thead><tr><th>Barista</th><th>Cash share</th><th>Card share</th><th>Total</th></tr></thead>
        <tbody>
          ${perRows.map(r=>`
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td>$${fmtMoney(r.cash)}</td>
              <td>$${fmtMoney(r.card)}</td>
              <td>$${fmtMoney(r.cash + r.card)}</td>
            </tr>
          `).join('')}
        </tbody>`;
      node.querySelector('.chunk-table').appendChild(tbl);
      wrap.appendChild(node);
    });
  }

  function renderResults(calc){
    $('#resultsWrap').classList.remove('hidden');
    renderSummary(calc);
    renderAudit(calc);
  }

  // ------------- CSV -------------
  function exportCsv(calc){
    const rows = Object.entries(calc.results)
      .map(([id,r])=>({name:r.name, cash:r.cash, card:r.card, total:r.total}))
      .sort((a,b)=>a.name.localeCompare(b.name));

    const header = ['Barista','Cash','Card','Total'];
    const body = rows.map(r=>[r.name, fmtMoney(r.cash), fmtMoney(r.card), fmtMoney(r.total)]);
    body.push(['Totals', fmtMoney(rows.reduce((a,r)=>a+r.cash,0)), fmtMoney(rows.reduce((a,r)=>a+r.card,0)), fmtMoney(rows.reduce((a,r)=>a+r.total,0))]);

    const csv = [header, ...body].map(r => r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='tip-split.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ------------- Save / Load / Reset -------------
  function saveState(){
    localStorage.setItem('baristaTipSplitter:v2', JSON.stringify(state));
    toast('Saved. Remember: claim proper tips via the Daily Sales QR Code.');
  }
  function loadState(){
    const raw = localStorage.getItem('baristaTipSplitter:v2');
    if(!raw) return toast('No saved data found.');
    try{
      const data = JSON.parse(raw);
      state.baristas = Array.isArray(data.baristas)? data.baristas : [];
      state.periods  = Array.isArray(data.periods)?  data.periods  : [];
      renderBaristas(); renderPeriods(); toast('Loaded.');
    }catch{ alert('Could not load saved data.'); }
  }
  function resetState(){
    if(!confirm('Clear all baristas, shifts, and payout periods?')) return;
    state.baristas=[]; state.periods=[]; renderBaristas(); renderPeriods();
    $('#resultsWrap').classList.add('hidden');
    toast('Cleared. Log new shifts and generate periods.');
  }

  // ------------- Action buttons -------------
  document.getElementById('calcBtn').addEventListener('click', ()=>{
    if(state.baristas.length===0) return alert('Add at least one barista.');
    if(state.periods.length===0){ generatePeriodsFromShifts(); if(state.periods.length===0) return; }
    const calc = calcAllocations();
    renderResults(calc);
    document.getElementById('exportCsvBtn').onclick = () => exportCsv(calc);
    toast('Calculated. Review the Summary and Audit below.');
  });

  document.getElementById('saveStateBtn').addEventListener('click', saveState);
  document.getElementById('loadStateBtn').addEventListener('click', loadState);
  document.getElementById('resetStateBtn').addEventListener('click', resetState);
  document.getElementById('printBtn').addEventListener('click', ()=>{ window.print(); toast('Printing summary and audit.'); });

  // ------------- Init -------------
  renderBaristas();
  renderPeriods();
  setTimeout(()=>toast('Start by adding baristas, then click Refresh Periods and enter payouts.'), 600);
})();
