/* BudgetMe — dashboard.js v5
   Home: azioni rapide, cosa fare, come stai andando (buste), ultimi movimenti, patrimonio.
   I grafici stanno in fondo, in una sezione che si apre. */
import db, { getOrCreateMeseCorrente, saldiContiAl } from '../db.js';
import { BUSTE, calcolaPianoMese } from '../buste.js';
import { navigate } from '../router.js';
import { formatEur, MESI_NOMI, daysUntil } from '../utils.js';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataValida = d => /^20\d\d-\d\d-\d\d$/.test(d || '');
const chiaveMese = (anno, mese) => `${anno}-${String(mese).padStart(2, '0')}`;
const nomeMese = k => `${MESI_NOMI[parseInt(k.slice(5, 7))]} ${k.slice(0, 4)}`;
const eur0 = v => new Intl.NumberFormat('it-IT').format(Math.round(v) || 0) + ' €';

// Apre Mese su una scheda precisa (letto da mese.js all'avvio)
function vaiAMese(intent) {
  sessionStorage.setItem('meseIntent', JSON.stringify(intent));
  navigate('mese');
}

// Apre Patrimonio su una scheda precisa (letto da patrimonio.js all'avvio)
function vaiAPatrimonio(tab) {
  sessionStorage.setItem('patrimonioTab', tab);
  navigate('patrimonio');
}

// ── Calendario ───────────────────────────────────────────────────────────────
const NOMI_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Data della Pasqua (algoritmo di Gauss/Meeus per il calendario gregoriano)
function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);          // 3 = marzo, 4 = aprile
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno);
}

// Festivi italiani dell'anno: 'MM-GG' → nome (le domeniche si colorano a parte)
function festiviAnno(anno) {
  const f = {
    '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': 'Festa della Liberazione',
    '05-01': 'Festa del Lavoro', '06-02': 'Festa della Repubblica', '08-15': 'Ferragosto',
    '11-01': 'Ognissanti', '12-08': 'Immacolata Concezione',
    '12-25': 'Natale', '12-26': 'Santo Stefano'
  };
  const chiave = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const p = pasqua(anno);
  f[chiave(p)] = 'Pasqua';
  f[chiave(new Date(anno, p.getMonth(), p.getDate() + 1))] = "Lunedì dell'Angelo";
  return f;
}

let calAnno = 0, calMese = 0;

