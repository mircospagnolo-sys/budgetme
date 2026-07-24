/* BudgetMe — depositi.js */
import db from '../db.js';
import { formatEur, formatDate, daysUntil, ritenuta, nettoRitenuta, today, toast } from '../utils.js';

let editingDepId   = null;
let editingVincId  = null;
let currentCedVincId = null;
let currentCedDepId  = null;

// Dati default da precaricare al primo avvio
const DEFAULT_DEPOSITI = [
  {
    nome: 'CA Bank Deposito', banca: 'CA Bank', somma_libera: 10.33, stato: 'aperto',
    note: '', importo: 11000,
    vincoli: [
      { numero: '2026001', decorrenza: '2026-03-09', scadenza: '2026-09-09', tasso: 2.50, importo: 1900,  interessi_netti: 17.72, svincolabile: 1 },
      { numero: '2026002', decorrenza: '2026-03-10', scadenza: '2026-09-10', tasso: 2.50, importo: 3000,  interessi_netti: 27.98, svincolabile: 1 },
      { numero: '2026003', decorrenza: '2026-06-10', scadenza: '2026-12-10', tasso: 2.55, importo: 2100,  interessi_netti: 19.87, svincolabile: 0 },
      { numero: '2026004', decorrenza: '2026-06-10', scadenza: '2026-12-10', tasso: 2.55, importo: 2000,  interessi_netti: 18.92, svincolabile: 0 },
      { numero: '2026005', decorrenza: '2026-06-10', scadenza: '2026-12-10', tasso: 2.55, importo: 1000,  interessi_netti: 9.46,  svincolabile: 0 },
      { numero: '2026006', decorrenza: '2026-06-10', scadenza: '2026-12-10', tasso: 2.00, importo: 1000,  interessi_netti: 7.42,  svincolabile: 1 },
    ]
  },
  {
    nome: 'IFIS Rendimax', banca: 'Banca IFIS', somma_libera: 18.72, stato: 'aperto',
    note: '', importo: 8725,
    vincoli: [
      { numero: '2023002', decorrenza: '2023-10-06', scadenza: '2026-10-06', tasso: 3.55, importo: 3425,  interessi_netti: 270.17, svincolabile: 0 },
      { numero: '2023001', decorrenza: '2023-09-13', scadenza: '2027-09-13', tasso: 3.60, importo: 4000,  interessi_netti: 426.53, svincolabile: 0 },
      { numero: '2025001', decorrenza: '2025-12-03', scadenza: '2027-12-03', tasso: 3.00, importo: 1300,  interessi_netti: 57.72,  svincolabile: 0 },
    ]
  },
  {
    nome: 'Cherry Bank', banca: 'Cherry Bank', somma_libera: 53.53, stato: 'aperto',
    note: 'Ultima cedola 3/10/2026', importo: 3000,
    vincoli: [
      { numero: 'CHERRY-01', decorrenza: '2025-10-03', scadenza: '2026-10-03', tasso: 0, importo: 3000, interessi_netti: 30.24, svincolabile: 0 },
    ],
    cedole: [
      { data_incasso: '2026-10-03', importo_lordo: 40.86, importo_netto: 30.24, incassata: 0, destinazione: 'PAC ETF Trade Republic', note: 'Ultima e finale cedola Cherry Bank' }
    ]
  }
];

// ── INIT ─────────────────────────────────────────────────────────────────────
export async function init() {
  window.closeDepModal   = closeDepModal;
  window.editDeposito    = editDeposito;
  window.deleteDeposito  = deleteDeposito;
  window.addVincolo      = addVincolo;
  window.editVincolo     = editVincolo;
  window.deleteVincolo   = deleteVincolo;
  window.addCedola       = addCedola;
  window.openSimulatore  = openSimulatore;

  const count = await db.conti_deposito.count();
  if (count === 0) await loadDefaults();

  await render();
}

async function loadDefaults() {
  for (const dep of DEFAULT_DEPOSITI) {
    const { vincoli, cedole, ...depData } = dep;
    const depId = await db.conti_deposito.add(depData);
    for (const v of (vincoli || [])) {
      const vincId = await db.vincoli_deposito.add({
        deposito_id: depId, numero: v.numero,
        data_decorrenza: v.decorrenza, data_scadenza: v.scadenza,
        tasso_lordo: v.tasso, importo: v.importo,
        interessi_netti: v.interessi_netti,
        svincolabile: v.svincolabile, stato: 'attivo'
      });
      for (const c of (cedole || [])) {
        await db.cedole_deposito.add({ ...c, deposito_id: depId, vincolo_id: vincId });
      }
    }
  }
}

