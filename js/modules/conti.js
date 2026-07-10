/* BudgetMe — conti.js */
import db from '../db.js';
import { formatEur, formatDate, toast, openModal, closeModal,
         confirmAction, today } from '../utils.js';

// Categorie disponibili per i movimenti
const CAT_USCITA = [
  'Affitto/Rata mutuo','Mantenimento Figlio','Assicurazione/Auto',
  'Telefonia','Canone Banca','Imposta bollo c/c','TARI',
  'Utenze Luce+Gas','Utenza Acqua','Alimentari','Carburante/Auto',
  'Autolavaggio','Abbigliamento','Bar/Caffè','Bimbo/Neonato',
  'Farmacia/Salute','Hobby/Tempo libero','Ristorazione','Salute/Ottica',
  'Casa/Fai da Te','Casa/Varie','Bollo auto','Revisione auto',
  'Manutenzione auto','Regali/ricorrenze','Viaggi/Vacanze',
  'Risparmio','Investimento PAC','Tasse','Varie'
];
const CAT_ENTRATA = [
  'Stipendio','Tredicesima','Rimborso aziendale',
  'Cedola/Interesse','Dividendo ETF','Freelance','Altre entrate'
];

let editingContoId = null;
let selectedColor   = '#2a78d6';
let tipoMovimento   = 'uscita';

// ─── RENDER PRINCIPALE ────────────────────────────────────────────────────────
export async function init() {
  // Ridefinisci le funzioni globali ad ogni accesso alla sezione
  window.editConto = async (id) => {
    editingContoId = id;
    const c = await db.conti_correnti.get(id);
    if (!c) return;
    document.getElementById('modal-conto-title').textContent = 'Modifica conto';
    document.getElementById('conto-nome').value  = c.nome;
    document.getElementById('conto-banca').value = c.banca;
    document.getElementById('conto-iban').value  = c.iban || '';
    document.getElementById('conto-saldo').value = c.saldo_iniziale || 0;
    document.getElementById('conto-note').value  = c.note || '';
    selectedColor = c.colore || '#2a78d6';
    document.querySelectorAll('.color-dot').forEach(b =>
      b.classList.toggle('active', b.dataset.color === selectedColor));
    openModal('modal-conto');
    lucide.createIcons();
  };

  window.deleteConto = async (id) => {
    const ok = await confirmAction('Eliminare questo conto? Verranno eliminati anche tutti i movimenti associati.');
    if (!ok) return;
    await db.movimenti_conto.where('conto_id').equals(id).delete();
    await db.conti_correnti.delete(id);
    toast('Conto eliminato');
    await render();
  };

  window.deleteMovimento = async (id) => {
    const ok = await confirmAction('Eliminare questo movimento?');
    if (!ok) return;
    await db.movimenti_conto.delete(id);
    toast('Movimento eliminato');
    await render();
  };

  window.showMovimenti = async (contoId, nome) => {
    const container = document.getElementById('lista-movimenti');
    const title = document.querySelector('.section-title:last-of-type');
    if (title) title.textContent = `Movimenti — ${nome}`;
    await renderMovimentiRecenti(contoId, nome);
  };

  window._nuovoConto = () => {
    editingContoId = null;
    document.getElementById('modal-conto-title').textContent = 'Nuovo conto';
    ['conto-nome','conto-banca','conto-iban','conto-note'].forEach(id =>
      (document.getElementById(id).value = ''));
    document.getElementById('conto-saldo').value = '';
    selectedColor = '#2a78d6';
    document.querySelectorAll('.color-dot').forEach(b =>
      b.classList.toggle('active', b.dataset.color === '#2a78d6'));
    openModal('modal-conto');
    lucide.createIcons();
  };

  await render();
  lucide.createIcons();
}

