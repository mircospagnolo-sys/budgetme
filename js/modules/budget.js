/* BudgetMe — budget.js v2 */
import db from '../db.js';
import { formatEur, formatDate, MESI_NOMI, today } from '../utils.js';
import { getOrCreateMeseCorrente } from '../db.js';

const MODALITA_LABEL = {
  pos:'POS', credito:'Carta credito', ricaricabile:'Carta ricaricabile',
  contanti:'Contanti', bonifico:'Bonifico', rid:'RID', paypal:'PayPal/Satispay', altro:'Altro'
};

let currentTab    = 'mese';
let currentMese   = null;
let currentAnno   = null;
let currentMeseNum= null;
let editingCatId  = null;
let editingVoceId = null;
let selectedCatColor = '#2a78d6';
let currentRegVoceId = null;
let currentMovVoceId = null;

// ── INIT ─────────────────────────────────────────────────────────────────────
export async function init() {
  const now = new Date();
  currentAnno    = now.getFullYear();
  currentMeseNum = now.getMonth() + 1;

  setupTabs();
  setupNavMese();
  setupGlobalFunctions();

  try {
    await loadMese();
    const nCat = await db.categorie_budget.count();
    if (nCat === 0) await _initDefaultCategorie();
    await renderTab();
  } catch(err) {
    console.error('Errore init budget:', err);
    document.getElementById('budget-root').innerHTML =
      '<div class="empty-state"><p>Errore caricamento. Ricarica la pagina.</p></div>';
  }
}

async function loadMese() {
  let rec = await db.mesi.where({ anno: currentAnno, mese: currentMeseNum }).first();
  if (!rec) {
    const id = await db.mesi.add({
      anno: currentAnno, mese: currentMeseNum,
      note: '', chiuso: false, creato_il: new Date().toISOString()
    });
    rec = await db.mesi.get(id);
  }
  currentMese = rec;
  const label = document.getElementById('budget-mese-label');
  if (label) label.textContent = `${MESI_NOMI[currentMeseNum]} ${currentAnno}`;
}

// ── NAVIGAZIONE MESI ─────────────────────────────────────────────────────────
function setupNavMese() {
  document.getElementById('btn-mese-prec')?.addEventListener('click', async () => {
    currentMeseNum--;
    if (currentMeseNum < 1) { currentMeseNum = 12; currentAnno--; }
    await loadMese();
    await renderTab();
  });
  document.getElementById('btn-mese-succ')?.addEventListener('click', async () => {
    currentMeseNum++;
    if (currentMeseNum > 12) { currentMeseNum = 1; currentAnno++; }
    await loadMese();
    await renderTab();
  });
}

// ── TABS ─────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('#budget-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#budget-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      await renderTab();
    });
  });
}

async function renderTab() {
  if (currentTab === 'mese') await renderMese();
  else await renderGestione();
}

// ── CALCOLO IMPORTO REALE ────────────────────────────────────────────────────
async function getRealAmount(voceId, meseId) {
  // Priorità: somma movimenti se esistono, altrimenti registrazioni
  const movs = await db.movimenti_voce
    .where({ voce_id: voceId, mese_id: meseId }).toArray();
  if (movs.length > 0) {
    return { amount: movs.reduce((s, m) => s + (m.importo || 0), 0), hasMovimenti: true, count: movs.length };
  }
  const reg = await db.registrazioni.where({ voce_id: voceId, mese_id: meseId }).first();
  return { amount: reg?.importo_reale || 0, hasMovimenti: false, count: 0, reg };
}