// ── RENDER ───────────────────────────────────────────────────────────────────
async function render() {
  const root = document.getElementById('depositi-root');
  const depositi = await db.conti_deposito.toArray();

  if (depositi.length === 0) {
    root.innerHTML = `
      <div class="empty-state">
        <p>Nessun conto deposito.<br>Aggiungi il tuo primo conto deposito.</p>
      </div>
      <button class="btn btn-primary btn-full mt-16" onclick="window._nuovoDeposito()">
        + Aggiungi conto deposito
      </button>`;
    setupModalDeposito();
    return;
  }

  // Calcola totali
  let totaleCapitale = 0, totaleInteressi = 0, totaleLiquido = 0;
  const depositiConDati = await Promise.all(depositi.map(async dep => {
    const vincoli = await db.vincoli_deposito.where('deposito_id').equals(dep.id).toArray();
    const cedole  = await db.cedole_deposito.where('deposito_id').equals(dep.id).toArray();
    const capitaleVincoli = vincoli.reduce((s, v) => s + (v.importo || 0), 0);
    const interessiAttesi = vincoli.reduce((s, v) => s + (v.interessi_netti || 0), 0);
    totaleCapitale  += capitaleVincoli;
    totaleInteressi += interessiAttesi;
    totaleLiquido   += (dep.somma_libera || 0);
    return { ...dep, vincoli, cedole, capitaleVincoli, interessiAttesi };
  }));

  let html = `
    <!-- Sommario -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">TOTALE DEPOSITI</div>
      <div class="card-value" style="color:var(--blue)">${formatEur(totaleCapitale)}</div>
      <div style="display:flex;gap:16px;margin-top:8px;font-size:0.8rem">
        <span style="color:var(--green)">Interessi attesi: ${formatEur(totaleInteressi)}</span>
        <span style="color:var(--text-muted)">Liquidità libera: ${formatEur(totaleLiquido)}</span>
      </div>
    </div>

    <!-- Azioni -->
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-primary btn-sm" onclick="window._nuovoDeposito()">
        + Conto deposito
      </button>
      <button class="btn btn-ghost btn-sm" onclick="openSimulatore()">
        📊 Simulatore
      </button>
    </div>`;

  // Card per ogni conto deposito
  for (const dep of depositiConDati) {
    const cedolePendenti = dep.cedole.filter(c => !c.incassata);
    html += `
    <div class="dep-card">
      <div class="dep-card-header">
        <div class="dep-card-left">
          <div class="dep-nome">${dep.nome}</div>
          <div class="dep-banca">${dep.banca}</div>
          ${dep.note ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${dep.note}</div>` : ''}
          ${cedolePendenti.length > 0 ? `
            <div style="margin-top:6px">
              ${cedolePendenti.map(c => `
                <span class="badge badge-orange">
                  🔔 Cedola ${formatEur(c.importo_netto)} il ${formatDate(c.data_incasso)}
                </span>`).join('')}
            </div>` : ''}
        </div>
        <div class="dep-card-right">
          <div class="dep-totale">${formatEur(dep.capitaleVincoli)}</div>
          <div class="dep-libera">+ ${formatEur(dep.somma_libera)} liberi</div>
          <div style="font-size:0.75rem;color:var(--green);margin-top:2px">
            Int. netti: ${formatEur(dep.interessiAttesi)}
          </div>
          <div class="dep-actions">
            <button onclick="editDeposito(${dep.id})">✏️ Modifica</button>
            <button onclick="addCedola(${dep.id})" style="color:var(--green)">+ Cedola</button>
            <button onclick="deleteDeposito(${dep.id})" style="color:var(--red)">🗑️</button>
          </div>
        </div>
      </div>

      <!-- Vincoli -->
      ${dep.vincoli.map(v => {
        const giorni = daysUntil(v.data_scadenza);
        const scaduto = giorni !== null && giorni < 0;
        const urgente = giorni !== null && giorni >= 0 && giorni <= 30;
        return `
        <div class="vincolo-row">
          <div>
            <div>
              <span class="vinc-numero">${v.numero}</span>
              <span class="vinc-badge ${v.svincolabile ? 'badge-green' : 'badge-red'}">
                ${v.svincolabile ? 'svincolabile' : 'vincolato'}
              </span>
              <span class="vinc-badge ${v.stato === 'scaduto' ? 'badge-red' : 'badge-green'}">
                ${v.stato === 'scaduto' ? 'scaduto' : 'attivo'}
              </span>
              <span class="vinc-badge badge-blue">
                ${v.tipo_erogazione === 'anticipata' ? 'liq. anticipata' : 'liq. a scadenza'}
              </span>
            </div>
            <div class="vinc-info">${formatEur(v.importo)} al ${v.tasso_lordo}% lordo</div>
            <div class="vinc-scad">
              Scade: ${formatDate(v.data_scadenza)}
              ${scaduto ? '<span style="color:var(--red);font-weight:600"> — SCADUTO</span>' :
                urgente ? `<span style="color:var(--orange);font-weight:600"> — ${giorni} giorni</span>` :
                giorni !== null ? `<span style="color:var(--text-muted)"> — ${giorni} gg</span>` : ''}
            </div>
          </div>
          <div>
            <div class="vinc-importo">${formatEur(v.importo)}</div>
            <div class="vinc-interessi">+${formatEur(v.interessi_netti)} netti</div>
            <div style="display:flex;gap:4px;margin-top:4px;justify-content:flex-end">
              <button onclick="editVincolo(${v.id})"
                style="font-size:0.7rem;color:var(--text-muted);cursor:pointer">✏️</button>
              <button onclick="deleteVincolo(${v.id})"
                style="font-size:0.7rem;color:var(--red);cursor:pointer">🗑️</button>
            </div>
          </div>
        </div>`
      }).join('')}

      <!-- Cedole registrate -->
      ${dep.cedole.length > 0 ? `
      <div style="padding:8px 16px;border-top:1px solid var(--border);
           background:var(--bg);font-size:0.78rem;font-weight:600;
           color:var(--text-muted)">CEDOLE REGISTRATE</div>
      ${dep.cedole.map(c => `
        <div class="vincolo-row" style="background:${c.incassata ? 'transparent' : 'var(--orange-light)'}">
          <div>
            <div style="font-size:0.82rem;font-weight:500">
              ${c.incassata ? '✅' : '⏳'} ${formatDate(c.data_incasso)}
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted)">
              Lordo: ${formatEur(c.importo_lordo)} → Netto: ${formatEur(c.importo_netto)}
            </div>
            ${c.destinazione ? `<div style="font-size:0.72rem;color:var(--text-muted)">${c.destinazione}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:0.95rem;font-weight:700;color:var(--green)">${formatEur(c.importo_netto)}</div>
            ${!c.incassata ? `<button onclick="segnaIncassata(${c.id})"
              style="font-size:0.72rem;color:var(--blue);cursor:pointer;margin-top:2px">
              Segna incassata</button>` : ''}
          </div>
        </div>`).join('')}` : ''}

      <!-- Aggiungi vincolo / cedola -->
      <div class="vinc-add-row">
        <button onclick="addVincolo(${dep.id})">
          <span style="font-size:16px">+</span> Vincolo
        </button>
        <button onclick="addCedola(${dep.id})" style="color:var(--green)">
          <span style="font-size:16px">+</span> Cedola
        </button>
      </div>
    </div>`;
  }

  root.innerHTML = html;
  setupModalDeposito();
  setupModalVincolo();
  setupModalCedola();
  setupModalSimulatore();

  // Segna cedola incassata
  window.segnaIncassata = async (id) => {
    await db.cedole_deposito.update(id, { incassata: 1 });
    toast('Cedola segnata come incassata', 'success');
    await render();
  };

  lucide.createIcons();
}

