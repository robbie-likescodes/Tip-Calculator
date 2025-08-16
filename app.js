/* Barista Tip Splitter (full build with your changes)
 * - Banner reminders
 * - Section 2 renamed to "Tip Payout Amounts by Time Period"
 * - “How To Use” accordion
 * - Contextual toasts (incl. Add Barista hint)
 * - Clear, expandable per-payout audit
 * - Smart rounding, CSV export, localStorage save/load/reset
 */

(function(){
  // ----------------- State -----------------
  const state = {
    baristas: [], // [{id, name, shifts:[{start,end}]}]
    tips: [],     // [{id, type:'cash'|'card', amount:number, start, end}]
  };
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const elBaristaList = $('#baristaList');
  const elTipList = $('#tipList');
  const roundingToggle = $('#roundingToggle');

  // ----------------- Utilities -----------------
  const uid = () => Math.random().toString(36).slice(2,9);

  function timeToMin(t) {
    if (!t) return null;
    const [h,m] = t.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h*60 + m;
  }
  function minToTime(mm) {
    const h = Math.floor(mm/60);
    const m = mm%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function fmtMoney(n) {
    return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function assertRangeValid(startStr, endStr) {
    const s = timeToMin(startStr), e = timeToMin(endStr);
    return s != null && e != null && e > s;
  }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ----------------- Toasts / contextual hints -----------------
  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(msg, ms=2600){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ----------------- Rendering: Baristas -----------------
  const baristaItemTmpl = $('#baristaItemTmpl');
  const shiftRowTmpl = $('#shiftRowTmpl');

  function renderBaristas(){
    elBaristaList.innerHTML = '';
    state.baristas.forEach(b => {
      const node = baristaItemTmpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = b.id;
      node.querySelector('.barista-name').textContent = b.name;

      const shiftList = node.querySelector('.shift-list');
      shiftList.innerHTML = '';
      b.shifts.forEach((sh, idx) => {
        const row = shiftRowTmpl.content.firstElementChild.cloneNode(true);
        row.querySelector('.shift-in').value = sh.start || '';
        row.querySelector('.shift-out').value = sh.end || '';
        row.querySelector('.remove-shift-btn').addEventListener('click', () => {
          b.shifts.splice(idx,1);
          renderBaristas();
          toast('Shift removed.');
        });
        row.querySelector('.shift-in').addEventListener('change', ev => {
          sh.start = ev.target.value;
          if (sh.end && !assertRangeValid(sh.start, sh.end)) {
            alert('Shift end must be after start.');
            sh.start = '';
            ev.target.value = '';
          }
        });
        row.querySelector('.shift-out').addEventListener('change', ev => {
          sh.end = ev.target.value;
          if (sh.start && !assertRangeValid(sh.start, sh.end)) {
            alert('Shift end must be after start.');
            sh.end = '';
            ev.target.value = '';
          }
        });
        shiftList.appendChild(row);
      });

      node.querySelector('.add-shift-btn').addEventListener('click', () => {
        b.shifts.push({start:'', end:''});
        renderBaristas();
        toast('Add each time range the barista was on window/making drinks.');
      });
      node.querySelector('.remove-barista-btn').addEventListener('click', () => {
        const idx = state.baristas.findIndex(x => x.id === b.id);
        state.baristas.splice(idx,1);
        renderBaristas();
        toast('Barista removed.');
      });

      elBaristaList.appendChild(node);
    });
  }

  $('#addBaristaBtn').addEventListener('click', () => {
    const name = $('#baristaName').value.trim();
    if (!name) { alert('Enter a barista name.'); return; }
    state.baristas.push({ id: uid(), name, shifts: [] });
    $('#baristaName').value = '';
    renderBaristas();
    toast('You can add multiple shifts under the same Barista below.');
  });

  // ----------------- Rendering: Tip payouts -----------------
  const tipItemTmpl = $('#tipItemTmpl');

  function renderTips(){
    elTipList.innerHTML = '';
    state.tips.forEach(t => {
      const node = tipItemTmpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = t.id;
      const title = `${t.type.toUpperCase()} • $${fmtMoney(t.amount)}`;
      node.querySelector('.tip-title').textContent = title;
      node.querySelector('.tip-meta').textContent = `${t.start} → ${t.end}`;
      node.querySelector('.remove-tip-btn').addEventListener('click', () => {
        const idx = state.tips.findIndex(x => x.id === t.id);
        state.tips.splice(idx,1);
        renderTips();
        toast('Payout removed.');
      });
      elTipList.appendChild(node);
    });
  }

  $('#addTipBtn').addEventListener('click', () => {
    const type = $('#tipType').value;
    const amount = parseFloat($('#tipAmount').value);
    const start = $('#tipStart').value;
    const end = $('#tipEnd').value;

    if (!type || !(amount >= 0)) return alert('Enter tip type and amount.');
    if (!assertRangeValid(start, end)) return alert('Payout end must be after start.');

    state.tips.push({ id: uid(), type, amount, start, end });
    $('#tipAmount').value = ''; $('#tipStart').value = ''; $('#tipEnd').value = '';
    renderTips();
    toast('Add separate payouts for each time period money was removed (Paid Out).');
  });

  // ----------------- Calculation Core -----------------
  function collectBoundariesForChunk(chunk, allShifts) {
    const s = timeToMin(chunk.start), e = timeToMin(chunk.end);
    const set = new Set([s,e]);
    allShifts.forEach(sh => {
      const shS = timeToMin(sh.start), shE = timeToMin(sh.end);
      if (shS != null && shE != null) {
        if (shS > s && shS < e) set.add(shS);
        if (shE > s && shE < e) set.add(shE);
      }
    });
    const arr = Array.from(set).sort((a,b)=>a-b);
    const segs = [];
    for (let i=0;i<arr.length-1;i++){ segs.push([arr[i], arr[i+1]]); }
    return segs;
  }

  function activeBaristasDuring(minute, baristas) {
    const t = minute;
    const active = [];
    for (const b of baristas) {
      for (const sh of b.shifts) {
        const s = timeToMin(sh.start), e = timeToMin(sh.end);
        if (s!=null && e!=null && s <= t && t < e) { active.push(b.id); break; }
      }
    }
    return active;
  }

  function calcAllocations({rounding}) {
    const baristas = state.baristas.map(b => ({
      id:b.id, name:b.name,
      shifts: b.shifts.filter(sh => assertRangeValid(sh.start, sh.end))
    })).filter(b => b.shifts.length>0);

    const results = {}; // id -> {name, cash, card, total}
    baristas.forEach(b => results[b.id] = { name:b.name, cash:0, card:0, total:0 });

    const totalsByType = { cash:0, card:0 };
    const perChunk = []; // for audit

    for (const chunk of state.tips) {
      const s = timeToMin(chunk.start), e = timeToMin(chunk.end);
      if (s==null || e==null || e<=s) continue;
      totalsByType[chunk.type] += chunk.amount;

      const allShifts = baristas.flatMap(b => b.shifts);
      const segments = collectBoundariesForChunk(chunk, allShifts);
      const duration = e - s;
      if (duration <= 0) continue;
      const density = chunk.amount / duration; // $/min

      const rawAdds = new Map(); // id -> amount from this chunk
      const segRows = [];

      for (const [a,b] of segments) {
        const active = activeBaristasDuring(a, baristas);
        const segDur = b - a;
        if (segDur <= 0 || active.length===0) continue;

        const segAmount = density * segDur;
        const perHead = segAmount / active.length;

        active.forEach(id => rawAdds.set(id, (rawAdds.get(id)||0) + perHead));
        segRows.push({
          start:a, end:b, minutes:segDur,
          activeIds:active.slice(),
          segAmount, perHead
        });
      }

      // Write to overall results and build per-chunk table
      const chunkRow = { type:chunk.type, amount:chunk.amount, start:chunk.start, end:chunk.end, perBarista:[], segments:segRows };
      for (const b of baristas){
        const add = rawAdds.get(b.id)||0;
        if (add>0){
          results[b.id][chunk.type] += add;
          chunkRow.perBarista.push({ id:b.id, name:b.name, amount:add });
        }
      }
      perChunk.push(chunkRow);
    }

    // Smart rounding per type
    if (rounding) {
      ['cash','card'].forEach(type => {
        const exactTotal = totalsByType[type];
        const rows = Object.entries(results).map(([id,obj]) => ({id, name:obj.name, exact: obj[type]}));
        const centsRows = rows.map(r => ({...r, cents: Math.round(r.exact*100)}));
        let sumCents = centsRows.reduce((a,r)=>a+r.cents,0);
        const targetCents = Math.round(exactTotal*100);

        if (sumCents !== targetCents) {
          const delta = targetCents - sumCents;
          const direction = Math.sign(delta), count = Math.abs(delta);
          const prefs = rows.map(r => {
            const raw = r.exact*100;
            const frac = raw - Math.floor(raw);
            const invFrac = 1 - frac;
            return { id:r.id, score: direction>0 ? frac : (frac===0?1:invFrac) };
          }).sort((a,b)=>b.score - a.score);
          for (let i=0;i<count;i++){
            const pick = prefs[i % prefs.length];
            const idx = centsRows.findIndex(x => x.id === pick.id);
            centsRows[idx].cents += direction;
          }
        }
        centsRows.forEach(r => { results[r.id][type] = r.cents/100; });
      });
    }

    Object.values(results).forEach(r => r.total = r.cash + r.card);
    return { results, totalsByType, perChunk };
  }

  // ----------------- Results Rendering -----------------
  function renderSummary(calc){
    const rows = Object.entries(calc.results)
      .map(([id, r]) => ({ name:r.name, cash:r.cash, card:r.card, total:r.total }))
      .sort((a,b)=> a.name.localeCompare(b.name));

    const sumCash = rows.reduce((a,r)=>a+r.cash,0);
    const sumCard = rows.reduce((a,r)=>a+r.card,0);
    const sumTotal = rows.reduce((a,r)=>a+r.total,0);

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr><th>Barista</th><th>Cash</th><th>Card</th><th>Total</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>$${fmtMoney(r.cash)}</td>
            <td>$${fmtMoney(r.card)}</td>
            <td>$${fmtMoney(r.total)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>Totals</td>
          <td>$${fmtMoney(sumCash)}</td>
          <td>$${fmtMoney(sumCard)}</td>
          <td>$${fmtMoney(sumTotal)}</td>
        </tr>
      </tfoot>
    `;
    $('#summary').innerHTML = '';
    $('#summary').appendChild(table);
  }

  function renderAudit(calc){
    const wrap = $('#auditLog');
    wrap.innerHTML = '';
    const tmpl = $('#auditChunkTmpl');

    calc.perChunk.forEach((c, idx) => {
      const node = tmpl.content.firstElementChild.cloneNode(true);
      node.open = false;

      node.querySelector('.pill').classList.add(c.type === 'cash' ? 'cash' : 'card');
      node.querySelector('.pill').textContent = c.type.toUpperCase();
      node.querySelector('.chunk-title').textContent = `Payout #${idx+1} • $${fmtMoney(c.amount)} • ${c.start} → ${c.end}`;

      // Totals text
      node.querySelector('.chunk-totals').innerHTML =
        `<div><strong>Split rule:</strong> even split among baristas clocked in during this period.</div>`;

      // Per-barista table for this chunk
      const tableDiv = node.querySelector('.chunk-table');
      const sorted = c.perBarista.slice().sort((a,b)=>a.name.localeCompare(b.name));
      const table = document.createElement('table');
      table.innerHTML = `
        <thead><tr><th>Barista</th><th>Amount from this payout</th></tr></thead>
        <tbody>
          ${sorted.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>$${fmtMoney(r.amount)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td>$${fmtMoney(sorted.reduce((s,r)=>s+r.amount,0))}</td></tr></tfoot>
      `;
      tableDiv.appendChild(table);

      // Segment math
      const segWrap = node.querySelector('.segment-rows');
      segWrap.innerHTML = `
        <div class="segment-head segment-row">
          <div>Time segment</div>
          <div>Minutes</div>
          <div>$ in segment</div>
          <div>Per-person</div>
        </div>
      ` + c.segments.map(seg => {
        const who = seg.activeIds.map(id => calc.results[id]?.name || id);
        return `
          <div class="segment-row">
            <div>${minToTime(seg.start)}–${minToTime(seg.end)} <span class="who">(${who.join(', ')})</span></div>
            <div>${seg.minutes}</div>
            <div>$${fmtMoney(seg.segAmount)}</div>
            <div>$${fmtMoney(seg.perHead)}</div>
          </div>
        `;
      }).join('');

      wrap.appendChild(node);
    });
  }

  function renderResults(calc){
    $('#resultsWrap').classList.remove('hidden');
    renderSummary(calc);
    renderAudit(calc);
  }

  // ----------------- CSV Export -----------------
  function exportCsv(calc){
    const rows = Object.entries(calc.results)
      .map(([id, r]) => ({ name:r.name, cash:r.cash, card:r.card, total:r.total }))
      .sort((a,b)=> a.name.localeCompare(b.name));

    const header = ['Barista','Cash','Card','Total'];
    const body = rows.map(r => [r.name, fmtMoney(r.cash), fmtMoney(r.card), fmtMoney(r.total)]);
    body.push(['Totals', fmtMoney(rows.reduce((a,r)=>a+r.cash,0)), fmtMoney(rows.reduce((a,r)=>a+r.card,0)), fmtMoney(rows.reduce((a,r)=>a+r.total,0))]);

    const csv = [header, ...body].map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tip-split.csv';
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }

  // ----------------- Save / Load / Reset -----------------
  function saveState(){
    const data = deepClone(state);
    localStorage.setItem('baristaTipSplitter:v1', JSON.stringify(data));
    toast('Saved. Remember: claim proper tips via the Daily Sales QR Code.');
  }
  function loadState(){
    const raw = localStorage.getItem('baristaTipSplitter:v1');
    if (!raw) return toast('No saved data found.');
    try{
      const data = JSON.parse(raw);
      state.baristas = Array.isArray(data.baristas) ? data.baristas : [];
      state.tips = Array.isArray(data.tips) ? data.tips : [];
      renderBaristas(); renderTips();
      toast('Loaded.');
    }catch(e){ alert('Could not load saved data.'); }
  }
  function resetState(){
    if (!confirm('Clear all baristas, shifts, and tip payouts?')) return;
    state.baristas = []; state.tips = [];
    renderBaristas(); renderTips(); $('#resultsWrap').classList.add('hidden');
    toast('Cleared. Log new shifts and payouts.');
  }

  // ----------------- Events -----------------
  $('#calcBtn').addEventListener('click', () => {
    if (state.baristas.length === 0) return alert('Add at least one barista.');
    if (state.tips.length === 0) return alert('Add at least one tip payout.');

    // Coverage sanity: each payout must overlap at least one shift
    for (const t of state.tips) {
      const s = timeToMin(t.start), e = timeToMin(t.end);
      const covered = state.baristas.some(b => b.shifts.some(sh => {
        if (!assertRangeValid(sh.start, sh.end)) return false;
        const ss = timeToMin(sh.start), ee = timeToMin(sh.end);
        return Math.max(s, ss) < Math.min(e, ee);
      }));
      if (!covered) {
        return alert(`No barista coverage for payout ${t.start}→${t.end}.`);
      }
    }

    const calc = calcAllocations({ rounding: roundingToggle.checked });
    renderResults(calc);
    toast('Calculated. Review the Summary and Audit below.');
    $('#exportCsvBtn').onclick = () => exportCsv(calc);
  });

  $('#printBtn').addEventListener('click', () => { window.print(); toast('Printing summary and audit.'); });
  $('#saveStateBtn').addEventListener('click', saveState);
  $('#loadStateBtn').addEventListener('click', loadState);
  $('#resetStateBtn').addEventListener('click', resetState);

  // Initial render
  renderBaristas();
  renderTips();

  // Gentle onboarding hint
  setTimeout(() => toast('Start by adding baristas, then add each payout by time period.'), 600);
})();
