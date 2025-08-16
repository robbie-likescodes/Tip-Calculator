/* Barista Tip Splitter
 * Algorithm:
 *  - Tips assumed uniformly distributed over each tip chunk [t0, t1).
 *  - At any moment, the instantaneous tip stream is split evenly across active baristas.
 *  - For each tip chunk, we discretize time into maximal segments where the set of active baristas is constant
 *    (boundaries are all barista in/out times and the chunk start/end).
 *  - For each segment, each active barista receives:
 *      (chunkAmount / chunkDuration) * segmentDuration / activeCount(segment)
 *  - We sum over segments & chunks (separately for cash and card).
 *  - Optional "smart rounding": ensures per-type totals == inputs by distributing pennies by largest remainders.
 */

(function(){
  // ----------------- State -----------------
  const state = {
    baristas: [], // [{id, name, shifts:[{start,end}]}]
    tips: [],     // [{id, type:'cash'|'card', amount: number, start, end}]
  };
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const elBaristaList = $('#baristaList');
  const elTipList = $('#tipList');
  const roundingToggle = $('#roundingToggle');

  // ----------------- Utilities -----------------
  const uid = () => Math.random().toString(36).slice(2,9);

  function timeToMin(t) {
    // t: "HH:MM"
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
      b.shifts.forEach((sh, idx) => {
        const row = shiftRowTmpl.content.firstElementChild.cloneNode(true);
        row.querySelector('.shift-in').value = sh.start || '';
        row.querySelector('.shift-out').value = sh.end || '';
        row.querySelector('.remove-shift-btn').addEventListener('click', () => {
          b.shifts.splice(idx,1);
          renderBaristas();
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
      });
      node.querySelector('.remove-barista-btn').addEventListener('click', () => {
        const idx = state.baristas.findIndex(x => x.id === b.id);
        state.baristas.splice(idx,1);
        renderBaristas();
      });

      elBaristaList.appendChild(node);
    });
  }

  $('#addBaristaBtn').addEventListener('click', () => {
    const name = $('#baristaName').value.trim();
    if (!name) return alert('Enter a barista name.');
    state.baristas.push({ id: uid(), name, shifts: [] });
    $('#baristaName').value = '';
    renderBaristas();
  });

  // ----------------- Rendering: Tips -----------------
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
    if (!assertRangeValid(start, end)) return alert('Tip chunk end must be after start.');
    state.tips.push({ id: uid(), type, amount, start, end });
    $('#tipAmount').value = '';
    $('#tipStart').value = '';
    $('#tipEnd').value = '';
    renderTips();
  });

  // ----------------- Calculation Core -----------------
  function collectBoundariesForChunk(chunk, allShifts) {
    // boundaries are all unique minutes from chunk start,end and any shift in/out within that span
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
    // produce consecutive [t[i], t[i+1]) segments
    const segs = [];
    for (let i=0;i<arr.length-1;i++){
      segs.push([arr[i], arr[i+1]]);
    }
    return segs;
  }

  function activeBaristasDuring(minute, baristas) {
    // Returns IDs active at a specific minute (t in [start, end))
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
    // Prepare baristas map and all shift ranges
    const baristas = state.baristas.map(b => ({
      id: b.id,
      name: b.name,
      shifts: b.shifts.filter(sh => assertRangeValid(sh.start, sh.end))
    })).filter(b => b.shifts.length > 0);

    const results = {}; // id -> {name, cash:0, card:0, total:0}
    baristas.forEach(b => results[b.id] = { name:b.name, cash:0, card:0, total:0 });

    const audit = [];
    const totalsByType = { cash:0, card:0 };

    for (const chunk of state.tips) {
      const s = timeToMin(chunk.start), e = timeToMin(chunk.end);
      if (s==null || e==null || e<=s) continue;
      totalsByType[chunk.type] += chunk.amount;

      // Build segments whose active set is constant
      const allShifts = baristas.flatMap(b => b.shifts);
      const segments = collectBoundariesForChunk(chunk, allShifts);

      const duration = e - s;
      if (duration <= 0) continue;
      const density = chunk.amount / duration; // $ per minute

      // For rounding trace per type, track raw fractional allocations per barista
      const rawAdds = new Map(); // id -> added amount (for this chunk)
      for (const [a,b] of segments) {
        const mid = a; // any t in [a,b) is fine for active-set; choose a
        const active = activeBaristasDuring(mid, baristas);
        const segDur = b - a;
        if (segDur <= 0) continue;
        if (active.length === 0) {
          // No one on shift; by problem statement this shouldn't happen, but skip if so.
          continue;
        }
        const segAmount = density * segDur;
        const perHead = segAmount / active.length;
        active.forEach(id => {
          const prev = rawAdds.get(id) || 0;
          rawAdds.set(id, prev + perHead);
        });

        // Audit line
        const names = active.map(id => results[id].name);
        audit.push(`Chunk ${chunk.type.toUpperCase()} $${fmtMoney(chunk.amount)} [${chunk.start}→${chunk.end}] segment ${minToTime(a)}–${minToTime(b)} (${segDur} min): ` +
                   `${active.length} active (${names.join(', ')}) → $${fmtMoney(segAmount)} split → $${fmtMoney(perHead)} each`);
      }

      // Apply this chunk's raw allocations
      for (const [id, add] of rawAdds.entries()) {
        results[id][chunk.type] += add;
      }
    }

    // Optional per-type smart rounding so sums match exactly to the cent per type.
    if (rounding) {
      ['cash','card'].forEach(type => {
        const exactTotal = totalsByType[type];
        // build list of baristas with their exact amounts for this type
        const rows = Object.entries(results).map(([id,obj]) => ({id, name:obj.name, exact: obj[type]}));
        const floorCents = rows.map(r => {
          const cents = Math.round(r.exact*100); // round to nearest cent first to reduce machine noise
          return { ...r, cents };
        });
        // Sum, then adjust tiny rounding drift to exactTotal
        let sumCents = floorCents.reduce((acc,r)=> acc + r.cents, 0);
        const targetCents = Math.round(exactTotal*100);

        // If mismatch, distribute pennies by descending fractional remainder of raw exact amount
        if (sumCents !== targetCents) {
          const delta = targetCents - sumCents; // number of pennies to add (positive) or subtract (negative)
          const direction = Math.sign(delta);
          const count = Math.abs(delta);

          // compute fractional preferences
          const prefs = rows.map(r => {
            const raw = r.exact*100;
            const frac = raw - Math.floor(raw); // fractional part of cents
            const invFrac = 1 - frac;
            return {
              id: r.id,
              // if we need to add pennies, prioritize largest fractional remainders;
              // if subtract, prioritize smallest fractional remainders (closest to next lower cent)
              score: direction > 0 ? frac : (frac === 0 ? 1 : invFrac)
            };
          }).sort((a,b)=>b.score - a.score);

          for (let i=0;i<count;i++){
            const pick = prefs[i % prefs.length];
            const idx = floorCents.findIndex(x => x.id === pick.id);
            floorCents[idx].cents += direction;
          }
          sumCents = targetCents;
        }

        // write back rounded amounts
        floorCents.forEach(r => {
          results[r.id][type] = r.cents/100;
        });
      });
    }

    // Totals
    Object.values(results).forEach(r => r.total = r.cash + r.card);

    return { results, audit, totalsByType };
  }

  // ----------------- Results Rendering -----------------
  function renderResults(calc){
    const wrap = $('#resultsWrap');
    wrap.classList.remove('hidden');

    // summary table
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

    // audit
    $('#auditLog').innerHTML = `<pre>${calc.audit.join('\n')}</pre>`;
  }

  function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

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

  // ----------------- Save / Load -----------------
  function saveState(){
    const data = deepClone(state);
    localStorage.setItem('baristaTipSplitter:v1', JSON.stringify(data));
    toast('Saved.');
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
    if (!confirm('Clear all baristas, shifts, and tip chunks?')) return;
    state.baristas = []; state.tips = [];
    renderBaristas(); renderTips(); $('#resultsWrap').classList.add('hidden');
  }

  function toast(msg){
    console.log(msg);
  }

  // ----------------- Events -----------------
  $('#calcBtn').addEventListener('click', () => {
    if (state.baristas.length === 0) return alert('Add at least one barista.');
    if (state.tips.length === 0) return alert('Add at least one tip chunk.');
    // Validate there is at least some shift coverage overlapping each tip chunk
    for (const t of state.tips) {
      const s = timeToMin(t.start), e = timeToMin(t.end);
      const covered = state.baristas.some(b => b.shifts.some(sh => {
        if (!assertRangeValid(sh.start, sh.end)) return false;
        const ss = timeToMin(sh.start), ee = timeToMin(sh.end);
        return Math.max(s, ss) < Math.min(e, ee);
      }));
      if (!covered) {
        return alert(`No barista coverage for tip chunk ${t.start}→${t.end}.`);
      }
    }

    const calc = calcAllocations({ rounding: roundingToggle.checked });
    renderResults(calc);

    $('#exportCsvBtn').onclick = () => exportCsv(calc);
  });

  $('#printBtn').addEventListener('click', () => window.print());
  $('#saveStateBtn').addEventListener('click', saveState);
  $('#loadStateBtn').addEventListener('click', loadState);
  $('#resetStateBtn').addEventListener('click', resetState);

  // Initial
  renderBaristas();
  renderTips();
})();
