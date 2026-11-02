/* BudgetMe — mese.js
   Ciclo mensile completo: movimenti, budget, riconciliazione */
import db, { getOrCreateMese, getPrevisioneVoce } from '../db.js';
import { formatEur, formatDate, today, toast, MESI_NOMI } from '../utils.js';

const MODALITA_LABEL = {
  pos:'POS', credito:'Carta credito', ricaricabile:'Carta ricaricabile',
  contanti:'Contanti', bonifico:'Bonifico', rid:'RID',
  paypal:'PayPal/Satispay', altro:'Altro'
};

let currentAnno    = new Date().getFullYear();
let currentMeseNum = new Date().getMonth() + 1;
let currentMese    = null;
let currentTab = 'piano';

export async function init() {
  setupGlobals();
  await loadMese();
  setupNavMese();
  setupTabs();
  await renderTab();
}

async function loadMese() {
  currentMese = await getOrCreateMese(currentAnno, currentMeseNum);
  const label = document.getElementById('mese-label');
  if (label) label.textContent = `${MESI_NOMI[currentMeseNum]} ${currentAnno}`;
  await renderStatoBadge();
}

function setupNavMese() {
  document.getElementById('btn-prec')?.addEventListener('click', async () => {
    currentMeseNum--;
    if (currentMeseNum < 1) { currentMeseNum = 12; currentAnno--; }
    await loadMese(); await renderTab();
  });
  document.getElementById('btn-succ')?.addEventListener('click', async () => {
    currentMeseNum++;
    if (currentMeseNum > 12) { currentMeseNum = 1; currentAnno++; }
    await loadMese(); await renderTab();
  });
}

function setupTabs() {
  document.querySelectorAll('#mese-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#mese-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      await renderTab();
    });
  });
}

async function renderTab() {
  if (currentTab === 'piano') await renderPiano();
  else if (currentTab === 'movimenti') await renderMovimenti();
  else if (currentTab === 'budget') await renderBudget();
  else if (currentTab === 'riconciliazione') await renderRiconciliazione();
}

async function renderStatoBadge() {
  const el = document.getElementById('mese-stato');
  if (!el || !currentMese) return;
  const stato = currentMese.stato || 'aperto';
  const cfg = {
    aperto:   { label:'Aperto',   cls:'badge-blue' },
    in_corso: { label:'In corso', cls:'badge-orange' },
    chiuso:   { label:'Chiuso',   cls:'badge-gray' }
  };
  const { label, cls } = cfg[stato] || cfg.aperto;
  el.className = `badge ${cls}`;
  el.textContent = label;
  const saldoEl = document.getElementById('mese-saldo-apertura');
  if (saldoEl) {
    const saldo = currentMese.saldo_apertura ?? await calcolaSaldoApertura();
    saldoEl.textContent = `Apertura: ${formatEur(saldo)}`;
  }
}

async function calcolaSaldoApertura() {
  let annoPrec = currentAnno, mesePrec = currentMeseNum - 1;
  if (mesePrec < 1) { mesePrec = 12; annoPrec--; }
  const mp = await db.mesi.where({ anno: annoPrec, mese: mesePrec }).first();
  if (mp?.saldo_chiusura !== undefined) return mp.saldo_chiusura;
  const conti = await db.conti_correnti.toArray();
  return conti.filter(c => c.attivo === 1).reduce((s,c) => s + (c.saldo_iniziale||0), 0);
}