// Disegna il calendario del mese mostrato (calAnno, calMese) con domeniche e festivi in rosso
function disegnaCalendario() {
  const box = document.getElementById('home-cal');
  if (!box) return;
  const oggi = new Date();
  const corrente = calAnno === oggi.getFullYear() && calMese === oggi.getMonth() + 1;
  const festivi = festiviAnno(calAnno);
  const nGiorni = new Date(calAnno, calMese, 0).getDate();
  const offset = (new Date(calAnno, calMese - 1, 1).getDay() + 6) % 7;   // lunedì = 0

  const celle = [];
  for (let i = 0; i < offset; i++) celle.push('<div></div>');
  const elenco = [];
  for (let g = 1; g <= nGiorni; g++) {
    const k = `${String(calMese).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
    const festa = festivi[k];
    const domenica = (offset + g - 1) % 7 === 6;
    const isOggi = corrente && g === oggi.getDate();
    if (festa) elenco.push({ g, nome: festa });
    const colore = isOggi ? '#fff' : (festa || domenica) ? 'var(--red)' : 'var(--text)';
    celle.push(`
      <div title="${esc(festa || '')}" style="display:flex;align-items:center;justify-content:center;height:32px">
        <span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;
                     border-radius:50%;font-size:0.85rem;color:${colore};
                     font-weight:${isOggi || festa ? 700 : 500};${isOggi ? 'background:var(--blue);' : ''}">${g}</span>
      </div>`);
  }

  const NAV = 'width:32px;height:32px;border-radius:50%;border:1px solid var(--border);' +
              'background:var(--bg-card);color:var(--text);font-size:1rem;cursor:pointer;flex-shrink:0';
  box.innerHTML = `
    <div class="card" style="padding:12px 14px;flex:1">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <button id="cal-prec" aria-label="Mese precedente" style="${NAV}">‹</button>
        <div style="flex:1;text-align:center;font-size:1rem;font-weight:700">${MESI_NOMI[calMese]} ${calAnno}</div>
        <button id="cal-succ" aria-label="Mese successivo" style="${NAV}">›</button>
        <button id="cal-oggi" class="btn btn-ghost btn-sm" ${corrente ? 'disabled' : ''}
                style="${corrente ? 'opacity:0.4;' : ''}">Oggi</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;margin-bottom:2px">
        ${NOMI_GIORNI.map((n, i) =>
          `<div style="font-size:0.7rem;color:${i === 6 ? 'var(--red)' : 'var(--text-muted)'}">${n}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr)">${celle.join('')}</div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:0.75rem;line-height:1.6">
        ${elenco.length
          ? elenco.map(x => `<div><span style="color:var(--red);font-weight:700">${x.g}</span> ${esc(x.nome)}</div>`).join('')
          : '<div style="color:var(--text-muted)">Nessun giorno festivo, oltre alle domeniche</div>'}
        <div style="color:var(--text-muted);margin-top:2px">Domeniche e festivi in rosso</div>
      </div>
    </div>`;

  document.getElementById('cal-prec').addEventListener('click', () => {
    calMese--; if (calMese < 1) { calMese = 12; calAnno--; }
    disegnaCalendario();
  });
  document.getElementById('cal-succ').addEventListener('click', () => {
    calMese++; if (calMese > 12) { calMese = 1; calAnno++; }
    disegnaCalendario();
  });
  document.getElementById('cal-oggi').addEventListener('click', () => {
    calAnno = oggi.getFullYear(); calMese = oggi.getMonth() + 1;
    disegnaCalendario();
  });
}

// Dati del mio portafoglio, ricreati se le tabelle sono vuote
async function inizializzaPortafoglio() {
  try {
    const pfCount = await db.portafogli.count();
    if (pfCount > 0) return;
    const pfId = await db.portafogli.add({
      nome:'Trade Republic', broker:'Trade Republic', tipo:'broker',
      note:'PAC mensile ETF', attivo:1
    });
    await db.strumenti_portafoglio.add({
      portafoglio_id:pfId, nome:'UBS Core MSCI World UCITS ETF USD Acc',
      ticker:'UETW', isin:'IE00BD4TXV59', tipo_asset:'etf_azionario',
      strategia:'pac', modalita:'accumulo', valuta:'EUR',
      quantita:110.376808, prezzo_attuale:39.12, valore_attuale:4317.94,
      capitale_investito:3780.41, acquisto_medio:34.25, attivo:1
    });
    await db.strumenti_portafoglio.add({
      portafoglio_id:pfId, nome:'iShares Core MSCI Emerging Markets IMI UCITS ETF (Acc)',
      ticker:'IS3N', isin:'IE00B4KM4GZ66', tipo_asset:'etf_azionario',
      strategia:'pac', modalita:'accumulo', valuta:'EUR',
      quantita:49.883695, prezzo_attuale:48.19, valore_attuale:2403.90,
      capitale_investito:1760.89, acquisto_medio:35.30, attivo:1
    });
    await db.beni_reali.add({
      nome:'Lingottino oro Umicore 2.5g', categoria:'oro_fisico',
      costo_acquisto:167.00, valore_attuale:292.78,
      quantita:2.5, unita:'g', attivo:1
    });
    await db.beni_reali.add({
      nome:'Oro fisico (regali)', categoria:'oro_fisico',
      costo_acquisto:0, valore_attuale:2693.53,
      quantita:23, unita:'g', note:'Ricevuto come regalo', attivo:1
    });
  } catch(e) { console.warn('portafoglio init:', e); }
}

export async function init() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="spinner"></div>`;

  try {
    const mese = await getOrCreateMeseCorrente();
    await inizializzaPortafoglio();

    const [conti, movs, depositi, vincoli, strumenti, beni, cats, voci,
           mesiTutti, regsMese, movsVoce] = await Promise.all([
      db.conti_correnti.toArray(),
      db.movimenti_conto.toArray(),
      db.conti_deposito.toArray(),
      db.vincoli_deposito.toArray(),
      db.strumenti_portafoglio.toArray(),
      db.beni_reali.toArray(),
      db.categorie_budget.orderBy('ordine').toArray(),
      db.voci_budget.where('attiva').equals(1).toArray(),
      db.mesi.toArray(),
      db.registrazioni.where('mese_id').equals(mese.id).toArray(),
      db.movimenti_voce.where('mese_id').equals(mese.id).toArray()
    ]);

    const oggi = new Date();
    const giorno = oggi.getDate();
    const giorniMese = new Date(mese.anno, mese.mese, 0).getDate();
    const correnteK = chiaveMese(mese.anno, mese.mese);

    // ── Patrimonio ─────────────────────────────────────────────────────────
    const { saldi: saldiCC } = await saldiContiAl();
    const totCC = Object.values(saldiCC).reduce((s, v) => s + v, 0);

    // Depositi: contano solo i depositi aperti e i loro vincoli attivi, più la liquidità libera
    const depAperti = new Set(depositi.filter(d => d.stato !== 'chiuso').map(d => d.id));
    const vincoliAttivi = vincoli.filter(v => v.stato === 'attivo' && depAperti.has(v.deposito_id));
    const totDep = vincoliAttivi.reduce((s, v) => s + (v.importo || 0), 0)
                 + depositi.filter(d => depAperti.has(d.id))
                           .reduce((s, d) => s + (d.somma_libera || 0), 0);
    const totInvest = strumenti.filter(s => s.attivo === 1 || s.attivo === true)
                               .reduce((s, st) => s + (st.valore_attuale || 0), 0);
    const totBeni = beni.filter(b => b.attivo === 1 || b.attivo === true)
                        .reduce((s, b) => s + (b.valore_attuale || 0), 0);
    const totPatrimonio = totCC + totDep + totInvest + totBeni;

    // Disponibile subito: conti correnti più la liquidità libera dei depositi aperti
    const liberaDep = depositi.filter(d => depAperti.has(d.id))
                              .reduce((s, d) => s + (d.somma_libera || 0), 0);
    const disponibile = totCC + liberaDep;

    // Informazioni di controllo accanto ai blocchi
    const ggmm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    const dateMov = movs.filter(m => dataValida(m.data)).map(m => m.data).sort();
    const ultimoMov = dateMov[dateMov.length - 1];
    const vincDate = vincoliAttivi.filter(v => dataValida(v.data_scadenza))
      .map(v => ({ v, g: daysUntil(v.data_scadenza) })).filter(x => Number.isFinite(x.g));
    const nScaduti = vincDate.filter(x => x.g < 0).length;
    const prossimo = vincDate.filter(x => x.g >= 0).sort((a, b) => a.g - b.g)[0];

    const PATR = [
      { tab: 'conti',        nome: 'Conti correnti', val: totCC,     colore: '#2a78d6',
        sub: ultimoMov ? `ultimo movimento ${ggmm(ultimoMov)}` : '' },
      { tab: 'depositi',     nome: 'Conti deposito', val: totDep,    colore: '#1baf7a',
        sub: nScaduti
          ? `<span style="color:var(--orange)">${nScaduti} ${nScaduti === 1 ? 'vincolo scaduto' : 'vincoli scaduti'}</span>`
          : (prossimo ? `prossima scadenza ${ggmm(prossimo.v.data_scadenza)}/${prossimo.v.data_scadenza.slice(2, 4)}` : '') },
      { tab: 'investimenti', nome: 'Investimenti',   val: totInvest, colore: '#7c3d9e', sub: '' },
      { tab: 'investimenti', nome: 'Beni reali',     val: totBeni,   colore: '#b8860b', sub: '' }
    ];
    const baseBarra = PATR.reduce((s, p) => s + Math.max(0, p.val), 0);

    // ── Mese in corso: stesse regole di Analisi (straordinarie e risparmio esclusi) ──
    const { calcolaRiepilogoAnno } = await import(`./analisi.js?v=${Date.now()}`);
    const ra = await calcolaRiepilogoAnno(mese.anno);
    const dm = ra.datiMesi[mese.mese - 1];
    const dp = mese.mese === 1
      ? (await calcolaRiepilogoAnno(mese.anno - 1)).datiMesi[11]
      : ra.datiMesi[mese.mese - 2];
    const entrate = dm.entrate, uscite = dm.uscite, saldoMese = entrate - uscite;
    const haPrec = dp && (dp.entrate > 0 || dp.uscite > 0);
    const saldoAnno = ra.totEntrate - ra.totUscite;

    // ── Piano buste del mese ───────────────────────────────────────────────
    const pm = await calcolaPianoMese(mese.id);
    const BUSTE_UI = [
      { k: 'prima',    nome: 'Prima te stesso',    risparmio: true,  verbo: 'Versato', colore: 'var(--green)',
        desc: 'Risparmio e investimenti: si mettono da parte per primi, prima di spendere.' },
      { k: 'obblig',   nome: 'Obbligazioni fisse', risparmio: false, verbo: 'Pagato',  colore: 'var(--red)',
        desc: 'Spese che devi pagare ogni mese: mutuo, mantenimento, utenze, carburante, canoni.' },
      { k: 'persone',  nome: 'Spese personali',    risparmio: false, verbo: 'Speso',   colore: 'var(--purple)',
        desc: 'Il tuo budget libero: abbigliamento, hobby, bar e ristoranti.' },
      { k: 'gestione', nome: 'Gestione ordinaria', risparmio: false, verbo: 'Speso',   colore: 'var(--blue)',
        desc: 'La vita di tutti i giorni: alimentari, farmacia, casa, spese irregolari e tasse.' }
    ];

    // ── Da fare ────────────────────────────────────────────────────────────
    const azioni = [];

    const chiusi = new Set(mesiTutti.filter(m => m.stato === 'chiuso').map(m => chiaveMese(m.anno, m.mese)));
    if (giorno >= giorniMese - 4 && !chiusi.has(correnteK)) {
      azioni.push({ icona: '📥', testo: `Fine mese: importa l'estratto e chiudi ${MESI_NOMI[mese.mese]}`,
        dettaglio: 'poi confronta i saldi con la banca',
        vai: () => vaiAMese({ tab: 'movimenti', importa: true, anno: mese.anno, mese: mese.mese }) });
    }

    if (!conti.some(c => c.attivo === 1 || c.attivo === true)) {
      azioni.push({ icona: '🏦', testo: 'Aggiungi il tuo primo conto',
        dettaglio: 'Patrimonio → Conti', vai: () => vaiAPatrimonio('conti') });
    }

    // Movimenti da categorizzare, per mese (si parte dal più recente)
    const daCat = movs.filter(m => dataValida(m.data) && !m.categorizzato && m.tipo !== 'trasferimento');
    if (daCat.length) {
      const perMese = [...new Set(daCat.map(m => m.data.slice(0, 7)))].sort();
      const ultimo = perMese[perMese.length - 1];
      azioni.push({
        icona: '📌',
        testo: daCat.length === 1 ? '1 movimento da categorizzare' : `${daCat.length} movimenti da categorizzare`,
        dettaglio: perMese.length > 1
          ? `in ${perMese.length} mesi, si parte da ${nomeMese(ultimo)}` : nomeMese(ultimo),
        vai: () => vaiAMese({ tab: 'movimenti', daCat: true,
                              anno: parseInt(ultimo.slice(0, 4)), mese: parseInt(ultimo.slice(5, 7)) })
      });
    }

    const anomali = movs.filter(m => !dataValida(m.data));
    if (anomali.length) {
      azioni.push({ icona: '⚠️',
        testo: anomali.length === 1 ? '1 movimento con data non valida' : `${anomali.length} movimenti con data non valida`,
        dettaglio: 'non compaiono in nessun mese',
        vai: () => vaiAMese({ tab: 'movimenti' }) });
    }

    // Mesi passati con movimenti e non ancora chiusi
    const daChiudere = [...new Set(movs.filter(m => dataValida(m.data)).map(m => m.data.slice(0, 7)))]
      .filter(k => k < correnteK && !chiusi.has(k)).sort();
    daChiudere.slice(0, 3).forEach(k => azioni.push({
      icona: '🔒', testo: `${nomeMese(k)} non ancora chiuso`,
      dettaglio: 'confronta i saldi con la banca',
      vai: () => vaiAMese({ tab: 'riconciliazione',
                            anno: parseInt(k.slice(0, 4)), mese: parseInt(k.slice(5, 7)) })
    }));

    // Vincoli dei depositi scaduti o in scadenza entro 30 giorni
    const nomeDep = Object.fromEntries(depositi.map(d => [d.id, d.nome]));
    const scadenze = vincoliAttivi
      .filter(v => v.data_scadenza)
      .map(v => ({ v, g: daysUntil(v.data_scadenza) }))
      .filter(x => Number.isFinite(x.g) && x.g <= 30)
      .sort((a, b) => a.g - b.g);
    scadenze.slice(0, 2).forEach(({ v, g }) => azioni.push({
      icona: '⏳', testo: `Vincolo ${esc(nomeDep[v.deposito_id])} · ${formatEur(v.importo)}`,
      dettaglio: g < 0 ? `scaduto da ${-g} giorni` : g === 0 ? 'scade oggi' : `scade tra ${g} giorni`,
      vai: () => vaiAPatrimonio('depositi')
    }));
    if (scadenze.length > 2) {
      azioni.push({ icona: '⏳', testo: `e altri ${scadenze.length - 2} vincoli`,
        dettaglio: 'scaduti o in scadenza entro 30 giorni', vai: () => vaiAPatrimonio('depositi') });
    }

    // Backup
    const ultimoBackup = localStorage.getItem('lastBackup');
    const giorniBackup = ultimoBackup
      ? Math.floor((Date.now() - new Date(ultimoBackup)) / 86400000) : null;
    if (giorniBackup === null || giorniBackup > 30) {
      azioni.push({ icona: '💾',
        testo: giorniBackup === null ? 'Nessun backup scaricato' : `Ultimo backup ${giorniBackup} giorni fa`,
        dettaglio: 'Impostazioni → Scarica backup JSON',
        vai: () => window.openSettings && window.openSettings() });
    }

    // ── Ultimi movimenti ───────────────────────────────────────────────────
    const nomeConto = Object.fromEntries(conti.map(c => [c.id, c.nome]));
    const ultimi = movs.filter(m => dataValida(m.data))
      .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id).slice(0, 5);

    // ── Dati per i grafici (Budget del mese) ───────────────────────────────
    const regsMap = {};
    regsMese.forEach(r => { regsMap[r.voce_id] = r; });
    const movsMap = {};
    movsVoce.forEach(m => { movsMap[m.voce_id] = (movsMap[m.voce_id] || 0) + (m.importo || 0); });
    const reale = v => movsMap[v.id] > 0 ? movsMap[v.id] : (regsMap[v.id]?.importo_reale || 0);
    const perCategoria = tipo => cats.filter(c => c.tipo === tipo && c.attiva)
      .map(cat => ({ cat, tot: voci.filter(v => v.categoria_id === cat.id)
                                   .reduce((s, v) => s + reale(v), 0) }))
      .filter(x => x.tot > 0);
    const catU = perCategoria('uscita');
    const catE = perCategoria('entrata');

    // ── HTML ───────────────────────────────────────────────────────────────
    const VISIBILI = 3;
    const extra = Math.max(0, azioni.length - VISIBILI);
    const BTN = 'flex:1;white-space:nowrap';

    content.innerHTML = `
      <style>
        /* Telefono: una colonna, nell'ordine di importanza. Schermo largo (900px): tre zone in alto. */
        .home-grid { display:grid; gap:16px; grid-template-columns:minmax(0,1fr);
          grid-template-areas:"saldi" "dafare" "come" "ultimi" "cal" "grafici"; }
        .hz { min-width:0; display:flex; flex-direction:column; }
        .hz-saldi { grid-area:saldi; } .hz-dafare { grid-area:dafare; } .hz-cal { grid-area:cal; }
        .hz-come { grid-area:come; } .hz-ultimi { grid-area:ultimi; } .hz-grafici { grid-area:grafici; }
        @media (min-width: 900px) {
          .home-grid { grid-template-columns:minmax(220px,320px) minmax(0,1fr) minmax(300px,440px);
            grid-template-areas:"saldi dafare cal" "come come come" "ultimi ultimi ultimi" "grafici grafici grafici"; }
        }
      </style>
      <!-- Mese e azioni rapide -->
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:2px 2px 10px">
        <span style="font-size:1.3rem;font-weight:800">${MESI_NOMI[mese.mese]} ${mese.anno}</span>
        <span style="font-size:0.8rem;color:var(--text-muted)">giorno ${giorno} di ${giorniMese}</span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-primary" id="home-nuovo" style="${BTN}">+ Movimento</button>
        <button class="btn btn-ghost" id="home-importa" style="${BTN}">📥 Importa</button>
        <button class="btn btn-ghost" id="home-chiudi" style="${BTN}">Chiudi mese</button>
      </div>

      <!-- Saldi, Da fare e calendario, affiancati (in colonna su schermi stretti) -->
      <div class="home-grid">
      <div class="hz hz-saldi">
        <div class="card" style="flex:1;display:flex;flex-direction:column;padding:14px">
          <div class="card-title" style="margin:0 0 4px">I MIEI SALDI</div>
          <div style="font-size:1.9rem;font-weight:800;line-height:1.15">${eur0(totPatrimonio)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px">patrimonio netto, tutto compreso</div>
          ${baseBarra > 0 ? `
          <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px">
            ${PATR.map(p => `<div style="width:${Math.max(0, p.val) / baseBarra * 100}%;background:${p.colore}"></div>`).join('')}
          </div>` : ''}
          ${PATR.map((p, i) => `
          <button class="home-pat" data-tab="${p.tab}"
            style="display:flex;width:100%;align-items:center;gap:10px;padding:9px 0;border:none;
                   ${i > 0 ? 'border-top:1px solid var(--border);' : ''}background:none;text-align:left;
                   cursor:pointer;color:var(--text)">
            <span style="width:10px;height:10px;border-radius:50%;background:${p.colore};flex-shrink:0"></span>
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:0.92rem">${p.nome}</span>
              ${p.sub ? `<span style="display:block;font-size:0.7rem;color:var(--text-muted)">${p.sub}</span>` : ''}
            </span>
            <span style="font-size:0.95rem;font-weight:700">${eur0(p.val)}</span>
            <span style="color:var(--text-muted)">›</span>
          </button>`).join('')}
          <div style="flex:1;min-height:12px"></div>
          <div style="border-top:1px solid var(--border);padding-top:10px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-size:0.82rem;font-weight:700">Disponibile subito</span>
              <span style="font-size:1.05rem;font-weight:800;color:var(--blue)">${eur0(disponibile)}</span>
            </div>
            <div style="font-size:0.7rem;color:var(--text-muted);line-height:1.4;margin-top:2px">
              Conti correnti più la liquidità libera dei depositi. Non comprende vincoli, ETF e oro.</div>
          </div>
        </div>
      </div>
      <div class="hz hz-dafare">
      <div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column">
        <div class="card-title" style="padding:12px 14px 8px;margin:0">DA FARE</div>
        ${azioni.length ? azioni.map((a, i) => `
        <button class="home-azione ${i >= VISIBILI ? 'home-extra' : ''}" data-i="${i}"
          style="display:${i >= VISIBILI ? 'none' : 'flex'};width:100%;align-items:center;gap:10px;
                 padding:11px 14px;border:none;border-top:1px solid var(--border);background:none;
                 text-align:left;cursor:pointer;color:var(--text)">
          <span style="font-size:1.15rem">${a.icona}</span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:0.92rem;font-weight:600">${a.testo}</span>
            <span style="display:block;font-size:0.78rem;color:var(--text-muted)">${a.dettaglio}</span>
          </span>
          <span style="color:var(--text-muted)">›</span>
        </button>`).join('') : `
        <div style="padding:4px 14px 14px;font-size:0.95rem;color:var(--green);font-weight:600">
          ✓ Tutto in ordine</div>`}
        ${extra ? `
        <button id="home-altre" style="margin-top:auto;width:100%;padding:10px 14px;border:none;border-top:1px solid var(--border);
                background:var(--bg);color:var(--blue);font-size:0.85rem;font-weight:600;cursor:pointer">
          Mostra altre ${extra}</button>` : ''}
      </div>
      </div>
      <div class="hz hz-cal"><div id="home-cal" style="flex:1;display:flex;flex-direction:column"></div></div>

      <!-- Come stai andando -->
      <div class="hz hz-come">
      <p class="section-title">Come stai andando</p>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:12px 14px 0;font-size:0.75rem;font-weight:700;letter-spacing:0.04em;color:var(--text-muted)">
          QUESTO MESE · ${MESI_NOMI[mese.mese].toUpperCase()}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:8px 14px 4px">
          <div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Entrate</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--green)">${eur0(entrate)}</div>
            ${haPrec ? `<div style="font-size:0.68rem;color:var(--text-muted)">mese scorso (intero) ${eur0(dp.entrate)}</div>` : ''}
          </div>
          <div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Uscite</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--red)">${eur0(uscite)}</div>
            ${haPrec ? `<div style="font-size:0.68rem;color:var(--text-muted)">mese scorso (intero) ${eur0(dp.uscite)}</div>` : ''}
          </div>
          <div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Saldo</div>
            <div style="font-size:1.1rem;font-weight:800;color:${saldoMese >= 0 ? 'var(--green)' : 'var(--red)'}">
              ${saldoMese > 0 ? '+' : ''}${eur0(saldoMese)}</div>
            <div style="font-size:0.68rem;color:var(--text-muted)">entrate − uscite</div>
          </div>
        </div>
        <div style="padding:10px 14px 0;border-top:1px solid var(--border);font-size:0.75rem;font-weight:700;
                    letter-spacing:0.04em;color:var(--text-muted)">DA INIZIO ANNO · ${mese.anno}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:8px 14px 4px">
          <div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Entrate</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--green)">${eur0(ra.totEntrate)}</div>
            <div style="font-size:0.68rem;color:var(--text-muted)">media ${eur0(ra.mediaEntrate)} al mese</div>
          </div>
          <div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Uscite</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--red)">${eur0(ra.totUscite)}</div>
            <div style="font-size:0.68rem;color:var(--text-muted)">media ${eur0(ra.mediaUscite)} al mese</div>
          </div>
          <div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Saldo</div>
            <div style="font-size:1.1rem;font-weight:800;color:${saldoAnno >= 0 ? 'var(--green)' : 'var(--red)'}">
              ${saldoAnno > 0 ? '+' : ''}${eur0(saldoAnno)}</div>
            <div style="font-size:0.68rem;color:var(--text-muted)">risparmio ${ra.tassoRisparmio.toFixed(1).replace('.', ',')}%</div>
          </div>
        </div>
        <div style="padding:2px 14px 12px;font-size:0.74rem;color:var(--text-muted);line-height:1.4">
          Dai movimenti dei tuoi conti. Non contano i versamenti in risparmio e investimenti né le entrate straordinarie.
        </div>
        <div style="padding:10px 14px;border-top:1px solid var(--border);background:var(--bg)">
          <div style="font-size:0.82rem;font-weight:700;margin-bottom:2px">Il piano di ${MESI_NOMI[mese.mese]}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);line-height:1.55">
            Stipendio previsto <strong style="color:var(--text)">${eur0(pm.entrate.piano)}</strong>
            − Prima te stesso <strong style="color:var(--text)">${eur0(pm.prima.piano)}</strong>
            − Obbligazioni <strong style="color:var(--text)">${eur0(pm.obblig.piano)}</strong>
            = <strong style="color:var(--text)">${eur0(pm.persone.piano + pm.gestione.piano)}</strong> da spendere nel mese,
            divisi in ${eur0(pm.persone.piano)} di spese personali e ${eur0(pm.gestione.piano)} di gestione ordinaria.
          </div>
        </div>

        ${BUSTE_UI.map(b => {
          const p = pm[b.k].piano, r = pm[b.k].reale;
          const pct = p > 0 ? Math.min(100, Math.round(r / p * 100)) : 0;
          const sfora = !b.risparmio && r > p + 0.5;
          const resta = p - r;
          const testo = b.risparmio
            ? (resta > 0.5 ? `Mancano ${eur0(resta)}` : '✓ Fatto')
            : (sfora ? `Sforato di ${eur0(-resta)}` : `Restano ${eur0(resta)}`);
          const coloreTesto = b.risparmio
            ? (resta > 0.5 ? 'var(--orange)' : 'var(--green)')
            : (sfora ? 'var(--red)' : 'var(--text)');
          return `
          <div style="padding:11px 14px;border-top:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <span style="font-size:0.92rem;font-weight:700">${b.nome}</span>
              <span style="font-size:0.85rem;font-weight:700;color:${coloreTesto}">${testo}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin:1px 0 6px;line-height:1.35">${b.desc}</div>
            <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${sfora ? 'var(--red)' : b.colore};border-radius:3px"></div>
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">
              ${b.verbo} <strong style="color:var(--text)">${eur0(r)}</strong> su ${eur0(p)} previsti</div>
          </div>`;
        }).join('')}

        <details style="border-top:1px solid var(--border)">
          <summary style="padding:10px 14px;font-size:0.82rem;font-weight:600;color:var(--blue);cursor:pointer">
            Come leggere questa sezione</summary>
          <div style="padding:0 14px 12px;font-size:0.78rem;color:var(--text-muted);line-height:1.55">
            <p style="margin:0 0 6px"><strong style="color:var(--text)">La barra</strong> mostra quanto del piano hai già usato.
              Per le spese diventa rossa se superi la cifra prevista; per "Prima te stesso" la barra piena è l'obiettivo raggiunto.</p>
            <p style="margin:0 0 6px"><strong style="color:var(--text)">Il piano</strong> si imposta in Mese → Piano.
              Il residuo è quello che rimane dopo il risparmio e le spese fisse, e si divide tra spese personali e gestione ordinaria.</p>
            <p style="margin:0 0 4px"><strong style="color:var(--text)">Cosa comprende ogni busta:</strong></p>
            ${BUSTE_UI.map(b => `<p style="margin:0 0 4px"><strong style="color:var(--text)">${b.nome}</strong>:
              ${esc([...BUSTE[b.k].cat, ...BUSTE[b.k].voci].join(', '))}</p>`).join('')}
          </div>
        </details>

        <div style="padding:8px 14px;border-top:1px solid var(--border);background:var(--bg);
                    font-size:0.72rem;color:var(--text-muted);line-height:1.4">
          Le buste contano solo i movimenti categorizzati${daCat.length ? ` (${daCat.length} da categorizzare)` : ''}.
          ${pm.salvato ? '' : 'Piano del mese non salvato: valori predefiniti (Mese → Piano).'}
        </div>
      </div>

      </div>

      <!-- Ultimi movimenti -->
      <div class="hz hz-ultimi">
      <p class="section-title">Ultimi movimenti</p>
      <div class="card" style="padding:0;overflow:hidden">
        ${ultimi.length ? ultimi.map((m, i) => {
          const isEnt = m.tipo === 'entrata', isTra = m.tipo === 'trasferimento';
          const col = isEnt ? 'var(--green)' : isTra ? 'var(--blue)' : 'var(--red)';
          const segno = isEnt ? '+' : isTra ? '⇄' : '−';
          return `
          <button class="home-mov" data-i="${i}"
            style="display:flex;width:100%;align-items:center;gap:10px;padding:10px 14px;border:none;
                   ${i > 0 ? 'border-top:1px solid var(--border);' : ''}background:none;text-align:left;
                   cursor:pointer;color:var(--text)">
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:0.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${esc(m.descrizione || m.categoria || '—')}</span>
              <span style="display:block;font-size:0.72rem;color:var(--text-muted)">
                ${m.data.slice(8, 10)}/${m.data.slice(5, 7)} · ${esc(nomeConto[m.conto_id] || '')}
                ${m.categorizzato || isTra ? '' : '<span style="color:var(--orange)"> · da categorizzare</span>'}</span>
            </span>
            <span style="font-size:0.92rem;font-weight:700;color:${col};white-space:nowrap">${segno} ${formatEur(m.importo)}</span>
          </button>`;
        }).join('') : `
        <div class="empty-state" style="padding:16px"><p>Nessun movimento ancora.</p></div>`}
      </div>

      </div>

      <!-- Grafici (si disegnano alla prima apertura) -->
      <details id="home-grafici" class="card hz hz-grafici" style="padding:0">
        <summary style="padding:12px 14px;font-weight:600;font-size:0.9rem;cursor:pointer">
          📊 Budget del mese per categoria</summary>
        <div style="padding:0 14px 14px">
          ${catE.length || catU.length ? `
          ${catE.length ? `
          <div class="card-title" style="color:var(--green)">▲ ENTRATE</div>
          <div style="position:relative;height:${Math.max(60, catE.length * 28)}px;margin-bottom:12px">
            <canvas id="chart-entrate"></canvas>
          </div>` : ''}
          ${catU.length ? `
          <div class="card-title" style="color:var(--red)">▼ USCITE</div>
          <div style="position:relative;height:${Math.max(60, catU.length * 28)}px">
            <canvas id="chart-uscite"></canvas>
          </div>` : ''}` : `
          <div class="empty-state" style="padding:12px 0">
            <p>Nessun movimento categorizzato in questo mese.</p></div>`}
        </div>
      </details>
      </div>
    `;

    // ── Calendario sul mese corrente ───────────────────────────────────────
    calAnno = mese.anno; calMese = mese.mese;
    disegnaCalendario();

    // ── Azioni ─────────────────────────────────────────────────────────────
    document.getElementById('home-nuovo').addEventListener('click', () =>
      vaiAMese({ tab: 'movimenti', nuovo: true, anno: mese.anno, mese: mese.mese }));
    document.getElementById('home-importa').addEventListener('click', () =>
      vaiAMese({ tab: 'movimenti', importa: true, anno: mese.anno, mese: mese.mese }));
    document.getElementById('home-chiudi').addEventListener('click', () =>
      vaiAMese({ tab: 'riconciliazione', anno: mese.anno, mese: mese.mese }));

    content.querySelectorAll('.home-azione').forEach(b =>
      b.addEventListener('click', () => azioni[b.dataset.i].vai()));
    content.querySelectorAll('.home-pat').forEach(b =>
      b.addEventListener('click', () => vaiAPatrimonio(b.dataset.tab)));
    content.querySelectorAll('.home-mov').forEach(b =>
      b.addEventListener('click', () => {
        const m = ultimi[b.dataset.i];
        vaiAMese({ tab: 'movimenti', anno: parseInt(m.data.slice(0, 4)), mese: parseInt(m.data.slice(5, 7)) });
      }));

    const altre = document.getElementById('home-altre');
    if (altre) {
      let aperte = false;
      altre.addEventListener('click', () => {
        aperte = !aperte;
        content.querySelectorAll('.home-extra').forEach(b => { b.style.display = aperte ? 'flex' : 'none'; });
        altre.textContent = aperte ? 'Mostra meno' : `Mostra altre ${extra}`;
      });
    }

    // ── Grafici: solo alla prima apertura della sezione ────────────────────
    const det = document.getElementById('home-grafici');
    let disegnati = false;
    det.addEventListener('toggle', () => {
      if (!det.open || disegnati) return;
      disegnati = true;
      if (catE.length) disegnaBarre('chart-entrate', catE, '#1baf7a');
      if (catU.length) disegnaBarre('chart-uscite', catU, '#e34948');
    });

  } catch(err) {
    console.error('Dashboard error:', err);
    document.getElementById('content').innerHTML =
      '<div class="empty-state"><p>Errore caricamento dashboard. Ricarica la pagina.</p></div>';
  }
}

// ── Grafici budget (barre orizzontali) ───────────────────────────────────────
function disegnaBarre(canvasId, righe, colorePredefinito) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: righe.map(x => x.cat.nome.length > 16 ? x.cat.nome.slice(0, 16) + '…' : x.cat.nome),
      datasets: [{
        data: righe.map(x => x.tot),
        backgroundColor: righe.map(x => x.cat.colore || colorePredefinito),
        borderRadius: 3, borderWidth: 0, maxBarThickness: 18
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + formatEur(ctx.raw) } }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: { font: { size: 9 }, maxTicksLimit: 4,
            callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k€' : v + '€' }
        },
        y: { grid: { display: false }, ticks: { font: { size: 9 } } }
      }
    }
  });
}