async function render() {
  const root = document.getElementById('conti-root') ||
               document.getElementById('content');

  const conti = await db.conti_correnti.where('attivo').equals(1).toArray();

  // Calcola saldo reale per ogni conto
  const contiConSaldo = await Promise.all(conti.map(async c => {
    const movimenti = await db.movimenti_conto
      .where('conto_id').equals(c.id).toArray();
    const delta = movimenti.reduce((s, m) => {
      if (m.tipo === 'entrata')       return s + m.importo;
      if (m.tipo === 'uscita')        return s - m.importo;
      if (m.tipo === 'trasferimento' && m.conto_dest_id === c.id) return s + m.importo;
      if (m.tipo === 'trasferimento') return s - m.importo;
      return s;
    }, 0);
    return { ...c, saldoReale: (c.saldo_iniziale || 0) + delta };
  }));

  const totale = contiConSaldo.reduce((s, c) => s + c.saldoReale, 0);

  root.innerHTML = `
    <!-- Saldo consolidato -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">TOTALE LIQUIDITÀ</div>
      <div class="card-value">${formatEur(totale)}</div>
      <div class="card-sub">${contiConSaldo.length} conto/i attivo/i</div>
    </div>

    <!-- Lista conti -->
    <p class="section-title">I tuoi conti</p>
    ${contiConSaldo.length === 0 ? `
      <div class="empty-state">
        <p>Nessun conto aggiunto.<br>Tocca + per aggiungere il primo conto.</p>
      </div>` :
      contiConSaldo.map(c => `
        <div class="conto-card" style="background:${c.colore || '#2a78d6'}">
          <div class="conto-card-actions">
            <button onclick="event.stopPropagation();editConto(${c.id})" aria-label="Modifica"
              style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.25);
                     display:flex;align-items:center;justify-content:center;color:white;
                     cursor:pointer;border:none;position:relative;z-index:30;
                     font-size:15px;line-height:1">
              ✏️
            </button>
            <button onclick="event.stopPropagation();deleteConto(${c.id})" aria-label="Elimina"
              style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.25);
                     display:flex;align-items:center;justify-content:center;color:white;
                     cursor:pointer;border:none;position:relative;z-index:30;
                     font-size:15px;line-height:1">
              🗑️
            </button>
          </div>
          <div class="conto-card-name">${c.nome}</div>
          <div class="conto-card-banca">${c.banca}</div>
          <div class="conto-card-saldo">${formatEur(c.saldoReale)}</div>
          ${c.iban ? `<div class="conto-card-iban">${c.iban}</div>` : ''}
          <div style="margin-top:12px">
            <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;border:none"
              onclick="showMovimenti(${c.id}, '${c.nome.replace(/'/g,"\\'")}')">
              <i data-lucide="list" style="width:14px;height:14px"></i> Movimenti
            </button>
          </div>
        </div>`
      ).join('')
    }

    <!-- Movimenti recenti -->
    <p class="section-title mt-24">Movimenti recenti</p>
    <div id="lista-movimenti" class="card">
      <div class="spinner" style="margin:20px auto"></div>
    </div>
  `;

  await renderMovimentiRecenti();
  setupModalConto();
  setupModalMovimento();
  setupFAB();
  lucide.createIcons();
}

// ─── MOVIMENTI RECENTI ────────────────────────────────────────────────────────
async function renderMovimentiRecenti(contoId = null, contoNome = null) {
  const container = document.getElementById('lista-movimenti');
  if (!container) return;

  let query = db.movimenti_conto.orderBy('data').reverse();
  let movimenti = await query.limit(30).toArray();
  if (contoId) movimenti = movimenti.filter(m => m.conto_id === contoId);

  const conti = await db.conti_correnti.toArray();
  const contiMap = Object.fromEntries(conti.map(c => [c.id, c]));

  if (movimenti.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nessun movimento registrato</p></div>';
    return;
  }

  container.innerHTML = movimenti.map(m => {
    const isEntrata = m.tipo === 'entrata';
    const isTrasf   = m.tipo === 'trasferimento';
    const conto     = contiMap[m.conto_id];
    const segno     = isEntrata ? '+' : isTrasf ? '⇄' : '−';
    const colore    = isEntrata ? 'var(--green)' : isTrasf ? 'var(--blue)' : 'var(--red)';
    return `
      <div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">${m.descrizione || m.categoria || '—'}</div>
          <div class="list-item-sub">
            ${formatDate(m.data)}
            ${conto ? `· <span style="color:${conto.colore}">${conto.nome}</span>` : ''}
            ${m.categoria ? `· ${m.categoria}` : ''}
          </div>
        </div>
        <div class="list-item-right">
          <div class="list-item-amount" style="color:${colore}">
            ${segno} ${formatEur(m.importo)}
          </div>
          <button onclick="deleteMovimento(${m.id})"
            style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">
            elimina
          </button>
        </div>
      </div>`;
  }).join('');
}

// ─── MODAL CONTO ─────────────────────────────────────────────────────────────
function setupModalConto() {
  document.getElementById('btn-close-conto')
    ?.addEventListener('click', () => closeModal('modal-conto'));
  document.getElementById('btn-cancel-conto')
    ?.addEventListener('click', () => closeModal('modal-conto'));

  // Color picker
  document.querySelectorAll('.color-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-dot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.color;
    });
  });

  document.getElementById('btn-save-conto')?.addEventListener('click', saveConto);
}

async function saveConto() {
  const nome   = document.getElementById('conto-nome').value.trim();
  const banca  = document.getElementById('conto-banca').value.trim();
  const iban   = document.getElementById('conto-iban').value.trim();
  const saldo  = parseFloat(document.getElementById('conto-saldo').value) || 0;
  const note   = document.getElementById('conto-note').value.trim();

  if (!nome || !banca) { toast('Compila nome e banca', 'error'); return; }

  const data = { nome, banca, iban, saldo_iniziale: saldo,
                 colore: selectedColor, note, attivo: 1 };

  if (editingContoId) {
    await db.conti_correnti.update(editingContoId, data);
    toast('Conto aggiornato', 'success');
  } else {
    await db.conti_correnti.add(data);
    toast('Conto aggiunto', 'success');
  }
  closeModal('modal-conto');
  editingContoId = null;
  await render();
}