// ── TAB PIANO BUSTE ───────────────────────────────────────────────────────────
async function renderPiano() {
  const root = document.getElementById('mese-root');
  root.innerHTML = `<div class="spinner" style="margin:24px auto"></div>`;

  // Carica piano esistente o crea default
  let piano = await db.piano_mensile.where('mese_id').equals(currentMese.id).first();

  // Calcola obbligazioni fisse dal budget
  const cats = await db.categorie_budget.toArray();
  const voci = await db.voci_budget.where('attiva').equals(1).toArray();
  const prevMens = await db.previsioni_mensili
    .where('mese_id').equals(currentMese.id).toArray();
  const prevMap = Object.fromEntries(prevMens.map(p => [p.voce_id, p.importo]));

  const catFisse = cats.find(c => c.nome === 'Spese Fisse Contrattuali');
  const catCanoni = cats.find(c => c.nome === 'Canoni Bancari');

  let obbligazioni = 0;
  const vociObbligate = [];

  for (const cat of [catFisse, catCanoni].filter(Boolean)) {
    const vociCat = voci.filter(v => v.categoria_id === cat.id);
    for (const v of vociCat) {
      const prev = prevMap[v.id] ?? v.previsione_default ?? 0;
      if (prev > 0) {
        obbligazioni += prev;
        vociObbligate.push({ nome: v.nome, importo: prev });
      }
    }
  }

  // Override manuale obbligazioni
  if (piano?.obbligazioni_override) {
    try {
      const ovr = JSON.parse(piano.obbligazioni_override);
      ovr.forEach(o => {
        const idx = vociObbligate.findIndex(v => v.nome === o.nome);
        if (idx >= 0) vociObbligate[idx].importo = o.importo;
        obbligazioni = vociObbligate.reduce((s, v) => s + v.importo, 0);
      });
    } catch(e) {}
  }

  const stipendio   = piano?.stipendio_atteso   ?? 2250;
  const primateTe   = piano?.prima_te_stesso    ?? 200;
  const primaNote   = piano?.prima_te_stesso_note ?? '';
  const spesePers   = piano?.spese_personali    ?? 300;
  const residuo     = stipendio - primateTe - obbligazioni;
  const gestione    = residuo - spesePers;

  root.innerHTML = `
    <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;text-align:center">
      Pianifica come distribuire le entrate di ${MESI_NOMI[currentMeseNum]}
    </div>

    <!-- ① Stipendio -->
    <div class="card" style="margin-bottom:10px;border-left:4px solid var(--blue)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);
               text-transform:uppercase;letter-spacing:0.05em">① Entrate attese</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">Stipendio + altre entrate</div>
        </div>
        <input type="number" id="piano-stipendio" value="${stipendio}"
          style="width:100px;text-align:right;font-size:1.1rem;font-weight:700;
                 border:1px solid var(--border);border-radius:6px;padding:4px 8px;
                 background:var(--bg-card);color:var(--text)"
          inputmode="decimal" step="10">
      </div>
    </div>

    <!-- ② Prima te stesso -->
    <div class="card" style="margin-bottom:10px;border-left:4px solid var(--green)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div>
          <div style="font-size:0.75rem;font-weight:700;color:var(--green);
               text-transform:uppercase;letter-spacing:0.05em">② Prima te stesso 🏦</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">Risparmio/investimento intoccabile</div>
        </div>
        <input type="number" id="piano-primatete" value="${primateTe}"
          style="width:100px;text-align:right;font-size:1.1rem;font-weight:700;
                 border:1px solid var(--green);border-radius:6px;padding:4px 8px;
                 background:var(--bg-card);color:var(--green)"
          inputmode="decimal" step="10">
      </div>
      <input type="text" id="piano-primanote" value="${primaNote}"
        placeholder="es. PAC ETF 100€ + Deposito 100€"
        style="width:100%;font-size:0.8rem;border:1px solid var(--border);
               border-radius:6px;padding:6px 8px;background:var(--bg);color:var(--text)">
    </div>

    <!-- ③ Obbligazioni fisse -->
    <div class="card" style="margin-bottom:10px;border-left:4px solid var(--red)">
      <div style="margin-bottom:8px">
        <div style="font-size:0.75rem;font-weight:700;color:var(--red);
             text-transform:uppercase;letter-spacing:0.05em">③ Obbligazioni fisse 🏠</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">Da categorie budget — modificabili</div>
      </div>
      ${vociObbligate.map(v => `
        <div style="display:flex;justify-content:space-between;align-items:center;
             padding:4px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:0.82rem">${v.nome}</span>
          <input type="number" data-voce="${v.nome}" value="${v.importo}"
            class="voce-obbl"
            style="width:80px;text-align:right;font-size:0.85rem;font-weight:600;
                   border:1px solid var(--border);border-radius:4px;padding:2px 6px;
                   background:var(--bg-card);color:var(--text)"
            inputmode="decimal" step="10">
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;margin-top:8px;
           font-weight:700;font-size:0.9rem">
        <span>Totale obbligazioni</span>
        <span id="tot-obbl" style="color:var(--red)">${formatEur(obbligazioni)}</span>
      </div>
    </div>

    <!-- Residuo -->
    <div style="background:var(--bg);border-radius:var(--radius-sm);
         padding:10px 14px;margin-bottom:10px;
         border:2px solid ${residuo>=0?'var(--blue)':'var(--red)'}">
      <div style="display:flex;justify-content:space-between;font-size:0.85rem">
        <span style="color:var(--text-muted)">Entrate</span>
        <span id="calc-entrate">${formatEur(stipendio)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem">
        <span style="color:var(--text-muted)">− Prima te stesso</span>
        <span id="calc-primatete" style="color:var(--green)">${formatEur(primateTe)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem">
        <span style="color:var(--text-muted)">− Obbligazioni</span>
        <span id="calc-obbl" style="color:var(--red)">${formatEur(obbligazioni)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:700;
           font-size:1rem;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
        <span>Residuo disponibile</span>
        <span id="calc-residuo" style="color:${residuo>=0?'var(--blue)':'var(--red)'}">
          ${formatEur(residuo)}
        </span>
      </div>
    </div>

    <!-- ④ Distribuzione residuo -->
    <div class="card" style="margin-bottom:16px;border-left:4px solid var(--purple)">
      <div style="font-size:0.75rem;font-weight:700;color:var(--purple);
           text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        ④ Distribuzione residuo
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;
           padding:6px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:0.85rem;font-weight:600">🎯 Spese personali</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">
            Abbigliamento, hobby, ristorazione...
          </div>
        </div>
        <input type="number" id="piano-persone" value="${spesePers}"
          style="width:80px;text-align:right;font-size:0.95rem;font-weight:700;
                 border:1px solid var(--border);border-radius:6px;padding:4px 6px;
                 background:var(--bg-card);color:var(--text)"
          inputmode="decimal" step="10">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
        <div>
          <div style="font-size:0.85rem;font-weight:600">🛒 Gestione ordinaria</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">
            Alimentari, farmacia, casa...
          </div>
        </div>
        <span id="piano-gestione" style="font-size:0.95rem;font-weight:700;
          color:${gestione>=0?'var(--text)':'var(--red)'}">
          ${formatEur(gestione)}
        </span>
      </div>
    </div>

    <button class="btn btn-primary btn-full" onclick="window.salvaPiano()">
      💾 Salva piano ${MESI_NOMI[currentMeseNum]}
    </button>
  `;

  // Aggiornamento live al cambio valori
  const aggiorna = () => {
    const stip  = parseFloat(document.getElementById('piano-stipendio').value) || 0;
    const prima = parseFloat(document.getElementById('piano-primatete').value) || 0;
    let totObbl = 0;
    document.querySelectorAll('.voce-obbl').forEach(inp => {
      totObbl += parseFloat(inp.value) || 0;
    });
    const res  = stip - prima - totObbl;
    const pers = parseFloat(document.getElementById('piano-persone').value) || 0;
    const gest = res - pers;

    document.getElementById('calc-entrate').textContent   = formatEur(stip);
    document.getElementById('calc-primatete').textContent = formatEur(prima);
    document.getElementById('calc-obbl').textContent      = formatEur(totObbl);
    document.getElementById('tot-obbl').textContent       = formatEur(totObbl);
    const residuoEl = document.getElementById('calc-residuo');
    residuoEl.textContent = formatEur(res);
    residuoEl.style.color = res >= 0 ? 'var(--blue)' : 'var(--red)';
    const gestEl = document.getElementById('piano-gestione');
    gestEl.textContent  = formatEur(gest);
    gestEl.style.color  = gest >= 0 ? 'var(--text)' : 'var(--red)';
  };

  document.getElementById('piano-stipendio').addEventListener('input', aggiorna);
  document.getElementById('piano-primatete').addEventListener('input', aggiorna);
  document.getElementById('piano-persone').addEventListener('input', aggiorna);
  document.querySelectorAll('.voce-obbl').forEach(inp =>
    inp.addEventListener('input', aggiorna));
}

// ── TAB MOVIMENTI ─────────────────────────────────────────────────────────────
async function renderMovimenti() {
  const root = document.getElementById('mese-root');
  root.innerHTML = `<div class="spinner" style="margin:24px auto"></div>`;
  const dataInizio = `${currentAnno}-${String(currentMeseNum).padStart(2,'0')}-01`;
  const dataFine   = new Date(currentAnno, currentMeseNum, 0).toISOString().split('T')[0];
  const [movimenti, conti] = await Promise.all([
    db.movimenti_conto.where('data').between(dataInizio, dataFine, true, true).reverse().toArray(),
    db.conti_correnti.toArray()
  ]);
  const contiMap       = Object.fromEntries(conti.map(c => [c.id, c]));
  const nonCat         = movimenti.filter(m => !m.categorizzato && m.tipo !== 'trasferimento');
  const totEnt         = movimenti.filter(m => m.tipo === 'entrata').reduce((s,m) => s+m.importo, 0);
  const totUsc         = movimenti.filter(m => m.tipo === 'uscita').reduce((s,m) => s+m.importo, 0);

  root.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:12px">
      <div class="kpi-card"><div class="label">Entrate</div>
        <div class="value text-positive">${formatEur(totEnt)}</div></div>
      <div class="kpi-card"><div class="label">Uscite</div>
        <div class="value text-negative">${formatEur(totUsc)}</div></div>
    </div>
    ${nonCat.length > 0 ? `
    <div style="background:var(--orange-light);border-radius:var(--radius-sm);
         padding:10px 14px;margin-bottom:12px;display:flex;
         justify-content:space-between;align-items:center">
      <span style="font-size:0.82rem;color:var(--orange);font-weight:600">
        ⚠️ ${nonCat.length} movimenti senza categoria
      </span>
    </div>` : `
    <div style="background:var(--green-light);border-radius:var(--radius-sm);
         padding:8px 14px;margin-bottom:12px">
      <span style="font-size:0.82rem;color:var(--green);font-weight:600">
        ✓ Tutti i movimenti sono categorizzati
      </span>
    </div>`}
    <div class="card" style="padding:0;overflow:hidden">
      ${movimenti.length === 0
        ? `<div class="empty-state" style="padding:32px"><p>Nessun movimento registrato</p></div>`
        : movimenti.map(m => {
            const c = contiMap[m.conto_id];
            const isEnt = m.tipo === 'entrata', isTra = m.tipo === 'trasferimento';
            const col   = isEnt ? 'var(--green)' : isTra ? 'var(--blue)' : 'var(--red)';
            const segno = isEnt ? '+' : isTra ? '⇄' : '−';
            const catOk = m.categorizzato || isTra;
            return `
            <div class="list-item" style="padding:10px 14px">
              <div class="list-item-left">
                <div style="display:flex;align-items:center;gap:6px">
                  ${!catOk?`<span style="width:6px;height:6px;border-radius:50%;background:var(--orange);flex-shrink:0"></span>`:''}
                  <div class="list-item-title">${m.descrizione||m.categoria||'—'}</div>
                </div>
                <div class="list-item-sub">
                  ${formatDate(m.data)}
                  ${c?`· <span style="color:${c.colore||'var(--blue)'}">${c.nome}</span>`:''}
                  ${m.categoria?`· ${m.categoria}`:`<span style="color:var(--orange)"> · da categorizzare</span>`}
                </div>
              </div>
              <div class="list-item-right">
                <div style="font-size:0.95rem;font-weight:700;color:${col}">${segno} ${formatEur(m.importo)}</div>
                <div style="display:flex;gap:4px;margin-top:2px;justify-content:flex-end">
                  ${!catOk?`<button onclick="window.categorizzaMovimento(${m.id})"
                    style="font-size:0.7rem;color:var(--orange);cursor:pointer;background:none;border:none">📌</button>`:''}
                  <button onclick="window.eliminaMovimento(${m.id})"
                    style="font-size:0.7rem;color:var(--text-muted);cursor:pointer;background:none;border:none">🗑️</button>
                </div>
              </div>
            </div>`;
          }).join('')}
    </div>`;
  setupFAB(); lucide.createIcons();
}

function setupFAB() {
  let fab = document.getElementById('fab-mese');
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'fab-mese'; fab.className = 'fab';
    fab.setAttribute('aria-label','Aggiungi movimento');
    fab.innerHTML = '<i data-lucide="plus"></i>';
    document.getElementById('app').appendChild(fab);
  }
  fab.onclick = () => window.apriNuovoMovimento();
}

// ── TAB BUDGET ────────────────────────────────────────────────────────────────
async function renderBudget() {
  const root = document.getElementById('mese-root');
  root.innerHTML = `<div class="spinner" style="margin:24px auto"></div>`;
  const [cats, voci, regs, movsVoce, prevMens] = await Promise.all([
    db.categorie_budget.orderBy('ordine').toArray(),
    db.voci_budget.where('attiva').equals(1).toArray(),
    db.registrazioni.where('mese_id').equals(currentMese.id).toArray(),
    db.movimenti_voce.where('mese_id').equals(currentMese.id).toArray(),
    db.previsioni_mensili.where('mese_id').equals(currentMese.id).toArray()
  ]);
  const regsMap = Object.fromEntries(regs.map(r => [r.voce_id, r]));
  const prevMap = Object.fromEntries(prevMens.map(p => [p.voce_id, p.importo]));
  const movsMap = {};
  movsVoce.forEach(m => { movsMap[m.voce_id] = (movsMap[m.voce_id]||0) + m.importo; });

  const catsU = cats.filter(c => c.tipo==='uscita'  && c.attiva);
  const catsE = cats.filter(c => c.tipo==='entrata' && c.attiva);
  let totRU=0,totPU=0,totRE=0,totPE=0;
  [...catsU,...catsE].forEach(cat => {
    const isU = cat.tipo==='uscita';
    voci.filter(v => v.categoria_id===cat.id).forEach(v => {
      const real = movsMap[v.id] ?? regsMap[v.id]?.importo_reale ?? 0;
      const prev = prevMap[v.id] ?? regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
      if (isU) { totRU+=real; totPU+=prev; } else { totRE+=real; totPE+=prev; }
    });
  });
  const sR = totRE-totRU, sP = totPE-totPU;

  let html = `
    <div class="kpi-grid" style="margin-bottom:12px">
      <div class="kpi-card"><div class="label">Entrate reali</div>
        <div class="value text-positive">${formatEur(totRE)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">prev. ${formatEur(totPE)}</div></div>
      <div class="kpi-card"><div class="label">Uscite reali</div>
        <div class="value text-negative">${formatEur(totRU)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">prev. ${formatEur(totPU)}</div></div>
      <div class="kpi-card"><div class="label">Saldo reale</div>
        <div class="value ${sR>=0?'text-positive':'text-negative'}">${formatEur(sR,true)}</div></div>
      <div class="kpi-card"><div class="label">Saldo previsto</div>
        <div class="value ${sP>=0?'text-positive':'text-negative'}">${formatEur(sP,true)}</div></div>
    </div>`;

  for (const [label, catList, totR] of [['▲ ENTRATE',catsE,totRE],['▼ USCITE',catsU,totRU]]) {
    const color = label.includes('ENTRATE') ? 'var(--green)' : 'var(--red)';
    html += `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.06em;color:${color};margin:14px 0 6px">${label}</p>`;
    for (const cat of catList) {
      const vociCat = voci.filter(v => v.categoria_id===cat.id);
      if (!vociCat.length) continue;
      let catR=0,catP=0;
      vociCat.forEach(v => {
        catR += movsMap[v.id] ?? regsMap[v.id]?.importo_reale ?? 0;
        catP += prevMap[v.id] ?? regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
      });
      const sC = catP-catR;
      html += `
      <div style="background:var(--bg-card);border:1px solid var(--border);
           border-radius:var(--radius-sm);margin-bottom:6px;overflow:hidden">
        <div style="background:${cat.colore};padding:8px 12px;
             display:flex;justify-content:space-between;align-items:center;cursor:pointer"
             onclick="this.nextElementSibling.style.display=
               this.nextElementSibling.style.display==='none'?'':'none'">
          <span style="font-size:0.78rem;font-weight:700;color:white;text-transform:uppercase">${cat.nome}</span>
          <div style="text-align:right">
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(catR)}</div>
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.8)">
              ${sC>=0?'+':''}${formatEur(sC)} su ${formatEur(catP)}</div>
          </div>
        </div>
        <div>
          ${vociCat.map(v => {
            const real = movsMap[v.id] ?? regsMap[v.id]?.importo_reale ?? 0;
            const prev = prevMap[v.id] ?? regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
            const saldo = prev-real;
            const pct   = prev>0?Math.min(100,Math.round(real/prev*100)):0;
            const nMov  = movsVoce.filter(m => m.voce_id===v.id).length;
            return `
            <div style="padding:9px 12px;border-top:1px solid var(--border);
                 cursor:pointer;display:flex;justify-content:space-between;align-items:center"
                 onclick="window.apriVoce(${v.id},'${v.nome.replace(/'/g,"\\'")}',${prev})">
              <div style="flex:1;min-width:0">
                <div style="font-size:0.85rem;font-weight:500">${v.nome}</div>
                ${nMov>0?`<div style="font-size:0.7rem;color:var(--blue)">${nMov} mov.</div>`:''}
                ${prev>0?`<div style="height:3px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${pct>100?'var(--red)':cat.colore};border-radius:2px"></div>
                </div>`:''}
              </div>
              <div style="text-align:right;margin-left:12px;flex-shrink:0">
                <div style="font-size:0.9rem;font-weight:700;color:${real>0?'inherit':'var(--text-muted)'}">
                  ${real>0?formatEur(real):'—'}</div>
                <div style="font-size:0.68rem;color:var(--text-muted)">prev. ${formatEur(prev)}</div>
                ${(real>0||prev>0)?`<div style="font-size:0.7rem;font-weight:600;
                  color:${saldo>=0?'var(--green)':'var(--red)'}">
                  ${saldo>=0?'+':''}${formatEur(saldo)}</div>`:''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }
  }
  root.innerHTML = html; lucide.createIcons();
}

// ── TAB RICONCILIAZIONE ───────────────────────────────────────────────────────
async function renderRiconciliazione() {
  const root = document.getElementById('mese-root');
  const conti = await db.conti_correnti.where('attivo').equals(1).toArray();
  const saldoApertura = currentMese.saldo_apertura ?? await calcolaSaldoApertura();
  const dataInizio = `${currentAnno}-${String(currentMeseNum).padStart(2,'0')}-01`;
  const dataFine   = new Date(currentAnno, currentMeseNum, 0).toISOString().split('T')[0];
  const movimenti  = await db.movimenti_conto
    .where('data').between(dataInizio, dataFine, true, true).toArray();
  const totEnt = movimenti.filter(m => m.tipo==='entrata').reduce((s,m)=>s+m.importo,0);
  const totUsc = movimenti.filter(m => m.tipo==='uscita').reduce((s,m)=>s+m.importo,0);
  const saldoCalcolato = saldoApertura + totEnt - totUsc;
  const isMeseChiuso  = currentMese.stato === 'chiuso';
  const recon = await db.riconciliazioni.where('mese_id').equals(currentMese.id).first();

  root.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">CALCOLO SALDO</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:0.88rem">
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-muted)">Saldo apertura</span>
          <span style="font-weight:600">${formatEur(saldoApertura)}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--green)">+ Entrate</span>
          <span style="font-weight:600;color:var(--green)">${formatEur(totEnt)}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--red)">− Uscite</span>
          <span style="font-weight:600;color:var(--red)">${formatEur(totUsc)}</span>
        </div>
        <div style="border-top:2px solid var(--border);padding-top:8px;
             display:flex;justify-content:space-between">
          <span style="font-weight:700">Saldo calcolato</span>
          <span style="font-weight:700;font-size:1.05rem">${formatEur(saldoCalcolato)}</span>
        </div>
      </div>
    </div>
    ${isMeseChiuso ? `
    <div style="background:var(--gray-light);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:12px">
      <div style="font-size:0.82rem;font-weight:700;color:var(--gray);margin-bottom:8px">
        🔒 Mese chiuso il ${recon?.data_chiusura?formatDate(recon.data_chiusura):'—'}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px">
        <span>Saldo reale banca</span><span>${formatEur(recon?.saldo_estratto_conto)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:700;
           color:${Math.abs(recon?.differenza||0)<0.01?'var(--green)':'var(--red)'}">
        <span>Differenza</span><span>${formatEur(recon?.differenza??0)}</span>
      </div>
    </div>
    <button class="btn btn-ghost btn-full" onclick="window.riapreMese()">🔓 Riapri mese</button>
    ` : `
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">VERIFICA SALDO REALE</div>
      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px">
        Inserisci il saldo che vedi nell'app della banca a fine ${MESI_NOMI[currentMeseNum]}.
      </p>
      ${conti.map(c=>`
      <div class="form-group">
        <div class="label">${c.nome} — saldo reale (€)</div>
        <input type="number" id="sr-${c.id}" placeholder="0.00" step="0.01"
          inputmode="decimal" value="${recon?.saldo_estratto_conto||''}">
      </div>`).join('')}
      <div id="diff-preview" style="display:none;background:var(--bg);
           border-radius:var(--radius-sm);padding:10px 12px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px">
          <span>Saldo inserito</span><span id="diff-ins">—</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-weight:700;
             padding-top:6px;border-top:1px solid var(--border)">
          <span>Differenza</span><span id="diff-val">—</span>
        </div>
      </div>
    </div>
    <button class="btn btn-primary btn-full"
      onclick="window.chiudiMese(${saldoCalcolato}, ${conti[0]?.id||0})">
      🔒 Chiudi ${MESI_NOMI[currentMeseNum]} ${currentAnno}
    </button>
    <p style="font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:8px">
      La chiusura blocca il mese e imposta il saldo di apertura del mese successivo.
    </p>`}`;

  // Preview diff in realtime
  if (!isMeseChiuso && conti.length > 0) {
    document.getElementById(`sr-${conti[0].id}`)?.addEventListener('input', e => {
      const ins  = parseFloat(e.target.value) || 0;
      const diff = ins - saldoCalcolato;
      document.getElementById('diff-preview').style.display = '';
      document.getElementById('diff-ins').textContent = formatEur(ins);
      const dEl = document.getElementById('diff-val');
      dEl.textContent  = (diff>=0?'+':'') + formatEur(diff);
      dEl.style.color  = Math.abs(diff)<0.01?'var(--green)':'var(--red)';
    });
  }
  lucide.createIcons();
}

// ── MODAL NUOVO MOVIMENTO ─────────────────────────────────────────────────────
async function apriNuovoMovimento() {
  let modal = document.getElementById('modal-nm');
  if (!modal) {
    const conti = await db.conti_correnti.where('attivo').equals(1).toArray();
    const cats  = await db.categorie_budget.orderBy('ordine').toArray();
    modal = document.createElement('div');
    modal.id = 'modal-nm'; modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Nuovo movimento</h2>
          <button class="modal-close" onclick="window.chiudiNM()"><i data-lucide="x"></i></button>
        </div>
        <div class="tabs" id="nm-tipo-tabs">
          <button class="tab-btn active" data-tipo="uscita">Uscita</button>
          <button class="tab-btn" data-tipo="entrata">Entrata</button>
          <button class="tab-btn" data-tipo="trasferimento">Trasf.</button>
        </div>
        <div class="form-row" style="margin-top:12px">
          <div class="form-group">
            <div class="label">Data *</div>
            <input type="date" id="nm-data" value="${today()}">
          </div>
          <div class="form-group">
            <div class="label">Importo (€) *</div>
            <input type="number" id="nm-importo" placeholder="0.00" step="0.01" inputmode="decimal">
          </div>
        </div>
        <div class="form-group">
          <div class="label">Conto *</div>
          <select id="nm-conto">${conti.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select>
        </div>
        <div class="form-group" id="nm-dest-wrap" style="display:none">
          <div class="label">Conto destinazione</div>
          <select id="nm-conto-dest">${conti.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <div class="label">Categoria budget</div>
          <select id="nm-cat">
            <option value="">— nessuna —</option>
            ${cats.filter(c=>c.tipo==='uscita').map(c=>`<option value="${c.nome}">${c.nome}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <div class="label">Descrizione</div>
          <input type="text" id="nm-desc" placeholder="es. CONAD, Stipendio...">
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" onclick="window.chiudiNM()">Annulla</button>
          <button class="btn btn-primary" onclick="window.salvaNM()">Salva</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const updateCats = (tipo) => {
      const sel = document.getElementById('nm-cat');
      const f = tipo==='entrata' ? cats.filter(c=>c.tipo==='entrata') : cats.filter(c=>c.tipo==='uscita');
      sel.innerHTML = '<option value="">— nessuna —</option>' +
        f.map(c=>`<option value="${c.nome}">${c.nome}</option>`).join('');
    };
    document.querySelectorAll('#nm-tipo-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#nm-tipo-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const tipo = btn.dataset.tipo;
        document.getElementById('nm-dest-wrap').style.display = tipo==='trasferimento'?'':'none';
        updateCats(tipo);
      });
    });
    modal.addEventListener('click', e => { if (e.target===modal) window.chiudiNM(); });
  }
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));
  document.getElementById('nm-importo').value = '';
  document.getElementById('nm-desc').value = '';
  document.getElementById('nm-data').value = today();
  lucide.createIcons();
}

