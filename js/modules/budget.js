/* BudgetMe — budget.js */
import db from '../db.js';
import { formatEur, MESI_NOMI } from '../utils.js';
import { getOrCreateMeseCorrente } from '../db.js';

let currentTab    = 'mese';
let currentMese   = null;
let editingCatId  = null;
let editingVoceId = null;
let editingVoceCatId = null;
let currentRegVoceId = null;
let selectedCatColor = '#2a78d6';

// ── INIT ─────────────────────────────────────────────────────────────────────
export async function init() {
  setupTabs();
  setupGlobalFunctions();
  try {
    currentMese = await getOrCreateMeseCorrente();
    const nCat = await db.categorie_budget.count();
    if (nCat === 0) await _initDefaultCategorie();
    await renderTab();
  } catch(err) {
    console.error('Errore init budget:', err);
    document.getElementById('budget-root').innerHTML =
      '<div class="empty-state"><p>Errore caricamento. Ricarica la pagina.</p></div>';
  }
}

async function _initDefaultCategorie() {
  const cats = [
    { nome:'Spese Fisse Contrattuali', tipo:'uscita',  ordine:1, colore:'#2a78d6', attiva:1,
      voci:[
        {nome:'Affitto / Rata mutuo',       prev:530,   tv:'fisso'},
        {nome:'Mantenimento Figlio 1',       prev:500,   tv:'fisso'},
        {nome:'Mantenimento ex coniuge',     prev:0,     tv:'fisso'},
        {nome:'Assicurazione Auto',          prev:39.42, tv:'fisso'},
        {nome:'Telefonia',                   prev:9.99,  tv:'fisso'},
        {nome:'Finanziamenti',               prev:0,     tv:'fisso'},
        {nome:'Spese condominiali',          prev:0,     tv:'fisso'},
        {nome:'Assicurazione Casa',          prev:0,     tv:'fisso'},
      ]},
    { nome:'Canoni Bancari', tipo:'uscita', ordine:2, colore:'#444441', attiva:1,
      voci:[
        {nome:'Canone UniCredit',            prev:2.15,  tv:'fisso'},
        {nome:'Canone BPER',                 prev:6.00,  tv:'fisso'},
        {nome:'Imposta bollo c/c',           prev:8.55,  tv:'fisso', note:'34,20€/anno — trimestrale'},
      ]},
    { nome:'Figli', tipo:'uscita', ordine:3, colore:'#d4720f', attiva:1,
      voci:[
        {nome:'Istruzione / Nido Figlio 1',  prev:0,  tv:'variabile'},
        {nome:'Sport / Attività Figlio 1',   prev:0,  tv:'variabile'},
        {nome:'Spese Figlio 1',              prev:50, tv:'variabile'},
      ]},
    { nome:'Spese Variabili Necessarie', tipo:'uscita', ordine:4, colore:'#1baf7a', attiva:1,
      voci:[
        {nome:'Utenze Luce + Gas',           prev:47.20, tv:'variabile'},
        {nome:'Utenza Acqua',                prev:30,    tv:'variabile'},
        {nome:'Alimentari',                  prev:150,   tv:'variabile'},
        {nome:'Carburante / Auto',           prev:100,   tv:'variabile'},
      ]},
    { nome:'Spese Discrezionali', tipo:'uscita', ordine:5, colore:'#7c3d9e', attiva:1,
      voci:[
        {nome:'Abbigliamento',               prev:50,  tv:'variabile'},
        {nome:'Bar / Caffè',                 prev:10,  tv:'variabile'},
        {nome:'Cura Persona',                prev:0,   tv:'variabile'},
        {nome:'Farmacia / Salute',           prev:10,  tv:'variabile'},
        {nome:'Hobby / Tempo libero',        prev:20,  tv:'variabile'},
        {nome:'Lavanderia',                  prev:0,   tv:'variabile'},
        {nome:'Ristorazione',                prev:50,  tv:'variabile'},
        {nome:'Salute / Ottica',             prev:0,   tv:'variabile'},
        {nome:'Casa / Fai da Te',            prev:20,  tv:'variabile'},
        {nome:'Casa / Varie',                prev:10,  tv:'variabile'},
        {nome:'Autolavaggio',                prev:16,  tv:'variabile'},
      ]},
    { nome:'Spese Irregolari / Annuali', tipo:'uscita', ordine:6, colore:'#e34948', attiva:1,
      voci:[
        {nome:'Bollo auto',                  prev:0, tv:'irregolare'},
        {nome:'Revisione auto',              prev:0, tv:'irregolare'},
        {nome:'Manutenzione auto ordinaria', prev:0, tv:'irregolare'},
        {nome:'Manutenzione auto straord.',  prev:0, tv:'irregolare'},
        {nome:'Ordine professionale',        prev:0, tv:'irregolare'},
        {nome:'Regali / Ricorrenze',         prev:0, tv:'irregolare'},
        {nome:'Spese Straordinarie Casa',    prev:0, tv:'irregolare'},
        {nome:'Viaggi / Vacanze',            prev:0, tv:'irregolare'},
      ]},
    { nome:'Risparmio e Liquidità', tipo:'uscita', ordine:7, colore:'#1baf7a', attiva:1,
      voci:[
        {nome:'Fondo emergenza',             prev:100, tv:'risparmio'},
        {nome:'Versamento Conto Deposito 1', prev:0,   tv:'risparmio'},
        {nome:'Versamento Conto Deposito 2', prev:0,   tv:'risparmio'},
      ]},
    { nome:'Investimento Lungo Termine', tipo:'uscita', ordine:8, colore:'#7c3d9e', attiva:1,
      voci:[
        {nome:'PAC ETF', prev:100, tv:'risparmio', note:'Orizzonte >10 anni'},
      ]},
    { nome:'Fiscalità', tipo:'uscita', ordine:9, colore:'#5F5E5A', attiva:1,
      voci:[
        {nome:'F24 / Acconto IRPEF',    prev:0, tv:'irregolare'},
        {nome:'IMU / ICI',              prev:0, tv:'irregolare'},
        {nome:'Addizionale regionale',  prev:0, tv:'irregolare'},
        {nome:'Addizionale comunale',   prev:0, tv:'irregolare'},
        {nome:'IVA trimestrale',        prev:0, tv:'irregolare', note:'Solo P.IVA'},
        {nome:'Contributi INPS',        prev:0, tv:'irregolare', note:'Solo autonomi'},
        {nome:'IRAP',                   prev:0, tv:'irregolare', note:'Solo P.IVA'},
        {nome:'Altre imposte',          prev:0, tv:'irregolare'},
      ]},
    { nome:'Reddito da Lavoro', tipo:'entrata', ordine:1, colore:'#1baf7a', attiva:1,
      voci:[
        {nome:'Stipendio netto',          prev:2268, tv:'fisso'},
        {nome:'Tredicesima',              prev:0,    tv:'irregolare', note:'Solo a dicembre'},
        {nome:'Quattordicesima',          prev:0,    tv:'irregolare', note:'Solo a luglio se prevista'},
        {nome:'Rimborsi aziendali',       prev:0,    tv:'variabile',  note:'Solo quando incassato'},
        {nome:'Freelance / Consulenze',   prev:0,    tv:'variabile'},
      ]},
    { nome:'Rendite da Risparmio', tipo:'entrata', ordine:2, colore:'#d4720f', attiva:1,
      voci:[
        {nome:'Cedola Conto Deposito 1',  prev:0, tv:'variabile', note:'Netto dopo ritenuta 26%'},
        {nome:'Cedola Conto Deposito 2',  prev:0, tv:'variabile', note:'Netto dopo ritenuta 26%'},
        {nome:'Interessi attivi',         prev:0, tv:'variabile'},
        {nome:'Dividendi ETF',            prev:0, tv:'variabile'},
      ]},
    { nome:'Rimborsi Fiscali', tipo:'entrata', ordine:3, colore:'#2a78d6', attiva:1,
      voci:[
        {nome:'Rimborso 730',             prev:0, tv:'irregolare'},
        {nome:'Bonus / Detrazioni',       prev:0, tv:'irregolare'},
      ]},
    { nome:'Entrate Straordinarie', tipo:'entrata', ordine:4, colore:'#444441', attiva:1,
      voci:[
        {nome:'Vendite / Altro',          prev:0, tv:'variabile'},
        {nome:'Altre entrate',            prev:0, tv:'variabile'},
      ]},
  ];
  for (const cat of cats) {
    const { voci, ...catData } = cat;
    const catId = await db.categorie_budget.add(catData);
    let ord = 1;
    for (const v of voci) {
      await db.voci_budget.add({
        categoria_id: catId, nome: v.nome,
        previsione_default: v.prev || 0,
        tipo_voce: v.tv, note: v.note || '',
        attiva: 1, ordine: ord++
      });
    }
  }
}

