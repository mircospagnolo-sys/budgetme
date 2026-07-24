/* BudgetMe — dashboard.js v3
   Interroga il DB direttamente per evitare dipendenze da versioni cache */
import db, { getOrCreateMeseCorrente } from '../db.js';
import { formatEur, formatPct, MESI_NOMI } from '../utils.js';

export async function init() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="spinner"></div>`;

  try {
    const mese = await getOrCreateMeseCorrente();

    // ── Inizializza portafoglio defaults se necessario ─────────────────────
    try {
      const pfCount = await db.portafogli.count();
      if (pfCount === 0) {
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
      }
    } catch(e) { console.warn('portafoglio init:', e); }

    // ── Patrimonio: query diretta al DB ────────────────────────────────────
    const [conti, movimentiConto, depositi, vincoli,
           strumenti, beni, regsAll, cats, voci] = await Promise.all([
      db.conti_correnti.toArray(),
      db.movimenti_conto.toArray(),
      db.conti_deposito.toArray(),
      db.vincoli_deposito.toArray(),
      db.strumenti_portafoglio.toArray(),
      db.beni_reali.toArray(),
      db.registrazioni.where('mese_id').equals(mese.id).toArray(),
      db.categorie_budget.orderBy('ordine').toArray(),
      db.voci_budget.where('attiva').equals(1).toArray()
    ]);

    // Saldo conti correnti
    let totCC = 0;
    for (const c of conti.filter(c => c.attivo === 1 || c.attivo === true)) {
      const movs = movimentiConto.filter(m => m.conto_id === c.id);
      const delta = movs.reduce((s, m) => {
        if (m.tipo === 'entrata') return s + m.importo;
        if (m.tipo === 'uscita')  return s - m.importo;
        return s;
      }, 0);
      totCC += (c.saldo_iniziale || 0) + delta;
    }

    // Depositi: somma vincoli attivi + liquidità libera
    const vincoliAttivi = vincoli.filter(v => v.stato === 'attivo');
    const totDep = vincoliAttivi.reduce((s, v) => s + (v.importo || 0), 0)
                 + depositi.filter(d => d.stato === 'aperto')
                           .reduce((s, d) => s + (d.somma_libera || 0), 0);

    // Investimenti: strumenti finanziari
    const strumentiAttivi = strumenti.filter(s => s.attivo === 1 || s.attivo === true);
    const totInvest = strumentiAttivi.reduce((s, st) => s + (st.valore_attuale || 0), 0);

    // Beni reali
    const beniAttivi = beni.filter(b => b.attivo === 1 || b.attivo === true);
    const totBeni = beniAttivi.reduce((s, b) => s + (b.valore_attuale || 0), 0);

    const totPatrimonio = totCC + totDep + totInvest + totBeni;

    // ── KPI mensili ────────────────────────────────────────────────────────
    const regsMap = {};
    regsAll.forEach(r => { regsMap[r.voce_id] = r; });

    // Movimenti voce del mese
    let movsVoce = [];
    try { movsVoce = await db.movimenti_voce.where('mese_id').equals(mese.id).toArray(); } catch(e) {}
    const movsMap = {};
    movsVoce.forEach(m => {
      if (!movsMap[m.voce_id]) movsMap[m.voce_id] = 0;
      movsMap[m.voce_id] += m.importo || 0;
    });

    const catsU = cats.filter(c => c.tipo === 'uscita'  && c.attiva);
    const catsE = cats.filter(c => c.tipo === 'entrata' && c.attiva);

    let totRU=0, totPU=0, totRE=0, totPE=0;
    const catTotaliU = [], catTotaliE = [];

    for (const cat of catsU) {
      const vociCat = voci.filter(v => v.categoria_id === cat.id);
      let catR=0, catP=0;
      vociCat.forEach(v => {
        const real = movsMap[v.id] > 0 ? movsMap[v.id] : (regsMap[v.id]?.importo_reale || 0);
        const prev = regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
        catR += real; catP += prev;
      });
      totRU += catR; totPU += catP;
      catTotaliU.push({ cat, catR, catP });
    }
    for (const cat of catsE) {
      const vociCat = voci.filter(v => v.categoria_id === cat.id);
      let catR=0, catP=0;
      vociCat.forEach(v => {
        const real = movsMap[v.id] > 0 ? movsMap[v.id] : (regsMap[v.id]?.importo_reale || 0);
        const prev = regsMap[v.id]?.previsione_override ?? v.previsione_default ?? 0;
        catR += real; catP += prev;
      });
      totRE += catR; totPE += catP;
      catTotaliE.push({ cat, catR, catP });
    }

    const saldoR = totRE - totRU;
    const saldoP = totPE - totPU;
    const tassoRisp = totRE > 0 ? saldoR / totRE : 0;

    // ── HTML ───────────────────────────────────────────────────────────────
    content.innerHTML = `
      <!-- Patrimonio netto -->
      <div class="card" style="background:var(--blue);border:none;margin-bottom:16px">
        <div class="card-title" style="color:rgba(255,255,255,0.75)">PATRIMONIO NETTO</div>
        <div class="card-value large" style="color:#fff">${formatEur(totPatrimonio)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px">
          <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 10px">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">🏦 Conti correnti</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totCC)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 10px">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">🏛 Conti deposito</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totDep)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 10px">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">📈 Investimenti</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totInvest)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 10px">
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7)">🥇 Beni reali</div>
            <div style="font-size:0.9rem;font-weight:700;color:white">${formatEur(totBeni)}</div>
          </div>
        </div>
      </div>

      <!-- KPI mese -->
      <p class="section-title">${MESI_NOMI[mese.mese]} ${mese.anno}</p>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="label">Entrate</div>
          <div class="value text-positive">${formatEur(totRE)}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">prev. ${formatEur(totPE)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Uscite</div>
          <div class="value text-negative">${formatEur(totRU)}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">prev. ${formatEur(totPU)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Saldo mese</div>
          <div class="value ${saldoR>=0?'text-positive':'text-negative'}">${formatEur(saldoR,true)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Tasso risparmio</div>
          <div class="value ${tassoRisp>=0.1?'text-positive':'text-negative'}">${formatPct(tassoRisp)}</div>
        </div>
      </div>

      <!-- Grafico ciambella patrimonio -->
      <p class="section-title mt-24">Composizione patrimonio</p>
      <div class="card">
        <div style="position:relative;width:180px;height:180px;margin:0 auto">
          <canvas id="chart-patrimonio"></canvas>
        </div>
      </div>

      <!-- Grafici budget -->
      ${totRE > 0 || totRU > 0 ? `
      <p class="section-title mt-24">Budget ${MESI_NOMI[mese.mese]}</p>
      <div class="card" style="margin-bottom:10px">
        <div class="card-title" style="color:var(--green)">▲ ENTRATE — ${formatEur(totRE)}</div>
        <div style="position:relative;height:${Math.max(60, catTotaliE.filter(x=>x.catR>0).length * 28)}px">
          <canvas id="chart-entrate"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="color:var(--red)">▼ USCITE — ${formatEur(totRU)}</div>
        <div style="position:relative;height:${Math.max(60, catTotaliU.filter(x=>x.catR>0).length * 28)}px">
          <canvas id="chart-uscite"></canvas>
        </div>
      </div>` : `
      <div class="card mt-16" style="border-color:var(--blue-light);background:var(--blue-light)">
        <p style="font-size:0.85rem;color:var(--blue);font-weight:600">👋 Benvenuto in BudgetMe!</p>
        <p style="font-size:0.82rem;color:var(--blue);margin-top:6px">
          Vai su <strong>Conti</strong> per aggiungere i tuoi conti correnti, poi su
          <strong>Budget</strong> per registrare entrate e uscite.
        </p>
      </div>`}
    `;

    // ── Grafico patrimonio ─────────────────────────────────────────────────
    if (totPatrimonio > 0) {
      const ctx = document.getElementById('chart-patrimonio')?.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Conti correnti','Conti deposito','Investimenti','Beni reali'],
            datasets: [{
              data: [Math.max(0,totCC), Math.max(0,totDep), Math.max(0,totInvest), Math.max(0,totBeni)],
              backgroundColor: ['#2a78d6','#1baf7a','#7c3d9e','#b8860b'],
              borderWidth: 0
            }]
          },
          options: {
            responsive:true, maintainAspectRatio:false, cutout:'55%',
            plugins: {
              legend:{ position:'bottom', labels:{ font:{size:10}, padding:6,
                generateLabels: (chart) => {
                  const data = chart.data;
                  return data.labels.map((label, i) => ({
                    text: label + ': ' + formatEur(data.datasets[0].data[i]),
                    fillStyle: data.datasets[0].backgroundColor[i],
                    hidden: false, index: i
                  }));
                }
              }},
              tooltip:{ callbacks:{ label: ctx => ' '+formatEur(ctx.raw) } }
            }
          },
          plugins: [{
            id: 'sliceLabels',
            afterDraw(chart) {
              const {ctx, chartArea: {width, height}, data} = chart;
              const total = data.datasets[0].data.reduce((a,b) => a+b, 0);
              const cx = chart.getDatasetMeta(0).data[0]?.x || width/2;
              const cy = chart.getDatasetMeta(0).data[0]?.y || height/2;
              chart.getDatasetMeta(0).data.forEach((arc, i) => {
                const val = data.datasets[0].data[i];
                if (!val || val/total < 0.03) return;
                const angle = (arc.startAngle + arc.endAngle) / 2;
                const r = (arc.outerRadius + arc.innerRadius) / 2;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;
                const pct = Math.round(val/total*100);
                ctx.save();
                ctx.fillStyle = 'white';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = 3;
                ctx.fillText(pct + '%', x, y);
                ctx.restore();
              });
            }
          }]
        });
      }
    } else {
      const el = document.getElementById('chart-patrimonio');
      if (el) el.parentElement.innerHTML = '<div class="empty-state" style="padding:20px 0"><p>Aggiungi conti per vedere il grafico</p></div>';
    }

    // ── Grafici budget (barre orizzontali) ────────────────────────────────
    const buildBarChart = (canvasId, data, labels, colors) => {
      const ctx = document.getElementById(canvasId)?.getContext('2d');
      if (!ctx) return;
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels.map(l => l.length > 16 ? l.slice(0,16)+'…' : l),
          datasets: [{
            data, backgroundColor: colors,
            borderRadius: 3, borderWidth: 0,
            maxBarThickness: 18
          }]
        },
        options: {
          indexAxis: 'y', responsive:true, maintainAspectRatio:false,
          layout: { padding: { right: 8 } },
          plugins: {
            legend:{ display:false },
            tooltip:{ callbacks:{ label: ctx => ' '+formatEur(ctx.raw) } }
          },
          scales: {
            x:{
              grid:{ color:'rgba(0,0,0,0.06)' },
              ticks:{ font:{size:9}, maxTicksLimit:4,
                callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k€' : v+'€' }
            },
            y:{ grid:{display:false}, ticks:{ font:{size:9} } }
          }
        }
      });
    };

    if (totRE > 0) {
      const filtrati = catTotaliE.filter(x => x.catR > 0);
      buildBarChart('chart-entrate',
        filtrati.map(x => x.catR),
        filtrati.map(x => x.cat.nome),
        filtrati.map(x => x.cat.colore || '#1baf7a')
      );
    }
    if (totRU > 0) {
      const filtrati = catTotaliU.filter(x => x.catR > 0);
      buildBarChart('chart-uscite',
        filtrati.map(x => x.catR),
        filtrati.map(x => x.cat.nome),
        filtrati.map(x => x.cat.colore || '#e34948')
      );
    }

  } catch(err) {
    console.error('Dashboard error:', err);
    document.getElementById('content').innerHTML =
      '<div class="empty-state"><p>Errore caricamento dashboard. Ricarica la pagina.</p></div>';
  }
}