// ── MODAL CATEGORIZZA ─────────────────────────────────────────────────────────
async function categorizzaMovimento(movId) {
  const mov  = await db.movimenti_conto.get(movId);
  const cats = await db.categorie_budget.orderBy('ordine').toArray();
  let modal = document.getElementById('modal-cat-mov');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'modal-cat-mov'; modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Categorizza</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').classList.add('hidden')">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px">
        <div style="font-weight:600">${mov.descrizione||'—'}</div>
        <div style="font-size:0.82rem;color:var(--text-muted)">${formatDate(mov.data)} · ${formatEur(mov.importo)}</div>
      </div>
      <div class="form-group">
        <div class="label">Categoria</div>
        <select id="cat-mov-sel" onchange="window.aggiornaSelezioneVoci(this.value)">
  <option value="">— nessuna —</option>
  ${cats.map(c => `<option value="${c.nome}">${c.nome} (${c.tipo})</option>`).join('')}
</select>
<div id="voce-sel-wrap" style="display:none">
  <div class="label" style="margin-top:8px">Voce specifica (opzionale)</div>
  <select id="cat-nome-sel"></select>
</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').classList.add('hidden')">Annulla</button>
        <button class="btn btn-primary" onclick="window.salvaCatMov(${movId})">Salva</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));
  lucide.createIcons();
}