function setupTabs() {
  document.querySelectorAll('#budget-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#budget-tabs .tab-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      await renderTab();
    });
  });
}

async function renderTab() {
  if (currentTab === 'mese')      await renderMese();
  else if (currentTab === 'gestione') await renderGestione();
}

// ── TAB MESE ─────────────────────────────────────────────────────────────────
async function renderMese() {
  const root = document.getElementById('budget-root');
  root.innerHTML = `<div class="spinner" style="margin:24px auto"></div>`;

  const [cats, voci, regs] = await Promise.all([
    db.categorie_budget.orderBy('ordine').toArray(),
    db.voci_budget.where('attiva').equals(1).toArray(),
    db.registrazioni.where('mese_id').equals(currentMese.id).toArray()
  ]);

  const regsMap = {};
  regs.forEach(r => { regsMap[r.voce_id] = r; });

  const vociMap = {};
  voci.forEach(v => { vociMap[v.id] = v; });

  let html = `<p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;text-align:center">
    ${MESI_NOMI[currentMese.mese]} ${currentMese.anno} — tocca una voce per registrare l'importo</p>`;

  // Separa uscite ed entrate
  const catsUscita  = cats.filter(c => c.tipo === 'uscita'  && c.attiva);
  const catsEntrata = cats.filter(c => c.tipo === 'entrata' && c.attiva);

  // Calcola totali globali
  let totRealUscite = 0, totPrevUscite = 0;
  let totRealEntrate = 0, totPrevEntrate = 0;

  for (const cat of catsUscita) {
    const vociCat = voci.filter(v => v.categoria_id === cat.id);
    vociCat.forEach(v => {
      const reg = regsMap[v.id];
      totRealUscite += reg?.importo_reale || 0;
      totPrevUscite += reg?.previsione_override ?? v.previsione_default ?? 0;
    });
  }
  for (const cat of catsEntrata) {
    const vociCat = voci.filter(v => v.categoria_id === cat.id);
    vociCat.forEach(v => {
      const reg = regsMap[v.id];
      totRealEntrate += reg?.importo_reale || 0;
      totPrevEntrate += reg?.previsione_override ?? v.previsione_default ?? 0;
    });
  }

  const saldoReale = totRealEntrate - totRealUscite;
  const saldoPrev  = totPrevEntrate - totPrevUscite;

  // KPI sommario
  html += `
  <div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi-card">
      <div class="label">Entrate reali</div>
      <div class="value text-positive">${formatEur(totRealEntrate)}</div>
      <div style="font-size:0.72rem;color:var(--text-muted)">prev. ${formatEur(totPrevEntrate)}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Uscite reali</div>
      <div class="value text-negative">${formatEur(totRealUscite)}</div>
      <div style="font-size:0.72rem;color:var(--text-muted)">prev. ${formatEur(totPrevUscite)}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Saldo reale</div>
      <div class="value ${saldoReale >= 0 ? 'text-positive' : 'text-negative'}">${formatEur(saldoReale, true)}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Saldo previsto</div>
      <div class="value ${saldoPrev >= 0 ? 'text-positive' : 'text-negative'}">${formatEur(saldoPrev, true)}</div>
    </div>
  </div>`;

  // Render gruppi ENTRATE
  html += renderCatGroup(catsEntrata, voci, regsMap, totRealEntrate, '▲ ENTRATE', '#1baf7a');
  // Render gruppi USCITE
  html += renderCatGroup(catsUscita,  voci, regsMap, totRealUscite,  '▼ USCITE',  '#e34948');

  root.innerHTML = html;

  // Event: click su voce → apri modal registrazione
  root.querySelectorAll('.budget-voce-row').forEach(row => {
    row.addEventListener('click', () => openRegModal(
      parseInt(row.dataset.voceId),
      row.dataset.voceName,
      parseFloat(row.dataset.vocePrev),
      regsMap[parseInt(row.dataset.voceId)]
    ));
  });

  // Collassa/espandi gruppi
  root.querySelectorAll('.budget-group-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = document.getElementById(`group-body-${h.dataset.catId}`);
      if (!body) return;
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      h.classList.toggle('collapsed', !collapsed);
    });
  });

  lucide.createIcons();
}

