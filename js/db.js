/* ============================================
   BudgetMe — db.js  (v2)
   Database IndexedDB via Dexie.js
   ============================================ */

const db = new Dexie('BudgetMeDB');

// v1 — tabelle originali
db.version(1).stores({
  mesi:            '++id, anno, mese',
  voci_uscita:     '++id, mese_id, categoria, conto_id',
  voci_entrata:    '++id, mese_id, categoria, conto_id',
  accantonamenti:  '++id, voce',
  crediti_sospeso: '++id, stato, mese_id',
  cedole_budget:   '++id, mese_id, incassata',
  conti_correnti:  '++id, nome, attivo',
  movimenti_conto: '++id, conto_id, data, tipo',
  conti_deposito:  '++id, banca, stato',
  cedole_deposito: '++id, deposito_id, incassata, data_incasso',
  pac_etf:         '++id, nome, broker, attivo',
  pac_versamenti:  '++id, pac_id, anno, mese'
});

// v2 — aggiunge sistema categorie/voci flessibile
db.version(2).stores({
  mesi:               '++id, anno, mese',
  voci_uscita:        '++id, mese_id, categoria, conto_id',
  voci_entrata:       '++id, mese_id, categoria, conto_id',
  accantonamenti:     '++id, voce',
  crediti_sospeso:    '++id, stato, mese_id',
  cedole_budget:      '++id, mese_id, incassata',
  conti_correnti:     '++id, nome, attivo',
  movimenti_conto:    '++id, conto_id, data, tipo',
  conti_deposito:     '++id, banca, stato',
  cedole_deposito:    '++id, deposito_id, incassata, data_incasso',
  pac_etf:            '++id, nome, broker, attivo',
  pac_versamenti:     '++id, pac_id, anno, mese',
  // NUOVE TABELLE v2
  categorie_budget:   '++id, tipo, ordine, attiva',
  voci_budget:        '++id, categoria_id, ordine, attiva',
  registrazioni:      '++id, voce_id, mese_id, [voce_id+mese_id]'
}).upgrade(async tx => {
  await populateDefaults(tx);
});

