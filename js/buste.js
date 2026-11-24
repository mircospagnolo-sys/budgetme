/* BudgetMe — buste.js
   Mappa delle buste e calcoli del Piano, condivisi da Mese (Piano) e dalla Home. */
import db from './db.js';

// ── MAPPA BUSTE ──────────────────────────────────────────────────────────────
// Le voci elencate in "voci" hanno la precedenza sulla categoria.
// I nomi devono coincidere con quelli in Budget → Gestione voci.
export const BUSTE = {
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

export function bustaDi(voceNome, catNome) {
  for (const [busta, def] of Object.entries(BUSTE)) {
    if (def.voci.includes(voceNome)) return busta;
  }
  for (const [busta, def] of Object.entries(BUSTE)) {
    if (def.cat.includes(catNome)) return busta;
  }
  return null;
}

// Piano e reale di ogni voce del mese, raggruppati per busta
export async function calcolaBusteMese(meseId) {
  const [cats, voci, regs, movs, prevMens] = await Promise.all([
    db.categorie_budget.toArray(),
    db.voci_budget.where('attiva').equals(1).toArray(),
    db.registrazioni.where('mese_id').equals(meseId).toArray(),
    db.movimenti_voce.where('mese_id').equals(meseId).toArray(),
    db.previsioni_mensili.where('mese_id').equals(meseId).toArray()
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

const somma = (righe, campo) => righe.reduce((s, r) => s + r[campo], 0);

// Riepilogo del Piano buste del mese, con gli stessi calcoli di Mese → Piano:
// residuo = stipendio − Prima te stesso − obbligazioni; gestione = residuo − spese personali.
export async function calcolaPianoMese(meseId) {
  const [piano, buste] = await Promise.all([
    db.piano_mensile.where('mese_id').equals(meseId).first(),
    calcolaBusteMese(meseId)
  ]);

  // Modifiche manuali alle obbligazioni, salvate per nome voce
  const ovr = {};
  try {
    JSON.parse(piano?.obbligazioni_override || '[]')
      .forEach(o => { ovr[o.nome] = o.importo; });
  } catch (e) {}
  const pianoObbl = buste.obblig.reduce((s, r) => s + (ovr[r.nome] ?? r.piano), 0);

  const stipendio = piano?.stipendio_atteso ?? 2250;
  const prima     = piano?.prima_te_stesso  ?? 200;
  const pers      = piano?.spese_personali  ?? 300;
  const residuo   = stipendio - prima - pianoObbl;

  return {
    salvato:  !!piano,                       // false = valori predefiniti
    entrate:  { piano: stipendio,       reale: somma(buste.entrate, 'reale') },
    prima:    { piano: prima,           reale: somma(buste.prima, 'reale') },
    obblig:   { piano: pianoObbl,       reale: somma(buste.obblig, 'reale') },
    persone:  { piano: pers,            reale: somma(buste.persone, 'reale') },
    gestione: { piano: residuo - pers,  reale: somma(buste.gestione, 'reale') }
  };
}