function renderCatGroup(cats, voci, regsMap, totaleReale, label, labelColor) {
  let html = `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
    letter-spacing:0.07em;color:${labelColor};margin:16px 0 8px">${label}</p>`;

  for (const cat of cats) {
    const vociCat = voci.filter(v => v.categoria_id === cat.id);
    if (!vociCat.length) continue;

    let catReal = 0, catPrev = 0;
    vociCat.forEach(v => {
      const reg = regsMap[v.id];
      catReal += reg?.importo_reale || 0;
      catPrev += reg?.previsione_override ?? v.previsione_default ?? 0;
    });

    const saldoCat = catPrev - catReal;
    const colore   = cat.colore || '#444441';

    html += `
    <div class="budget-group">
      <div class="budget-group-header" data-cat-id="${cat.id}"
           style="background:${colore}">
        <div>
          <div class="group-name">${cat.nome}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div>
            <div class="group-total">${formatEur(catReal)}</div>
            <div style="font-size:0.7rem;color:rgba(255,255,255,0.7);text-align:right">
              ${saldoCat >= 0 ? '+' : ''}${formatEur(saldoCat)} su ${formatEur(catPrev)}
            </div>
          </div>
          <i data-lucide="chevron-down" class="group-chevron" style="width:16px;height:16px"></i>
        </div>
      </div>
      <div id="group-body-${cat.id}" class="card" style="border-radius:0 0 var(--radius) var(--radius);margin-top:-1px">`;

    for (const v of vociCat) {
      const reg  = regsMap[v.id];
      const real = reg?.importo_reale || 0;
      const prev = reg?.previsione_override ?? v.previsione_default ?? 0;
      const saldo = prev - real;
      const saldoClass = saldo > 0.005 ? 'saldo-pos' : saldo < -0.005 ? 'saldo-neg' : 'saldo-zero';
      const pct  = totaleReale > 0 ? ((real / totaleReale) * 100).toFixed(1) : '0.0';

      html += `
        <div class="budget-voce-row"
             data-voce-id="${v.id}"
             data-voce-name="${v.nome.replace(/"/g,'&quot;')}"
             data-voce-prev="${prev}">
          <div>
            <div class="voce-name">${v.nome}</div>
            ${v.note ? `<div class="voce-note">${v.note}</div>` : ''}
          </div>
          <div class="voce-prev">${formatEur(prev)}</div>
          <div>
            <div class="voce-real ${real > 0 ? '' : 'text-muted'}">${real > 0 ? formatEur(real) : '—'}</div>
            <div style="font-size:0.68rem;color:var(--text-muted);text-align:right">${pct}%</div>
          </div>
          <div class="voce-saldo ${saldoClass}">
            ${real > 0 || prev > 0 ? (saldo >= 0 ? '+' : '') + formatEur(saldo) : ''}
          </div>
        </div>`;
    }

    html += `</div></div>`;
  }
  return html;
}

