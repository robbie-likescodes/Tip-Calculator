/* Theme restored + "<5 min merge" with toast only if merges happened + merge notes in audit */

(function(){
  // ----- State -----
  const state = {
    baristas: [],                  // [{id,name,shifts:[{start,end}]}]
    periods: [],                   // [{id,start,end,teamIds:[id],cash,card}]
    lastMergeNotes: []             // [{fromIdx,toIdx,infoText}]
  };
  const SMOOTH_MINUTES = 5;

  // ----- Helpers -----
  const $ = s => document.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2,9);
  function timeToMin(t){ if(!t) return null; const [h,m]=t.split(':').map(Number); return (isNaN(h)||isNaN(m))?null:h*60+m; }
  function minToTime(mm){ const h=Math.floor(mm/60), m=mm%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
  function fmtMoney(n){ return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function assertRangeValid(s,e){ const ss=timeToMin(s), ee=timeToMin(e); return ss!=null && ee!=null && ee>ss; }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Toast
  const toastEl = $('#toast'); let toastTimer=null;
  function toast(msg, ms=2400){ toastEl.textContent=msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('show'), ms); }

  // ----- Baristas UI -----
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
        row.querySelector('.shift-in').addEventListener('change', e=>{
          sh.start = e.target.value;
          if (sh.end && !assertRangeValid(sh.start, sh.end)) { alert('Shift end must be after start.'); sh.start=''; e.target.value=''; }
          markPeriodsDirty();
        });
        row.querySelector('.shift-out').addEventListener('change', e=>{
          sh.end = e.target.value;
          if (sh.start && !assertRangeValid(sh.start, sh.end)) { alert('Shift end must be after start.'); sh.end=''; e.target.value=''; }
          markPeriodsDirty();
        });
        shiftList.appendChild(row);
      });

      node.querySelector('.add-shift-btn').addEventListener('click', ()=>{
        b.shifts.push({start:'', end:''}); renderBaristas(); markPeriodsDirty();
        toast('You can add multiple shifts under the same Barista below.');
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
  });

  // ----- Period generation -----
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
    return ids.sort(); // canonical
  }
  function eqArray(a,b){ if(a.length!==b.length) return false; for(let i=0;i<a.length;i++){ if(a[i]!==b[i]) return false; } return true; }

  function mergeSameTeam(blocks){
    if(blocks.length<=1) return blocks.slice();
    const out=[blocks[0]];
    for(let i=1;i<blocks.length;i++){
      const cur=blocks[i], prev=out[out.length-1];
      if(prev.end===cur.start && eqArray(prev.teamIds, cur.teamIds)){ prev.end = cur.end; }
      else out.push({...cur});
    }
    return out;
  }

  // Remove any block < SMOOTH_MINUTES by merging into neighbor (prefer previous)
  function removeTinyBlocks(blocks){
    if(blocks.length<=1) return blocks.slice();
    let arr = blocks.slice();
    const notes = [];

    let changed = true;
    while (changed){
      changed = false;
      for(let i=0;i<arr.length;i++){
        const dur = arr[i].end - arr[i].start;
        if (dur >= SMOOTH_MINUTES) continue;

        const from = arr[i];
        if (i>0){
          const to = arr[i-1];
          notes.push({fromIdx:i, toIdx:i-1, infoText:`Merged ${minToTime(from.start)}–${minToTime(from.end)} (${dur} min) into previous (${minToTime(to.start)}–${minToTime(to.end)})`});
          to.end = Math.max(to.end, from.end);
          arr.splice(i,1);
        } else if (arr.length>1){
          const to = arr[1];
          notes.push({fromIdx:i, toIdx:1, infoText:`Merged ${minToTime(from.start)}–${minToTime(from.end)} (${dur} min) into next (${minToTime(to.start)}–${minToTime(to.end)})`});
          to.start = Math.min(to.start, from.start);
          arr.splice(0,1);
        }
        arr = mergeSameTeam(arr);
        changed = true;
        break;
      }
    }
    return {arr, notes};
  }

  function generatePeriodsFromShifts(){
    // collect valid shifts
    const baristas = state.baristas.map(b=>({
      id:b.id, name:b.name, shifts:b.shifts.filter(sh=>assertRangeValid(sh.start, sh.end))
    })).filter(b=>b.shifts.length>0);

    // time boundaries
    const set = new Set();
    baristas.forEach(b=>b.shifts.forEach(sh=>{ set.add(timeToMin(sh.start)); set.add(timeToMin(sh.end)); }));
    const times = [...set].filter(v=>v!=null).sort((a,b)=>a-b);

    // raw blocks by active team
    const raw=[];
    for(let i=0;i<times.length-1;i++){
      const a=times[i], b=times[i+1];
      if (a>=b) continue;
      const teamIds = activeAt(a, baristas);
      if (teamIds.length===0) continue;
      raw.push({start:a, end:b, teamIds});
    }

    // merge identical neighbors then remove tiny blocks (<5)
    const merged = mergeSameTeam(raw);
    const {arr:smoothed, notes} = removeTinyBlocks(merged);

    // preserve amounts if same key exists
    const prior = new Map(state.periods.map(p => [`${p.start}-${p.end}-${p.teamIds.join('.')}`, p]));
    state.periods = smoothed.map(b=>{
      const key = `${b.start}-${b.end}-${b.teamIds.join('.')}`;
      const ex = prior.get(key);
      return { id: ex?.id || uid(), start:b.start, end:b.end, teamIds:b.teamIds.slice(), cash: ex?.cash || 0, card: ex?.card || 0 };
    });

    state.lastMergeNotes = notes; // keep for toast + audit
    renderPeriods();
    periodsDirtyBadge.style.display='none';

    if (notes.length > 0) {
      toast(`Merged ${notes.length} short period${notes.length>1?'s':''} (< ${SMOOTH_MINUTES} min).`);
    } else {
      toast('Periods updated from shifts.');
    }
  }

  function renderPeriods(){
    elPeriodList.innerHTML='';
    if (state.periods.length===0){ noPeriodsNote.style.display='block'; return; }
    noPeriodsNote.style.display='none';

    state.periods.forEach((p, i)=>{
      const node = periodRowTmpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = p.id;
      node.querySelector('.when').textContent = `Period #${i+1}: ${minToTime(p.start)} → ${minToTime(p.end)} (${p.end-p.start} min)`;
      const names = p.teamIds.map(id => state.baristas.find(b=>b.id===id)?.name || id).join(', ');
      node.querySelector('.who').textContent = `Team: ${names}`;

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

  // Wire refresh
  document.getElementById('refreshPeriodsBtn').addEventListener('click', (e)=>{ e.preventDefault(); generatePeriodsFromShifts(); });

  // ----- Calculation -----
  function calcTotals(){
    const results = {};
    state.baristas.forEach(b => results[b.id] = { name:b.name, cash:0, card:0, total:0 });

    const audit = [];
    let totalCash=0, totalCard=0;

    state.periods.forEach((p, idx)=>{
      const team = p.teamIds.slice();
      if (team.length===0) return;
      const eachCash = (p.cash||0)/team.length;
      const eachCard = (p.card||0)/team.length;

      totalCash += (p.cash||0);
      totalCard += (p.card||0);

      team.forEach(id=>{
        if(results[id]){ results[id].cash+=eachCash; results[id].card+=eachCard; }
      });

      audit.push({
        title:`Period #${idx+1}: ${minToTime(p.start)} → ${minToTime(p.end)} (${p.end-p.start} min)`,
        teamIds:team, cash:p.cash||0, card:p.card||0, eachCash, eachCard
      });
    });

    Object.values(results).forEach(r=> r.total = r.cash + r.card);
    return { results, totalsByType:{cash:totalCash, card:totalCard}, audit };
  }

  // ----- Results UI -----
  function renderQuickTotals(calc){
    const rows = Object.values(calc.results).map(r=>({name:r.name, cash:r.cash, card:r.card, total:r.total}))
      .sort((a,b)=>a.name.localeCompare(b.name));
    const table = document.createElement('table');
    const sumCash = rows.reduce((a,r)=>a+r.cash,0);
    const sumCard = rows.reduce((a,r)=>a+r.card,0);
    const sumTotal = rows.reduce((a,r)=>a+r.total,0);
    table.innerHTML = `
      <thead><tr><th>Barista</th><th>Cash</th><th>Card</th><th>Total</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>$${fmtMoney(r.cash)}</td><td>$${fmtMoney(r.card)}</td><td>$${fmtMoney(r.total)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Totals</td><td>$${fmtMoney(sumCash)}</td><td>$${fmtMoney(sumCard)}</td><td>$${fmtMoney(sumTotal)}</td></tr></tfoot>
    `;
    $('#summary').innerHTML=''; $('#summary').appendChild(table);
    $('#quickResults').classList.remove('hidden');
  }

  function renderAudit(calc){
    const mergeWrap = $('#mergeNotes');
    const auditWrap = $('#auditLog');
    mergeWrap.innerHTML = '';
    auditWrap.innerHTML = '';

    if (state.lastMergeNotes.length){
      const ul = document.createElement('ul');
      ul.style.margin='0'; ul.style.paddingLeft='18px';
      state.lastMergeNotes.forEach(n=>{
        const li=document.createElement('li'); li.textContent = n.infoText; ul.appendChild(li);
      });
      const title=document.createElement('div');
      title.innerHTML = `<strong>Merge notes:</strong>`;
      mergeWrap.appendChild(title);
      mergeWrap.appendChild(ul);
    }

    calc.audit.forEach(period=>{
      const names = period.teamIds.map(id => state.baristas.find(b=>b.id===id)?.name || id).join(', ');
      const perRows = period.teamIds.map(id=>{
        const name = state.baristas.find(b=>b.id===id)?.name || id;
        return {name, cash:period.eachCash, card:period.eachCard};
      }).sort((a,b)=>a.name.localeCompare(b.name));

      const tbl = document.createElement('table');
      tbl.innerHTML = `
        <caption style="text-align:left; font-weight:700; padding:6px 0">${escapeHtml(period.title)}</caption>
        <thead><tr><th>Barista</th><th>Cash share</th><th>Card share</th><th>Total</th></tr></thead>
        <tbody>
          ${perRows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>$${fmtMoney(r.cash)}</td><td>$${fmtMoney(r.card)}</td><td>$${fmtMoney(r.cash+r.card)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Paid Out totals</td><td>$${fmtMoney(period.cash)}</td><td>$${fmtMoney(period.card)}</td><td>$${fmtMoney(period.cash+period.card)}</td></tr></tfoot>
      `;
      auditWrap.appendChild(tbl);

      const note = document.createElement('div');
      note.className='muted'; note.style.marginBottom='14px';
      note.innerHTML = `<strong>Team:</strong> ${escapeHtml(names)} • <strong>Rule:</strong> even split among ${period.teamIds.length}`;
      auditWrap.appendChild(note);
    });
  }

  // CSV
  function exportCsv(calc){
    const rows = Object.values(calc.results).map(r=>({name:r.name, cash:r.cash, card:r.card, total:r.total}))
      .sort((a,b)=>a.name.localeCompare(b.name));
    const header = ['Barista','Cash','Card','Total'];
    const body = rows.map(r=>[r.name, fmtMoney(r.cash), fmtMoney(r.card), fmtMoney(r.total)]);
    body.push(['Totals', fmtMoney(rows.reduce((a,r)=>a+r.cash,0)), fmtMoney(rows.reduce((a,r)=>a+r.card,0)), fmtMoney(rows.reduce((a,r)=>a+r.total,0))]);
    const csv = [header, ...body].map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='tip-split.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // Buttons
  document.getElementById('calcBtn').addEventListener('click', ()=>{
    if(state.baristas.length===0) return alert('Add at least one barista.');
    if(state.periods.length===0){ generatePeriodsFromShifts(); if(state.periods.length===0) return; }
    const calc = calcTotals();
    renderQuickTotals(calc);
    $('#toggleAuditBtn').onclick = ()=>{
      const wrap = $('#auditWrap');
      if (wrap.classList.contains('hidden')) {
        renderAudit(calc);
        wrap.classList.remove('hidden'); wrap.open = true;
        $('#toggleAuditBtn').textContent = '📑 Hide Audit';
      } else {
        wrap.classList.add('hidden');
        $('#toggleAuditBtn').textContent = '📑 Show Audit';
      }
    };
    $('#exportCsvBtn').onclick = ()=>exportCsv(calc);
    $('#printBtn').onclick = ()=>{ window.print(); toast('Printing'); };
    toast('Calculated. Quick totals shown; open Audit for details.');
  });

  document.getElementById('saveStateBtn').addEventListener('click', ()=>{
    localStorage.setItem('baristaTipSplitter:v3', JSON.stringify(state));
    toast('Saved.');
  });
  document.getElementById('loadStateBtn').addEventListener('click', ()=>{
    const raw = localStorage.getItem('baristaTipSplitter:v3');
    if(!raw) return toast('No saved data found.');
    try{
      const data = JSON.parse(raw);
      state.baristas = Array.isArray(data.baristas)?data.baristas:[];
      state.periods  = Array.isArray(data.periods)?data.periods:[];
      state.lastMergeNotes = Array.isArray(data.lastMergeNotes)?data.lastMergeNotes:[];
      renderBaristas(); renderPeriods(); toast('Loaded.');
    }catch{ alert('Could not load saved data.'); }
  });
  document.getElementById('resetStateBtn').addEventListener('click', ()=>{
    if(!confirm('Clear all baristas, shifts, and payout periods?')) return;
    state.baristas=[]; state.periods=[]; state.lastMergeNotes=[];
    renderBaristas(); renderPeriods();
    $('#quickResults').classList.add('hidden'); $('#auditWrap').classList.add('hidden');
    toast('Cleared.');
  });
  document.getElementById('refreshPeriodsBtn').addEventListener('click', (e)=>{ e.preventDefault(); generatePeriodsFromShifts(); });

  // Init
  renderBaristas(); renderPeriods();
  setTimeout(()=>toast('Add baristas & shifts → Refresh periods → Enter amounts → Calculate'), 700);
})();
