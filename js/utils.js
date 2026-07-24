/* BudgetMe — utils.js */

export function formatEur(value, showSign = false) {
  if (value === null || value === undefined || isNaN(value)) return '— €';
  const formatted = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true
  }).format(Math.abs(value));
  if (showSign && value > 0) return '+' + formatted;
  if (value < 0) return '−' + formatted;
  return formatted;
}

export function formatPct(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return (value * 100).toFixed(decimals) + '%';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
}

export function formatMonth(month, year) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('it-IT', { month:'long', year:'numeric' });
}

export function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function interesseSemplice(capitale, tassoLordo, giorni) {
  return capitale * (tassoLordo / 100) * (giorni / 365);
}

export function nettoRitenuta(lordo) { return lordo * 0.74; }
export function ritenuta(lordo)      { return lordo * 0.26; }

export function proiezionePAC(versamento, tassoAnnuo, anni) {
  const mesi = anni * 12;
  const r = tassoAnnuo / 100 / 12;
  if (r === 0) return versamento * mesi;
  return versamento * ((Math.pow(1 + r, mesi) - 1) / r) * (1 + r);
}

export function prezzoMedioCarico(versamenti) {
  const totImporto = versamenti.reduce((s, v) => s + (v.importo_versato || 0), 0);
  const totQuote   = versamenti.reduce((s, v) => s + (v.num_quote || 0), 0);
  return totQuote > 0 ? totImporto / totQuote : 0;
}

export function performance(valoreAttuale, totaleInvestito) {
  if (!totaleInvestito) return 0;
  return (valoreAttuale - totaleInvestito) / totaleInvestito;
}

export function toast(msg, type = 'default', duration = 2500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration);
}

export function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('open'));
}

export function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.classList.add('hidden'), 250);
}

export async function confirmAction(msg = 'Sei sicuro?') {
  return new Promise(resolve => resolve(window.confirm(msg)));
}

export const MESI_NOMI = [
  '','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'
];