// ── MODAL REGISTRAZIONE ───────────────────────────────────────────────────────
function openRegModal(voceId, voceName, prevDefault, existingReg) {
  currentRegVoceId = voceId;
  document.getElementById('modal-reg-title').textContent = voceName;
  document.getElementById('reg-importo').value   = existingReg?.importo_reale || '';
  document.getElementById('reg-previsione').value = existingReg?.previsione_override ?? '';
  document.getElementById('reg-note').value       = existingReg?.note || '';

  const overlay = document.getElementById('modal-reg');
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('open'));
  setTimeout(() => document.getElementById('reg-importo').focus(), 300);

  document.getElementById('btn-save-reg').onclick = async () => {
    const importo = parseFloat(document.getElementById('reg-importo').value);
    const prevOvr = document.getElementById('reg-previsione').value;
    const note    = document.getElementById('reg-note').value.trim();

    if (isNaN(importo) || importo < 0) {
      alert('Inserisci un importo valido (0 o più)'); return;
    }

    const data = {
      voce_id:            currentRegVoceId,
      mese_id:            currentMese.id,
      importo_reale:      importo,
      previsione_override: prevOvr !== '' ? parseFloat(prevOvr) : undefined,
      note
    };

    const existing = await db.registrazioni
      .where({ voce_id: currentRegVoceId, mese_id: currentMese.id }).first();

    if (existing) await db.registrazioni.update(existing.id, data);
    else          await db.registrazioni.add(data);

    closeBudgetModal('modal-reg');
    await renderMese();
  };
  lucide.createIcons();
}

