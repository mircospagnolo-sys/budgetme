/* BudgetMe — pac.js (Portafoglio Investimenti) */
import db from '../db.js';
import { formatEur, formatDate, today, toast } from '../utils.js';

let editingPfId   = null;
let editingStrId  = null;
let editingBeneId = null;
let aggStrId      = null;

const TIPO_LABEL = {
  etf_azionario:      'ETF Az.',
  etf_obbligazionario:'ETF Obbl.',
  azione:             'Azione',
  obbligazione:       'Obbl.',
  fondo:              'Fondo',
  materia_prima:      'Mat. Prima',
  crypto:             'Crypto',
  altro_bene:         'Altro'
};

const TIPO_COLORE = {
  etf_azionario:      '#2a78d6',
  etf_obbligazionario:'#1baf7a',
  azione:             '#7c3d9e',
  obbligazione:       '#d4720f',
  fondo:              '#444441',
  materia_prima:      '#b8860b',
  crypto:             '#e34948',
  altro_bene:         '#5F5E5A'
};

const CAT_BENE_LABEL = {
  oro_fisico:    '🥇 Oro fisico',
  argento_fisico:'🥈 Argento',
  crypto:        '₿ Crypto',
  orologio:      '⌚ Orologio',
  arte:          '🎨 Arte',
  immobile:      '🏠 Immobile',
  altro:         '📦 Altro'
};

// Dati default da precaricare
const DEFAULT_DATA = {
  portafogli: [
    { nome: 'Trade Republic', broker: 'Trade Republic', tipo: 'broker', note: 'PAC mensile ETF', attivo: 1 }
  ],
  strumenti: [
    {
      pf_index: 0,
      nome: 'UBS Core MSCI World UCITS ETF USD Acc',
      ticker: 'UETW', isin: 'IE00BD4TXV59',
      tipo_asset: 'etf_azionario', strategia: 'pac', modalita: 'accumulo',
      valuta: 'EUR', note: 'World developed markets',
      quantita: 110.376808, prezzo_attuale: 39.12,
      valore_attuale: 4317.94, capitale_investito: 3780.41,
      acquisto_medio: 34.25
    },
    {
      pf_index: 0,
      nome: 'iShares Core MSCI Emerging Markets IMI UCITS ETF (Acc)',
      ticker: 'IS3N', isin: 'IE00B4KM4GZ66',
      tipo_asset: 'etf_azionario', strategia: 'pac', modalita: 'accumulo',
      valuta: 'EUR', note: 'Emerging markets',
      quantita: 49.883695, prezzo_attuale: 48.19,
      valore_attuale: 2403.90, capitale_investito: 1760.89,
      acquisto_medio: 35.30
    }
  ],
  beni: [
    {
      nome: 'Lingottino oro Umicore 2.5g', categoria: 'oro_fisico',
      costo_acquisto: 167.00, valore_attuale: 292.78,
      quantita: 2.5, unita: 'g',
      data_acquisto: '', note: 'Umicore',
      attivo: 1
    },
    {
      nome: 'Oro fisico (regali)', categoria: 'oro_fisico',
      costo_acquisto: 0, valore_attuale: 2693.53,
      quantita: 23, unita: 'g',
      data_acquisto: '', note: 'Ricevuto come regalo',
      attivo: 1
    }
  ]
};

let currentPacTab = 'portafoglio';

// ── INIT ─────────────────────────────────────────────────────────────────────
export async function init() {
  window.closePacModal      = closePacModal;
  window.editPortafoglio    = editPortafoglio;
  window.deletePortafoglio  = deletePortafoglio;
  window.addStrumento       = addStrumento;
  window.editStrumento      = editStrumento;
  window.deleteStrumento    = deleteStrumento;
  window.aggiornaValori     = aggiornaValori;
  window.addBene            = addBene;
  window.editBene           = editBene;
  window.deleteBene         = deleteBene;

  const count = await db.portafogli.count();
  if (count === 0) await loadDefaults();

  setupPacTabs();
  await render();
}

function setupPacTabs() {
  document.querySelectorAll('#pac-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#pac-tabs .tab-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPacTab = btn.dataset.tab;
      await render();
    });
  });
}