window.salvaCategorizza = async (movId) => {
  const cat     = document.getElementById('cat-sel').value;
  const nomeCat = document.getElementById('cat-nome-sel')?.value || '';
  
  await db.movimenti_conto.update(movId, {
    categoria: cat, categorizzato: cat ? 1 : 0
  });

  // Collegamento automatico → budget
  if (cat && nomeCat) {
    const mov = await db.movimenti_conto.get(movId);
    if (mov && mov.tipo !== 'trasferimento') {
      // Trova la voce budget corrispondente al nome categoria
      const voci = await db.voci_budget.toArray();
      const voce = voci.find(v => v.nome === nomeCat);
      if (voce) {
        // Trova o crea il mese corretto
        const data = mov.data; // es. "2026-07-08"
        const anno = parseInt(data.slice(0,4));
        const mese = parseInt(data.slice(5,7));
        const meseRec = await getOrCreateMese(anno, mese);
        // Verifica che non esista già un movimento voce uguale
        const existing = await db.movimenti_voce
          .where({ voce_id: voce.id, mese_id: meseRec.id })
          .filter(m => m.descrizione === (mov.descrizione||'') && m.importo === mov.importo)
          .first();
        if (!existing) {
          await db.movimenti_voce.add({
            voce_id:     voce.id,
            mese_id:     meseRec.id,
            data:        mov.data,
            importo:     mov.importo,
            modalita:    'bonifico',
            descrizione: mov.descrizione || cat,
            note:        'Da movimento bancario'
          });
        }
      }
    }
  }

  document.getElementById('modal-categorizza')?.classList.add('hidden');
  toast('Categoria salvata e budget aggiornato', 'success');
  await renderMovimenti();
};