// ─── MODAL MOVIMENTO ─────────────────────────────────────────────────────────
function setupModalMovimento() {
  // Tab tipo
  document.querySelectorAll('[data-tipo]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tipo]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tipoMovimento = btn.dataset.tipo;
      const destGroup = document.getElementById('mov-conto-dest-group');
      const catSelect = document.getElementById('mov-categoria');
      if (destGroup) destGroup.style.display = tipoMovimento === 'trasferimento' ? '' : 'none';
      if (catSelect) popolaCategorie(catSelect);
    });
  });

  document.getElementById('btn-close-movimento')
    ?.addEventListener('click', () => closeModal('modal-movimento'));
  document.getElementById('btn-cancel-movimento')
    ?.addEventListener('click', () => closeModal('modal-movimento'));
  document.getElementById('btn-save-movimento')
    ?.addEventListener('click', saveMovimento);

  // Data default = oggi
  const dataInput = document.getElementById('mov-data');
  if (dataInput) dataInput.value = today();
}

async function popolaSelectConti() {
  const conti = await db.conti_correnti.where('attivo').equals(1).toArray();
  const opts  = conti.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  const sel1  = document.getElementById('mov-conto');
  const sel2  = document.getElementById('mov-conto-dest');
  if (sel1) sel1.innerHTML = opts;
  if (sel2) sel2.innerHTML = opts;
  return conti;
}

function popolaCategorie(select) {
  const cats = tipoMovimento === 'entrata' ? CAT_ENTRATA : CAT_USCITA;
  select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function saveMovimento() {
  const importo = parseFloat(document.getElementById('mov-importo').value);
  const data    = document.getElementById('mov-data').value;
  const contoId = parseInt(document.getElementById('mov-conto').value);
  const cat     = document.getElementById('mov-categoria').value;
  const desc    = document.getElementById('mov-descrizione').value.trim();
  const destId  = tipoMovimento === 'trasferimento'
                  ? parseInt(document.getElementById('mov-conto-dest').value) : null;

  if (!importo || importo <= 0) { toast('Inserisci un importo valido', 'error'); return; }
  if (!data)    { toast('Inserisci la data', 'error'); return; }
  if (!contoId) { toast('Seleziona un conto', 'error'); return; }

  await db.movimenti_conto.add({
    conto_id: contoId, data, tipo: tipoMovimento,
    importo: Math.abs(importo), categoria: cat,
    descrizione: desc, conto_dest_id: destId
  });

  toast('Movimento salvato', 'success');
  closeModal('modal-movimento');
  await render();
}

// ─── FUNZIONI GLOBALI — definite in init() per essere sempre aggiornate

// ─── FAB ─────────────────────────────────────────────────────────────────────
function setupFAB() {
  // FAB "+" per nuovo movimento
  let fab = document.getElementById('fab-conti');
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'fab-conti';
    fab.className = 'fab';
    fab.setAttribute('aria-label', 'Aggiungi movimento');
    fab.innerHTML = '<i data-lucide="plus"></i>';
    document.getElementById('app').appendChild(fab);
  }
  fab.onclick = async () => {
    tipoMovimento = 'uscita';
    document.getElementById('modal-conto-title') &&
      (document.getElementById('modal-conto-title').textContent = 'Nuovo conto');
    document.getElementById('mov-importo').value  = '';
    document.getElementById('mov-descrizione').value = '';
    document.getElementById('mov-data').value = today();
    document.querySelectorAll('[data-tipo]').forEach(b =>
      b.classList.toggle('active', b.dataset.tipo === 'uscita'));
    document.getElementById('mov-conto-dest-group').style.display = 'none';
    await popolaSelectConti();
    popolaCategorie(document.getElementById('mov-categoria'));
    openModal('modal-movimento');
    lucide.createIcons();
  };

  // Pulsante "+ Conto" nell'header
  const headerActions = document.getElementById('header-actions');
  if (headerActions && !document.getElementById('btn-nuovo-conto')) {
    const btn = document.createElement('button');
    btn.id = 'btn-nuovo-conto';
    btn.setAttribute('aria-label', 'Aggiungi conto');
    btn.innerHTML = '<i data-lucide="landmark-plus" style="width:22px;height:22px;color:var(--text-sub)"></i>';
    btn.onclick = () => {
      editingContoId = null;
      document.getElementById('modal-conto-title').textContent = 'Nuovo conto';
      ['conto-nome','conto-banca','conto-iban','conto-note'].forEach(id =>
        (document.getElementById(id).value = ''));
      document.getElementById('conto-saldo').value = '';
      selectedColor = '#2a78d6';
      document.querySelectorAll('.color-dot').forEach(b =>
        b.classList.toggle('active', b.dataset.color === '#2a78d6'));
      openModal('modal-conto');
      lucide.createIcons();
    };
    headerActions.prepend(btn);
  }
}
