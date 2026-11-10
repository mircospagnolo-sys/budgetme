/* ============================================
   BudgetMe — backup.js
   Export e import JSON del database completo
   + "Inizia un nuovo periodo" (azzera i movimenti, riparte dai saldi reali)
   ============================================ */

import db, { exportAllData, importAllData, saldiContiAl } from './db.js';
import { toast } from './utils.js';

// --- Export ---
// Restituisce true se il file è stato generato, false in caso di errore
export async function downloadBackup() {
  try {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href     = url;
    a.download = `budgetme_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Segna data ultimo backup
    localStorage.setItem('lastBackup', new Date().toISOString());
    toast('Backup scaricato con successo', 'success');
    return true;
  } catch (err) {
    console.error(err);
    toast('Errore durante il backup', 'error');
    return false;
  }
}

// --- Import ---
export function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Conferma distruttiva
    const testo = window.prompt(
      '⚠️ ATTENZIONE: questa operazione sovrascrive TUTTI i dati.\n\nDigita CONFERMA per procedere:'
    );
    if (testo !== 'CONFERMA') {
      toast('Ripristino annullato', 'default');
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validazione minimale struttura
      if (!data.version || !data.mesi) {
        toast('File non valido o danneggiato', 'error');
        return;
      }

      await importAllData(data);
      toast('Dati ripristinati con successo', 'success');

      // Ricarica la pagina per aggiornare tutte le viste
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error(err);
      toast('Errore durante il ripristino', 'error');
    }
  };
  input.click();
}

// --- Reminder backup mensile ---
export function checkBackupReminder() {
  const last = localStorage.getItem('lastBackup');
  if (!last) return true; // mai fatto
  const giorni = (Date.now() - new Date(last)) / (1000 * 60 * 60 * 24);
  return giorni > 30;
}

// --- Nuovo periodo ---
// Tabelle che si svuotano (movimenti, budget registrato, mesi e chiusure).
// Restano conti, categorie e voci, depositi, portafogli, ETF e beni reali.
const TABELLE_DA_AZZERARE = [
  'movimenti_conto', 'movimenti_voce', 'registrazioni',
  'previsioni_mensili', 'riconciliazioni', 'piano_mensile', 'mesi'
];

const escNome = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function iniziaNuovoPeriodo() {
  const { conti, saldi } = await saldiContiAl();
  if (conti.length === 0) { toast('Nessun conto attivo', 'error'); return; }

  document.getElementById('modal-nuovo-periodo')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-nuovo-periodo'; modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Inizia un nuovo periodo</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div style="background:var(--orange-light);color:var(--orange);border-radius:var(--radius-sm);
                  padding:10px 12px;font-size:0.8rem;margin-bottom:12px;line-height:1.45">
        ⚠️ Prima viene scaricato un backup completo. Poi vengono <strong>cancellati</strong>
        movimenti dei conti, Budget registrato, previsioni mensili, piani, mesi e chiusure.
        <br>Restano: conti, categorie e voci, depositi, investimenti e beni reali.
      </div>
      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px">
        Inserisci il saldo reale di ogni conto alla data di inizio. Sarà il saldo di apertura del nuovo periodo.
      </p>
      ${conti.map(c => `
      <div class="form-group">
        <div class="label">${escNome(c.nome)} — saldo reale (€)</div>
        <input type="number" id="np-${c.id}" value="${(saldi[c.id] ?? 0).toFixed(2)}"
               step="0.01" inputmode="decimal">
      </div>`).join('')}
      <div class="form-group">
        <div class="label">Digita AZZERA per confermare</div>
        <input type="text" id="np-conferma" autocomplete="off" autocapitalize="characters">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Annulla</button>
        <button class="btn btn-primary" id="np-esegui">Scarica backup e azzera</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));
  lucide.createIcons();

  document.getElementById('np-esegui').addEventListener('click', async () => {
    // Saldi inseriti, uno per conto
    const valori = [];
    for (const c of conti) {
      const v = parseFloat(document.getElementById(`np-${c.id}`).value);
      if (isNaN(v)) { alert(`Inserisci il saldo di "${c.nome}"`); return; }
      valori.push({ id: c.id, saldo: Math.round(v * 100) / 100 });
    }
    if (document.getElementById('np-conferma').value.trim().toUpperCase() !== 'AZZERA') {
      alert('Digita AZZERA per confermare'); return;
    }

    // 1) backup: se non riesce, non si cancella nulla
    if (!(await downloadBackup())) {
      alert('Backup non riuscito: nessun dato è stato cancellato.');
      return;
    }
    if (!confirm('Controlla che il file budgetme_backup_… sia stato scaricato.\n\nPremi OK per cancellare i movimenti.')) {
      return;
    }

    // 2) azzeramento e nuovi saldi iniziali
    try {
      await db.transaction('rw', TABELLE_DA_AZZERARE.map(t => db[t]), async () => {
        for (const t of TABELLE_DA_AZZERARE) await db[t].clear();
      });
      for (const { id, saldo } of valori) {
        await db.conti_correnti.update(id, { saldo_iniziale: saldo });
      }
      toast('Nuovo periodo pronto', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error(err);
      toast('Errore durante l\'azzeramento', 'error');
    }
  });
}