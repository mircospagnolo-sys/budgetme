/* ============================================
   BudgetMe — db.js  (v2.1)
   Database IndexedDB via Dexie.js
   ============================================ */

async function triggerAutoSync() {
  try {
    const { scheduleSync } = await import('./sync.js');
    scheduleSync();
  } catch(e) {}
}

const db = new Dexie('BudgetMeDB');

db.version(1).stores({
  mesi:'++id,anno,mese',voci_uscita:'++id,mese_id,categoria,conto_id',
  voci_entrata:'++id,mese_id,categoria,conto_id',accantonamenti:'++id,voce',
  crediti_sospeso:'++id,stato,mese_id',cedole_budget:'++id,mese_id,incassata',
  conti_correnti:'++id,nome,attivo',movimenti_conto:'++id,conto_id,data,tipo',
  conti_deposito:'++id,banca,stato',cedole_deposito:'++id,deposito_id,incassata,data_incasso',
  pac_etf:'++id,nome,broker,attivo',pac_versamenti:'++id,pac_id,anno,mese'
});

db.version(2).stores({
  mesi:'++id,anno,mese',voci_uscita:'++id,mese_id,categoria,conto_id',
  voci_entrata:'++id,mese_id,categoria,conto_id',accantonamenti:'++id,voce',
  crediti_sospeso:'++id,stato,mese_id',cedole_budget:'++id,mese_id,incassata',
  conti_correnti:'++id,nome,attivo',movimenti_conto:'++id,conto_id,data,tipo',
  conti_deposito:'++id,banca,stato',cedole_deposito:'++id,deposito_id,incassata,data_incasso',
  pac_etf:'++id,nome,broker,attivo',pac_versamenti:'++id,pac_id,anno,mese',
  categorie_budget:'++id,tipo,ordine,attiva',
  voci_budget:'++id,categoria_id,ordine,attiva',
  registrazioni:'++id,voce_id,mese_id,[voce_id+mese_id]'
}).upgrade(async tx => {
  const n = await tx.table('categorie_budget').count();
  if (n === 0) await _insertDefaults(tx.table.bind(tx));
});

