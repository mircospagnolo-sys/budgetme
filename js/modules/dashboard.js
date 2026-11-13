/* BudgetMe — dashboard.js v4
   Home: cosa fare, mese in corso, patrimonio. I grafici stanno in fondo, in una sezione che si apre. */
import db, { getOrCreateMeseCorrente, saldiContiAl } from '../db.js';
import { navigate } from '../router.js';
import { formatEur, MESI_NOMI, daysUntil } from '../utils.js';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataValida = d => /^20\d\d-\d\d-\d\d$/.test(d || '');
const chiaveMese = (anno, mese) => `${anno}-${String(mese).padStart(2, '0')}`;
const nomeMese = k => `${MESI_NOMI[parseInt(k.slice(5, 7))]} ${k.slice(0, 4)}`;

// Apre Mese su una scheda precisa (letto da mese.js all'avvio)
function vaiAMese(intent) {
  sessionStorage.setItem('meseIntent', JSON.stringify(intent));
  navigate('mese');
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

    // ── Patrimonio ─────────────────────────────────────────────────────────
    const { saldi: saldiCC } = await saldiContiAl();
    const totCC = Object.values(saldiCC).reduce((s, v) => s + v, 0);

    const vincoliAttivi = vincoli.filter(v => v.stato === 'attivo');
    const totDep = vincoliAttivi.reduce((s, v) => s + (v.importo || 0), 0)
                 + depositi.filter(d => d.stato === 'aperto')
                           .reduce((s, d) => s + (d.somma_libera || 0), 0);
    const totInvest = strumenti.filter(s => s.attivo === 1 || s.attivo === true)
                               .reduce((s, st) => s + (st.valore_attuale || 0), 0);
    const totBeni = beni.filter(b => b.attivo === 1 || b.attivo === true)
                        .reduce((s, b) => s + (b.valore_attuale || 0), 0);
    const totPatrimonio = totCC + totDep + totInvest + totBeni;

    // ── Mese in corso: stesse regole di Analisi (straordinarie e risparmio esclusi) ──
    const { calcolaRiepilogoAnno } = await import(`./analisi.js?v=${Date.now()}`);
    const ra = await calcolaRiepilogoAnno(mese.anno);
    const dm = ra.datiMesi[mese.mese - 1];
    const entrate = dm.entrate, uscite = dm.uscite, saldoMese = entrate - uscite;
    const esclusi = [];
    if (dm.straordinarie > 0) esclusi.push(`entrate straordinarie ${formatEur(dm.straordinarie)}`);

    // ── Da fare ────────────────────────────────────────────────────────────
    const azioni = [];

    if (!conti.some(c => c.attivo === 1 || c.attivo === true)) {
      azioni.push({ icona: '🏦', testo: 'Aggiungi il tuo primo conto',
        dettaglio: 'Patrimonio → Conti', vai: () => navigate('patrimonio') });
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
    const chiusi = new Set(mesiTutti.filter(m => m.stato === 'chiuso').map(m => chiaveMese(m.anno, m.mese)));
    const correnteK = chiaveMese(mese.anno, mese.mese);
    const daChiudere = [...new Set(movs.filter(m => dataValida(m.data)).map(m => m.data.slice(0, 7)))]
      .filter(k => k < correnteK && !chiusi.has(k)).sort();
    daChiudere.slice(0, 3).forEach(k => azioni.push({
      icona: '🔒', testo: `${nomeMese(k)} non ancora chiuso`,
      dettaglio: 'confronta i saldi con la banca',
      vai: () => vaiAMese({ tab: 'riconciliazione',
                            anno: parseInt(k.slice(0, 4)), mese: parseInt(k.slice(5, 7)) })
    }));

    // Vincoli dei depositi scaduti o in scadenza entro 30 giorni
    const depAperti = new Set(depositi.filter(d => d.stato === 'aperto').map(d => d.id));
    const nomeDep = Object.fromEntries(depositi.map(d => [d.id, d.nome]));
    const scadenze = vincoliAttivi
      .filter(v => depAperti.has(v.deposito_id) && v.data_scadenza)
      .map(v => ({ v, g: daysUntil(v.data_scadenza) }))
      .filter(x => Number.isFinite(x.g) && x.g <= 30)
      .sort((a, b) => a.g - b.g);
    scadenze.slice(0, 2).forEach(({ v, g }) => azioni.push({
      icona: '⏳', testo: `Vincolo ${esc(nomeDep[v.deposito_id])} · ${formatEur(v.importo)}`,
      dettaglio: g < 0 ? `scaduto da ${-g} giorni` : g === 0 ? 'scade oggi' : `scade tra ${g} giorni`,
      vai: () => navigate('patrimonio')
    }));
    if (scadenze.length > 2) {
      azioni.push({ icona: '⏳', testo: `e altri ${scadenze.length - 2} vincoli`,
        dettaglio: 'scaduti o in scadenza entro 30 giorni', vai: () => navigate('patrimonio') });
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
    const TESSERA = 'background:rgba(255,255,255,0.15);border:none;border-radius:8px;' +
                    'padding:6px 10px;text-align:left;cursor:pointer;width:100%';

    content.innerHTML = `
      <!-- Da fare -->
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
        <div class="card-title" style="padding:12px 14px 8px;margin:0">DA FARE</div>
        ${azioni.length ? azioni.map((a, i) => `
        <button class="home-azione" data-i="${i}"
          style="display:flex;width:100%;align-items:center;gap:10px;padding:11px 14px;
                 border:none;border-top:1px solid var(--border);background:none;
                 text-align:left;cursor:pointer;color:var(--text)">
          <span style="font-size:1.1rem">${a.icona}</span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:0.88rem;font-weight:600">${a.testo}</span>
            <span style="display:block;font-size:0.75rem;color:var(--text-muted)">${a.dettaglio}</span>
          </span>
          <span style="color:var(--text-muted)">›</span>
        </button>`).join('') : `
        <div style="padding:4px 14px 14px;font-size:0.9rem;color:var(--green);font-weight:600">
          ✓ Tutto in ordine</div>`}
      </div>

      <!-- Mese in corso -->
      <p class="section-title">${MESI_NOMI[mese.mese]} ${mese.anno}</p>
      <div class="kpi-grid" style="margin-bottom:8px">
        <div class="kpi-card">
          <div class="label">Entrate</div>
          <div class="value text-positive">${formatEur(entrate)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Uscite</div>
          <div class="value text-negative">${formatEur(uscite)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Saldo</div>
          <div class="value ${saldoMese>=0?'text-positive':'text-negative'}">${formatEur(saldoMese,true)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Risparmiato</div>
          <div class="value">${formatEur(dm.risparmio)}</div>
        </div>
      </div>
      ${esclusi.length ? `
      <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">
        Non contati: ${esclusi.join(' · ')}</div>` : ''}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-primary" id="home-nuovo" style="flex:1">+ Movimento</button>
        <button class="btn btn-ghost" id="home-chiudi" style="flex:1">Chiudi mese</button>
      </div>

      <!-- Patrimonio netto -->
      <div class="card" style="background:var(--blue);border:none;margin-bottom:16px">
        <div class="card-title" style="color:rgba(255,255,255,0.75)">PATRIMONIO NETTO</div>
        <div class="card-value large" style="color:#fff">${formatEur(totPatrimonio)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px">
          <button class="home-pat" style="${TESSERA}">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">🏦 Conti correnti</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totCC)}</div>
          </button>
          <button class="home-pat" style="${TESSERA}">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">🏛 Conti deposito</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totDep)}</div>
          </button>
          <button class="home-pat" style="${TESSERA}">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">📈 Investimenti</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totInvest)}</div>
          </button>
          <button class="home-pat" style="${TESSERA}">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">🥇 Beni reali</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totBeni)}</div>
          </button>
        </div>
      </div>

      <!-- Grafici (si disegnano alla prima apertura) -->
      <details id="home-grafici" class="card" style="padding:0">
        <summary style="padding:12px 14px;font-weight:600;font-size:0.9rem;cursor:pointer">
          📊 Grafici</summary>
        <div style="padding:0 14px 14px">
          <p class="section-title">Composizione patrimonio</p>
          <div style="position:relative;width:180px;height:180px;margin:0 auto 16px">
            <canvas id="chart-patrimonio"></canvas>
          </div>
          <p class="section-title">Budget ${MESI_NOMI[mese.mese]} (voci categorizzate)</p>
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
    `;

    // ── Azioni ─────────────────────────────────────────────────────────────
    content.querySelectorAll('.home-azione').forEach(b =>
      b.addEventListener('click', () => azioni[b.dataset.i].vai()));
    content.querySelectorAll('.home-pat').forEach(b =>
      b.addEventListener('click', () => navigate('patrimonio')));
    document.getElementById('home-nuovo').addEventListener('click', () =>
      vaiAMese({ tab: 'movimenti', nuovo: true, anno: mese.anno, mese: mese.mese }));
    document.getElementById('home-chiudi').addEventListener('click', () =>
      vaiAMese({ tab: 'riconciliazione', anno: mese.anno, mese: mese.mese }));

    // ── Grafici: solo alla prima apertura della sezione ────────────────────
    const det = document.getElementById('home-grafici');
    let disegnati = false;
    det.addEventListener('toggle', () => {
      if (!det.open || disegnati) return;
      disegnati = true;
      disegnaCiambella([totCC, totDep, totInvest, totBeni]);
      if (catE.length) disegnaBarre('chart-entrate', catE, '#1baf7a');
      if (catU.length) disegnaBarre('chart-uscite', catU, '#e34948');
    });

  } catch(err) {
    console.error('Dashboard error:', err);
    document.getElementById('content').innerHTML =
      '<div class="empty-state"><p>Errore caricamento dashboard. Ricarica la pagina.</p></div>';
  }
}

// ── Grafico patrimonio (ciambella) ───────────────────────────────────────────
function disegnaCiambella(valori) {
  const totale = valori.reduce((a, b) => a + Math.max(0, b), 0);
  const el = document.getElementById('chart-patrimonio');
  if (!el) return;
  if (totale <= 0) {
    el.parentElement.innerHTML =
      '<div class="empty-state" style="padding:20px 0"><p>Aggiungi conti per vedere il grafico</p></div>';
    return;
  }
  new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Conti correnti','Conti deposito','Investimenti','Beni reali'],
      datasets: [{
        data: valori.map(v => Math.max(0, v)),
        backgroundColor: ['#2a78d6','#1baf7a','#7c3d9e','#b8860b'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '55%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 6,
          generateLabels: (chart) => {
            const data = chart.data;
            return data.labels.map((label, i) => ({
              text: label + ': ' + formatEur(data.datasets[0].data[i]),
              fillStyle: data.datasets[0].backgroundColor[i],
              hidden: false, index: i
            }));
          }
        }},
        tooltip: { callbacks: { label: ctx => ' ' + formatEur(ctx.raw) } }
      }
    },
    plugins: [{
      id: 'sliceLabels',
      afterDraw(chart) {
        const { ctx, chartArea: { width, height }, data } = chart;
        const tot = data.datasets[0].data.reduce((a, b) => a + b, 0);
        const cx = chart.getDatasetMeta(0).data[0]?.x || width / 2;
        const cy = chart.getDatasetMeta(0).data[0]?.y || height / 2;
        chart.getDatasetMeta(0).data.forEach((arc, i) => {
          const val = data.datasets[0].data[i];
          if (!val || val / tot < 0.03) return;
          const angle = (arc.startAngle + arc.endAngle) / 2;
          const r = (arc.outerRadius + arc.innerRadius) / 2;
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 3;
          ctx.fillText(Math.round(val / tot * 100) + '%', cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
          ctx.restore();
        });
      }
    }]
  });
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