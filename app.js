// Motorista – Meta & Relatórios (PWA)
// Dados ficam no localStorage (offline).
// Chaves:
const K_SETTINGS = "m_settings_v1";
const K_DAYS = "m_days_v1"; // { 'YYYY-MM-DD': { ganho:number, gastos:[{cat,val,note,ts}], createdAt } }

const $$ = (sel, el=document) => el.querySelector(sel);
const $$$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

function brMoney(n){
  const v = Number(n||0);
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
function toDateKey(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseNumberBR(s){
  if(typeof s === "number") return s;
  if(!s) return 0;
  // Remove currency, spaces; convert "1.234,56" -> 1234.56
  const clean = String(s).replace(/[^0-9,.-]/g,"").replace(/\./g,"").replace(/,/g,".");
  const v = Number(clean);
  return Number.isFinite(v) ? v : 0;
}
function startOfWeek(date){
  const d = new Date(date);
  const day = (d.getDay()+6)%7; // Monday=0
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()-day);
  return d;
}
function endOfWeek(date){
  const s = startOfWeek(date);
  const e = new Date(s);
  e.setDate(e.getDate()+6);
  return e;
}
function startOfMonth(date){
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(1); return d;
}
function endOfMonth(date){
  const d = startOfMonth(date);
  const e = new Date(d);
  e.setMonth(e.getMonth()+1);
  e.setDate(0);
  return e;
}
function dateKeyToPretty(k){
  // YYYY-MM-DD -> DD/MM/YYYY
  const [y,m,d] = k.split("-");
  return `${d}/${m}/${y}`;
}
function toast(msg){
  const t = $$("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2300);
}

function loadSettings(){
  const raw = localStorage.getItem(K_SETTINGS);
  const def = {
    meta: 400,
    categories: ["combustível","aluguel","pedágio","estacionamento","lanche","manutenção","outros"]
  };
  if(!raw) return def;
  try{
    const s = JSON.parse(raw);
    if(!s || typeof s !== "object") return def;
    return {
      meta: Number.isFinite(Number(s.meta)) ? Number(s.meta) : def.meta,
      categories: Array.isArray(s.categories) && s.categories.length ? s.categories : def.categories
    };
  }catch(e){ return def; }
}
function saveSettings(s){
  localStorage.setItem(K_SETTINGS, JSON.stringify(s));
}
function loadDays(){
  const raw = localStorage.getItem(K_DAYS);
  if(!raw) return {};
  try{
    const d = JSON.parse(raw);
    return d && typeof d === "object" ? d : {};
  }catch(e){ return {}; }
}
function saveDays(days){
  localStorage.setItem(K_DAYS, JSON.stringify(days));
}

function ensureDay(days, key){
  if(!days[key]) days[key] = { ganho: 0, gastos: [], createdAt: Date.now() };
  if(!Array.isArray(days[key].gastos)) days[key].gastos = [];
  if(!Number.isFinite(Number(days[key].ganho))) days[key].ganho = 0;
  return days[key];
}

let state = {
  view: "home",
  reportRange: "day",
  settings: loadSettings(),
  days: loadDays(),
  today: toDateKey(new Date())
};

function navTo(view){
  state.view = view;
  $$$(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  ["home","reports","settings"].forEach(v => {
    $$("#view-"+v).classList.toggle("hide", v!==view);
  });
  if(view==="reports") renderReports();
  if(view==="settings") renderSettings();
  if(view==="home") renderHome();
}

function openModal(title, bodyHTML){
  $$("#modalTitle").textContent = title;
  $$("#modalBody").innerHTML = bodyHTML;
  $$("#modal").classList.remove("hide");
}
function closeModal(){
  $$("#modal").classList.add("hide");
  $$("#modalBody").innerHTML = "";
}

function calcDay(key){
  const d = state.days[key];
  if(!d) return { ganho:0, gastos:0, lucro:0, cats:{} };
  const ganho = Number(d.ganho||0);
  let gastos = 0;
  const cats = {};
  for(const g of (d.gastos||[])){
    const v = Number(g.val||0);
    gastos += v;
    const c = (g.cat||"outros").toLowerCase();
    cats[c] = (cats[c]||0) + v;
  }
  const lucro = ganho - gastos;
  return { ganho, gastos, lucro, cats };
}

function calcRange(range){
  const now = new Date();
  let start, end, label;
  if(range==="day"){
    start = new Date(now); end = new Date(now);
    label = `Hoje (${dateKeyToPretty(state.today)})`;
  }else if(range==="week"){
    start = startOfWeek(now); end = endOfWeek(now);
    label = `Semana (${dateKeyToPretty(toDateKey(start))} a ${dateKeyToPretty(toDateKey(end))})`;
  }else{ // month
    start = startOfMonth(now); end = endOfMonth(now);
    label = `Mês (${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()})`;
  }
  const keys = [];
  const cursor = new Date(start);
  while(cursor <= end){
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate()+1);
  }
  let ganho=0, gastos=0, lucro=0;
  const cats = {};
  let dias = 0;
  for(const k of keys){
    if(state.days[k]){
      const c = calcDay(k);
      ganho += c.ganho;
      gastos += c.gastos;
      lucro += c.lucro;
      for(const [cat, val] of Object.entries(c.cats)){
        cats[cat] = (cats[cat]||0) + val;
      }
      // dia considerado se tem algum lançamento
      if(c.ganho !== 0 || c.gastos !== 0) dias += 1;
    }
  }
  return { start, end, label, ganho, gastos, lucro, cats, dias, keys };
}

function renderHome(){
  const now = new Date();
  const weekday = now.toLocaleDateString("pt-BR",{weekday:"long"});
  const pretty = now.toLocaleDateString("pt-BR");
  $$("#todayLabel").textContent = `${weekday} • ${pretty}`;

  const meta = Number(state.settings.meta||0);
  $$("#metaInfo").textContent = `Meta: ${brMoney(meta)}`;

  const today = ensureDay(state.days, state.today);
  saveDays(state.days); // ensure persisted

  const c = calcDay(state.today);
  $$("#kpiGanhos").textContent = brMoney(c.ganho);
  $$("#kpiGastos").textContent = brMoney(c.gastos);
  $$("#kpiLucro").textContent = brMoney(c.lucro);

  const falta = meta - c.lucro;
  const faltaAbs = Math.abs(falta);
  const faltaText = falta > 0 ? `Falta ${brMoney(faltaAbs)}` : `Sobrou ${brMoney(faltaAbs)}`;
  $$("#kpiFalta").textContent = faltaText;

  const pct = meta > 0 ? Math.max(0, Math.min(100, (c.lucro/meta)*100)) : 0;
  $$("#progressBar").style.width = `${pct}%`;

  const pill = $$("#statusPill");
  pill.classList.remove("good","bad");
  if(meta<=0){
    pill.classList.add("bad");
    $$("#statusText").textContent = "Defina uma meta nos ajustes";
  }else if(c.lucro >= meta){
    pill.classList.add("good");
    $$("#statusText").textContent = "Meta batida ✅";
  }else{
    pill.classList.add("bad");
    $$("#statusText").textContent = "Foco na meta 💪";
  }

  const countGastos = (today.gastos||[]).length;
  $$("#todaySummary").textContent = `1 ganho (total do dia) • ${countGastos} gastos lançados`;

  const list = $$("#todayList");
  list.innerHTML = "";
  // ganho item
  const ganhoItem = document.createElement("div");
  ganhoItem.className = "item";
  ganhoItem.innerHTML = `
    <div class="top">
      <div>
        <div style="font-weight:850">Ganho do dia</div>
        <div class="muted">${dateKeyToPretty(state.today)}</div>
      </div>
      <div class="right">
        <div class="money">${brMoney(c.ganho)}</div>
        <div class="tag">ganho</div>
      </div>
    </div>
  `;
  list.appendChild(ganhoItem);

  // gastos items
  const gastos = (today.gastos||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
  for(const g of gastos){
    const it = document.createElement("div");
    it.className = "item";
    const note = g.note ? `<div class="mini">${escapeHtml(g.note)}</div>` : "";
    it.innerHTML = `
      <div class="top">
        <div>
          <div style="font-weight:850">${escapeHtml(g.cat||"outros")}</div>
          <div class="muted">${new Date(g.ts||Date.now()).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>
          ${note}
        </div>
        <div class="right">
          <div class="money">${brMoney(g.val||0)}</div>
          <button class="danger" data-del="${g.id}" style="margin-top:8px; padding:8px 10px; border-radius:12px">Excluir</button>
        </div>
      </div>
    `;
    list.appendChild(it);
  }

  // bind delete
  $$$("button[data-del]", list).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.del;
      const d = ensureDay(state.days, state.today);
      d.gastos = (d.gastos||[]).filter(x => String(x.id) !== String(id));
      saveDays(state.days);
      toast("Gasto excluído");
      renderHome();
    });
  });
}