// ── MODAL DEPOSITO ────────────────────────────────────────────────────────────
function setupModalDeposito() {
  document.getElementById('btn-save-deposito')?.addEventListener('click', saveDeposito);
  document.getElementById('modal-deposito')?.addEventListener('click', function(e) {
    if (e.target === this) closeDepModal('modal-deposito');
  });
}

window._nuovoDeposito = () => {
  editingDepId = null;
  document.getElementById('modal-dep-title').textContent = 'Nuovo conto deposito';
  ['dep-nome','dep-banca','dep-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dep-libera').value = '';
  openDepModal('modal-deposito');
};

async function editDeposito(id) {
  editingDepId = id;
  const dep = await db.conti_deposito.get(id);
  if (!dep) return;
  document.getElementById('modal-dep-title').textContent = 'Modifica conto deposito';
  document.getElementById('dep-nome').value   = dep.nome;
  document.getElementById('dep-banca').value  = dep.banca;
  document.getElementById('dep-libera').value = dep.somma_libera || '';
  document.getElementById('dep-note').value   = dep.note || '';
  openDepModal('modal-deposito');
}

async function saveDeposito() {
  const nome   = document.getElementById('dep-nome').value.trim();
  const banca  = document.getElementById('dep-banca').value.trim();
  const libera = parseFloat(document.getElementById('dep-libera').value) || 0;
  const note   = document.getElementById('dep-note').value.trim();
  if (!nome || !banca) { alert('Inserisci nome e banca'); return; }
  const data = { nome, banca, somma_libera: libera, stato: 'aperto', note };
  if (editingDepId) await db.conti_deposito.update(editingDepId, data);
  else await db.conti_deposito.add({ ...data, importo: 0 });
  closeDepModal('modal-deposito');
  toast('Conto deposito salvato', 'success');
  await render();
}