async function loadDefaults() {
  const pfIds = [];
  for (const pf of DEFAULT_DATA.portafogli) {
    const id = await db.portafogli.add(pf);
    pfIds.push(id);
  }
  for (const str of DEFAULT_DATA.strumenti) {
    const { pf_index, ...strData } = str;
    await db.strumenti_portafoglio.add({
      ...strData, portafoglio_id: pfIds[pf_index], attivo: 1
    });
  }
  for (const bene of DEFAULT_DATA.beni) {
    await db.beni_reali.add(bene);
  }
}

// ── RENDER ───────────────────────────────────────────────────────────────────
async function render() {
  if (currentPacTab === 'beni') { await renderBeni(); return; }
  await renderPortafoglio();
}

async function renderPortafoglio() {
  const root = document.getElementById('pac-root');
  const [portafogli, strumenti, beni] = await Promise.all([
    db.portafogli.toArray(),
    db.strumenti_portafoglio.where('attivo').equals(1).toArray(),
    db.beni_reali.where('attivo').equals(1).toArray()
  ]);

  // Calcola totali globali
  const totInvestito = strumenti.reduce((s, st) => s + (st.capitale_investito || 0), 0);
  const totAttuale   = strumenti.reduce((s, st) => s + (st.valore_attuale || 0), 0);
  const totBeni      = beni.reduce((s, b) => s + (b.valore_attuale || 0), 0);
  const totCostoBeni = beni.reduce((s, b) => s + (b.costo_acquisto || 0), 0);
  const guadagno     = totAttuale - totInvestito;
  const perf         = totInvestito > 0 ? (guadagno / totInvestito) * 100 : 0;

  let html = `
    <!-- Riepilogo -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">PATRIMONIO INVESTIMENTI</div>
      <div class="card-value" style="color:var(--blue)">${formatEur(totAttuale + totBeni)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        <div style="background:var(--bg);border-radius:8px;padding:8px 10px">
          <div style="font-size:0.7rem;color:var(--text-muted)">Strumenti finanziari</div>
          <div style="font-size:0.95rem;font-weight:700;color:var(--blue)">${formatEur(totAttuale)}</div>
          <div style="font-size:0.72rem;color:${guadagno >= 0 ? 'var(--green)' : 'var(--red)'}">
            ${guadagno >= 0 ? '+' : ''}${formatEur(guadagno)} (${perf.toFixed(2)}%)
          </div>
        </div>
        <div style="background:var(--bg);border-radius:8px;padding:8px 10px">
          <div style="font-size:0.7rem;color:var(--text-muted)">Beni reali</div>
          <div style="font-size:0.95rem;font-weight:700;color:var(--orange)">${formatEur(totBeni)}</div>
          <div style="font-size:0.72rem;color:${(totBeni-totCostoBeni) >= 0 ? 'var(--green)' : 'var(--red)'}">
            Plus latente: ${(totBeni-totCostoBeni) >= 0 ? '+' : ''}${formatEur(totBeni-totCostoBeni)}
          </div>
        </div>
      </div>
    </div>

    <!-- Azioni strumenti finanziari -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="window._nuovoPortafoglio()">
        + Portafoglio
      </button>
    </div>`;

  // ── Portafogli e strumenti ──
  for (const pf of portafogli) {
    const strPf = strumenti.filter(s => s.portafoglio_id === pf.id);
    const pfInvestito = strPf.reduce((s, st) => s + (st.capitale_investito || 0), 0);
    const pfAttuale   = strPf.reduce((s, st) => s + (st.valore_attuale || 0), 0);
    const pfGuadagno  = pfAttuale - pfInvestito;
    const pfPerf      = pfInvestito > 0 ? (pfGuadagno / pfInvestito) * 100 : 0;

    html += `
    <div class="pf-card">
      <div class="pf-header">
        <div>
          <div class="pf-header-nome">${pf.nome}</div>
          <div class="pf-header-broker">${pf.broker || ''} · ${pf.tipo || ''}</div>
        </div>
        <div class="pf-header-totale">
          <div class="pf-header-val">${formatEur(pfAttuale)}</div>
          <div class="pf-header-perf" style="color:${pfGuadagno >= 0 ? '#90EE90' : '#FFB6C1'}">
            ${pfGuadagno >= 0 ? '+' : ''}${formatEur(pfGuadagno)} (${pfPerf.toFixed(2)}%)
          </div>
          <div style="display:flex;gap:4px;margin-top:6px;justify-content:flex-end">
            <button onclick="editPortafoglio(${pf.id})"
              style="font-size:12px;padding:2px 8px;border-radius:10px;
                     background:rgba(255,255,255,0.2);color:white;cursor:pointer;border:none">
              ✏️ Modifica
            </button>
            <button onclick="addStrumento(${pf.id})"
              style="font-size:12px;padding:2px 8px;border-radius:10px;
                     background:rgba(255,255,255,0.2);color:white;cursor:pointer;border:none">
              + Strumento
            </button>
            <button onclick="deletePortafoglio(${pf.id})"
              style="font-size:12px;padding:2px 8px;border-radius:10px;
                     background:rgba(255,100,100,0.3);color:white;cursor:pointer;border:none">
              🗑️
            </button>
          </div>
        </div>
      </div>`;

    if (strPf.length === 0) {
      html += `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem">
        Nessuno strumento. Aggiungi il primo.
      </div>`;
    }

    for (const st of strPf) {
      const guad  = (st.valore_attuale || 0) - (st.capitale_investito || 0);
      const perf  = st.capitale_investito > 0 ? (guad / st.capitale_investito) * 100 : 0;
      const peso  = pfAttuale > 0 ? (st.valore_attuale / pfAttuale * 100).toFixed(1) : '0.0';
      const colore = TIPO_COLORE[st.tipo_asset] || '#888';

      html += `
      <div class="str-row">
        <div>
          <div class="str-nome">${st.nome}</div>
          <div class="str-meta">
            ${st.ticker ? `<strong>${st.ticker}</strong> · ` : ''}
            ${st.isin || ''}
          </div>
          <div class="str-badges">
            <span class="tipo-badge" style="background:${colore}22;color:${colore}">
              ${TIPO_LABEL[st.tipo_asset] || st.tipo_asset}
            </span>
            ${st.strategia !== 'na' ? `<span class="tipo-badge badge-blue">${st.strategia?.toUpperCase()}</span>` : ''}
            ${st.modalita !== 'na' ? `<span class="tipo-badge badge-gray">${st.modalita}</span>` : ''}
          </div>
          ${st.quantita ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px">
            ${st.quantita.toFixed(6)} quote · PMC ${formatEur(st.acquisto_medio || 0)}
          </div>` : ''}
          <div class="str-actions">
            <button onclick="aggiornaValori(${st.id})" style="color:var(--blue)">📊 Aggiorna</button>
            <button onclick="editStrumento(${st.id})">✏️ Modifica</button>
            <button onclick="deleteStrumento(${st.id})" style="color:var(--red)">🗑️</button>
          </div>
        </div>
        <div>
          <div class="str-val">${formatEur(st.valore_attuale || 0)}</div>
          <div class="str-perf" style="color:${guad >= 0 ? 'var(--green)' : 'var(--red)'}">
            ${guad >= 0 ? '+' : ''}${formatEur(guad)}<br>
            ${perf >= 0 ? '+' : ''}${perf.toFixed(2)}%
          </div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-align:right;margin-top:2px">
            ${peso}% del portafoglio
          </div>
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  root.innerHTML = html;
  setupModals();
  lucide.createIcons();
}

// ── RENDER BENI REALI ─────────────────────────────────────────────────────────
async function renderBeni() {
  const root = document.getElementById('pac-root');
  const beni = await db.beni_reali.toArray();
  const attivi = beni.filter(b => b.attivo === 1 || b.attivo === true);

  const totAcquisto = attivi.reduce((s, b) => s + (b.costo_acquisto || 0), 0);
  const totAttuale  = attivi.reduce((s, b) => s + (b.valore_attuale || 0), 0);
  const plusTot     = totAttuale - totAcquisto;

  let html = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">TOTALE BENI REALI</div>
      <div class="card-value" style="color:var(--orange)">${formatEur(totAttuale)}</div>
      <div style="font-size:0.82rem;margin-top:6px">
        Costo storico: ${formatEur(totAcquisto)} →
        <span style="color:${plusTot >= 0 ? 'var(--green)' : 'var(--red)'}">
          Plus latente: ${plusTot >= 0 ? '+' : ''}${formatEur(plusTot)}
        </span>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" onclick="addBene()">+ Aggiungi bene</button>
    </div>`;

  if (attivi.length === 0) {
    html += '<div class="empty-state"><p>Nessun bene reale registrato.</p></div>';
  } else {
    const gruppi = {};
    attivi.forEach(b => {
      if (!gruppi[b.categoria]) gruppi[b.categoria] = [];
      gruppi[b.categoria].push(b);
    });

    for (const [cat, items] of Object.entries(gruppi)) {
      const totCat    = items.reduce((s, b) => s + (b.valore_attuale || 0), 0);
      const costoCat  = items.reduce((s, b) => s + (b.costo_acquisto || 0), 0);
      const plusCat   = totCat - costoCat;
      html += `
      <div class="pf-card">
        <div style="padding:10px 16px;background:var(--orange);color:white;
             display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">${CAT_BENE_LABEL[cat] || cat}</span>
          <div style="text-align:right">
            <div style="font-weight:700">${formatEur(totCat)}</div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.8)">
              ${plusCat >= 0 ? '+' : ''}${formatEur(plusCat)}
            </div>
          </div>
        </div>`;

      for (const b of items) {
        const plus = (b.valore_attuale || 0) - (b.costo_acquisto || 0);
        html += `
        <div class="bene-row">
          <div>
            <div style="font-size:0.88rem;font-weight:500">${b.nome}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">
              ${b.quantita ? `${b.quantita} ${b.unita || ''}` : ''}
              ${b.note ? ` · ${b.note}` : ''}
            </div>
            ${b.costo_acquisto > 0 ? `<div style="font-size:0.72rem;color:var(--text-muted)">
              Costo: ${formatEur(b.costo_acquisto)}
            </div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:0.95rem;font-weight:700">${formatEur(b.valore_attuale || 0)}</div>
            <div style="font-size:0.75rem;color:${plus >= 0 ? 'var(--green)' : 'var(--red)'}">
              ${plus >= 0 ? '+' : ''}${formatEur(plus)}
            </div>
            <div style="display:flex;gap:4px;margin-top:4px;justify-content:flex-end">
              <button onclick="editBene(${b.id})"
                style="font-size:0.7rem;color:var(--text-muted);cursor:pointer">✏️ Modifica</button>
              <button onclick="deleteBene(${b.id})"
                style="font-size:0.7rem;color:var(--red);cursor:pointer">🗑️</button>
            </div>
          </div>
        </div>`;
      }
      html += `</div>`;
    }
  }

  root.innerHTML = html;
  setupModals();
  lucide.createIcons();
}