function renderReports(){
  const range = state.reportRange;
  const r = calcRange(range);
  const meta = Number(state.settings.meta||0);

  $$("#reportTitle").textContent =
    range==="day" ? "Relatório diário" : (range==="week" ? "Relatório semanal" : "Relatório mensal");
  $$("#reportSubtitle").textContent = r.label;

  $$("#rGanhos").textContent = brMoney(r.ganho);
  $$("#rGastos").textContent = brMoney(r.gastos);
  $$("#rLucro").textContent = brMoney(r.lucro);
  $$("#rDias").textContent = String(r.dias);

  // meta status
  let metaNote = "—";
  let metaTag = brMoney(meta) + " / dia";
  if(meta<=0){
    metaNote = "Defina uma meta nos ajustes para ver o comparativo.";
    metaTag = "Sem meta";
  }else{
    const alvo = meta * (r.dias || (range==="day" ? 1 : 0));
    if(range==="day"){
      const falta = meta - r.lucro;
      metaNote = falta>0 ? `Faltou ${brMoney(falta)} para bater a meta hoje.` : `Meta batida! Sobrou ${brMoney(Math.abs(falta))}.`;
    }else{
      if(r.dias===0){
        metaNote = "Sem lançamentos no período.";
      }else{
        const falta = alvo - r.lucro;
        metaNote = falta>0 ? `Faltou ${brMoney(falta)} para bater a meta no período.` : `Meta batida no período! Sobrou ${brMoney(Math.abs(falta))}.`;
      }
    }
  }
  $$("#rMetaTag").textContent = metaTag;
  $$("#rMetaNote").textContent = metaNote;

  // média
  const media = r.dias>0 ? (r.lucro / r.dias) : 0;
  $$("#rMediaTag").textContent = r.dias>0 ? brMoney(media) + " / dia" : "—";
  $$("#rMediaNote").textContent = r.dias>0 ? "Média de lucro nos dias com lançamento." : "Sem dias com lançamento no período.";

  // categories list
  const cats = Object.entries(r.cats).sort((a,b)=>b[1]-a[1]);
  const catsEl = $$("#rCats");
  catsEl.innerHTML = "";
  if(cats.length===0){
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `<div class="muted">Nenhum gasto no período.</div>`;
    catsEl.appendChild(it);
  }else{
    for(const [cat, val] of cats.slice(0,8)){
      const it = document.createElement("div");
      it.className = "item";
      it.innerHTML = `
        <div class="top">
          <div style="font-weight:850">${escapeHtml(cat)}</div>
          <div class="money">${brMoney(val)}</div>
        </div>
      `;
      catsEl.appendChild(it);
    }
  }

  // export handlers
  $$("#btnCSV").onclick = () => exportCSV(range);
  $$("#btnPDF").onclick = () => {
    // Prepare a print-friendly view (reports already). Just trigger print.
    toast("Abrindo impressão… escolha Salvar como PDF");
    setTimeout(()=>window.print(), 250);
  };
}