// ── MODAL VOCE BUDGET ─────────────────────────────────────────────────────────
async function apriVoce(voceId, voceName, prevDefault) {
  const [movs, reg, prevMese] = await Promise.all([
    db.movimenti_voce.where({ voce_id: voceId, mese_id: currentMese.id }).toArray(),
    db.registrazioni.where({ voce_id: voceId, mese_id: currentMese.id }).first(),
    db.previsioni_mensili.where({ voce_id: voceId, mese_id: currentMese.id }).first()
  ]);
  const totMov = movs.reduce((s,m)=>s+m.importo,0);
  const prev   = prevMese?.importo ?? prevDefault;
  let modal = document.getElementById('modal-voce-m');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'modal-voce-m'; modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${voceName}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').classList.add('hidden')">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="form-group">
        <div class="label">Previsione ${MESI_NOMI[currentMeseNum]} (€)
          <span style="font-size:0.72rem;color:var(--text-muted)">default: ${formatEur(prevDefault)}</span>
        </div>
        <input type="number" id="vm-prev" value="${prev||''}" placeholder="${prevDefault}" step="0.01" inputmode="decimal">
      </div>
      <div class="form-group">
        <div class="label">Importo diretto (€)</div>
        <input type="number" id="vm-real" value="${reg?.importo_reale||''}" placeholder="oppure usa movimenti sotto" step="0.01" inputmode="decimal">
      </div>
      ${movs.length>0?`
      <div class="section-title">Movimenti — totale ${formatEur(totMov)}</div>
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
        ${movs.map(m=>`
        <div class="list-item" style="padding:8px 12px">
          <div class="list-item-left">
            <div style="font-size:0.85rem">${m.descrizione||'—'}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${formatDate(m.data)} · ${MODALITA_LABEL[m.modalita]||m.modalita}</div>
          </div>
          <div class="list-item-right">
            <div style="font-weight:700">${formatEur(m.importo)}</div>
            <button onclick="window.elimMV(${m.id},${voceId},'${voceName.replace(/'/g,"\\'")}',${prevDefault})"
              style="font-size:0.7rem;color:var(--red);background:none;border:none;cursor:pointer">🗑️</button>
          </div>
        </div>`).join('')}
      </div>`:''}
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-sub);margin-bottom:8px">+ Aggiungi movimento</div>
        <div class="form-row">
          <div class="form-group"><div class="label">Data</div>
            <input type="date" id="mv-data" value="${today()}"></div>
          <div class="form-group"><div class="label">Importo (€)</div>
            <input type="number" id="mv-imp" placeholder="0.00" step="0.01" inputmode="decimal"></div>
        </div>
        <div class="form-group"><div class="label">Pagamento</div>
          <select id="mv-mod">
            <option value="pos">POS</option><option value="credito">Carta credito</option>
            <option value="ricaricabile">Carta ricaricabile</option><option value="contanti">Contanti</option>
            <option value="bonifico">Bonifico</option><option value="rid">RID</option>
            <option value="paypal">PayPal/Satispay</option><option value="altro">Altro</option>
          </select></div>
        <div class="form-group"><div class="label">Descrizione</div>
          <input type="text" id="mv-desc" placeholder="es. Prenatal, CONAD..."></div>
        <button class="btn btn-ghost btn-full btn-sm"
          onclick="window.addMV(${voceId},'${voceName.replace(/'/g,"\\'")}',${prevDefault})">+ Aggiungi</button>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').classList.add('hidden')">Chiudi</button>
        <button class="btn btn-primary" onclick="window.salvaVoce(${voceId},${prevDefault})">Salva</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));
  lucide.createIcons();
}