// ── SETUP MODALS ─────────────────────────────────────────────────────────────
function setupModals() {
  document.getElementById('btn-save-portafoglio')?.addEventListener('click', savePortafoglio);
  document.getElementById('btn-save-strumento')?.addEventListener('click', saveStrumento);
  document.getElementById('btn-save-aggiorna')?.addEventListener('click', saveAggiorna);
  document.getElementById('btn-save-bene')?.addEventListener('click', saveBene);

  // Preview calcolo in aggiorna valori
  ['agg-quantita','agg-prezzo','agg-investito'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateAggPreview);
  });

  // Chiudi cliccando overlay
  ['modal-portafoglio','modal-strumento','modal-aggiorna','modal-bene'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(e) {
      if (e.target === this) closePacModal(id);
    });
  });
}

function updateAggPreview() {
  const q = parseFloat(document.getElementById('agg-quantita').value) || 0;
  const p = parseFloat(document.getElementById('agg-prezzo').value)   || 0;
  const i = parseFloat(document.getElementById('agg-investito').value)|| 0;
  if (q > 0 && p > 0) {
    const val  = q * p;
    const guad = val - i;
    const perf = i > 0 ? (guad / i) * 100 : 0;
    document.getElementById('agg-preview').style.display = '';
    document.getElementById('agg-val-attuale').textContent = formatEur(val);
    document.getElementById('agg-guadagno').textContent =
      `${guad >= 0 ? '+' : ''}${formatEur(guad)}`;
    document.getElementById('agg-guadagno').style.color =
      guad >= 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('agg-perf').textContent =
      `${perf >= 0 ? '+' : ''}${perf.toFixed(2)}%`;
    document.getElementById('agg-perf').style.color =
      perf >= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    document.getElementById('agg-preview').style.display = 'none';
  }
}

