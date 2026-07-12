/* ============================================
   BudgetMe — db.js  (v2.1)
   Database IndexedDB via Dexie.js
   ============================================ */

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

export async function saldoContiCorrenti() {
  const conti = await db.conti_correnti.where('attivo').equals(1).toArray();
  let tot = 0;
  for (const c of conti) {
    const mov = await db.movimenti_conto.where('conto_id').equals(c.id).toArray();
    tot += (c.saldo_iniziale||0) + mov.reduce((s,m) =>
      m.tipo==='entrata' ? s+m.importo : m.tipo==='uscita' ? s-m.importo : s, 0);
  }
  return tot;
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

export async function exportAllData() {
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    mesi:             await db.mesi.toArray(),
    voci_uscita:      await db.voci_uscita.toArray(),
    voci_entrata:     await db.voci_entrata.toArray(),
    accantonamenti:   await db.accantonamenti.toArray(),
    crediti_sospeso:  await db.crediti_sospeso.toArray(),
    cedole_budget:    await db.cedole_budget.toArray(),
    conti_correnti:   await db.conti_correnti.toArray(),
    movimenti_conto:  await db.movimenti_conto.toArray(),
    conti_deposito:   await db.conti_deposito.toArray(),
    cedole_deposito:  await db.cedole_deposito.toArray(),
    pac_etf:          await db.pac_etf.toArray(),
    pac_versamenti:   await db.pac_versamenti.toArray(),
    categorie_budget: await db.categorie_budget.toArray(),
    voci_budget:      await db.voci_budget.toArray(),
    registrazioni:    await db.registrazioni.toArray()
  };
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