// ── GLOBALS ───────────────────────────────────────────────────────────────────
function setupGlobals() {
  window.apriNuovoMovimento  = apriNuovoMovimento;
  window.categorizzaMovimento = categorizzaMovimento;
  window.apriVoce            = apriVoce;

  window.chiudiNM = () => {
    const m = document.getElementById('modal-nm');
    if (m) { m.classList.remove('open'); setTimeout(()=>m.classList.add('hidden'),250); }
  };

  window.salvaNM = async () => {
    const tipo    = document.querySelector('#nm-tipo-tabs .tab-btn.active')?.dataset.tipo||'uscita';
    const importo = parseFloat(document.getElementById('nm-importo').value);
    const data    = document.getElementById('nm-data').value;
    const contoId = parseInt(document.getElementById('nm-conto').value);
    const cat     = document.getElementById('nm-cat').value;
    const desc    = document.getElementById('nm-desc').value.trim();
    const destId  = tipo==='trasferimento'?parseInt(document.getElementById('nm-conto-dest').value):null;
    if (!importo||importo<=0||!data||!contoId){alert('Inserisci data, importo e conto');return;}
    await db.movimenti_conto.add({
      conto_id:contoId, data, tipo, importo:Math.abs(importo),
      descrizione:desc, categoria:cat||null, conto_dest_id:destId, categorizzato:cat?1:0
    });
    window.chiudiNM();
    toast('Movimento salvato','success');
    await renderMovimenti();
  };

  window.eliminaMovimento = async (id) => {
    if (!confirm('Eliminare questo movimento?')) return;
    await db.movimenti_conto.delete(id);
    toast('Eliminato');
    await renderMovimenti();
  };

  window.salvaCatMov = async (movId) => {
    const cat = document.getElementById('cat-mov-sel').value;
    await db.movimenti_conto.update(movId,{categoria:cat,categorizzato:cat?1:0});
    document.getElementById('modal-cat-mov')?.classList.add('hidden');
    toast('Categoria salvata','success');
    await renderMovimenti();
  };

  window.salvaVoce = async (voceId, prevDefault) => {
    const prevVal = parseFloat(document.getElementById('vm-prev').value);
    const realVal = parseFloat(document.getElementById('vm-real').value);
    if (!isNaN(prevVal)&&prevVal!==prevDefault) {
      const ex = await db.previsioni_mensili.where({voce_id:voceId,mese_id:currentMese.id}).first();
      if (ex) await db.previsioni_mensili.update(ex.id,{importo:prevVal});
      else await db.previsioni_mensili.add({voce_id:voceId,mese_id:currentMese.id,importo:prevVal});
    }
    if (!isNaN(realVal)&&realVal>=0) {
      const ex = await db.registrazioni.where({voce_id:voceId,mese_id:currentMese.id}).first();
      if (ex) await db.registrazioni.update(ex.id,{importo_reale:realVal});
      else await db.registrazioni.add({voce_id:voceId,mese_id:currentMese.id,importo_reale:realVal});
    }
    document.getElementById('modal-voce-m')?.classList.add('hidden');
    toast('Voce salvata','success');
    await renderBudget();
  };

  window.addMV = async (voceId, voceName, prevDefault) => {
    const imp  = parseFloat(document.getElementById('mv-imp').value);
    const data = document.getElementById('mv-data').value;
    const mod  = document.getElementById('mv-mod').value;
    const desc = document.getElementById('mv-desc').value.trim();
    if (!imp||imp<=0||!data){alert('Inserisci data e importo');return;}
    await db.movimenti_voce.add({
      voce_id:voceId, mese_id:currentMese.id,
      data, importo:imp, modalita:mod, descrizione:desc, note:''
    });
    document.getElementById('modal-voce-m')?.classList.add('hidden');
    await apriVoce(voceId,voceName,prevDefault);
  };

  window.elimMV = async (movId, voceId, voceName, prevDefault) => {
    if (!confirm('Eliminare?')) return;
    await db.movimenti_voce.delete(movId);
    document.getElementById('modal-voce-m')?.classList.add('hidden');
    await apriVoce(voceId,voceName,prevDefault);
  };

  window.chiudiMese = async (saldoCalcolato, primoContoId) => {
    const saldoReale = parseFloat(document.getElementById(`sr-${primoContoId}`)?.value);
    if (isNaN(saldoReale)){alert('Inserisci il saldo reale della banca');return;}
    if (!confirm(`Chiudere ${MESI_NOMI[currentMeseNum]} ${currentAnno}?`)) return;
    const diff = saldoReale - saldoCalcolato;
    await db.riconciliazioni.add({
      mese_id:currentMese.id, conto_id:primoContoId,
      saldo_estratto_conto:saldoReale, saldo_calcolato:saldoCalcolato,
      differenza:diff, data_chiusura:today(), note:''
    });
    await db.mesi.update(currentMese.id,{stato:'chiuso',saldo_chiusura:saldoCalcolato});
    currentMese = await db.mesi.get(currentMese.id);
    toast(`${MESI_NOMI[currentMeseNum]} chiuso ✓`,'success');
    await renderStatoBadge();
    await renderRiconciliazione();
  };

  window.riapreMese = async () => {
    if (!confirm('Riaprire il mese?')) return;
    await db.mesi.update(currentMese.id,{stato:'in_corso',saldo_chiusura:undefined});
    await db.riconciliazioni.where('mese_id').equals(currentMese.id).delete();
    currentMese = await db.mesi.get(currentMese.id);
    toast('Mese riaperto');
    await renderStatoBadge();
    await renderRiconciliazione();
  };

  window.aggiornaSelezioneVoci = async (catNome) => {
  const wrap = document.getElementById('voce-sel-wrap');
  const sel  = document.getElementById('cat-nome-sel');
  if (!catNome || !wrap || !sel) return;
  const cats = await db.categorie_budget.toArray();
  const cat  = cats.find(c => c.nome === catNome);
  if (!cat) { wrap.style.display = 'none'; return; }
  const voci = await db.voci_budget
    .where('categoria_id').equals(cat.id).toArray();
  sel.innerHTML = voci.map(v =>
    `<option value="${v.nome}">${v.nome}</option>`
  ).join('');
  wrap.style.display = voci.length > 0 ? '' : 'none';
};

window.salvaPiano = async () => {
  const stipendio  = parseFloat(document.getElementById('piano-stipendio').value) || 0;
  const primateTe  = parseFloat(document.getElementById('piano-primatete').value) || 0;
  const primaNote  = document.getElementById('piano-primanote').value.trim();
  const spesePers  = parseFloat(document.getElementById('piano-persone').value) || 0;

  // Salva override obbligazioni modificate manualmente
  const overrides = [];
  document.querySelectorAll('.voce-obbl').forEach(inp => {
    overrides.push({ nome: inp.dataset.voce, importo: parseFloat(inp.value) || 0 });
  });

  const existing = await db.piano_mensile
    .where('mese_id').equals(currentMese.id).first();

  const data = {
    mese_id:              currentMese.id,
    stipendio_atteso:     stipendio,
    prima_te_stesso:      primateTe,
    prima_te_stesso_note: primaNote,
    obbligazioni_override: JSON.stringify(overrides),
    spese_personali:      spesePers,
    creato_il:            new Date().toISOString()
  };

  if (existing) await db.piano_mensile.update(existing.id, data);
  else          await db.piano_mensile.add(data);

  toast('Piano salvato ✓', 'success');
};
}