// ── PORTAFOGLIO ───────────────────────────────────────────────────────────────
window._nuovoPortafoglio = () => {
  editingPfId = null;
  document.getElementById('pf-nome').value   = '';
  document.getElementById('pf-broker').value = '';
  document.getElementById('pf-tipo').value   = 'broker';
  document.getElementById('pf-note').value   = '';
  openPacModal('modal-portafoglio');
};

async function editPortafoglio(id) {
  editingPfId = id;
  const pf = await db.portafogli.get(id);
  if (!pf) return;
  document.getElementById('pf-nome').value   = pf.nome;
  document.getElementById('pf-broker').value = pf.broker || '';
  document.getElementById('pf-tipo').value   = pf.tipo || 'broker';
  document.getElementById('pf-note').value   = pf.note || '';
  openPacModal('modal-portafoglio');
}

async function savePortafoglio() {
  const nome = document.getElementById('pf-nome').value.trim();
  if (!nome) { alert('Inserisci il nome del portafoglio'); return; }
  const data = {
    nome, broker: document.getElementById('pf-broker').value.trim(),
    tipo: document.getElementById('pf-tipo').value,
    note: document.getElementById('pf-note').value.trim(), attivo: 1
  };
  if (editingPfId) await db.portafogli.update(editingPfId, data);
  else await db.portafogli.add(data);
  closePacModal('modal-portafoglio');
  toast('Portafoglio salvato', 'success');
  await render();
}

