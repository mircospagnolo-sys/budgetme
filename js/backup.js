/* ============================================
   BudgetMe — backup.js
   Export e import JSON del database completo
   ============================================ */

import { exportAllData, importAllData } from './db.js';
import { toast } from './utils.js';

// --- Export ---
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
  } catch (err) {
    console.error(err);
    toast('Errore durante il backup', 'error');
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