function renderSettings(){
  $$("#metaInput").value = String(state.settings.meta ?? "");
  $$("#catsInput").value = (state.settings.categories||[]).join("\n");
}

function exportCSV(range){
  const r = calcRange(range);
  // CSV of days in range with ganho/gastos/lucro
  const rows = [["data","ganho","gastos","lucro"]];
  for(const k of r.keys){
    const c = calcDay(k);
    // include rows even when empty? include only if any
    if(c.ganho!==0 || c.gastos!==0){
      rows.push([dateKeyToPretty(k), String(c.ganho.toFixed(2)).replace(".",","), String(c.gastos.toFixed(2)).replace(".",","), String(c.lucro.toFixed(2)).replace(".",",")]);
    }
  }
  // categories summary
  rows.push([]);
  rows.push(["gastos_por_categoria","valor","",""]);
  const cats = Object.entries(r.cats).sort((a,b)=>b[1]-a[1]);
  for(const [cat,val] of cats){
    rows.push([cat, String(val.toFixed(2)).replace(".",","), "", ""]);
  }
  const csv = rows.map(r=>r.map(cell=>{
    const s = String(cell ?? "");
    // wrap if contains comma/semicolon/newline
    if(/[;"\n\r]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }).join(";")).join("\n");

  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  const file = `relatorio_${range}_${toDateKey(new Date())}.csv`;
  a.href = URL.createObjectURL(blob);
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast("CSV exportado");
}

function escapeHtml(str){
  return String(str ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function showGanhoModal(){
  const day = ensureDay(state.days, state.today);
  const body = `
    <label>Total de ganhos do dia (R$)</label>
    <input id="ganhoDiaInput" inputmode="decimal" placeholder="Ex: 520" value="${day.ganho ? String(day.ganho).replace(".",",") : ""}">
    <div class="btns" style="margin-top:12px">
      <button id="saveGanho">Salvar ganho</button>
      <button class="ghost" id="cancelGanho">Cancelar</button>
    </div>
    <div class="muted" style="margin-top:10px">Dica: digite só o total que apareceu no app no fim do dia.</div>
  `;
  openModal("Lançar ganho do dia", body);
  $$("#cancelGanho").onclick = closeModal;
  $$("#saveGanho").onclick = ()=>{
    const v = parseNumberBR($$("#ganhoDiaInput").value);
    day.ganho = v;
    saveDays(state.days);
    closeModal();
    toast("Ganho salvo");
    renderHome();
  };
}
function showGastoModal(){
  const cats = state.settings.categories || [];
  const opts = cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const body = `
    <label>Categoria</label>
    <select id="gastoCat">${opts}</select>
    <label>Valor (R$)</label>
    <input id="gastoVal" inputmode="decimal" placeholder="Ex: 50">
    <label>Observação (opcional)</label>
    <textarea id="gastoNote" placeholder="Ex: gasolina, pedágio, lanche..."></textarea>
    <div class="btns" style="margin-top:12px">
      <button id="saveGasto">Salvar gasto</button>
      <button class="ghost" id="cancelGasto">Cancelar</button>
    </div>
  `;
  openModal("Lançar gasto", body);
  $$("#cancelGasto").onclick = closeModal;
  $$("#saveGasto").onclick = ()=>{
    const cat = $$("#gastoCat").value || "outros";
    const val = parseNumberBR($$("#gastoVal").value);
    if(val <= 0){
      toast("Informe um valor maior que zero");
      return;
    }
    const note = $$("#gastoNote").value?.trim() || "";
    const d = ensureDay(state.days, state.today);
    d.gastos.push({ id: String(Date.now()) + "_" + Math.random().toString(16).slice(2), cat, val, note, ts: Date.now() });
    saveDays(state.days);
    closeModal();
    toast("Gasto salvo");
    renderHome();
  };
}

function bindUI(){
  // footer nav
  $$$(".navBtn").forEach(b=>b.addEventListener("click", ()=>navTo(b.dataset.view)));

  // modal close
  $$("#modalClose").addEventListener("click", closeModal);
  $$("#modal").addEventListener("click", (e)=>{ if(e.target.id==="modal") closeModal(); });

  // home actions
  $$("#btnAddGanho").addEventListener("click", showGanhoModal);
  $$("#btnAddGasto").addEventListener("click", showGastoModal);
  $$("#btnClearToday").addEventListener("click", ()=>{
    const ok = confirm("Quer limpar os lançamentos de hoje? (ganho e gastos)");
    if(!ok) return;
    state.days[state.today] = { ganho: 0, gastos: [], createdAt: Date.now() };
    saveDays(state.days);
    toast("Hoje zerado");
    renderHome();
  });

  // reports tabs
  $$$(".tab").forEach(t=>{
    t.addEventListener("click", ()=>{
      $$$(".tab").forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      state.reportRange = t.dataset.range;
      renderReports();
    });
  });

  // settings buttons
  $$("#btnSaveSettings").addEventListener("click", ()=>{
    const meta = parseNumberBR($$("#metaInput").value);
    const catsRaw = $$("#catsInput").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const cats = catsRaw.length ? catsRaw : ["combustível","aluguel","pedágio","lanche","manutenção","outros"];
    state.settings = { meta: meta>0?meta:0, categories: cats };
    saveSettings(state.settings);
    toast("Configurações salvas");
    renderHome();
  });

  $$("#btnResetAll").addEventListener("click", ()=>{
    const ok = confirm("Isso vai apagar TODOS os dados (lançamentos e ajustes). Continuar?");
    if(!ok) return;
    localStorage.removeItem(K_SETTINGS);
    localStorage.removeItem(K_DAYS);
    state.settings = loadSettings();
    state.days = loadDays();
    toast("Tudo zerado");
    renderHome();
    renderSettings();
  });
}

function tickMidnight(){
  // update today's key if date changed
  const k = toDateKey(new Date());
  if(k !== state.today){
    state.today = k;
    renderHome();
    if(state.view==="reports") renderReports();
  }
}

async function registerSW(){
  if(!("serviceWorker" in navigator)) return;
  try{
    await navigator.serviceWorker.register("./sw.js");
  }catch(e){
    // ignore
  }
}

(function init(){
  // Ensure today's day exists
  ensureDay(state.days, state.today);
  saveDays(state.days);

  bindUI();
  renderHome();
  registerSW();
  setInterval(tickMidnight, 30*1000);
})();