// ── TAB GESTIONE ─────────────────────────────────────────────────────────────
async function renderGestione() {
  const root = document.getElementById('budget-root');
  const [cats, voci] = await Promise.all([
    db.categorie_budget.orderBy('ordine').toArray(),
    db.voci_budget.orderBy('ordine').toArray()
  ]);

  const vociPerCat = {};
  voci.forEach(v => {
    if (!vociPerCat[v.categoria_id]) vociPerCat[v.categoria_id] = [];
    vociPerCat[v.categoria_id].push(v);
  });

  let html = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" id="btn-nuova-cat">
        <i data-lucide="folder-plus" style="width:14px;height:14px"></i> Nuova categoria
      </button>
    </div>`;

  const catsUscita  = cats.filter(c => c.tipo === 'uscita');
  const catsEntrata = cats.filter(c => c.tipo === 'entrata');

  html += renderGestioneSezione('▼ USCITE', catsUscita,  vociPerCat, '#e34948');
  html += renderGestioneSezione('▲ ENTRATE', catsEntrata, vociPerCat, '#1baf7a');

  root.innerHTML = html;

  document.getElementById('btn-nuova-cat')?.addEventListener('click', () => openCatModal());

  // Bottoni modifica/elimina categoria
  root.querySelectorAll('.btn-edit-cat').forEach(btn =>
    btn.addEventListener('click', () => openCatModal(parseInt(btn.dataset.catId))));
  root.querySelectorAll('.btn-delete-cat').forEach(btn =>
    btn.addEventListener('click', () => deleteCat(parseInt(btn.dataset.catId))));
  root.querySelectorAll('.btn-toggle-cat').forEach(btn =>
    btn.addEventListener('click', () => toggleCat(parseInt(btn.dataset.catId), btn.dataset.attiva === '1')));

  // Bottoni voce
  root.querySelectorAll('.btn-add-voce').forEach(btn =>
    btn.addEventListener('click', () => openVoceModal(null, parseInt(btn.dataset.catId))));
  root.querySelectorAll('.btn-edit-voce').forEach(btn =>
    btn.addEventListener('click', () => openVoceModal(parseInt(btn.dataset.voceId), parseInt(btn.dataset.catId))));
  root.querySelectorAll('.btn-delete-voce').forEach(btn =>
    btn.addEventListener('click', () => deleteVoce(parseInt(btn.dataset.voceId))));
  root.querySelectorAll('.btn-toggle-voce').forEach(btn =>
    btn.addEventListener('click', () => toggleVoce(parseInt(btn.dataset.voceId), btn.dataset.attiva === '1')));

  lucide.createIcons();
}

function renderGestioneSezione(label, cats, vociPerCat, color) {
  let html = `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
    letter-spacing:0.07em;color:${color};margin:16px 0 8px">${label}</p>`;

  for (const cat of cats) {
    const voci   = vociPerCat[cat.id] || [];
    const attiva = cat.attiva === 1;
    html += `
    <div class="gestione-cat" style="opacity:${attiva ? 1 : 0.55}">
      <div class="gestione-cat-header">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:10px;height:10px;border-radius:50%;background:${cat.colore || '#888'}"></div>
          <div class="gestione-cat-name">${cat.nome}</div>
          <span class="badge ${attiva ? 'badge-green' : 'badge-gray'}" style="font-size:0.65rem">
            ${attiva ? 'attiva' : 'disattivata'}
          </span>
        </div>
        <div class="gestione-cat-actions">
          <button class="btn-toggle-cat" data-cat-id="${cat.id}" data-attiva="${cat.attiva}" title="${attiva ? 'Disattiva' : 'Attiva'}">
            <i data-lucide="${attiva ? 'eye-off' : 'eye'}"></i>
          </button>
          <button class="btn-edit-cat" data-cat-id="${cat.id}" title="Modifica">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-delete-cat" data-cat-id="${cat.id}" title="Elimina">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>`;

    for (const v of voci) {
      const vAttiva = v.attiva === 1;
      html += `
      <div class="gestione-voce-item" style="opacity:${vAttiva ? 1 : 0.5}">
        <div class="gestione-voce-name">${v.nome}
          ${v.note ? `<div style="font-size:0.7rem;color:var(--text-muted)">${v.note}</div>` : ''}
        </div>
        <span class="gestione-voce-prev">${formatEur(v.previsione_default)}/mese</span>
        <div class="gestione-voce-actions">
          <button class="btn-toggle-voce" data-voce-id="${v.id}" data-attiva="${v.attiva}" title="${vAttiva ? 'Nascondi' : 'Mostra'}">
            <i data-lucide="${vAttiva ? 'eye-off' : 'eye'}"></i>
          </button>
          <button class="btn-edit-voce" data-voce-id="${v.id}" data-cat-id="${cat.id}" title="Modifica">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-delete-voce" data-voce-id="${v.id}" title="Elimina">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>`;
    }

    html += `
      <button class="add-voce-btn btn-add-voce" data-cat-id="${cat.id}">
        <i data-lucide="plus" style="width:14px;height:14px"></i> Aggiungi voce
      </button>
    </div>`;
  }
  return html;
}