// ── DEFAULT CATEGORIE ─────────────────────────────────────────────────────────
const DEFAULT_CATS = [
  { nome:'Spese Fisse Contrattuali', tipo:'uscita',  ordine:1, colore:'#2a78d6', attiva:1, voci:[
    {nome:'Affitto / Rata mutuo',       prev:530,   tv:'fisso'},
    {nome:'Mantenimento Figlio 1',       prev:500,   tv:'fisso'},
    {nome:'Mantenimento ex coniuge',     prev:0,     tv:'fisso'},
    {nome:'Assicurazione Auto',          prev:39.42, tv:'fisso'},
    {nome:'Telefonia',                   prev:9.99,  tv:'fisso'},
    {nome:'Finanziamenti',               prev:0,     tv:'fisso'},
    {nome:'Spese condominiali',          prev:0,     tv:'fisso'},
    {nome:'Assicurazione Casa',          prev:0,     tv:'fisso'},
  ]},
  { nome:'Canoni Bancari', tipo:'uscita', ordine:2, colore:'#444441', attiva:1, voci:[
    {nome:'Canone UniCredit',            prev:2.15,  tv:'fisso'},
    {nome:'Canone BPER',                 prev:6.00,  tv:'fisso'},
    {nome:'Imposta bollo c/c',           prev:8.55,  tv:'fisso', note:'34,20€/anno — trimestrale'},
  ]},
  { nome:'Figli', tipo:'uscita', ordine:3, colore:'#d4720f', attiva:1, voci:[
    {nome:'Istruzione / Nido Figlio 1',  prev:0,     tv:'variabile'},
    {nome:'Sport / Attività Figlio 1',   prev:0,     tv:'variabile'},
    {nome:'Spese Figlio 1',              prev:50,    tv:'variabile'},
  ]},
  { nome:'Spese Variabili Necessarie', tipo:'uscita', ordine:4, colore:'#1baf7a', attiva:1, voci:[
    {nome:'Utenze Luce + Gas',           prev:47.20, tv:'variabile'},
    {nome:'Utenza Acqua',                prev:30,    tv:'variabile'},
    {nome:'Alimentari',                  prev:150,   tv:'variabile'},
    {nome:'Carburante / Auto',           prev:100,   tv:'variabile'},
  ]},
  { nome:'Spese Discrezionali', tipo:'uscita', ordine:5, colore:'#7c3d9e', attiva:1, voci:[
    {nome:'Abbigliamento',               prev:50,    tv:'variabile'},
    {nome:'Bar / Caffè',                 prev:10,    tv:'variabile'},
    {nome:'Cura Persona',                prev:0,     tv:'variabile'},
    {nome:'Farmacia / Salute',           prev:10,    tv:'variabile'},
    {nome:'Hobby / Tempo libero',        prev:20,    tv:'variabile'},
    {nome:'Lavanderia',                  prev:0,     tv:'variabile'},
    {nome:'Ristorazione',                prev:50,    tv:'variabile'},
    {nome:'Salute / Ottica',             prev:0,     tv:'variabile'},
    {nome:'Casa / Fai da Te',            prev:20,    tv:'variabile'},
    {nome:'Casa / Varie',                prev:10,    tv:'variabile'},
    {nome:'Autolavaggio',                prev:16,    tv:'variabile'},
  ]},
  { nome:'Spese Irregolari / Annuali', tipo:'uscita', ordine:6, colore:'#e34948', attiva:1, voci:[
    {nome:'Bollo auto',                  prev:0,     tv:'irregolare'},
    {nome:'Revisione auto',              prev:0,     tv:'irregolare'},
    {nome:'Manutenzione auto ordinaria', prev:0,     tv:'irregolare'},
    {nome:'Manutenzione auto straord.',  prev:0,     tv:'irregolare'},
    {nome:'Ordine professionale',        prev:0,     tv:'irregolare'},
    {nome:'Regali / Ricorrenze',         prev:0,     tv:'irregolare'},
    {nome:'Spese Straordinarie Casa',    prev:0,     tv:'irregolare'},
    {nome:'Viaggi / Vacanze',            prev:0,     tv:'irregolare'},
  ]},
  { nome:'Risparmio e Liquidità', tipo:'uscita', ordine:7, colore:'#1baf7a', attiva:1, voci:[
    {nome:'Fondo emergenza',             prev:100,   tv:'risparmio'},
    {nome:'Versamento Conto Deposito 1', prev:0,     tv:'risparmio'},
    {nome:'Versamento Conto Deposito 2', prev:0,     tv:'risparmio'},
  ]},
  { nome:'Investimento Lungo Termine', tipo:'uscita', ordine:8, colore:'#7c3d9e', attiva:1, voci:[
    {nome:'PAC ETF',                     prev:100,   tv:'risparmio', note:'Orizzonte >10 anni'},
  ]},
  { nome:'Fiscalità', tipo:'uscita', ordine:9, colore:'#5F5E5A', attiva:1, voci:[
    {nome:'F24 / Acconto IRPEF',         prev:0,     tv:'irregolare'},
    {nome:'IMU / ICI',                   prev:0,     tv:'irregolare'},
    {nome:'Addizionale regionale',       prev:0,     tv:'irregolare'},
    {nome:'Addizionale comunale',        prev:0,     tv:'irregolare'},
    {nome:'IVA trimestrale',             prev:0,     tv:'irregolare', note:'Solo P.IVA'},
    {nome:'Contributi INPS',             prev:0,     tv:'irregolare', note:'Solo autonomi'},
    {nome:'IRAP',                        prev:0,     tv:'irregolare', note:'Solo P.IVA'},
    {nome:'Altre imposte',               prev:0,     tv:'irregolare'},
  ]},
  { nome:'Reddito da Lavoro', tipo:'entrata', ordine:1, colore:'#1baf7a', attiva:1, voci:[
    {nome:'Stipendio netto',             prev:2268,  tv:'fisso'},
    {nome:'Tredicesima',                 prev:0,     tv:'irregolare', note:'Solo a dicembre'},
    {nome:'Quattordicesima',             prev:0,     tv:'irregolare', note:'Solo a luglio se prevista'},
    {nome:'Rimborsi aziendali',          prev:0,     tv:'variabile',  note:'Solo quando incassato'},
    {nome:'Freelance / Consulenze',      prev:0,     tv:'variabile'},
  ]},
  { nome:'Rendite da Risparmio', tipo:'entrata', ordine:2, colore:'#d4720f', attiva:1, voci:[
    {nome:'Cedola Conto Deposito 1',     prev:0,     tv:'variabile',  note:'Netto dopo ritenuta 26%'},
    {nome:'Cedola Conto Deposito 2',     prev:0,     tv:'variabile',  note:'Netto dopo ritenuta 26%'},
    {nome:'Interessi attivi',            prev:0,     tv:'variabile'},
    {nome:'Dividendi ETF',               prev:0,     tv:'variabile'},
  ]},
  { nome:'Rimborsi Fiscali', tipo:'entrata', ordine:3, colore:'#2a78d6', attiva:1, voci:[
    {nome:'Rimborso 730',                prev:0,     tv:'irregolare'},
    {nome:'Bonus / Detrazioni',          prev:0,     tv:'irregolare'},
  ]},
  { nome:'Entrate Straordinarie', tipo:'entrata', ordine:4, colore:'#444441', attiva:1, voci:[
    {nome:'Vendite / Altro',             prev:0,     tv:'variabile'},
    {nome:'Altre entrate',               prev:0,     tv:'variabile'},
  ]},
];

