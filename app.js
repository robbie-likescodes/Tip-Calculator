// Accordion How-To
document.querySelectorAll(".accordion").forEach(acc => {
  acc.addEventListener("click", function () {
    this.classList.toggle("active");
    let panel = this.nextElementSibling;
    panel.style.display = (panel.style.display === "block") ? "none" : "block";
  });
});

const baristasDiv = document.getElementById("baristas");
const periodsDiv = document.getElementById("periods");
const resultsDiv = document.getElementById("results");
let baristaCount = 0;

document.getElementById("addBarista").addEventListener("click", () => {
  const bDiv = document.createElement("div");
  bDiv.className = "barista";
  bDiv.innerHTML = `
    <label>Name: <input type="text" class="bname" placeholder="Barista Name"/></label>
    <button class="addShift">+ Add shift</button>
    <button class="removeBarista">Remove</button>
    <div class="shifts"></div>
  `;
  baristasDiv.appendChild(bDiv);

  bDiv.querySelector(".addShift").addEventListener("click", () => {
    const sDiv = document.createElement("div");
    sDiv.innerHTML = `
      In <input type="time" class="inTime"/>
      Out <input type="time" class="outTime"/>
      <button class="removeShift">Remove</button>
    `;
    sDiv.querySelector(".removeShift").addEventListener("click", () => sDiv.remove());
    bDiv.querySelector(".shifts").appendChild(sDiv);
    alert("You can add multiple shifts under the same Barista below");
  });

  bDiv.querySelector(".removeBarista").addEventListener("click", () => bDiv.remove());
});

// Convert HH:MM -> minutes since midnight
function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Refresh periods
document.getElementById("refreshPeriods").addEventListener("click", () => {
  periodsDiv.innerHTML = "";
  let shifts = [];
  document.querySelectorAll(".barista").forEach(b => {
    const name = b.querySelector(".bname").value || "Unnamed";
    b.querySelectorAll(".shifts div").forEach(s => {
      const inT = s.querySelector(".inTime").value;
      const outT = s.querySelector(".outTime").value;
      if (inT && outT) {
        shifts.push({ name, start: toMinutes(inT), end: toMinutes(outT) });
      }
    });
  });

  if (shifts.length === 0) return;

  // collect unique time boundaries
  let times = new Set();
  shifts.forEach(s => { times.add(s.start); times.add(s.end); });
  let sortedTimes = Array.from(times).sort((a,b)=>a-b);

  // build segments
  let periods = [];
  for (let i=0; i<sortedTimes.length-1; i++) {
    let start = sortedTimes[i];
    let end = sortedTimes[i+1];
    let team = shifts.filter(s => s.start < end && s.end > start).map(s=>s.name);
    if (team.length > 0) {
      periods.push({start,end,team});
    }
  }

  // merge periods if gap < 5 minutes
  let merged = [];
  for (let p of periods) {
    if (merged.length === 0) {
      merged.push(p);
    } else {
      let last = merged[merged.length-1];
      if (p.start - last.end <= 5 && JSON.stringify(p.team) === JSON.stringify(last.team)) {
        last.end = p.end; // extend
      } else {
        merged.push(p);
      }
    }
  }

  merged.forEach((p,i)=>{
    const div = document.createElement("div");
    div.className = "period";
    const mins = p.end - p.start;
    const startH = String(Math.floor(p.start/60)).padStart(2,"0");
    const startM = String(p.start%60).padStart(2,"0");
    const endH = String(Math.floor(p.end/60)).padStart(2,"0");
    const endM = String(p.end%60).padStart(2,"0");
    div.innerHTML = `
      <h3>Period #${i+1}: ${startH}:${startM} → ${endH}:${endM} (${mins} min)</h3>
      <p>Team: ${p.team.join(", ")}</p>
      Cash: <input type="number" class="cash" value="0"/>
      Card: <input type="number" class="card" value="0"/>
    `;
    periodsDiv.appendChild(div);
  });
});

// Calculate
document.getElementById("calculate").addEventListener("click", () => {
  let totals = {};
  document.querySelectorAll(".barista .bname").forEach(b => {
    let name = b.value || "Unnamed";
    totals[name] = {cash:0,card:0};
  });

  document.querySelectorAll(".period").forEach(p=>{
    const team = p.querySelector("p").textContent.replace("Team: ","").split(", ");
    const cash = parseFloat(p.querySelector(".cash").value)||0;
    const card = parseFloat(p.querySelector(".card").value)||0;
    const splitCash = cash / team.length;
    const splitCard = card / team.length;
    team.forEach(name=>{
      if (totals[name]) {
        totals[name].cash += splitCash;
        totals[name].card += splitCard;
      }
    });
  });

  resultsDiv.innerHTML = `<div class="audit"><h3>Audit Summary</h3></div>`;
  const auditDiv = resultsDiv.querySelector(".audit");
  for (let [name,val] of Object.entries(totals)) {
    auditDiv.innerHTML += `<p><strong>${name}</strong>: Cash $${val.cash.toFixed(2)} | Card $${val.card.toFixed(2)} | Total $${(val.cash+val.card).toFixed(2)}</p>`;
  }
});
