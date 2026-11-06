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

// ── MAPPA BUSTE ──────────────────────────────────────────────────────────────
// Le voci elencate in "voci" hanno la precedenza sulla categoria.
// I nomi devono coincidere con quelli in Budget → Gestione voci.
const BUSTE = {
  prima: {
    cat:  ['Risparmio e Liquidità', 'Investimento Lungo Termine'],
    voci: []
  },
  obblig: {
    cat:  ['Spese Fisse Contrattuali', 'Canoni Bancari', 'Figli'],
    voci: ['Utenze Luce + Gas', 'Utenza Acqua', 'Carburante / Auto']
  },
  persone: {
    cat:  ['Spese Discrezionali'],
    voci: []
  },
  gestione: {
    cat:  ['Spese Variabili Necessarie', 'Spese Irregolari / Annuali', 'Fiscalità'],
    voci: ['Farmacia / Salute', 'Casa / Varie', 'Casa / Fai da Te', 'Autolavaggio']
  }
};

// Ultimo giorno del mese come 'YYYY-MM-DD', in ora locale (niente toISOString)
function fineMese(anno, mese) {
  const ultimo = new Date(anno, mese, 0).getDate();
  return `${anno}-${String(mese).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

function bustaDi(voceNome, catNome) {
  for (const [busta, def] of Object.entries(BUSTE)) {
    if (def.voci.includes(voceNome)) return busta;
  }
  for (const [busta, def] of Object.entries(BUSTE)) {
    if (def.cat.includes(catNome)) return busta;
  }
  return null;
}

// Piano e reale di ogni voce del mese, raggruppati per busta
async function calcolaBusteMese() {
  const [cats, voci, regs, movs, prevMens] = await Promise.all([
    db.categorie_budget.toArray(),
    db.voci_budget.where('attiva').equals(1).toArray(),
    db.registrazioni.where('mese_id').equals(currentMese.id).toArray(),
    db.movimenti_voce.where('mese_id').equals(currentMese.id).toArray(),
    db.previsioni_mensili.where('mese_id').equals(currentMese.id).toArray()
  ]);

  const catMap  = Object.fromEntries(cats.map(c => [c.id, c]));
  const regsMap = Object.fromEntries(regs.map(r => [r.voce_id, r]));
  const prevMap = Object.fromEntries(prevMens.map(p => [p.voce_id, p.importo]));
  const movsMap = {};
  movs.forEach(m => { movsMap[m.voce_id] = (movsMap[m.voce_id] || 0) + m.importo; });

  const out = { entrate: [], prima: [], obblig: [], persone: [], gestione: [], altro: [] };

  for (const v of voci) {
    const cat = catMap[v.categoria_id];
    if (!cat) continue;
    const reale = movsMap[v.id] ?? regsMap[v.id]?.importo_reale ?? 0;
    const piano = prevMap[v.id] ?? regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
    const riga  = { nome: v.nome, piano, reale };

    if (cat.tipo === 'entrata') { out.entrate.push(riga); continue; }
    out[bustaDi(v.nome, cat.nome) || 'altro'].push(riga);
  }
  return out;
}

const sommaRighe = (righe, campo) => righe.reduce((s, r) => s + r[campo], 0);

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
    filtroMov = { q: '', tipo: 'tutti', conto: '', daCat: false };
    await loadMese(); await renderTab();
  });
  document.getElementById('btn-succ')?.addEventListener('click', async () => {
    currentMeseNum++;
    if (currentMeseNum > 12) { currentMeseNum = 1; currentAnno++; }
    filtroMov = { q: '', tipo: 'tutti', conto: '', daCat: false };
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

  const [piano, buste] = await Promise.all([
    db.piano_mensile.where('mese_id').equals(currentMese.id).first(),
    calcolaBusteMese()
  ]);

    // Versamenti "Prima te stesso" del mese (movimenti delle voci di quella busta)
  const [catsP, vociP, movsP] = await Promise.all([
    db.categorie_budget.toArray(),
    db.voci_budget.toArray(),
    db.movimenti_voce.where('mese_id').equals(currentMese.id).toArray()
  ]);
  const idCatP   = catsP.filter(c => BUSTE.prima.cat.includes(c.nome)).map(c => c.id);
  const vociPMap = Object.fromEntries(
    vociP.filter(v => idCatP.includes(v.categoria_id)).map(v => [v.id, v.nome]));
  const versamenti = movsP
    .filter(m => vociPMap[m.voce_id])
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  // Modifiche manuali alle obbligazioni, salvate per nome voce
  const ovr = {};
  try {
    JSON.parse(piano?.obbligazioni_override || '[]')
      .forEach(o => { ovr[o.nome] = o.importo; });
  } catch (e) {}

  const righeObbl = buste.obblig
    .map(r => ({ ...r, piano: ovr[r.nome] ?? r.piano }))
    .filter(r => r.piano > 0 || r.reale > 0 || ovr[r.nome] !== undefined);

  const stipendio  = piano?.stipendio_atteso     ?? 2250;
  const primaPiano = piano?.prima_te_stesso      ?? 200;
  const primaNote  = piano?.prima_te_stesso_note ?? '';
  const persPiano  = piano?.spese_personali      ?? 300;

  const realeEntrate = sommaRighe(buste.entrate, 'reale');
  const realePrima   = sommaRighe(buste.prima, 'reale');
  const realeObbl    = sommaRighe(buste.obblig, 'reale');
  const realePers    = sommaRighe(buste.persone, 'reale');
  const realeGest    = sommaRighe(buste.gestione, 'reale');
  const altro = buste.altro.filter(r => r.piano > 0 || r.reale > 0);

  // Importi mostrati in euro interi per stare nelle colonne
  const eur0  = v => new Intl.NumberFormat('it-IT').format(Math.round(v) || 0);
  const segno = v => (v > 0 ? '+' : '') + eur0(v);

  const GRID = 'display:grid;grid-template-columns:1fr 64px 56px 56px;gap:4px;align-items:center';
  const NUM  = 'font-size:0.8rem;text-align:right;font-variant-numeric:tabular-nums';
  const INP  = 'width:100%;box-sizing:border-box;text-align:right;font-size:0.8rem;font-weight:600;' +
               'padding:3px 4px;border:1px solid var(--border);border-radius:4px;' +
               'background:var(--bg-card);color:var(--text)';
  const SMALL = 'font-size:0.68rem;color:var(--text-muted)';

  const intestazione = (titolo, colore) => `
    <div style="${GRID};margin-bottom:6px">
      <span style="font-size:0.78rem;font-weight:700;color:${colore};white-space:nowrap;
                   overflow:hidden;text-overflow:ellipsis">${titolo}</span>
      <span style="${NUM};${SMALL}">Piano</span>
      <span style="${NUM};${SMALL}">Reale</span>
      <span style="${NUM};${SMALL}">Resta</span>
    </div>`;

  const rigaVoce = r => `
    <div style="${GRID};padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:0.8rem;min-width:0;overflow:hidden;text-overflow:ellipsis">${r.nome}</span>
      <input type="number" class="voce-obbl" data-voce="${r.nome.replace(/"/g, '&quot;')}"
             data-reale="${r.reale}" value="${r.piano}" style="${INP}"
             inputmode="decimal" step="10">
      <span style="${NUM}">${eur0(r.reale)}</span>
      <span class="resta-voce" style="${NUM}"></span>
    </div>`;

  const realeResiduo = realeEntrate > 0
    ? eur0(realeEntrate - realePrima - realeObbl) : '—';

  root.innerHTML = `
    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;text-align:center">
      Resta = Piano − Reale · importi in euro
    </div>

    <!-- ① Entrate -->
    <div class="card" style="margin-bottom:10px;border-left:4px solid var(--blue)">
      ${intestazione('① Entrate', 'var(--blue)')}
      <div style="${GRID}">
        <span style="font-size:0.8rem;color:var(--text-muted)">Stipendio e altre</span>
        <input type="number" id="piano-stipendio" value="${stipendio}" style="${INP}"
               inputmode="decimal" step="10">
        <span style="${NUM}">${eur0(realeEntrate)}</span>
        <span id="r-entrate" style="${NUM};font-weight:700"></span>
      </div>
    </div>

    <!-- ② Prima te stesso -->
    <div class="card" style="margin-bottom:10px;border-left:4px solid var(--green)">
      ${intestazione('② Prima te stesso', 'var(--green)')}
      <div style="${GRID};margin-bottom:6px">
        <span style="font-size:0.8rem;color:var(--text-muted)">Risparmio intoccabile</span>
        <input type="number" id="piano-primatete" value="${primaPiano}" style="${INP}"
               inputmode="decimal" step="10">
        <span style="${NUM}">${eur0(realePrima)}</span>
        <span id="r-prima" style="${NUM};font-weight:700"></span>
      </div>
      <input type="text" id="piano-primanote" value="${primaNote}"
             placeholder="es. PAC ETF 100€ + Deposito 100€"
             style="width:100%;box-sizing:border-box;font-size:0.78rem;padding:6px 8px;
                    border:1px solid var(--border);border-radius:6px;
                    background:var(--bg);color:var(--text)">
            <button class="btn btn-ghost btn-full btn-sm" style="margin-top:8px"
              onclick="window.apriVersamento()">+ Registra versamento</button>
      ${versamenti.length ? `
        <div style="margin-top:8px">
          ${versamenti.map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:5px 0;border-top:1px solid var(--border);font-size:0.78rem">
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis">
                ${formatDate(m.data)} · ${vociPMap[m.voce_id]}
                ${m.descrizione && m.descrizione !== vociPMap[m.voce_id]
                  ? `<span style="color:var(--text-muted)"> · ${m.descrizione}</span>` : ''}
              </span>
              <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                <strong>${eur0(m.importo)}</strong>
                ${m.note === 'Prima te stesso'
                  ? `<button onclick="window.eliminaVersamento(${m.id})"
                       style="background:none;border:none;cursor:pointer;font-size:0.8rem">🗑️</button>`
                  : ''}
              </span>
            </div>`).join('')}
        </div>` : ''}
    </div>

    <!-- ③ Obbligazioni fisse -->
    <div class="card" style="margin-bottom:10px;border-left:4px solid var(--red)">
      ${intestazione('③ Obbligazioni fisse', 'var(--red)')}
      ${righeObbl.length
        ? righeObbl.map(rigaVoce).join('')
        : '<div style="font-size:0.8rem;color:var(--text-muted);padding:6px 0">Nessuna voce con importo.</div>'}
      <div style="${GRID};margin-top:8px">
        <span style="font-size:0.8rem;font-weight:700">Totale</span>
        <span id="p-obbl" style="${NUM};font-weight:700"></span>
        <span style="${NUM};font-weight:700">${eur0(realeObbl)}</span>
        <span id="r-obbl" style="${NUM};font-weight:700"></span>
      </div>
    </div>

    <!-- Residuo -->
    <div style="border:2px solid var(--blue);border-radius:var(--radius-sm);
                padding:10px 12px;margin-bottom:10px">
      <div style="${GRID}">
        <span style="font-size:0.85rem;font-weight:700">Residuo disponibile</span>
        <span id="p-residuo" style="${NUM};font-weight:700"></span>
        <span style="${NUM};font-weight:700">${realeResiduo}</span>
        <span></span>
      </div>
    </div>

    <!-- ④ Distribuzione del residuo -->
    <div class="card" style="margin-bottom:10px;border-left:4px solid var(--purple)">
      ${intestazione('④ Distribuzione del residuo', 'var(--purple)')}
      <div style="${GRID};padding:6px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:0.82rem;font-weight:600">Spese personali</div>
          <div style="${SMALL}">Abbigliamento, hobby, ristorazione…</div>
        </div>
        <input type="number" id="piano-persone" value="${persPiano}" style="${INP}"
               inputmode="decimal" step="10">
        <span style="${NUM}">${eur0(realePers)}</span>
        <span id="r-pers" style="${NUM};font-weight:700"></span>
      </div>
      <div style="${GRID};padding:6px 0">
        <div>
          <div style="font-size:0.82rem;font-weight:600">Gestione ordinaria</div>
          <div style="${SMALL}">Alimentari, farmacia, casa…</div>
        </div>
        <span id="p-gest" style="${NUM};font-weight:700"></span>
        <span style="${NUM}">${eur0(realeGest)}</span>
        <span id="r-gest" style="${NUM};font-weight:700"></span>
      </div>
    </div>

    ${altro.length ? `
    <div style="font-size:0.75rem;color:var(--orange);background:var(--orange-light);
                border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:10px">
      ⚠️ ${altro.length} voci non assegnate a nessuna busta (${altro.map(r => r.nome).join(', ')}).
      Aggiungile all'elenco BUSTE in mese.js.
    </div>` : ''}

    <button class="btn btn-primary btn-full" onclick="window.salvaPiano()">
      💾 Salva piano ${MESI_NOMI[currentMeseNum]}
    </button>
  `;

  // Ricalcolo live: i valori "Reale" restano quelli letti dai movimenti
  const VERDE = 'var(--green)', ROSSO = 'var(--red)', ARANCIO = 'var(--orange)';
  const set = (id, testo, colore) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = testo;
    if (colore) el.style.color = colore;
  };

  const aggiorna = () => {
    const stip  = parseFloat(document.getElementById('piano-stipendio').value) || 0;
    const prima = parseFloat(document.getElementById('piano-primatete').value) || 0;
    const pers  = parseFloat(document.getElementById('piano-persone').value) || 0;

    let totObbl = 0;
    document.querySelectorAll('.voce-obbl').forEach(inp => {
      const p = parseFloat(inp.value) || 0;
      const resta = p - (parseFloat(inp.dataset.reale) || 0);
      totObbl += p;
      const cella = inp.parentElement.querySelector('.resta-voce');
      cella.textContent = segno(resta);
      cella.style.color = resta >= -0.005 ? VERDE : ROSSO;
    });

    const residuo = stip - prima - totObbl;
    const gest    = residuo - pers;

    // Entrate e Prima te stesso: sopra zero = ancora da incassare / accantonare
    set('r-entrate', segno(stip - realeEntrate),  stip - realeEntrate  <= 0.005 ? VERDE : ARANCIO);
    set('r-prima',   segno(prima - realePrima),   prima - realePrima   <= 0.005 ? VERDE : ARANCIO);
    // Uscite: sotto zero = piano superato
    set('p-obbl',    eur0(totObbl));
    set('r-obbl',    segno(totObbl - realeObbl),  totObbl - realeObbl  >= -0.005 ? VERDE : ROSSO);
    set('p-residuo', eur0(residuo),               residuo >= 0 ? 'var(--blue)' : ROSSO);
    set('r-pers',    segno(pers - realePers),     pers - realePers     >= -0.005 ? VERDE : ROSSO);
    set('p-gest',    eur0(gest),                  gest >= 0 ? 'var(--text)' : ROSSO);
    set('r-gest',    segno(gest - realeGest),     gest - realeGest     >= -0.005 ? VERDE : ROSSO);
  };

  ['piano-stipendio', 'piano-primatete', 'piano-persone'].forEach(id =>
    document.getElementById(id).addEventListener('input', aggiorna));
  document.querySelectorAll('.voce-obbl').forEach(inp =>
    inp.addEventListener('input', aggiorna));
  aggiorna();
}

