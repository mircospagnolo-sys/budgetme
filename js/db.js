/* ============================================
   BudgetMe — db.js
   Definizione database IndexedDB via Dexie.js
   ============================================ */

// Dexie.js caricato via CDN nel HTML — disponibile come globale
const db = new Dexie('BudgetMeDB');

db.version(1).stores({
  // Area Budget
  mesi:           '++id, anno, mese',
  voci_uscita:    '++id, mese_id, categoria, conto_id',
  voci_entrata:   '++id, mese_id, categoria, conto_id',
  accantonamenti: '++id, voce',
  crediti_sospeso:'++id, stato, mese_id',
  cedole_budget:  '++id, mese_id, incassata',

  // Area Conti Correnti
  conti_correnti: '++id, nome, attivo',
  movimenti_conto:'++id, conto_id, data, tipo',

  // Area Conti Deposito
  conti_deposito: '++id, banca, stato',
  cedole_deposito:'++id, deposito_id, incassata, data_incasso',

  // Area PAC ETF
  pac_etf:        '++id, nome, broker, attivo',
  pac_versamenti: '++id, pac_id, anno, mese'
});

// --- Helpers generali ---

// Ottieni o crea il mese corrente
export async function getOrCreateMeseCorrente() {
  const now = new Date();
  const anno = now.getFullYear();
  const mese = now.getMonth() + 1;
  let record = await db.mesi.where({ anno, mese }).first();
  if (!record) {
    const id = await db.mesi.add({ anno, mese, note: '', chiuso: false, creato_il: new Date().toISOString() });
    record = await db.mesi.get(id);
  }
  return record;
}

// Somma importi reali uscite per un mese
export async function totaleUsciteMese(mese_id) {
  const voci = await db.voci_uscita.where('mese_id').equals(mese_id).toArray();
  return voci.reduce((s, v) => s + (v.importo_reale || 0), 0);
}

// Somma importi reali entrate per un mese
export async function totaleEntrateMese(mese_id) {
  const voci = await db.voci_entrata.where('mese_id').equals(mese_id).toArray();
  return voci.reduce((s, v) => s + (v.importo_reale || 0), 0);
}

// Saldo consolidato di tutti i conti correnti
export async function saldoContiCorrenti() {
  const conti = await db.conti_correnti.where('attivo').equals(1).toArray();
  let totale = 0;
  for (const conto of conti) {
    const movimenti = await db.movimenti_conto.where('conto_id').equals(conto.id).toArray();
    const deltaMovimenti = movimenti.reduce((s, m) => {
      if (m.tipo === 'entrata') return s + m.importo;
      if (m.tipo === 'uscita')  return s - m.importo;
      return s; // trasferimenti gestiti a parte
    }, 0);
    totale += (conto.saldo_iniziale || 0) + deltaMovimenti;
  }
  return totale;
}

// Valore totale conti deposito (capitale)
export async function totaleDepositi() {
  const depositi = await db.conti_deposito.where('stato').equals('aperto').toArray();
  return depositi.reduce((s, d) => s + (d.importo || 0), 0);
}

// Valore attuale PAC (ultimo versamento con valore_attuale)
export async function valorePAC() {
  const pacs = await db.pac_etf.where('attivo').equals(1).toArray();
  let totale = 0;
  for (const pac of pacs) {
    const versamenti = await db.pac_versamenti.where('pac_id').equals(pac.id).toArray();
    if (versamenti.length === 0) continue;
    // Prende il valore_attuale più recente
    const ultimo = versamenti.sort((a, b) =>
      (b.anno * 100 + b.mese) - (a.anno * 100 + a.mese)
    )[0];
    totale += ultimo.valore_attuale || 0;
  }
  return totale;
}

// Patrimonio netto totale
export async function patrimonioNetto() {
  const [cc, dep, pac] = await Promise.all([
    saldoContiCorrenti(),
    totaleDepositi(),
    valorePAC()
  ]);
  return { cc, dep, pac, totale: cc + dep + pac };
}

// Esporta tutto il DB come oggetto JS
export async function exportAllData() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    mesi:            await db.mesi.toArray(),
    voci_uscita:     await db.voci_uscita.toArray(),
    voci_entrata:    await db.voci_entrata.toArray(),
    accantonamenti:  await db.accantonamenti.toArray(),
    crediti_sospeso: await db.crediti_sospeso.toArray(),
    cedole_budget:   await db.cedole_budget.toArray(),
    conti_correnti:  await db.conti_correnti.toArray(),
    movimenti_conto: await db.movimenti_conto.toArray(),
    conti_deposito:  await db.conti_deposito.toArray(),
    cedole_deposito: await db.cedole_deposito.toArray(),
    pac_etf:         await db.pac_etf.toArray(),
    pac_versamenti:  await db.pac_versamenti.toArray()
  };
}

// Importa dati da un backup JSON (sovrascrive tutto)
export async function importAllData(data) {
  await db.transaction('rw',
    db.mesi, db.voci_uscita, db.voci_entrata, db.accantonamenti,
    db.crediti_sospeso, db.cedole_budget, db.conti_correnti,
    db.movimenti_conto, db.conti_deposito, db.cedole_deposito,
    db.pac_etf, db.pac_versamenti,
    async () => {
      await db.mesi.clear();            await db.mesi.bulkAdd(data.mesi || []);
      await db.voci_uscita.clear();     await db.voci_uscita.bulkAdd(data.voci_uscita || []);
      await db.voci_entrata.clear();    await db.voci_entrata.bulkAdd(data.voci_entrata || []);
      await db.accantonamenti.clear();  await db.accantonamenti.bulkAdd(data.accantonamenti || []);
      await db.crediti_sospeso.clear(); await db.crediti_sospeso.bulkAdd(data.crediti_sospeso || []);
      await db.cedole_budget.clear();   await db.cedole_budget.bulkAdd(data.cedole_budget || []);
      await db.conti_correnti.clear();  await db.conti_correnti.bulkAdd(data.conti_correnti || []);
      await db.movimenti_conto.clear(); await db.movimenti_conto.bulkAdd(data.movimenti_conto || []);
      await db.conti_deposito.clear();  await db.conti_deposito.bulkAdd(data.conti_deposito || []);
      await db.cedole_deposito.clear(); await db.cedole_deposito.bulkAdd(data.cedole_deposito || []);
      await db.pac_etf.clear();         await db.pac_etf.bulkAdd(data.pac_etf || []);
      await db.pac_versamenti.clear();  await db.pac_versamenti.bulkAdd(data.pac_versamenti || []);
    }
  );
}

export default db;