async function deleteDeposito(id) {
  if (!confirm('Eliminare questo conto deposito e tutti i vincoli associati?')) return;
  await db.vincoli_deposito.where('deposito_id').equals(id).delete();
  await db.cedole_deposito.where('deposito_id').equals(id).delete();
  await db.conti_deposito.delete(id);
  toast('Conto deposito eliminato');
  await render();
}

// ── MODAL VINCOLO ─────────────────────────────────────────────────────────────
function setupModalVincolo() {
  document.getElementById('btn-save-vincolo')?.addEventListener('click', saveVincolo);
  document.getElementById('modal-vincolo')?.addEventListener('click', function(e) {
    if (e.target === this) closeDepModal('modal-vincolo');
  });
}

async function populateDepositiSelect(selectId, selectedId = null) {
  const depositi = await db.conti_deposito.toArray();
  const sel = document.getElementById(selectId);
  sel.innerHTML = depositi.map(d =>
    `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${d.nome}</option>`
  ).join('');
}

async function addVincolo(depId) {
  editingVincId = null;
  document.getElementById('modal-vinc-title').textContent = 'Nuovo vincolo';
  ['vinc-numero','vinc-importo','vinc-tasso','vinc-interessi'].forEach(id =>
    document.getElementById(id).value = '');
  document.getElementById('vinc-decorrenza').value = today();
  document.getElementById('vinc-scadenza').value    = '';
  document.getElementById('vinc-svincolabile').value = '1';
  document.getElementById('vinc-stato').value        = 'attivo';
  document.getElementById('vinc-erogazione').value   = 'a_scadenza';
  await populateDepositiSelect('vinc-deposito-id', depId);
  openDepModal('modal-vincolo');
}

async function editVincolo(id) {
  editingVincId = id;
  const v = await db.vincoli_deposito.get(id);
  if (!v) return;
  document.getElementById('modal-vinc-title').textContent = 'Modifica vincolo';
  document.getElementById('vinc-numero').value       = v.numero || '';
  document.getElementById('vinc-decorrenza').value   = v.data_decorrenza || '';
  document.getElementById('vinc-scadenza').value     = v.data_scadenza || '';
  document.getElementById('vinc-importo').value      = v.importo || '';
  document.getElementById('vinc-tasso').value        = v.tasso_lordo || '';
  document.getElementById('vinc-interessi').value    = v.interessi_netti || '';
  document.getElementById('vinc-svincolabile').value = v.svincolabile ?? 1;
  document.getElementById('vinc-stato').value        = v.stato || 'attivo';
  document.getElementById('vinc-erogazione').value   = v.tipo_erogazione || 'a_scadenza';
  await populateDepositiSelect('vinc-deposito-id', v.deposito_id);
  openDepModal('modal-vincolo');
}

async function saveVincolo() {
  const importo = parseFloat(document.getElementById('vinc-importo').value) || 0;
  const depId   = parseInt(document.getElementById('vinc-deposito-id').value);
  if (!importo) { alert('Inserisci l\'importo'); return; }
  const data = {
    deposito_id:    depId,
    numero:         document.getElementById('vinc-numero').value.trim(),
    data_decorrenza:document.getElementById('vinc-decorrenza').value,
    data_scadenza:  document.getElementById('vinc-scadenza').value,
    tasso_lordo:    parseFloat(document.getElementById('vinc-tasso').value) || 0,
    importo,
    interessi_netti:parseFloat(document.getElementById('vinc-interessi').value) || 0,
    svincolabile:   parseInt(document.getElementById('vinc-svincolabile').value),
    stato: 'attivo'
  };
  if (editingVincId) await db.vincoli_deposito.update(editingVincId, data);
  else await db.vincoli_deposito.add(data);
  closeDepModal('modal-vincolo');
  toast('Vincolo salvato', 'success');
  await render();
}