// ── TAB MESE ─────────────────────────────────────────────────────────────────
async function renderMese() {
  const root = document.getElementById('budget-root');
  root.innerHTML = `<div class="spinner" style="margin:24px auto"></div>`;

  const [cats, voci] = await Promise.all([
    db.categorie_budget.orderBy('ordine').toArray(),
    db.voci_budget.where('attiva').equals(1).toArray()
  ]);

  // Calcola importi reali per tutte le voci del mese
  const reals = {};
  await Promise.all(voci.map(async v => {
    reals[v.id] = await getRealAmount(v.id, currentMese.id);
  }));

  const regsMap = {};
  const regsAll = await db.registrazioni.where('mese_id').equals(currentMese.id).toArray();
  regsAll.forEach(r => { regsMap[r.voce_id] = r; });

  const catsU = cats.filter(c => c.tipo === 'uscita'  && c.attiva);
  const catsE = cats.filter(c => c.tipo === 'entrata' && c.attiva);

  // Totali
  let totRU=0, totPU=0, totRE=0, totPE=0;
  for (const cat of catsU) {
    voci.filter(v => v.categoria_id === cat.id).forEach(v => {
      totRU += reals[v.id]?.amount || 0;
      totPU += regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
    });
  }
  for (const cat of catsE) {
    voci.filter(v => v.categoria_id === cat.id).forEach(v => {
      totRE += reals[v.id]?.amount || 0;
      totPE += regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
    });
  }
  const saldoR = totRE - totRU;
  const saldoP = totPE - totPU;

  let html = `
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-card">
        <div class="label">Entrate reali</div>
        <div class="value text-positive">${formatEur(totRE)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">prev. ${formatEur(totPE)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Uscite reali</div>
        <div class="value text-negative">${formatEur(totRU)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">prev. ${formatEur(totPU)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Saldo reale</div>
        <div class="value ${saldoR>=0?'text-positive':'text-negative'}">${formatEur(saldoR,true)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Saldo previsto</div>
        <div class="value ${saldoP>=0?'text-positive':'text-negative'}">${formatEur(saldoP,true)}</div>
      </div>
    </div>`;

  // Riepilogo per categoria
  html += `<div style="margin-bottom:16px">
    <p class="section-title">Riepilogo per categoria</p>`;

  for (const [label, catList, totReal] of [
    ['▲ ENTRATE', catsE, totRE],
    ['▼ USCITE',  catsU, totRU]
  ]) {
    const color = label.includes('ENTRATE') ? 'var(--green)' : 'var(--red)';
    html += `<p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.06em;color:${color};margin:10px 0 4px">${label}</p>`;
    for (const cat of catList) {
      const vociCat = voci.filter(v => v.categoria_id === cat.id);
      const catReal = vociCat.reduce((s,v) => s + (reals[v.id]?.amount||0), 0);
      const catPrev = vociCat.reduce((s,v) => s + (regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0), 0);
      const pct = totReal > 0 ? Math.round(catReal/totReal*100) : 0;
      const saldo = catPrev - catReal;
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;
             padding:5px 10px;border-radius:6px;margin-bottom:2px;
             background:${cat.colore}18">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:8px;height:8px;border-radius:50%;background:${cat.colore};flex-shrink:0"></div>
            <span style="font-size:0.8rem;font-weight:500">${cat.nome}</span>
          </div>
          <div style="display:flex;gap:12px;align-items:center">
            <span style="font-size:0.72rem;color:var(--text-muted)">${pct}%</span>
            <span style="font-size:0.85rem;font-weight:700">${formatEur(catReal)}</span>
            <span style="font-size:0.72rem;padding:1px 5px;border-radius:8px;
              background:${saldo>=0?'var(--green-light)':'var(--red-light)'};
              color:${saldo>=0?'var(--green)':'var(--red)'}">
              ${saldo>=0?'+':''}${formatEur(saldo)}
            </span>
          </div>
        </div>`;
    }
  }
  html += `</div>`;

  // Gruppi voci
  html += renderGruppiVoci('▲ ENTRATE', catsE, voci, reals, regsMap, totRE, 'var(--green)');
  html += renderGruppiVoci('▼ USCITE',  catsU, voci, reals, regsMap, totRU, 'var(--red)');

  root.innerHTML = html;

  // Click su voce → modal movimenti o singolo
  root.querySelectorAll('.voce-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const vid  = parseInt(el.dataset.voceId);
      const vname = el.dataset.voceName;
      const vprev = parseFloat(el.dataset.vocePrev);
      openMovimentiModal(vid, vname, vprev, regsMap[vid]);
    });
  });

  root.querySelectorAll('.btn-importo-diretto').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const voceId = parseInt(btn.dataset.voceId);
      const voceName = btn.dataset.voceName;
      const vocePrev = parseFloat(btn.dataset.vocePrev);
      openRegModal(voceId, voceName, vocePrev, regsMap[voceId]);
    });
  });

  // Collassa/espandi
  root.querySelectorAll('.budget-group-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = document.getElementById(`gbody-${h.dataset.catId}`);
      if (!body) return;
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      h.classList.toggle('collapsed', !collapsed);
    });
  });

  lucide.createIcons();
}

function renderGruppiVoci(label, cats, voci, reals, regsMap, totReal, labelColor) {
  let html = `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
    letter-spacing:0.07em;color:${labelColor};margin:16px 0 8px">${label}</p>`;

  for (const cat of cats) {
    const vociCat = voci.filter(v => v.categoria_id === cat.id);
    if (!vociCat.length) continue;
    const catReal = vociCat.reduce((s,v) => s + (reals[v.id]?.amount||0), 0);
    const catPrev = vociCat.reduce((s,v) => s + (regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0), 0);
    const saldoCat = catPrev - catReal;

    html += `
    <div class="budget-group">
      <div class="budget-group-header" data-cat-id="${cat.id}"
           style="background:${cat.colore||'#444'}">
        <div style="flex:1;min-width:0">
          <div class="gname">${cat.nome}</div>
        </div>
        <div class="gtotal" style="margin:0 8px">
          <div class="gtot-val">${formatEur(catReal)}</div>
          <div class="gtot-sub">su ${formatEur(catPrev)}</div>
        </div>
        <i data-lucide="chevron-down" class="gchevron" style="width:16px;height:16px"></i>
      </div>
      <div id="gbody-${cat.id}" class="budget-group-body">`;

    for (const v of vociCat) {
      const real = reals[v.id];
      const amount = real?.amount || 0;
      const prev = regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
      const saldo = prev - amount;
      const pct = prev > 0 ? Math.min(100, Math.round(amount/prev*100)) : (amount>0?100:0);
      const saldoClass = saldo > 0.005 ? 'pos' : saldo < -0.005 ? 'neg' : 'zero';
      const pctTot = totReal > 0 ? (amount/totReal*100).toFixed(1) : '0.0';

      html += `
        <div class="voce-item" data-voce-id="${v.id}"
             data-voce-name="${v.nome.replace(/"/g,'&quot;')}"
             data-voce-prev="${prev}"
             style="cursor:pointer">
          <div class="voce-item-top">
            <div style="flex:1;min-width:0">
              <div class="voce-name">${v.nome}</div>
              ${v.note ? `<div class="voce-note-text">${v.note}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:8px">
              <div class="voce-amount ${amount===0?'zero':''}">${amount>0?formatEur(amount):'—'}</div>
              <div style="font-size:0.68rem;color:var(--text-muted)">${pctTot}% entrate/usc.</div>
            </div>
          </div>
          <div class="voce-item-bottom">
            <div class="voce-prev-label">
              Prev: ${formatEur(prev)}
              ${real?.hasMovimenti ? `<span style="color:var(--blue);margin-left:4px">· ${real.count} mov.</span>` : ''}
            </div>
            <span class="voce-saldo ${saldoClass}">
              ${amount>0||prev>0 ? (saldo>=0?'+':'')+formatEur(saldo) : '—'}
            </span>
          </div>
          ${prev>0 ? `
          <div class="voce-progress">
            <div class="voce-progress-fill"
                 style="width:${pct}%;background:${pct>100?'var(--red)':cat.colore||'var(--blue)'}"></div>
          </div>` : ''}
          <div class="voce-actions" onclick="event.stopPropagation()">
            <button class="primary btn-importo-diretto"
              data-voce-id="${v.id}"
              data-voce-name="${v.nome.replace(/"/g,'&quot;')}"
              data-voce-prev="${prev}">
              ✏️ Importo diretto
            </button>
          </div>
        </div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

// ── MODAL MOVIMENTI ──────────────────────────────────────────────────────────
async function openMovimentiModal(voceId, voceName, prevDefault, existingReg) {
  currentMovVoceId = voceId;
  document.getElementById('modal-mov-title').textContent = voceName;
  document.getElementById('mov-data').value = today();
  document.getElementById('mov-importo').value = '';
  document.getElementById('mov-descrizione').value = '';
  document.getElementById('mov-note').value = '';
  document.getElementById('mov-modalita').value = 'pos';

  await refreshMovLista(voceId);

  document.getElementById('btn-add-movimento').onclick = async () => {
    const importo = parseFloat(document.getElementById('mov-importo').value);
    const data    = document.getElementById('mov-data').value;
    if (!importo || importo <= 0) { alert('Inserisci un importo valido'); return; }
    if (!data) { alert('Inserisci la data'); return; }

    await db.movimenti_voce.add({
      voce_id:    voceId,
      mese_id:    currentMese.id,
      data,
      importo,
      modalita:   document.getElementById('mov-modalita').value,
      descrizione:document.getElementById('mov-descrizione').value.trim(),
      note:       document.getElementById('mov-note').value.trim()
    });

    document.getElementById('mov-importo').value = '';
    document.getElementById('mov-descrizione').value = '';
    await refreshMovLista(voceId);
  };

  openBudgetModal('modal-movimenti');
}

async function refreshMovLista(voceId) {
  const movs = await db.movimenti_voce
    .where({ voce_id: voceId, mese_id: currentMese.id })
    .sortBy('data');
  const totale = movs.reduce((s,m) => s + (m.importo||0), 0);
  document.getElementById('mov-totale').textContent = formatEur(totale);

  const lista = document.getElementById('mov-lista');
  if (movs.length === 0) {
    lista.innerHTML = '<p style="font-size:0.82rem;color:var(--text-muted);text-align:center;padding:12px 0">Nessun movimento — aggiungi il primo qui sotto</p>';
    return;
  }
  lista.innerHTML = movs.map(m => `
    <div class="mov-item">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="mov-data">${formatDate(m.data)}</span>
          <span class="mov-badge">${MODALITA_LABEL[m.modalita]||m.modalita}</span>
        </div>
        <div class="mov-desc">${m.descrizione||'—'}</div>
        ${m.note ? `<div style="font-size:0.72rem;color:var(--text-muted)">${m.note}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span class="mov-amount">${formatEur(m.importo)}</span>
        <button class="mov-del" onclick="window._delMov(${m.id})">🗑️</button>
      </div>
    </div>`).join('');
}

// ── MODAL IMPORTO DIRETTO ─────────────────────────────────────────────────────
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
    if (isNaN(importo) || importo < 0) { alert('Inserisci un importo valido'); return; }
    const data = {
      voce_id: currentRegVoceId, mese_id: currentMese.id,
      importo_reale: importo,
      previsione_override: prevOvr !== '' ? parseFloat(prevOvr) : undefined,
      note
    };
    const existing = await db.registrazioni
      .where({ voce_id: currentRegVoceId, mese_id: currentMese.id }).first();
    if (existing) await db.registrazioni.update(existing.id, data);
    else          await db.registrazioni.add(data);
    window.closeBudgetModal('modal-reg');
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

  for (const [label, color, tipo] of [['▼ USCITE','var(--red)','uscita'],['▲ ENTRATE','var(--green)','entrata']]) {
    html += `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.07em;color:${color};margin:16px 0 8px">${label}</p>`;
    const catsTipo = cats.filter(c => c.tipo === tipo);
    for (const cat of catsTipo) {
      const vociCat = vociPerCat[cat.id] || [];
      const attiva  = cat.attiva === 1;
      html += `
      <div class="gestione-cat" style="opacity:${attiva?1:0.55}">
        <div class="gestione-cat-header">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:${cat.colore||'#888'}"></div>
            <div class="gestione-cat-name">${cat.nome}</div>
            <span class="badge ${attiva?'badge-green':'badge-gray'}" style="font-size:0.65rem">
              ${attiva?'attiva':'disattivata'}
            </span>
          </div>
          <div class="gestione-cat-actions">
            <button class="btn-toggle-cat" data-cat-id="${cat.id}" data-attiva="${cat.attiva}" title="${attiva?'Disattiva':'Attiva'}">
              <i data-lucide="${attiva?'eye-off':'eye'}"></i>
            </button>
            <button class="btn-edit-cat" data-cat-id="${cat.id}" title="Modifica">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-delete-cat" data-cat-id="${cat.id}" title="Elimina">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>`;
      for (const v of vociCat) {
        const vAttiva = v.attiva === 1;
        html += `
        <div class="gestione-voce-item" style="opacity:${vAttiva?1:0.5}">
          <div class="gestione-voce-name">${v.nome}
            ${v.note ? `<div style="font-size:0.7rem;color:var(--text-muted)">${v.note}</div>` : ''}
          </div>
          <span class="gestione-voce-prev">${formatEur(v.previsione_default)}/mese</span>
          <div class="gestione-voce-actions">
            <button class="btn-toggle-voce" data-voce-id="${v.id}" data-attiva="${v.attiva}">
              <i data-lucide="${vAttiva?'eye-off':'eye'}"></i>
            </button>
            <button class="btn-edit-voce" data-voce-id="${v.id}" data-cat-id="${cat.id}">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-delete-voce" data-voce-id="${v.id}">
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
  }

  root.innerHTML = html;
  document.getElementById('btn-nuova-cat')?.addEventListener('click', () => openCatModal());
  root.querySelectorAll('.btn-edit-cat').forEach(b => b.addEventListener('click', () => openCatModal(parseInt(b.dataset.catId))));
  root.querySelectorAll('.btn-delete-cat').forEach(b => b.addEventListener('click', () => deleteCat(parseInt(b.dataset.catId))));
  root.querySelectorAll('.btn-toggle-cat').forEach(b => b.addEventListener('click', () => toggleCat(parseInt(b.dataset.catId), b.dataset.attiva==='1')));
  root.querySelectorAll('.btn-add-voce').forEach(b => b.addEventListener('click', () => openVoceModal(null, parseInt(b.dataset.catId))));
  root.querySelectorAll('.btn-edit-voce').forEach(b => b.addEventListener('click', () => openVoceModal(parseInt(b.dataset.voceId), parseInt(b.dataset.catId))));
  root.querySelectorAll('.btn-delete-voce').forEach(b => b.addEventListener('click', () => deleteVoce(parseInt(b.dataset.voceId))));
  root.querySelectorAll('.btn-toggle-voce').forEach(b => b.addEventListener('click', () => toggleVoce(parseInt(b.dataset.voceId), b.dataset.attiva==='1')));
  lucide.createIcons();
}

// ── MODAL CATEGORIA ───────────────────────────────────────────────────────────
async function openCatModal(catId=null) {
  editingCatId = catId;
  selectedCatColor = '#2a78d6';
  if (catId) {
    const cat = await db.categorie_budget.get(catId);
    document.getElementById('modal-cat-title').textContent = 'Modifica categoria';
    document.getElementById('cat-nome').value = cat.nome;
    document.getElementById('cat-tipo').value = cat.tipo;
    selectedCatColor = cat.colore || '#2a78d6';
  } else {
    document.getElementById('modal-cat-title').textContent = 'Nuova categoria';
    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-tipo').value = 'uscita';
  }
  document.querySelectorAll('#cat-color-picker .color-dot').forEach(b => {
    b.classList.toggle('active', b.dataset.color === selectedCatColor);
    b.onclick = () => {
      document.querySelectorAll('#cat-color-picker .color-dot').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      selectedCatColor = b.dataset.color;
    };
  });
  document.getElementById('btn-save-cat').onclick = saveCat;
  openBudgetModal('modal-cat');
}

async function saveCat() {
  const nome = document.getElementById('cat-nome').value.trim();
  const tipo = document.getElementById('cat-tipo').value;
  if (!nome) { alert('Inserisci il nome'); return; }
  if (editingCatId) {
    await db.categorie_budget.update(editingCatId, { nome, tipo, colore: selectedCatColor });
  } else {
    const max = await db.categorie_budget.orderBy('ordine').last();
    await db.categorie_budget.add({ nome, tipo, colore: selectedCatColor, ordine: (max?.ordine||0)+1, attiva:1 });
  }
  window.closeBudgetModal('modal-cat');
  await renderGestione();
}

async function deleteCat(id) {
  if (!confirm('Eliminare questa categoria e tutte le sue voci?')) return;
  const voci = await db.voci_budget.where('categoria_id').equals(id).toArray();
  await Promise.all(voci.map(v => db.voci_budget.delete(v.id)));
  await db.categorie_budget.delete(id);
  await renderGestione();
}

async function toggleCat(id, attiva) {
  await db.categorie_budget.update(id, { attiva: attiva?0:1 });
  await renderGestione();
}

// ── MODAL VOCE ────────────────────────────────────────────────────────────────
async function openVoceModal(voceId=null, catId=null) {
  editingVoceId = voceId;
  const cats = await db.categorie_budget.orderBy('ordine').toArray();
  const sel  = document.getElementById('voce-categoria');
  sel.innerHTML = cats.map(c => `<option value="${c.id}" ${c.id===catId?'selected':''}>${c.nome} (${c.tipo})</option>`).join('');
  if (voceId) {
    const v = await db.voci_budget.get(voceId);
    document.getElementById('modal-voce-title').textContent = 'Modifica voce';
    document.getElementById('voce-nome').value       = v.nome;
    document.getElementById('voce-previsione').value = v.previsione_default||'';
    document.getElementById('voce-tipo').value       = v.tipo_voce||'variabile';
    document.getElementById('voce-note').value       = v.note||'';
    sel.value = v.categoria_id;
  } else {
    document.getElementById('modal-voce-title').textContent = 'Nuova voce';
    ['voce-nome','voce-note'].forEach(id => document.getElementById(id).value='');
    document.getElementById('voce-previsione').value='';
    document.getElementById('voce-tipo').value='variabile';
  }
  document.getElementById('btn-save-voce').onclick = saveVoce;
  openBudgetModal('modal-voce');
}

async function saveVoce() {
  const nome = document.getElementById('voce-nome').value.trim();
  if (!nome) { alert('Inserisci il nome'); return; }
  const catId = parseInt(document.getElementById('voce-categoria').value);
  const data = {
    nome, previsione_default: parseFloat(document.getElementById('voce-previsione').value)||0,
    tipo_voce: document.getElementById('voce-tipo').value,
    note: document.getElementById('voce-note').value.trim(),
    categoria_id: catId
  };
  if (editingVoceId) await db.voci_budget.update(editingVoceId, data);
  else {
    const max = await db.voci_budget.where('categoria_id').equals(catId).last();
    await db.voci_budget.add({ ...data, attiva:1, ordine:(max?.ordine||0)+1 });
  }
  window.closeBudgetModal('modal-voce');
  await renderGestione();
}

async function deleteVoce(id) {
  if (!confirm('Eliminare questa voce?')) return;
  await db.voci_budget.delete(id);
  await renderGestione();
}

async function toggleVoce(id, attiva) {
  await db.voci_budget.update(id, { attiva: attiva?0:1 });
  await renderGestione();
}

// ── HELPERS MODAL ─────────────────────────────────────────────────────────────
function openBudgetModal(id) {
  const o = document.getElementById(id);
  if (!o) return;
  o.classList.remove('hidden');
  requestAnimationFrame(() => o.classList.add('open'));
  lucide.createIcons();
}

function setupGlobalFunctions() {
  window.closeBudgetModal = (id) => {
    const o = document.getElementById(id);
    if (!o) return;
    o.classList.remove('open');
    setTimeout(() => { o.classList.add('hidden'); renderMese(); }, 250);
  };
  window._delMov = async (id) => {
    if (!confirm('Eliminare questo movimento?')) return;
    await db.movimenti_voce.delete(id);
    await refreshMovLista(currentMovVoceId);
  };
  ['modal-reg','modal-cat','modal-voce','modal-movimenti'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(e) {
      if (e.target === this) window.closeBudgetModal(id);
    });
  });
}

// ── DEFAULT CATEGORIE ────────────────────────────────────────────────────────
async function _initDefaultCategorie() {
  const cats = [
    { nome:'Spese Fisse Contrattuali', tipo:'uscita', ordine:1, colore:'#2a78d6', attiva:1, voci:[
      {nome:'Affitto / Rata mutuo',prev:530,tv:'fisso'},{nome:'Mantenimento Figlio 1',prev:500,tv:'fisso'},
      {nome:'Mantenimento ex coniuge',prev:0,tv:'fisso'},{nome:'Assicurazione Auto',prev:39.42,tv:'fisso'},
      {nome:'Telefonia',prev:9.99,tv:'fisso'},{nome:'Finanziamenti',prev:0,tv:'fisso'},
      {nome:'Spese condominiali',prev:0,tv:'fisso'},{nome:'Assicurazione Casa',prev:0,tv:'fisso'}]},
    { nome:'Canoni Bancari', tipo:'uscita', ordine:2, colore:'#444441', attiva:1, voci:[
      {nome:'Canone UniCredit',prev:2.15,tv:'fisso'},{nome:'Canone BPER',prev:6.00,tv:'fisso'},
      {nome:'Imposta bollo c/c',prev:8.55,tv:'fisso',note:'34,20€/anno — trimestrale'}]},
    { nome:'Figli', tipo:'uscita', ordine:3, colore:'#d4720f', attiva:1, voci:[
      {nome:'Istruzione / Nido Figlio 1',prev:0,tv:'variabile'},{nome:'Sport / Attività Figlio 1',prev:0,tv:'variabile'},
      {nome:'Spese Figlio 1',prev:50,tv:'variabile'}]},
    { nome:'Spese Variabili Necessarie', tipo:'uscita', ordine:4, colore:'#1baf7a', attiva:1, voci:[
      {nome:'Utenze Luce + Gas',prev:47.20,tv:'variabile'},{nome:'Utenza Acqua',prev:30,tv:'variabile'},
      {nome:'Alimentari',prev:150,tv:'variabile'},{nome:'Carburante / Auto',prev:100,tv:'variabile'}]},
    { nome:'Spese Discrezionali', tipo:'uscita', ordine:5, colore:'#7c3d9e', attiva:1, voci:[
      {nome:'Abbigliamento',prev:50,tv:'variabile'},{nome:'Bar / Caffè',prev:10,tv:'variabile'},
      {nome:'Cura Persona',prev:0,tv:'variabile'},{nome:'Farmacia / Salute',prev:10,tv:'variabile'},
      {nome:'Hobby / Tempo libero',prev:20,tv:'variabile'},{nome:'Lavanderia',prev:0,tv:'variabile'},
      {nome:'Ristorazione',prev:50,tv:'variabile'},{nome:'Salute / Ottica',prev:0,tv:'variabile'},
      {nome:'Casa / Fai da Te',prev:20,tv:'variabile'},{nome:'Casa / Varie',prev:10,tv:'variabile'},
      {nome:'Autolavaggio',prev:16,tv:'variabile'}]},
    { nome:'Spese Irregolari / Annuali', tipo:'uscita', ordine:6, colore:'#e34948', attiva:1, voci:[
      {nome:'Bollo auto',prev:0,tv:'irregolare'},{nome:'Revisione auto',prev:0,tv:'irregolare'},
      {nome:'Manutenzione auto ordinaria',prev:0,tv:'irregolare'},{nome:'Manutenzione auto straord.',prev:0,tv:'irregolare'},
      {nome:'Ordine professionale',prev:0,tv:'irregolare'},{nome:'Regali / Ricorrenze',prev:0,tv:'irregolare'},
      {nome:'Spese Straordinarie Casa',prev:0,tv:'irregolare'},{nome:'Viaggi / Vacanze',prev:0,tv:'irregolare'}]},
    { nome:'Risparmio e Liquidità', tipo:'uscita', ordine:7, colore:'#1baf7a', attiva:1, voci:[
      {nome:'Fondo emergenza',prev:100,tv:'risparmio'},{nome:'Versamento Conto Deposito 1',prev:0,tv:'risparmio'},
      {nome:'Versamento Conto Deposito 2',prev:0,tv:'risparmio'}]},
    { nome:'Investimento Lungo Termine', tipo:'uscita', ordine:8, colore:'#7c3d9e', attiva:1, voci:[
      {nome:'PAC ETF',prev:100,tv:'risparmio',note:'Orizzonte >10 anni'}]},
    { nome:'Fiscalità', tipo:'uscita', ordine:9, colore:'#5F5E5A', attiva:1, voci:[
      {nome:'F24 / Acconto IRPEF',prev:0,tv:'irregolare'},{nome:'IMU / ICI',prev:0,tv:'irregolare'},
      {nome:'Addizionale regionale',prev:0,tv:'irregolare'},{nome:'Addizionale comunale',prev:0,tv:'irregolare'},
      {nome:'IVA trimestrale',prev:0,tv:'irregolare',note:'Solo P.IVA'},{nome:'Contributi INPS',prev:0,tv:'irregolare',note:'Solo autonomi'},
      {nome:'IRAP',prev:0,tv:'irregolare',note:'Solo P.IVA'},{nome:'Altre imposte',prev:0,tv:'irregolare'}]},
    { nome:'Reddito da Lavoro', tipo:'entrata', ordine:1, colore:'#1baf7a', attiva:1, voci:[
      {nome:'Stipendio netto',prev:2268,tv:'fisso'},{nome:'Tredicesima',prev:0,tv:'irregolare',note:'Solo a dicembre'},
      {nome:'Quattordicesima',prev:0,tv:'irregolare',note:'Solo a luglio se prevista'},
      {nome:'Rimborsi aziendali',prev:0,tv:'variabile',note:'Solo quando incassato'},{nome:'Freelance / Consulenze',prev:0,tv:'variabile'}]},
    { nome:'Rendite da Risparmio', tipo:'entrata', ordine:2, colore:'#d4720f', attiva:1, voci:[
      {nome:'Cedola Conto Deposito 1',prev:0,tv:'variabile',note:'Netto dopo ritenuta 26%'},
      {nome:'Cedola Conto Deposito 2',prev:0,tv:'variabile',note:'Netto dopo ritenuta 26%'},
      {nome:'Interessi attivi',prev:0,tv:'variabile'},{nome:'Dividendi ETF',prev:0,tv:'variabile'}]},
    { nome:'Rimborsi Fiscali', tipo:'entrata', ordine:3, colore:'#2a78d6', attiva:1, voci:[
      {nome:'Rimborso 730',prev:0,tv:'irregolare'},{nome:'Bonus / Detrazioni',prev:0,tv:'irregolare'}]},
    { nome:'Entrate Straordinarie', tipo:'entrata', ordine:4, colore:'#444441', attiva:1, voci:[
      {nome:'Vendite / Altro',prev:0,tv:'variabile'},{nome:'Altre entrate',prev:0,tv:'variabile'}]},
  ];
  for (const cat of cats) {
    const { voci, ...catData } = cat;
    const catId = await db.categorie_budget.add(catData);
    let ord = 1;
    for (const v of voci) {
      await db.voci_budget.add({ categoria_id:catId, nome:v.nome, previsione_default:v.prev||0,
        tipo_voce:v.tv, note:v.note||'', attiva:1, ordine:ord++ });
    }
  }
}