// ── MODAL CATEGORIA ───────────────────────────────────────────────────────────
async function openCatModal(catId = null) {
  editingCatId = catId;
  selectedCatColor = '#2a78d6';

  if (catId) {
    const cat = await db.categorie_budget.get(catId);
    document.getElementById('modal-cat-title').textContent = 'Modifica categoria';
    document.getElementById('cat-nome').value  = cat.nome;
    document.getElementById('cat-tipo').value  = cat.tipo;
    selectedCatColor = cat.colore || '#2a78d6';
  } else {
    document.getElementById('modal-cat-title').textContent = 'Nuova categoria';
    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-tipo').value = 'uscita';
  }

  document.querySelectorAll('#cat-color-picker .color-dot').forEach(b =>
    b.classList.toggle('active', b.dataset.color === selectedCatColor));

  document.querySelectorAll('#cat-color-picker .color-dot').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#cat-color-picker .color-dot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCatColor = btn.dataset.color;
    };
  });

  document.getElementById('btn-save-cat').onclick = saveCat;
  openBudgetModal('modal-cat');
}

async function saveCat() {
  const nome  = document.getElementById('cat-nome').value.trim();
  const tipo  = document.getElementById('cat-tipo').value;
  if (!nome) { alert('Inserisci il nome della categoria'); return; }

  if (editingCatId) {
    await db.categorie_budget.update(editingCatId, { nome, tipo, colore: selectedCatColor });
  } else {
    const max = await db.categorie_budget.orderBy('ordine').last();
    await db.categorie_budget.add({ nome, tipo, colore: selectedCatColor, ordine: (max?.ordine || 0) + 1, attiva: 1 });
  }
  closeBudgetModal('modal-cat');
  await renderGestione();
}