// ── TAB MOVIMENTI ─────────────────────────────────────────────────────────────
// Filtri e dati del mese restano in memoria: la ricerca aggiorna solo la lista,
// così la tastiera non perde il focus.
let filtroMov = { q: '', tipo: 'tutti', conto: '', daCat: false };
let movMese = [];
let contiMovMap = {};

const escH = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function giornoLabel(d) {
  const s = new Date(d + 'T12:00:00')
    .toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function filtraMov() {
  const q = filtroMov.q.trim().toLowerCase();
  return movMese.filter(m => {
    if (filtroMov.tipo !== 'tutti' && m.tipo !== filtroMov.tipo) return false;
    if (filtroMov.conto && String(m.conto_id) !== filtroMov.conto) return false;
    if (filtroMov.daCat && (m.categorizzato || m.tipo === 'trasferimento')) return false;
    if (q) {
      const c = contiMovMap[m.conto_id];
      const hay = [m.descrizione, m.categoria, c?.nome,
                   String(m.importo), String(m.importo).replace('.', ',')]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function disegnaListaMov() {
  const lista = document.getElementById('mov-lista');
  const cont  = document.getElementById('mov-conteggio');
  if (!lista) return;

  const visibili = filtraMov();
  const filtriAttivi = filtroMov.q.trim() || filtroMov.tipo !== 'tutti'
                       || filtroMov.conto || filtroMov.daCat;
  if (cont) cont.textContent = filtriAttivi
    ? `${visibili.length} di ${movMese.length} movimenti` : '';

  if (movMese.length === 0) {
    lista.innerHTML = `<div class="empty-state" style="padding:32px">
      <p>Nessun movimento in questo mese.<br>Tocca + per aggiungerne uno.</p></div>`;
    return;
  }
  if (visibili.length === 0) {
    lista.innerHTML = `<div class="empty-state" style="padding:32px">
      <p>Nessun movimento corrisponde ai filtri.</p>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px"
        onclick="window.azzeraFiltriMov()">Azzera filtri</button></div>`;
    return;
  }

  // Raggruppa per giorno (l'ordine arriva già dal più recente)
  const gruppi = [];
  visibili.forEach(m => {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.data === m.data) ultimo.righe.push(m);
    else gruppi.push({ data: m.data, righe: [m] });
  });

  lista.innerHTML = gruppi.map(g => {
    const netto = g.righe.reduce((s, m) =>
      m.tipo === 'entrata' ? s + m.importo
      : m.tipo === 'uscita' ? s - m.importo : s, 0);
    const righe = g.righe.map(m => {
      const c = contiMovMap[m.conto_id];
      const isEnt = m.tipo === 'entrata', isTra = m.tipo === 'trasferimento';
      const col   = isEnt ? 'var(--green)' : isTra ? 'var(--blue)' : 'var(--red)';
      const segno = isEnt ? '+' : isTra ? '⇄' : '−';
      const catOk = m.categorizzato || isTra;
      return `
      <div class="list-item" style="padding:10px 14px">
        <div class="list-item-left">
          <div style="display:flex;align-items:center;gap:6px">
            ${!catOk ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--orange);flex-shrink:0"></span>` : ''}
            <div class="list-item-title">${escH(m.descrizione || m.categoria || '—')}</div>
          </div>
          <div class="list-item-sub">
            ${c ? `<span style="color:${c.colore || 'var(--blue)'}">${escH(c.nome)}</span>` : ''}
            ${m.categoria ? `· ${escH(m.categoria)}` : `<span style="color:var(--orange)"> · da categorizzare</span>`}
          </div>
        </div>
        <div class="list-item-right">
          <div style="font-size:0.95rem;font-weight:700;color:${col}">${segno} ${formatEur(m.importo)}</div>
          <div style="display:flex;gap:4px;margin-top:2px;justify-content:flex-end">
            ${!catOk ? `<button onclick="window.categorizzaMovimento(${m.id})"
              style="font-size:0.7rem;color:var(--orange);cursor:pointer;background:none;border:none">📌</button>` : ''}
            <button onclick="window.eliminaMovimento(${m.id})"
              style="font-size:0.7rem;color:var(--text-muted);cursor:pointer;background:none;border:none">🗑️</button>
          </div>
        </div>
      </div>`;
    }).join('');

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:6px 14px;background:var(--bg);font-size:0.72rem;font-weight:700;
                  color:var(--text-muted);border-top:1px solid var(--border)">
        <span>${giornoLabel(g.data)}</span>
        <span style="color:${netto >= 0 ? 'var(--green)' : 'var(--red)'}">${formatEur(netto, true)}</span>
      </div>${righe}`;
  }).join('');
}

async function renderMovimenti() {
  const root = document.getElementById('mese-root');
  root.innerHTML = `<div class="spinner" style="margin:24px auto"></div>`;
  const dataInizio = `${currentAnno}-${String(currentMeseNum).padStart(2,'0')}-01`;
  const dataFine   = fineMese(currentAnno, currentMeseNum);
  const [movimenti, conti] = await Promise.all([
    db.movimenti_conto.where('data').between(dataInizio, dataFine, true, true).reverse().toArray(),
    db.conti_correnti.toArray()
  ]);
  movMese     = movimenti;
  contiMovMap = Object.fromEntries(conti.map(c => [c.id, c]));

  const nonCat = movimenti.filter(m => !m.categorizzato && m.tipo !== 'trasferimento');
  const totEnt = movimenti.filter(m => m.tipo === 'entrata').reduce((s,m) => s+m.importo, 0);
  const totUsc = movimenti.filter(m => m.tipo === 'uscita').reduce((s,m) => s+m.importo, 0);

  const INP = 'width:100%;box-sizing:border-box;font-size:0.85rem;padding:8px 10px;' +
              'border:1px solid var(--border);border-radius:var(--radius-sm);' +
              'background:var(--bg-card);color:var(--text)';

  root.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:12px">
      <div class="kpi-card"><div class="label">Entrate</div>
        <div class="value text-positive">${formatEur(totEnt)}</div></div>
      <div class="kpi-card"><div class="label">Uscite</div>
        <div class="value text-negative">${formatEur(totUsc)}</div></div>
    </div>

    <input type="search" id="mov-cerca" value="${escH(filtroMov.q)}"
           placeholder="Cerca per descrizione, categoria, conto o importo"
           style="${INP};margin-bottom:8px">

    <div class="tabs" id="mov-tipo-tabs" style="margin-bottom:8px">
      ${[['tutti','Tutti'],['uscita','Uscite'],['entrata','Entrate'],['trasferimento','Trasf.']]
        .map(([k, l]) => `<button class="tab-btn ${filtroMov.tipo === k ? 'active' : ''}"
          data-f="${k}">${l}</button>`).join('')}
    </div>

    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      ${conti.length > 1 ? `
      <select id="mov-conto" style="${INP};flex:1">
        <option value="">Tutti i conti</option>
        ${conti.map(c => `<option value="${c.id}" ${String(c.id) === filtroMov.conto ? 'selected' : ''}>${escH(c.nome)}</option>`).join('')}
      </select>` : ''}
      ${nonCat.length > 0 ? `
      <button id="mov-dacat" class="btn btn-sm ${filtroMov.daCat ? 'btn-primary' : 'btn-ghost'}"
              style="white-space:nowrap">⚠️ Da categorizzare (${nonCat.length})</button>` : `
      <span style="font-size:0.8rem;color:var(--green);font-weight:600;white-space:nowrap">
        ✓ Tutti categorizzati</span>`}
    </div>

    <div id="mov-conteggio" style="font-size:0.75rem;color:var(--text-muted);
         margin-bottom:6px;min-height:1em"></div>

    <div class="card" style="padding:0;overflow:hidden" id="mov-lista"></div>`;

  document.getElementById('mov-cerca').addEventListener('input', e => {
    filtroMov.q = e.target.value;
    disegnaListaMov();
  });
  document.querySelectorAll('#mov-tipo-tabs .tab-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mov-tipo-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroMov.tipo = btn.dataset.f;
      disegnaListaMov();
    }));
  document.getElementById('mov-conto')?.addEventListener('change', e => {
    filtroMov.conto = e.target.value;
    disegnaListaMov();
  });
  document.getElementById('mov-dacat')?.addEventListener('click', e => {
    filtroMov.daCat = !filtroMov.daCat;
    e.currentTarget.classList.toggle('btn-primary', filtroMov.daCat);
    e.currentTarget.classList.toggle('btn-ghost', !filtroMov.daCat);
    disegnaListaMov();
  });

  disegnaListaMov();
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
  const dataFine   = fineMese(currentAnno, currentMeseNum);
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
  const [conti, cats, voci] = await Promise.all([
    db.conti_correnti.where('attivo').equals(1).toArray(),
    db.categorie_budget.orderBy('ordine').toArray(),
    db.voci_budget.where('attiva').equals(1).toArray()
  ]);
  if (conti.length === 0) {
    alert('Aggiungi prima un conto in Patrimonio → Conti.');
    return;
  }

  // Un solo menu: voci raggruppate per categoria, filtrate per tipo
  const opzioniVoci = tipo => {
    const tipoCat = tipo === 'entrata' ? 'entrata' : 'uscita';
    const gruppi = cats.filter(c => c.tipo === tipoCat && c.attiva).map(c => {
      const vs = voci.filter(v => v.categoria_id === c.id)
        .sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
      return vs.length
        ? `<optgroup label="${escH(c.nome)}">${vs.map(v =>
            `<option value="${v.id}">${escH(v.nome)}</option>`).join('')}</optgroup>`
        : '';
    }).join('');
    return `<option value="">— nessuna (da categorizzare) —</option>${gruppi}`;
  };

  // Data proposta: oggi se cade nel mese visualizzato, altrimenti il primo del mese
  const mesePad = String(currentMeseNum).padStart(2, '0');
  const dataDefault = today().startsWith(`${currentAnno}-${mesePad}`)
    ? today() : `${currentAnno}-${mesePad}-01`;

  const optConti = conti.map(c => `<option value="${c.id}">${escH(c.nome)}</option>`).join('');

  document.getElementById('modal-nm')?.remove();
  const modal = document.createElement('div');
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
          <div class="label">Importo (€) *</div>
          <input type="number" id="nm-importo" placeholder="0.00" step="0.01" inputmode="decimal"
                 style="font-size:1.3rem;font-weight:700">
        </div>
        <div class="form-group">
          <div class="label">Data *</div>
          <input type="date" id="nm-data" value="${dataDefault}">
        </div>
      </div>
      <div class="form-group">
        <div class="label">Descrizione</div>
        <input type="text" id="nm-desc" placeholder="es. CONAD, Stipendio...">
      </div>
      <div class="form-group" id="nm-voce-wrap">
        <div class="label">Voce di budget</div>
        <select id="nm-voce">${opzioniVoci('uscita')}</select>
      </div>
      <div class="form-group">
        <div class="label">Conto *</div>
        <select id="nm-conto">${optConti}</select>
      </div>
      <div class="form-group" id="nm-dest-wrap" style="display:none">
        <div class="label">Conto destinazione</div>
        <select id="nm-conto-dest">${optConti}</select>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="window.chiudiNM()">Annulla</button>
        <button class="btn btn-ghost" onclick="window.salvaNM(true)">Salva e nuovo</button>
        <button class="btn btn-primary" onclick="window.salvaNM()">Salva</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.querySelectorAll('#nm-tipo-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#nm-tipo-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tipo = btn.dataset.tipo;
      const isTra = tipo === 'trasferimento';
      document.getElementById('nm-dest-wrap').style.display = isTra ? '' : 'none';
      document.getElementById('nm-voce-wrap').style.display = isTra ? 'none' : '';
      document.getElementById('nm-voce').innerHTML = opzioniVoci(tipo);
    });
  });
  ['nm-importo', 'nm-desc'].forEach(id =>
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') window.salvaNM();
    }));
  modal.addEventListener('click', e => { if (e.target === modal) window.chiudiNM(); });

  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));
  setTimeout(() => document.getElementById('nm-importo')?.focus(), 300);
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

  window.azzeraFiltriMov = async () => {
    filtroMov = { q: '', tipo: 'tutti', conto: '', daCat: false };
    await renderMovimenti();
  };

  window.chiudiNM = () => {
    const m = document.getElementById('modal-nm');
    if (m) { m.classList.remove('open'); setTimeout(()=>m.classList.add('hidden'),250); }
  };

    window.salvaNM = async (continua = false) => {
    const tipo    = document.querySelector('#nm-tipo-tabs .tab-btn.active')?.dataset.tipo || 'uscita';
    const importo = parseFloat(document.getElementById('nm-importo').value);
    const data    = document.getElementById('nm-data').value;
    const contoId = parseInt(document.getElementById('nm-conto').value);
    const desc    = document.getElementById('nm-desc').value.trim();
    const isTra   = tipo === 'trasferimento';
    const voceId  = isTra ? null : (parseInt(document.getElementById('nm-voce').value) || null);
    const destId  = isTra ? parseInt(document.getElementById('nm-conto-dest').value) : null;

    if (!importo || importo <= 0 || !data || !contoId) {
      alert('Inserisci data, importo e conto'); return;
    }
    if (isTra && destId === contoId) {
      alert('Scegli due conti diversi'); return;
    }

    // 1) se c'è una voce, il movimento entra anche nel Budget del mese giusto
    let voce = null, movVoceId = null;
    if (voceId) {
      voce = await db.voci_budget.get(voceId);
      const meseRec = await getOrCreateMese(parseInt(data.slice(0, 4)), parseInt(data.slice(5, 7)));
      movVoceId = await db.movimenti_voce.add({
        voce_id: voceId, mese_id: meseRec.id, data, importo: Math.abs(importo),
        modalita: tipo === 'entrata' ? 'bonifico' : 'pos',
        descrizione: desc || voce.nome, note: 'Da movimento bancario'
      });
    }

    // 2) movimento sul conto, collegato al movimento di budget
    await db.movimenti_conto.add({
      conto_id: contoId, data, tipo, importo: Math.abs(importo),
      descrizione: desc, categoria: voce ? voce.nome : null,
      conto_dest_id: destId, categorizzato: voce ? 1 : 0,
      voce_budget_id: movVoceId
    });

    toast('Movimento salvato', 'success');
    if (continua) {
      // Resta aperto: tiene tipo, data e conto, svuota il resto
      document.getElementById('nm-importo').value = '';
      document.getElementById('nm-desc').value = '';
      const sel = document.getElementById('nm-voce');
      if (sel) sel.value = '';
      document.getElementById('nm-importo').focus();
    } else {
      window.chiudiNM();
    }
    await renderMovimenti();
  };

  window.eliminaMovimento = async (id) => {
    if (!confirm('Eliminare questo movimento?')) return;
    const mov = await db.movimenti_conto.get(id);
    // Se è collegato al Budget, rimuove anche il movimento di voce
    if (mov?.voce_budget_id) await db.movimenti_voce.delete(mov.voce_budget_id);
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

  // ── PRIMA TE STESSO: registra versamento ───────────────────────────────────
  window.apriVersamento = async () => {
    const [conti, cats, voci] = await Promise.all([
      db.conti_correnti.where('attivo').equals(1).toArray(),
      db.categorie_budget.toArray(),
      db.voci_budget.where('attiva').equals(1).toArray()
    ]);
    const idCat = cats.filter(c => BUSTE.prima.cat.includes(c.nome)).map(c => c.id);
    const vociPrima = voci.filter(v => idCat.includes(v.categoria_id));
    if (vociPrima.length === 0) {
      alert('Nessuna voce trovata nelle categorie di "Prima te stesso". Controlla i nomi in BUSTE.');
      return;
    }

    // Data proposta: oggi se cade nel mese visualizzato, altrimenti il primo del mese
    const mesePad = String(currentMeseNum).padStart(2, '0');
    const dataDefault = today().startsWith(`${currentAnno}-${mesePad}`)
      ? today() : `${currentAnno}-${mesePad}-01`;

    document.getElementById('modal-versamento')?.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-versamento';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Registra versamento</h2>
          <button class="modal-close" onclick="window.chiudiVersamento()">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <div class="label">Data *</div>
            <input type="date" id="vp-data" value="${dataDefault}">
          </div>
          <div class="form-group">
            <div class="label">Importo (€) *</div>
            <input type="number" id="vp-importo" placeholder="0.00" step="0.01" inputmode="decimal">
          </div>
        </div>
        <div class="form-group">
          <div class="label">Destinazione *</div>
          <select id="vp-voce">
            ${vociPrima.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <div class="label">Conto di addebito</div>
          <select id="vp-conto">
            <option value="">— nessuno: solo budget —</option>
            ${conti.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <div class="label">Nota</div>
          <input type="text" id="vp-nota" placeholder="es. PAC mensile Trade Republic">
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" onclick="window.chiudiVersamento()">Annulla</button>
          <button class="btn btn-primary" onclick="window.salvaVersamento()">Salva</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) window.chiudiVersamento(); });
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('open'));
    lucide.createIcons();
  };

  window.chiudiVersamento = () => {
    const m = document.getElementById('modal-versamento');
    if (!m) return;
    m.classList.remove('open');
    setTimeout(() => m.remove(), 250);
  };

  window.salvaVersamento = async () => {
    const importo = parseFloat(document.getElementById('vp-importo').value);
    const data    = document.getElementById('vp-data').value;
    const voceId  = parseInt(document.getElementById('vp-voce').value);
    const contoId = parseInt(document.getElementById('vp-conto').value) || null;
    const nota    = document.getElementById('vp-nota').value.trim();
    if (!importo || importo <= 0 || !data || !voceId) {
      alert('Inserisci data, importo e destinazione');
      return;
    }

    const voce    = await db.voci_budget.get(voceId);
    const meseRec = await getOrCreateMese(parseInt(data.slice(0, 4)), parseInt(data.slice(5, 7)));

    // 1) movimento sulla voce di budget (alimenta la colonna Reale)
    const movVoceId = await db.movimenti_voce.add({
      voce_id: voceId, mese_id: meseRec.id, data, importo,
      modalita: 'bonifico', descrizione: nota || voce.nome,
      note: 'Prima te stesso'
    });

    // 2) uscita sul conto, collegata al movimento di budget
    if (contoId) {
      await db.movimenti_conto.add({
        conto_id: contoId, data, tipo: 'uscita', importo,
        descrizione: nota || voce.nome, categoria: voce.nome,
        conto_dest_id: null, categorizzato: 1,
        voce_budget_id: movVoceId
      });
    }

    window.chiudiVersamento();
    toast('Versamento registrato ✓', 'success');
    await renderPiano();
  };

  window.eliminaVersamento = async (movVoceId) => {
    if (!confirm('Eliminare questo versamento? Verrà rimosso anche dal conto collegato.')) return;
    await db.movimenti_conto.filter(m => m.voce_budget_id === movVoceId).delete();
    await db.movimenti_voce.delete(movVoceId);
    toast('Versamento eliminato');
    await renderPiano();
  };
}