async function _insertDefaults(getTable) {
  for (const cat of DEFAULT_CATS) {
    const { voci, ...catData } = cat;
    const catTable  = typeof getTable === 'function' ? getTable('categorie_budget') : db.categorie_budget;
    const voceTable = typeof getTable === 'function' ? getTable('voci_budget')      : db.voci_budget;
    const catId = await catTable.add(catData);
    let ord = 1;
    for (const v of voci) {
      await voceTable.add({
        categoria_id: catId, nome: v.nome,
        previsione_default: v.prev || 0,
        tipo_voce: v.tv, note: v.note || '',
        attiva: 1, ordine: ord++
      });
    }
  }
}

// Funzione pubblica per ripopolare se vuoto
export async function ensureDefaultCategorie() {
  const n = await db.categorie_budget.count();
  if (n === 0) await _insertDefaults(null);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
db.version(7).stores({
  mesi:                   '++id, anno, mese, stato',
  voci_uscita:            '++id, mese_id, categoria, conto_id',
  voci_entrata:           '++id, mese_id, categoria, conto_id',
  accantonamenti:         '++id, voce',
  crediti_sospeso:        '++id, stato, mese_id',
  cedole_budget:          '++id, mese_id, incassata',
  conti_correnti:         '++id, nome, attivo',
  movimenti_conto:        '++id, conto_id, data, tipo, categorizzato',
  conti_deposito:         '++id, banca, stato',
  vincoli_deposito:       '++id, deposito_id, stato, data_scadenza',
  cedole_deposito:        '++id, deposito_id, vincolo_id, incassata, data_incasso',
  pac_etf:                '++id, nome, broker, attivo',
  pac_versamenti:         '++id, pac_id, anno, mese',
  categorie_budget:       '++id, tipo, ordine, attiva',
  voci_budget:            '++id, categoria_id, ordine, attiva',
  registrazioni:          '++id, voce_id, mese_id, [voce_id+mese_id]',
  portafogli:             '++id, nome, attivo',
  strumenti_portafoglio:  '++id, portafoglio_id, tipo_asset, attivo',
  movimenti_portafoglio:  '++id, strumento_id, data, tipo_movimento',
  beni_reali:             '++id, categoria, attivo',
  movimenti_voce:         '++id, voce_id, mese_id, data',
  previsioni_mensili:     '++id, voce_id, mese_id, [voce_id+mese_id]',
  riconciliazioni:        '++id, mese_id, conto_id',
  piano_mensile:          '++id, mese_id'
});

// Versione 6: aggiunge previsioni_mensili e riconciliazioni
db.version(6).stores({
  mesi:                   '++id, anno, mese, stato',
  voci_uscita:            '++id, mese_id, categoria, conto_id',
  voci_entrata:           '++id, mese_id, categoria, conto_id',
  accantonamenti:         '++id, voce',
  crediti_sospeso:        '++id, stato, mese_id',
  cedole_budget:          '++id, mese_id, incassata',
  conti_correnti:         '++id, nome, attivo',
  movimenti_conto:        '++id, conto_id, data, tipo, categorizzato',
  conti_deposito:         '++id, banca, stato',
  vincoli_deposito:       '++id, deposito_id, stato, data_scadenza',
  cedole_deposito:        '++id, deposito_id, vincolo_id, incassata, data_incasso',
  pac_etf:                '++id, nome, broker, attivo',
  pac_versamenti:         '++id, pac_id, anno, mese',
  categorie_budget:       '++id, tipo, ordine, attiva',
  voci_budget:            '++id, categoria_id, ordine, attiva',
  registrazioni:          '++id, voce_id, mese_id, [voce_id+mese_id]',
  portafogli:             '++id, nome, attivo',
  strumenti_portafoglio:  '++id, portafoglio_id, tipo_asset, attivo',
  movimenti_portafoglio:  '++id, strumento_id, data, tipo_movimento',
  beni_reali:             '++id, categoria, attivo',
  movimenti_voce:         '++id, voce_id, mese_id, data',
  previsioni_mensili:     '++id, voce_id, mese_id, [voce_id+mese_id]',
  riconciliazioni:        '++id, mese_id, conto_id'
});

// ── VERSIONE 5: aggiunge movimenti_voce ──────────────────────────────────
db.version(5).stores({
  mesi:                   '++id, anno, mese',
  voci_uscita:            '++id, mese_id, categoria, conto_id',
  voci_entrata:           '++id, mese_id, categoria, conto_id',
  accantonamenti:         '++id, voce',
  crediti_sospeso:        '++id, stato, mese_id',
  cedole_budget:          '++id, mese_id, incassata',
  conti_correnti:         '++id, nome, attivo',
  movimenti_conto:        '++id, conto_id, data, tipo',
  conti_deposito:         '++id, banca, stato',
  vincoli_deposito:       '++id, deposito_id, stato, data_scadenza',
  cedole_deposito:        '++id, deposito_id, vincolo_id, incassata, data_incasso',
  pac_etf:                '++id, nome, broker, attivo',
  pac_versamenti:         '++id, pac_id, anno, mese',
  categorie_budget:       '++id, tipo, ordine, attiva',
  voci_budget:            '++id, categoria_id, ordine, attiva',
  registrazioni:          '++id, voce_id, mese_id, [voce_id+mese_id]',
  portafogli:             '++id, nome, attivo',
  strumenti_portafoglio:  '++id, portafoglio_id, tipo_asset, attivo',
  movimenti_portafoglio:  '++id, strumento_id, data, tipo_movimento',
  beni_reali:             '++id, categoria, attivo',
  movimenti_voce:         '++id, voce_id, mese_id, data'
});

// ── VERSIONE 4: aggiunge portafoglio investimenti ─────────────────────────
db.version(4).stores({
  mesi:                   '++id, anno, mese',
  voci_uscita:            '++id, mese_id, categoria, conto_id',
  voci_entrata:           '++id, mese_id, categoria, conto_id',
  accantonamenti:         '++id, voce',
  crediti_sospeso:        '++id, stato, mese_id',
  cedole_budget:          '++id, mese_id, incassata',
  conti_correnti:         '++id, nome, attivo',
  movimenti_conto:        '++id, conto_id, data, tipo',
  conti_deposito:         '++id, banca, stato',
  vincoli_deposito:       '++id, deposito_id, stato, data_scadenza',
  cedole_deposito:        '++id, deposito_id, vincolo_id, incassata, data_incasso',
  pac_etf:                '++id, nome, broker, attivo',
  pac_versamenti:         '++id, pac_id, anno, mese',
  categorie_budget:       '++id, tipo, ordine, attiva',
  voci_budget:            '++id, categoria_id, ordine, attiva',
  registrazioni:          '++id, voce_id, mese_id, [voce_id+mese_id]',
  // NUOVE v4
  portafogli:             '++id, nome, attivo',
  strumenti_portafoglio:  '++id, portafoglio_id, tipo_asset, attivo',
  movimenti_portafoglio:  '++id, strumento_id, data, tipo_movimento',
  beni_reali:             '++id, categoria, attivo'
});

// ── VERSIONE 3: aggiunge vincoli_deposito ────────────────────────────────────
db.version(3).stores({
  mesi:               '++id, anno, mese',
  voci_uscita:        '++id, mese_id, categoria, conto_id',
  voci_entrata:       '++id, mese_id, categoria, conto_id',
  accantonamenti:     '++id, voce',
  crediti_sospeso:    '++id, stato, mese_id',
  cedole_budget:      '++id, mese_id, incassata',
  conti_correnti:     '++id, nome, attivo',
  movimenti_conto:    '++id, conto_id, data, tipo',
  conti_deposito:     '++id, banca, stato',
  vincoli_deposito:   '++id, deposito_id, stato, data_scadenza',
  cedole_deposito:    '++id, deposito_id, vincolo_id, incassata, data_incasso',
  pac_etf:            '++id, nome, broker, attivo',
  pac_versamenti:     '++id, pac_id, anno, mese',
  categorie_budget:   '++id, tipo, ordine, attiva',
  voci_budget:        '++id, categoria_id, ordine, attiva',
  registrazioni:      '++id, voce_id, mese_id, [voce_id+mese_id]'
});

function patchTableForSync(table) {
  const origAdd    = table.add.bind(table);
  const origPut    = table.put.bind(table);
  const origUpdate = table.update.bind(table);
  const origDelete = table.delete.bind(table);
  table.add    = async (...a) => { const r = await origAdd(...a);    triggerAutoSync(); return r; };
  table.put    = async (...a) => { const r = await origPut(...a);    triggerAutoSync(); return r; };
  table.update = async (...a) => { const r = await origUpdate(...a); triggerAutoSync(); return r; };
  table.delete = async (...a) => { const r = await origDelete(...a); triggerAutoSync(); return r; };
}

db.on('ready', () => {
  ['mesi','voci_uscita','voci_entrata','accantonamenti','crediti_sospeso',
   'cedole_budget','conti_correnti','movimenti_conto','conti_deposito','vincoli_deposito',
   'cedole_deposito','pac_etf','pac_versamenti','categorie_budget','voci_budget',
   'registrazioni','portafogli','strumenti_portafoglio','movimenti_portafoglio',
   'beni_reali','movimenti_voce','previsioni_mensili','riconciliazioni','piano_mensile']
  .forEach(t => { if (db[t]) patchTableForSync(db[t]); });
});

// ── INIT DEFAULT PORTAFOGLIO ─────────────────────────────────────────────────
let _pfInitPromise = null;  // singleton: previene race condition su Promise.all

async function initPortafoglioDefaults() {
  if (_pfInitPromise) return _pfInitPromise;
  _pfInitPromise = _doInitPortafoglioDefaults();
  return _pfInitPromise;
}

async function _doInitPortafoglioDefaults() {
  try {
    const count = await db.portafogli.count();
    if (count > 0) return; // già inizializzato

    // Portafoglio Trade Republic
    const pfId = await db.portafogli.add({
      nome: 'Trade Republic', broker: 'Trade Republic',
      tipo: 'broker', note: 'PAC mensile ETF', attivo: 1
    });

    // ETF
    await db.strumenti_portafoglio.add({
      portafoglio_id: pfId,
      nome: 'UBS Core MSCI World UCITS ETF USD Acc',
      ticker: 'UETW', isin: 'IE00BD4TXV59',
      tipo_asset: 'etf_azionario', strategia: 'pac', modalita: 'accumulo',
      valuta: 'EUR', note: 'World developed markets',
      quantita: 110.376808, prezzo_attuale: 39.12,
      valore_attuale: 4317.94, capitale_investito: 3780.41,
      acquisto_medio: 34.25, attivo: 1
    });
    await db.strumenti_portafoglio.add({
      portafoglio_id: pfId,
      nome: 'iShares Core MSCI Emerging Markets IMI UCITS ETF (Acc)',
      ticker: 'IS3N', isin: 'IE00B4KM4GZ66',
      tipo_asset: 'etf_azionario', strategia: 'pac', modalita: 'accumulo',
      valuta: 'EUR', note: 'Emerging markets',
      quantita: 49.883695, prezzo_attuale: 48.19,
      valore_attuale: 2403.90, capitale_investito: 1760.89,
      acquisto_medio: 35.30, attivo: 1
    });

    // Oro fisico
    await db.beni_reali.add({
      nome: 'Lingottino oro Umicore 2.5g', categoria: 'oro_fisico',
      costo_acquisto: 167.00, valore_attuale: 292.78,
      quantita: 2.5, unita: 'g', data_acquisto: '', note: 'Umicore', attivo: 1
    });
    await db.beni_reali.add({
      nome: 'Oro fisico (regali)', categoria: 'oro_fisico',
      costo_acquisto: 0, valore_attuale: 2693.53,
      quantita: 23, unita: 'g', data_acquisto: '', note: 'Ricevuto come regalo', attivo: 1
    });
  } catch(e) {
    console.warn('_doInitPortafoglioDefaults:', e);
  }
}

export async function getOrCreateMeseCorrente() {
  const now = new Date();
  const anno = now.getFullYear(), mese = now.getMonth() + 1;
  let rec = await db.mesi.where({ anno, mese }).first();
  if (!rec) {
    const id = await db.mesi.add({ anno, mese, note:'', chiuso:false, creato_il:new Date().toISOString() });
    rec = await db.mesi.get(id);
  }
  return rec;
}

// Ottieni o crea un mese specifico per anno e mese
export async function getOrCreateMese(anno, mese) {
  let rec = await db.mesi.where({ anno, mese }).first();
  if (!rec) {
    const id = await db.mesi.add({
      anno, mese, note: '', chiuso: false,
      stato: 'aperto', creato_il: new Date().toISOString()
    });
    rec = await db.mesi.get(id);
  }
  return rec;
}

// Previsione per voce nel mese (previsioni_mensili → fallback previsione_default)
export async function getPrevisioneVoce(voceId, meseId) {
  try {
    const prev = await db.previsioni_mensili
      .where({ voce_id: voceId, mese_id: meseId }).first();
    if (prev) return prev.importo;
  } catch(e) {}
  const voce = await db.voci_budget.get(voceId);
  return voce?.previsione_default || 0;
}

export async function totaleUsciteMese(mese_id) {
  const cats   = await db.categorie_budget.where('tipo').equals('uscita').toArray();
  const catIds = new Set(cats.map(c => c.id));
  const voci   = await db.voci_budget.filter(v => catIds.has(v.categoria_id) && v.attiva === 1).toArray();
  const ids    = new Set(voci.map(v => v.id));
  const regs   = await db.registrazioni.where('mese_id').equals(mese_id).toArray();
  return regs.filter(r => ids.has(r.voce_id)).reduce((s,r) => s + (r.importo_reale||0), 0);
}

export async function totaleEntrateMese(mese_id) {
  const cats   = await db.categorie_budget.where('tipo').equals('entrata').toArray();
  const catIds = new Set(cats.map(c => c.id));
  const voci   = await db.voci_budget.filter(v => catIds.has(v.categoria_id) && v.attiva === 1).toArray();
  const ids    = new Set(voci.map(v => v.id));
  const regs   = await db.registrazioni.where('mese_id').equals(mese_id).toArray();
  return regs.filter(r => ids.has(r.voce_id)).reduce((s,r) => s + (r.importo_reale||0), 0);
}

// Saldo di ogni conto alla fine del giorno `data` (YYYY-MM-DD).
// Senza data conta tutti i movimenti. I trasferimenti scalano il conto di
// origine e accreditano quello di destinazione. Restituisce i conti attivi
// e quelli disattivati che a quella data hanno ancora un saldo.
export async function saldiContiAl(data = null) {
  const [tutti, movs] = await Promise.all([
    db.conti_correnti.toArray(),
    db.movimenti_conto.toArray()
  ]);
  const saldi = Object.fromEntries(tutti.map(c => [c.id, c.saldo_iniziale || 0]));
  movs.forEach(m => {
    if (data && !(m.data && m.data <= data)) return;
    if (m.tipo === 'entrata') {
      if (m.conto_id in saldi) saldi[m.conto_id] += m.importo;
    } else if (m.tipo === 'uscita') {
      if (m.conto_id in saldi) saldi[m.conto_id] -= m.importo;
    } else if (m.tipo === 'trasferimento') {
      if (m.conto_id in saldi) saldi[m.conto_id] -= m.importo;
      if (m.conto_dest_id in saldi) saldi[m.conto_dest_id] += m.importo;
    }
  });
  const conti = tutti.filter(c =>
    c.attivo === 1 || c.attivo === true || Math.abs(saldi[c.id]) >= 0.005);
  const out = {};
  conti.forEach(c => { out[c.id] = saldi[c.id]; });
  return { conti, saldi: out };
}

export async function saldoContiCorrenti() {
  const { saldi } = await saldiContiAl();
  return Object.values(saldi).reduce((s, v) => s + v, 0);
}

export async function totaleDepositi() {
  const dep = await db.conti_deposito.where('stato').equals('aperto').toArray();
  return dep.reduce((s,d) => s+(d.importo||0), 0);
}

export async function valorePAC() {
  const pacs = await db.pac_etf.where('attivo').equals(1).toArray();
  let tot = 0;
  for (const p of pacs) {
    const vers = await db.pac_versamenti.where('pac_id').equals(p.id).toArray();
    if (!vers.length) continue;
    const ult = vers.sort((a,b)=>(b.anno*100+b.mese)-(a.anno*100+a.mese))[0];
    tot += ult.valore_attuale||0;
  }
  return tot;
}

export async function patrimonioNetto() {
  const [cc,dep,pac] = await Promise.all([saldoContiCorrenti(),totaleDepositi(),valorePAC()]);
  return { cc, dep, pac, totale: cc+dep+pac };
}

const TABELLE_BACKUP = [
  'mesi','voci_uscita','voci_entrata','accantonamenti','crediti_sospeso',
  'cedole_budget','conti_correnti','movimenti_conto','conti_deposito',
  'vincoli_deposito','cedole_deposito','pac_etf','pac_versamenti',
  'categorie_budget','voci_budget','registrazioni',
  'portafogli','strumenti_portafoglio','movimenti_portafoglio','beni_reali',
  'movimenti_voce','previsioni_mensili','riconciliazioni','piano_mensile'
];

export async function exportAllData() {
  const out = {
    version: 3,
    exported_at: new Date().toISOString()
  };
  for (const t of TABELLE_BACKUP) {
    out[t] = await db[t].toArray();
  }
  return out;
}

export async function importAllData(data) {
  // Tabelle sempre ripristinate
  const tabelle = [
    'mesi','voci_uscita','voci_entrata','accantonamenti','crediti_sospeso',
    'cedole_budget','conti_correnti','movimenti_conto','conti_deposito',
    'cedole_deposito','pac_etf','pac_versamenti','registrazioni'
  ];
  await db.transaction('rw', tabelle.map(t => db[t]), async () => {
    for (const t of tabelle) {
      await db[t].clear();
      if (data[t]?.length) await db[t].bulkAdd(data[t]);
    }
  });

  // Categorie e voci: ripristina solo se il backup le contiene,
  // altrimenti mantieni quelle esistenti o reinserisci i default
  if (data.categorie_budget?.length) {
    await db.categorie_budget.clear();
    await db.categorie_budget.bulkAdd(data.categorie_budget);
    await db.voci_budget.clear();
    if (data.voci_budget?.length) await db.voci_budget.bulkAdd(data.voci_budget);
  } else {
    // Backup vecchio (v1) — mantieni o crea default
    const n = await db.categorie_budget.count();
    if (n === 0) await _insertDefaults(null);
  }
}

export default db;