async function deletePortafoglio(id) {
  if (!confirm('Eliminare questo portafoglio e tutti gli strumenti associati?')) return;
  const strumenti = await db.strumenti_portafoglio.where('portafoglio_id').equals(id).toArray();
  for (const s of strumenti) {
    await db.movimenti_portafoglio.where('strumento_id').equals(s.id).delete();
  }
  await db.strumenti_portafoglio.where('portafoglio_id').equals(id).delete();
  await db.portafogli.delete(id);
  toast('Portafoglio eliminato');
  await render();
}

// ── STRUMENTO ─────────────────────────────────────────────────────────────────
async function populatePfSelect(selectedId = null) {
  const pfs = await db.portafogli.toArray();
  const sel = document.getElementById('str-portafoglio-id');
  sel.innerHTML = pfs.map(p =>
    `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.nome}</option>`
  ).join('');
}

async function addStrumento(pfId) {
  editingStrId = null;
  ['str-nome','str-ticker','str-isin','str-note'].forEach(id =>
    document.getElementById(id).value = '');
  document.getElementById('str-tipo').value     = 'etf_azionario';
  document.getElementById('str-strategia').value= 'pac';
  document.getElementById('str-modalita').value = 'accumulo';
  document.getElementById('str-valuta').value   = 'EUR';
  await populatePfSelect(pfId);
  openPacModal('modal-strumento');
}

async function editStrumento(id) {
  editingStrId = id;
  const st = await db.strumenti_portafoglio.get(id);
  if (!st) return;
  document.getElementById('str-nome').value     = st.nome;
  document.getElementById('str-ticker').value   = st.ticker || '';
  document.getElementById('str-isin').value     = st.isin || '';
  document.getElementById('str-tipo').value     = st.tipo_asset || 'etf_azionario';
  document.getElementById('str-strategia').value= st.strategia || 'pac';
  document.getElementById('str-modalita').value = st.modalita || 'accumulo';
  document.getElementById('str-valuta').value   = st.valuta || 'EUR';
  document.getElementById('str-note').value     = st.note || '';
  await populatePfSelect(st.portafoglio_id);
  openPacModal('modal-strumento');
}

async function saveStrumento() {
  const nome = document.getElementById('str-nome').value.trim();
  if (!nome) { alert('Inserisci il nome dello strumento'); return; }
  const pfId = parseInt(document.getElementById('str-portafoglio-id').value);
  const data = {
    portafoglio_id: pfId, nome,
    ticker:   document.getElementById('str-ticker').value.trim().toUpperCase(),
    isin:     document.getElementById('str-isin').value.trim().toUpperCase(),
    tipo_asset:  document.getElementById('str-tipo').value,
    strategia:   document.getElementById('str-strategia').value,
    modalita:    document.getElementById('str-modalita').value,
    valuta:      document.getElementById('str-valuta').value.trim() || 'EUR',
    note:        document.getElementById('str-note').value.trim(),
    attivo: 1
  };
  if (editingStrId) await db.strumenti_portafoglio.update(editingStrId, data);
  else await db.strumenti_portafoglio.add({ ...data, valore_attuale: 0, capitale_investito: 0 });
  closePacModal('modal-strumento');
  toast('Strumento salvato', 'success');
  await render();
}