// Popola categorie e voci default al primo upgrade
async function populateDefaults(tx) {
  const existing = await tx.table('categorie_budget').count();
  if (existing > 0) return;

  const cats = [
    // ── USCITE ──────────────────────────────────────
    { nome: 'Spese Fisse Contrattuali', tipo: 'uscita',  ordine: 1,  colore: '#2a78d6', attiva: 1,
      voci: [
        { nome: 'Affitto / Rata mutuo',      previsione: 530,   tipo_voce: 'fisso' },
        { nome: 'Mantenimento Figlio 1',      previsione: 500,   tipo_voce: 'fisso' },
        { nome: 'Mantenimento ex coniuge',    previsione: 0,     tipo_voce: 'fisso' },
        { nome: 'Assicurazione Auto',         previsione: 39.42, tipo_voce: 'fisso' },
        { nome: 'Telefonia',                  previsione: 9.99,  tipo_voce: 'fisso' },
        { nome: 'Finanziamenti',              previsione: 0,     tipo_voce: 'fisso' },
        { nome: 'Spese condominiali',         previsione: 0,     tipo_voce: 'fisso' },
        { nome: 'Assicurazione Casa',         previsione: 0,     tipo_voce: 'fisso' },
      ]
    },
    { nome: 'Canoni Bancari',           tipo: 'uscita',  ordine: 2,  colore: '#444441', attiva: 1,
      voci: [
        { nome: 'Canone UniCredit',           previsione: 2.15,  tipo_voce: 'fisso' },
        { nome: 'Canone BPER',                previsione: 6.00,  tipo_voce: 'fisso' },
        { nome: 'Imposta bollo c/c',          previsione: 8.55,  tipo_voce: 'fisso', note: '34,20€/anno — trimestrale' },
      ]
    },
    { nome: 'Figli',                    tipo: 'uscita',  ordine: 3,  colore: '#d4720f', attiva: 1,
      voci: [
        { nome: 'Istruzione / Nido Figlio 1', previsione: 0,     tipo_voce: 'variabile' },
        { nome: 'Sport / Attività Figlio 1',  previsione: 0,     tipo_voce: 'variabile' },
        { nome: 'Spese Figlio 1',             previsione: 50,    tipo_voce: 'variabile' },
      ]
    },
    { nome: 'Spese Variabili Necessarie', tipo: 'uscita', ordine: 4, colore: '#1baf7a', attiva: 1,
      voci: [
        { nome: 'Utenze Luce + Gas',          previsione: 47.20, tipo_voce: 'variabile' },
        { nome: 'Utenza Acqua',               previsione: 30,    tipo_voce: 'variabile' },
        { nome: 'Alimentari',                 previsione: 150,   tipo_voce: 'variabile' },
        { nome: 'Carburante / Auto',          previsione: 100,   tipo_voce: 'variabile' },
      ]
    },
    { nome: 'Spese Discrezionali',      tipo: 'uscita',  ordine: 5,  colore: '#7c3d9e', attiva: 1,
      voci: [
        { nome: 'Abbigliamento',              previsione: 50,    tipo_voce: 'variabile' },
        { nome: 'Bar / Caffè',                previsione: 10,    tipo_voce: 'variabile' },
        { nome: 'Cura Persona',               previsione: 0,     tipo_voce: 'variabile' },
        { nome: 'Farmacia / Salute',          previsione: 10,    tipo_voce: 'variabile' },
        { nome: 'Hobby / Tempo libero',       previsione: 20,    tipo_voce: 'variabile' },
        { nome: 'Lavanderia',                 previsione: 0,     tipo_voce: 'variabile' },
        { nome: 'Ristorazione',               previsione: 50,    tipo_voce: 'variabile' },
        { nome: 'Salute / Ottica',            previsione: 0,     tipo_voce: 'variabile' },
        { nome: 'Casa / Fai da Te',           previsione: 20,    tipo_voce: 'variabile' },
        { nome: 'Casa / Varie',               previsione: 10,    tipo_voce: 'variabile' },
        { nome: 'Autolavaggio',               previsione: 16,    tipo_voce: 'variabile' },
      ]
    },
    { nome: 'Spese Irregolari / Annuali', tipo: 'uscita', ordine: 6, colore: '#e34948', attiva: 1,
      voci: [
        { nome: 'Bollo auto',                 previsione: 0,     tipo_voce: 'irregolare', note: 'Accantonamento mensile consigliato' },
        { nome: 'Revisione auto',             previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Manutenzione auto ordinaria',previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Manutenzione auto straord.', previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Ordine professionale',       previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Regali / Ricorrenze',        previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Spese Straordinarie Casa',   previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Viaggi / Vacanze',           previsione: 0,     tipo_voce: 'irregolare' },
      ]
    },
    { nome: 'Risparmio e Liquidità',    tipo: 'uscita',  ordine: 7,  colore: '#1baf7a', attiva: 1,
      voci: [
        { nome: 'Fondo emergenza',            previsione: 100,   tipo_voce: 'risparmio' },
        { nome: 'Versamento Conto Deposito 1',previsione: 0,     tipo_voce: 'risparmio', note: 'Spese prevedibili breve termine' },
        { nome: 'Versamento Conto Deposito 2',previsione: 0,     tipo_voce: 'risparmio', note: 'Spese prevedibili medio termine' },
      ]
    },
    { nome: 'Investimento Lungo Termine', tipo: 'uscita', ordine: 8, colore: '#7c3d9e', attiva: 1,
      voci: [
        { nome: 'PAC ETF',                    previsione: 100,   tipo_voce: 'risparmio', note: 'Orizzonte >10 anni' },
      ]
    },
    { nome: 'Fiscalità',                tipo: 'uscita',  ordine: 9,  colore: '#5F5E5A', attiva: 1,
      voci: [
        { nome: 'F24 / Acconto IRPEF',        previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'IMU / ICI',                  previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Addizionale regionale',      previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Addizionale comunale',       previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'IVA trimestrale',            previsione: 0,     tipo_voce: 'irregolare', note: 'Solo P.IVA' },
        { nome: 'Contributi INPS',            previsione: 0,     tipo_voce: 'irregolare', note: 'Solo autonomi' },
        { nome: 'IRAP',                       previsione: 0,     tipo_voce: 'irregolare', note: 'Solo P.IVA' },
        { nome: 'Altre imposte',              previsione: 0,     tipo_voce: 'irregolare' },
      ]
    },
    // ── ENTRATE ─────────────────────────────────────
    { nome: 'Reddito da Lavoro',        tipo: 'entrata', ordine: 1,  colore: '#1baf7a', attiva: 1,
      voci: [
        { nome: 'Stipendio netto',            previsione: 2268,  tipo_voce: 'fisso' },
        { nome: 'Tredicesima',                previsione: 0,     tipo_voce: 'irregolare', note: 'Valorizza solo a dicembre' },
        { nome: 'Quattordicesima',            previsione: 0,     tipo_voce: 'irregolare', note: 'Valorizza solo a luglio se prevista' },
        { nome: 'Rimborsi aziendali',         previsione: 0,     tipo_voce: 'variabile', note: 'Solo quando effettivamente incassato' },
        { nome: 'Freelance / Consulenze',     previsione: 0,     tipo_voce: 'variabile' },
      ]
    },
    { nome: 'Rendite da Risparmio',     tipo: 'entrata', ordine: 2,  colore: '#d4720f', attiva: 1,
      voci: [
        { nome: 'Cedola Conto Deposito 1',    previsione: 0,     tipo_voce: 'variabile', note: 'Netto dopo ritenuta 26%' },
        { nome: 'Cedola Conto Deposito 2',    previsione: 0,     tipo_voce: 'variabile', note: 'Netto dopo ritenuta 26%' },
        { nome: 'Interessi attivi',           previsione: 0,     tipo_voce: 'variabile' },
        { nome: 'Dividendi ETF',              previsione: 0,     tipo_voce: 'variabile', note: 'Solo se ETF a distribuzione' },
      ]
    },
    { nome: 'Rimborsi Fiscali',         tipo: 'entrata', ordine: 3,  colore: '#2a78d6', attiva: 1,
      voci: [
        { nome: 'Rimborso 730',               previsione: 0,     tipo_voce: 'irregolare' },
        { nome: 'Bonus / Detrazioni',         previsione: 0,     tipo_voce: 'irregolare' },
      ]
    },
    { nome: 'Entrate Straordinarie',    tipo: 'entrata', ordine: 4,  colore: '#444441', attiva: 1,
      voci: [
        { nome: 'Vendite / Altro',            previsione: 0,     tipo_voce: 'variabile' },
        { nome: 'Altre entrate',              previsione: 0,     tipo_voce: 'variabile' },
      ]
    },
  ];

  for (const cat of cats) {
    const { voci, ...catData } = cat;
    const catId = await tx.table('categorie_budget').add({ ...catData });
    let ordine = 1;
    for (const voce of voci) {
      await tx.table('voci_budget').add({
        categoria_id: catId,
        nome: voce.nome,
        previsione_default: voce.previsione || 0,
        tipo_voce: voce.tipo_voce || 'variabile',
        note: voce.note || '',
        attiva: 1,
        ordine: ordine++
      });
    }
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

export async function getOrCreateMeseCorrente() {
  const now  = new Date();
  const anno = now.getFullYear();
  const mese = now.getMonth() + 1;
  let rec = await db.mesi.where({ anno, mese }).first();
  if (!rec) {
    const id = await db.mesi.add({ anno, mese, note: '', chiuso: false, creato_il: new Date().toISOString() });
    rec = await db.mesi.get(id);
  }
  return rec;
}

// Totale uscite reali per un mese (da registrazioni)
export async function totaleUsciteMese(mese_id) {
  const vociUscita = await db.voci_budget
    .filter(v => v.attiva === 1).toArray();
  const cats = await db.categorie_budget
    .where('tipo').equals('uscita').toArray();
  const catIds = new Set(cats.map(c => c.id));
  const voceIds = vociUscita.filter(v => catIds.has(v.categoria_id)).map(v => v.id);
  const regs = await db.registrazioni
    .where('mese_id').equals(mese_id).toArray();
  return regs
    .filter(r => voceIds.includes(r.voce_id))
    .reduce((s, r) => s + (r.importo_reale || 0), 0);
}

// Totale entrate reali per un mese (da registrazioni)
export async function totaleEntrateMese(mese_id) {
  const cats = await db.categorie_budget
    .where('tipo').equals('entrata').toArray();
  const catIds = new Set(cats.map(c => c.id));
  const voci = await db.voci_budget.filter(v => catIds.has(v.categoria_id) && v.attiva === 1).toArray();
  const voceIds = voci.map(v => v.id);
  const regs = await db.registrazioni
    .where('mese_id').equals(mese_id).toArray();
  return regs
    .filter(r => voceIds.includes(r.voce_id))
    .reduce((s, r) => s + (r.importo_reale || 0), 0);
}

// Saldo conti correnti
export async function saldoContiCorrenti() {
  const conti = await db.conti_correnti.where('attivo').equals(1).toArray();
  let totale = 0;
  for (const c of conti) {
    const movimenti = await db.movimenti_conto.where('conto_id').equals(c.id).toArray();
    const delta = movimenti.reduce((s, m) => {
      if (m.tipo === 'entrata') return s + m.importo;
      if (m.tipo === 'uscita')  return s - m.importo;
      return s;
    }, 0);
    totale += (c.saldo_iniziale || 0) + delta;
  }
  return totale;
}

export async function totaleDepositi() {
  const dep = await db.conti_deposito.where('stato').equals('aperto').toArray();
  return dep.reduce((s, d) => s + (d.importo || 0), 0);
}

export async function valorePAC() {
  const pacs = await db.pac_etf.where('attivo').equals(1).toArray();
  let tot = 0;
  for (const p of pacs) {
    const vers = await db.pac_versamenti.where('pac_id').equals(p.id).toArray();
    if (!vers.length) continue;
    const ultimo = vers.sort((a, b) => (b.anno * 100 + b.mese) - (a.anno * 100 + a.mese))[0];
    tot += ultimo.valore_attuale || 0;
  }
  return tot;
}

export async function patrimonioNetto() {
  const [cc, dep, pac] = await Promise.all([saldoContiCorrenti(), totaleDepositi(), valorePAC()]);
  return { cc, dep, pac, totale: cc + dep + pac };
}

export async function exportAllData() {
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    mesi:               await db.mesi.toArray(),
    voci_uscita:        await db.voci_uscita.toArray(),
    voci_entrata:       await db.voci_entrata.toArray(),
    accantonamenti:     await db.accantonamenti.toArray(),
    crediti_sospeso:    await db.crediti_sospeso.toArray(),
    cedole_budget:      await db.cedole_budget.toArray(),
    conti_correnti:     await db.conti_correnti.toArray(),
    movimenti_conto:    await db.movimenti_conto.toArray(),
    conti_deposito:     await db.conti_deposito.toArray(),
    cedole_deposito:    await db.cedole_deposito.toArray(),
    pac_etf:            await db.pac_etf.toArray(),
    pac_versamenti:     await db.pac_versamenti.toArray(),
    categorie_budget:   await db.categorie_budget.toArray(),
    voci_budget:        await db.voci_budget.toArray(),
    registrazioni:      await db.registrazioni.toArray()
  };
}

export async function importAllData(data) {
  const tables = [
    'mesi','voci_uscita','voci_entrata','accantonamenti','crediti_sospeso',
    'cedole_budget','conti_correnti','movimenti_conto','conti_deposito',
    'cedole_deposito','pac_etf','pac_versamenti','categorie_budget',
    'voci_budget','registrazioni'
  ];
  await db.transaction('rw', tables.map(t => db[t]), async () => {
    for (const t of tables) {
      await db[t].clear();
      if (data[t]?.length) await db[t].bulkAdd(data[t]);
    }
  });
}

export default db;