async function deleteCat(id) {
  if (!confirm('Eliminare questa categoria e tutte le sue voci? I dati registrati nel budget rimarranno.')) return;
  const voci = await db.voci_budget.where('categoria_id').equals(id).toArray();
  await Promise.all(voci.map(v => db.voci_budget.delete(v.id)));
  await db.categorie_budget.delete(id);
  await renderGestione();
}

async function toggleCat(id, attiva) {
  await db.categorie_budget.update(id, { attiva: attiva ? 0 : 1 });
  await renderGestione();
}

// ── MODAL VOCE ────────────────────────────────────────────────────────────────
async function openVoceModal(voceId = null, catId = null) {
  editingVoceId   = voceId;
  editingVoceCatId = catId;

  const cats = await db.categorie_budget.orderBy('ordine').toArray();
  const sel  = document.getElementById('voce-categoria');
  sel.innerHTML = cats.map(c =>
    `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${c.nome} (${c.tipo})</option>`
  ).join('');

  if (voceId) {
    const v = await db.voci_budget.get(voceId);
    document.getElementById('modal-voce-title').textContent = 'Modifica voce';
    document.getElementById('voce-nome').value        = v.nome;
    document.getElementById('voce-previsione').value  = v.previsione_default || '';
    document.getElementById('voce-tipo').value        = v.tipo_voce || 'variabile';
    document.getElementById('voce-note').value        = v.note || '';
    sel.value = v.categoria_id;
  } else {
    document.getElementById('modal-voce-title').textContent = 'Nuova voce';
    document.getElementById('voce-nome').value       = '';
    document.getElementById('voce-previsione').value = '';
    document.getElementById('voce-tipo').value       = 'variabile';
    document.getElementById('voce-note').value       = '';
  }

  document.getElementById('btn-save-voce').onclick = saveVoce;
  openBudgetModal('modal-voce');
}

async function saveVoce() {
  const nome     = document.getElementById('voce-nome').value.trim();
  const prev     = parseFloat(document.getElementById('voce-previsione').value) || 0;
  const tipo     = document.getElementById('voce-tipo').value;
  const note     = document.getElementById('voce-note').value.trim();
  const catId    = parseInt(document.getElementById('voce-categoria').value);
  if (!nome) { alert('Inserisci il nome della voce'); return; }

  if (editingVoceId) {
    await db.voci_budget.update(editingVoceId, {
      nome, previsione_default: prev, tipo_voce: tipo, note, categoria_id: catId
    });
  } else {
    const max = await db.voci_budget.where('categoria_id').equals(catId).last();
    await db.voci_budget.add({
      categoria_id: catId, nome,
      previsione_default: prev, tipo_voce: tipo,
      note, attiva: 1, ordine: (max?.ordine || 0) + 1
    });
  }
  closeBudgetModal('modal-voce');
  await renderGestione();
}

async function deleteVoce(id) {
  if (!confirm('Eliminare questa voce? I dati registrati rimarranno nello storico.')) return;
  await db.voci_budget.delete(id);
  await renderGestione();
}

async function toggleVoce(id, attiva) {
  await db.voci_budget.update(id, { attiva: attiva ? 0 : 1 });
  await renderGestione();
}

// ── HELPERS MODAL ─────────────────────────────────────────────────────────────
function openBudgetModal(id) {
  const o = document.getElementById(id);
  o.classList.remove('hidden');
  requestAnimationFrame(() => o.classList.add('open'));
  lucide.createIcons();
}

function setupGlobalFunctions() {
  window.closeBudgetModal = (id) => {
    const o = document.getElementById(id);
    if (!o) return;
    o.classList.remove('open');
    setTimeout(() => o.classList.add('hidden'), 250);
  };
  // Chiudi cliccando overlay
  ['modal-reg','modal-cat','modal-voce'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(e) {
      if (e.target === this) window.closeBudgetModal(id);
    });
  });
}