async function deleteStrumento(id) {
  if (!confirm('Eliminare questo strumento?')) return;
  await db.movimenti_portafoglio.where('strumento_id').equals(id).delete();
  await db.strumenti_portafoglio.delete(id);
  toast('Strumento eliminato');
  await render();
}

// ── AGGIORNA VALORI ───────────────────────────────────────────────────────────
async function aggiornaValori(id) {
  aggStrId = id;
  const st = await db.strumenti_portafoglio.get(id);
  if (!st) return;
  document.getElementById('modal-agg-title').textContent = `Aggiorna — ${st.ticker || st.nome}`;
  document.getElementById('agg-quantita').value = st.quantita || '';
  document.getElementById('agg-prezzo').value   = st.prezzo_attuale || '';
  document.getElementById('agg-investito').value= st.capitale_investito || '';
  document.getElementById('agg-preview').style.display = 'none';
  openPacModal('modal-aggiorna');
  updateAggPreview();
}

async function saveAggiorna() {
  const q = parseFloat(document.getElementById('agg-quantita').value) || 0;
  const p = parseFloat(document.getElementById('agg-prezzo').value)   || 0;
  const i = parseFloat(document.getElementById('agg-investito').value)|| 0;
  const valoreAttuale = q * p;
  const acquistatoMedio = q > 0 ? i / q : 0;
  await db.strumenti_portafoglio.update(aggStrId, {
    quantita: q, prezzo_attuale: p,
    valore_attuale: valoreAttuale,
    capitale_investito: i,
    acquisto_medio: acquistatoMedio,
    ultimo_aggiornamento: today()
  });
  closePacModal('modal-aggiorna');
  toast('Valori aggiornati', 'success');
  await render();
}

// ── BENI REALI ────────────────────────────────────────────────────────────────
async function addBene() {
  editingBeneId = null;
  ['bene-nome','bene-note','bene-unita'].forEach(id => document.getElementById(id).value = '');
  ['bene-acquisto','bene-attuale','bene-quantita'].forEach(id =>
    document.getElementById(id).value = '');
  document.getElementById('bene-categoria').value = 'oro_fisico';
  document.getElementById('bene-data').value = '';
  openPacModal('modal-bene');
}

async function editBene(id) {
  editingBeneId = id;
  const b = await db.beni_reali.get(id);
  if (!b) return;
  document.getElementById('bene-nome').value      = b.nome;
  document.getElementById('bene-categoria').value = b.categoria || 'altro';
  document.getElementById('bene-acquisto').value  = b.costo_acquisto || '';
  document.getElementById('bene-attuale').value   = b.valore_attuale || '';
  document.getElementById('bene-quantita').value  = b.quantita || '';
  document.getElementById('bene-unita').value     = b.unita || '';
  document.getElementById('bene-data').value      = b.data_acquisto || '';
  document.getElementById('bene-note').value      = b.note || '';
  openPacModal('modal-bene');
}

async function saveBene() {
  const nome = document.getElementById('bene-nome').value.trim();
  if (!nome) { alert('Inserisci la descrizione del bene'); return; }
  const data = {
    nome, categoria: document.getElementById('bene-categoria').value,
    costo_acquisto: parseFloat(document.getElementById('bene-acquisto').value) || 0,
    valore_attuale: parseFloat(document.getElementById('bene-attuale').value)  || 0,
    quantita:       parseFloat(document.getElementById('bene-quantita').value) || 0,
    unita:          document.getElementById('bene-unita').value.trim(),
    data_acquisto:  document.getElementById('bene-data').value,
    note:           document.getElementById('bene-note').value.trim(),
    attivo: 1
  };
  if (editingBeneId) await db.beni_reali.update(editingBeneId, data);
  else await db.beni_reali.add(data);
  closePacModal('modal-bene');
  toast('Bene salvato', 'success');
  await render();
}

async function deleteBene(id) {
  if (!confirm('Eliminare questo bene?')) return;
  await db.beni_reali.delete(id);
  toast('Bene eliminato');
  await render();
}

// ── HELPERS MODAL ─────────────────────────────────────────────────────────────
function openPacModal(id) {
  const o = document.getElementById(id);
  if (!o) return;
  o.classList.remove('hidden');
  requestAnimationFrame(() => o.classList.add('open'));
  lucide.createIcons();
}

function closePacModal(id) {
  const o = document.getElementById(id);
  if (!o) return;
  o.classList.remove('open');
  setTimeout(() => o.classList.add('hidden'), 250);
}