async function deleteVincolo(id) {
  if (!confirm('Eliminare questo vincolo?')) return;
  await db.vincoli_deposito.delete(id);
  toast('Vincolo eliminato');
  await render();
}

// ── MODAL CEDOLA ──────────────────────────────────────────────────────────────
function setupModalCedola() {
  const lordoInput = document.getElementById('ced-lordo');
  if (lordoInput) {
    lordoInput.addEventListener('input', () => {
      const lordo = parseFloat(lordoInput.value) || 0;
      if (lordo > 0) {
        document.getElementById('ced-calcolo').style.display = '';
        document.getElementById('ced-ritenuta-val').textContent = formatEur(ritenuta(lordo));
        document.getElementById('ced-netto-val').textContent    = formatEur(nettoRitenuta(lordo));
      } else {
        document.getElementById('ced-calcolo').style.display = 'none';
      }
    });
  }
  document.getElementById('btn-save-cedola')?.addEventListener('click', saveCedola);
  document.getElementById('modal-cedola')?.addEventListener('click', function(e) {
    if (e.target === this) closeDepModal('modal-cedola');
  });
}

async function addCedola(depId) {
  currentCedDepId  = depId;
  currentCedVincId = null;
  document.getElementById('ced-data').value         = today();
  document.getElementById('ced-lordo').value        = '';
  document.getElementById('ced-destinazione').value = '';
  document.getElementById('ced-incassata').value    = '0';
  document.getElementById('ced-calcolo').style.display = 'none';
  openDepModal('modal-cedola');
}

async function saveCedola() {
  const lordo = parseFloat(document.getElementById('ced-lordo').value) || 0;
  const data  = document.getElementById('ced-data').value;
  if (!lordo || !data) { alert('Inserisci data e importo lordo'); return; }
  await db.cedole_deposito.add({
    deposito_id:   currentCedDepId,
    vincolo_id:    currentCedVincId,
    data_incasso:  data,
    importo_lordo: lordo,
    ritenuta:      ritenuta(lordo),
    importo_netto: nettoRitenuta(lordo),
    destinazione:  document.getElementById('ced-destinazione').value.trim(),
    incassata:     parseInt(document.getElementById('ced-incassata').value),
    note: ''
  });
  closeDepModal('modal-cedola');
  toast('Cedola registrata', 'success');
  await render();
}

// ── SIMULATORE ────────────────────────────────────────────────────────────────
function setupModalSimulatore() {
  document.getElementById('btn-calcola-sim')?.addEventListener('click', calcolaSimulazione);
  document.getElementById('modal-simulatore')?.addEventListener('click', function(e) {
    if (e.target === this) closeDepModal('modal-simulatore');
  });
}

async function openSimulatore() {
  await populateDepositiSelect('sim-deposito');
  ['sim-importo','sim-tasso','sim-mesi'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('sim-risultato').style.display = 'none';
  openDepModal('modal-simulatore');
  lucide.createIcons();
}

function calcolaSimulazione() {
  const importo = parseFloat(document.getElementById('sim-importo').value) || 0;
  const tasso   = parseFloat(document.getElementById('sim-tasso').value)   || 0;
  const mesi    = parseFloat(document.getElementById('sim-mesi').value)    || 0;
  if (!importo || !tasso || !mesi) { alert('Compila tutti i campi'); return; }
  const lordo = importo * (tasso / 100) * (mesi / 12);
  const rit   = ritenuta(lordo);
  const netto = nettoRitenuta(lordo);
  document.getElementById('sim-lordo').textContent = formatEur(lordo);
  document.getElementById('sim-rit').textContent   = formatEur(rit);
  document.getElementById('sim-netto').textContent = formatEur(netto);
  document.getElementById('sim-risultato').style.display = '';
}

// ── HELPERS MODAL ─────────────────────────────────────────────────────────────
function openDepModal(id) {
  const o = document.getElementById(id);
  if (!o) return;
  o.classList.remove('hidden');
  requestAnimationFrame(() => o.classList.add('open'));
  lucide.createIcons();
}

function closeDepModal(id) {
  const o = document.getElementById(id);
  if (!o) return;
  o.classList.remove('open');
  setTimeout(() => o.classList.add('hidden'), 250);
}
