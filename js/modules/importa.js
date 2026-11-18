/* BudgetMe — importa.js
   Import dell'estratto conto BPER (PDF "Riepilogo mensile").
   Il file viene letto nel browser: non viene caricato da nessuna parte. */
import db from '../db.js';
import { parseBperPagine, pulisciDescrizione, riconosciGiroconto, segnaDuplicati } from '../estrattoBper.js';
import { formatEur, formatDate, toast } from '../utils.js';

const PDFJS_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Stato dell'import in corso
let stato = { conti: [], contoId: null, righe: [], onFatto: null };

function caricaPdfJs() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve();
  }
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = PDFJS_URL;
    s.onload = ok;
    s.onerror = () => ko(new Error('Impossibile caricare la libreria di lettura PDF (serve la connessione).'));
    document.head.appendChild(s);
  }).then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; });
}

async function leggiPagine(file) {
  const buf = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pagine = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    pagine.push(tc.items.map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  return pagine;
}

function chiudi() {
  const m = document.getElementById('modal-import');
  if (!m) return;
  m.classList.remove('open');
  setTimeout(() => m.remove(), 250);
}

// ── Apertura ─────────────────────────────────────────────────────────────────
export async function apriImportEstratto(onFatto) {
  const conti = await db.conti_correnti.where('attivo').equals(1).toArray();
  if (conti.length === 0) {
    alert('Aggiungi prima un conto in Patrimonio → Conti.');
    return;
  }
  stato = { conti, contoId: conti[0].id, righe: [], onFatto };

  document.getElementById('modal-import')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-import'; modal.className = 'modal-overlay hidden';
  modal.innerHTML = `<div class="modal" id="imp-box"></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) chiudi(); });

  disegnaPasso1();
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));
}

// ── Passo 1: conto e file ────────────────────────────────────────────────────
function disegnaPasso1() {
  const box = document.getElementById('imp-box');
  box.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">Importa estratto conto</h2>
      <button class="modal-close" id="imp-x"><i data-lucide="x"></i></button>
    </div>
    <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px">
      Formato supportato: BPER, "Riepilogo mensile" in PDF. Il file resta sul tuo dispositivo.
    </p>
    <div class="form-group">
      <div class="label">Conto *</div>
      <select id="imp-conto">
        ${stato.conti.map(c => `<option value="${c.id}" ${c.id === stato.contoId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <div class="label">File PDF *</div>
      <input type="file" id="imp-file" accept="application/pdf,.pdf">
    </div>
    <div class="form-group">
      <div class="label">Il tuo nome e cognome</div>
      <input type="text" id="imp-titolare" placeholder="come compare in banca"
             value="${esc(localStorage.getItem('bm_titolare') || '')}">
      <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">
        Serve solo a riconoscere i giroconti tra i tuoi conti. Resta su questo dispositivo.
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="imp-annulla">Annulla</button>
      <button class="btn btn-primary" id="imp-leggi">Leggi estratto</button>
    </div>`;
  lucide.createIcons();
  document.getElementById('imp-x').onclick = chiudi;
  document.getElementById('imp-annulla').onclick = chiudi;
  document.getElementById('imp-leggi').onclick = leggiEstratto;
}

async function leggiEstratto() {
  const contoId  = parseInt(document.getElementById('imp-conto').value);
  const file     = document.getElementById('imp-file').files[0];
  const titolare = document.getElementById('imp-titolare').value.trim();
  if (!file) { alert('Scegli il file PDF dell\'estratto conto'); return; }

  const bottone = document.getElementById('imp-leggi');
  bottone.disabled = true; bottone.textContent = 'Lettura in corso…';
  try {
    localStorage.setItem('bm_titolare', titolare);
    stato.contoId = contoId;
    await caricaPdfJs();
    const righe = parseBperPagine(await leggiPagine(file));
    if (righe.length === 0) {
      alert('Nessun movimento riconosciuto. Controlla che sia il "Riepilogo mensile" BPER in PDF, con il testo selezionabile.');
      bottone.disabled = false; bottone.textContent = 'Leggi estratto';
      return;
    }
    const esistenti = await db.movimenti_conto.toArray();
    const gia = segnaDuplicati(righe, esistenti, contoId);
    stato.righe = righe.map((r, i) => ({
      ...r,
      desc: pulisciDescrizione(r.raw),
      gia: gia[i],
      includi: !gia[i],
      sembraGiro: riconosciGiroconto(r.raw, r.tipo, titolare),
      giro: ''
    }));
    disegnaPasso2();
  } catch (err) {
    console.error(err);
    alert('Errore nella lettura del PDF: ' + err.message);
    bottone.disabled = false; bottone.textContent = 'Leggi estratto';
  }
}

// ── Passo 2: anteprima ───────────────────────────────────────────────────────
function disegnaPasso2() {
  const box = document.getElementById('imp-box');
  const altri = stato.conti.filter(c => c.id !== stato.contoId);
  const conto = stato.conti.find(c => c.id === stato.contoId);
  const date = stato.righe.map(r => r.data).sort();
  const nuove = stato.righe.filter(r => !r.gia).length;
  const gia   = stato.righe.length - nuove;

  box.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">Anteprima import</h2>
      <button class="modal-close" id="imp-x"><i data-lucide="x"></i></button>
    </div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px;font-size:0.82rem">
      <strong>${esc(conto?.nome || '')}</strong> · dal ${formatDate(date[0])} al ${formatDate(date[date.length - 1])}<br>
      Letti ${stato.righe.length} movimenti: <strong>${nuove} nuovi</strong>${gia ? `, ${gia} già presenti (esclusi)` : ''}.
      <div id="imp-tot" style="margin-top:4px;color:var(--text-muted)"></div>
    </div>
    <div style="max-height:46vh;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 8px;margin-bottom:10px">
      ${stato.righe.map((r, i) => `
      <div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;
                  ${i > 0 ? 'border-top:1px solid var(--border);' : ''}opacity:${r.gia ? 0.5 : 1}">
        <input type="checkbox" data-i="${i}" ${r.includi ? 'checked' : ''} style="margin-top:3px">
        <div style="flex:1;min-width:0">
          <div style="font-size:0.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis">${esc(r.desc)}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${formatDate(r.data)}${r.gia ? ' · già presente' : ''}</div>
          ${r.sembraGiro && !r.gia ? (altri.length ? `
          <select data-g="${i}" style="margin-top:4px;font-size:0.75rem;padding:3px 6px;
                  border:1px solid var(--orange);border-radius:6px;background:var(--bg-card);color:var(--text)">
            <option value="">Sembra un giroconto: lascia come movimento</option>
            ${altri.map(c => `<option value="${c.id}">Trasferimento con ${esc(c.nome)}</option>`).join('')}
          </select>` : `
          <div style="font-size:0.7rem;color:var(--orange)">sembra un giroconto</div>`) : ''}
        </div>
        <div style="font-size:0.85rem;font-weight:700;white-space:nowrap;
                    color:${r.tipo === 'entrata' ? 'var(--green)' : 'var(--red)'}">
          ${r.tipo === 'entrata' ? '+' : '−'} ${formatEur(r.importo)}
        </div>
      </div>`).join('')}
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="imp-indietro">Indietro</button>
      <button class="btn btn-primary" id="imp-salva">Importa</button>
    </div>`;
  lucide.createIcons();

  document.getElementById('imp-x').onclick = chiudi;
  document.getElementById('imp-indietro').onclick = disegnaPasso1;
  document.getElementById('imp-salva').onclick = salva;
  box.querySelectorAll('input[type=checkbox][data-i]').forEach(cb =>
    cb.addEventListener('change', () => {
      stato.righe[cb.dataset.i].includi = cb.checked;
      aggiornaTotali();
    }));
  box.querySelectorAll('select[data-g]').forEach(sel =>
    sel.addEventListener('change', () => { stato.righe[sel.dataset.g].giro = sel.value; }));
  aggiornaTotali();
}

function aggiornaTotali() {
  const sel = stato.righe.filter(r => r.includi);
  const ent = sel.filter(r => r.tipo === 'entrata').reduce((s, r) => s + r.importo, 0);
  const usc = sel.filter(r => r.tipo === 'uscita').reduce((s, r) => s + r.importo, 0);
  const tot = document.getElementById('imp-tot');
  if (tot) tot.textContent = `Selezionati ${sel.length}: entrate ${formatEur(ent)} · uscite ${formatEur(usc)}`;
  const b = document.getElementById('imp-salva');
  if (b) { b.disabled = sel.length === 0; b.textContent = sel.length ? `Importa ${sel.length}` : 'Importa'; }
}

// ── Salvataggio ──────────────────────────────────────────────────────────────
async function salva() {
  const sel = stato.righe.filter(r => r.includi);
  if (sel.length === 0) return;
  const bottone = document.getElementById('imp-salva');
  bottone.disabled = true; bottone.textContent = 'Salvataggio…';

  try {
    for (const r of sel) {
      const altro = r.giro ? parseInt(r.giro) : null;
      if (altro) {
        // Trasferimento: per un'uscita l'origine è questo conto, per un'entrata è l'altro
        const [origine, destinazione] = r.tipo === 'uscita'
          ? [stato.contoId, altro] : [altro, stato.contoId];
        await db.movimenti_conto.add({
          conto_id: origine, conto_dest_id: destinazione, data: r.data, tipo: 'trasferimento',
          importo: r.importo, descrizione: r.desc, categoria: null,
          categorizzato: 0, voce_budget_id: null, dettaglio: r.raw
        });
      } else {
        await db.movimenti_conto.add({
          conto_id: stato.contoId, data: r.data, tipo: r.tipo, importo: r.importo,
          descrizione: r.desc, categoria: null, conto_dest_id: null,
          categorizzato: 0, voce_budget_id: null, dettaglio: r.raw
        });
      }
    }
    const ultima = sel.map(r => r.data).sort().pop();
    toast(`Importati ${sel.length} movimenti`, 'success');
    chiudi();
    if (stato.onFatto) await stato.onFatto(parseInt(ultima.slice(0, 4)), parseInt(ultima.slice(5, 7)));
  } catch (err) {
    console.error(err);
    alert('Errore durante il salvataggio: ' + err.message + '\nControlla i movimenti prima di riprovare.');
    bottone.disabled = false; aggiornaTotali();
  }
}
