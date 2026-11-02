/* BudgetMe — analisi.js */
import db from '../db.js';
import { formatEur, MESI_NOMI } from '../utils.js';

export async function init() {
  const root = document.getElementById('analisi-root');
  root.innerHTML = `<div class="spinner" style="margin:32px auto"></div>`;

  const anno = new Date().getFullYear();

  // Carica tutti i mesi dell'anno
  const mesi = await db.mesi.where('anno').equals(anno).toArray();

  // Carica registrazioni e movimenti voce per ogni mese
  const datiMesi = await Promise.all(
    Array.from({length: 12}, async (_, i) => {
      const meseNum = i + 1;
      const mesePad = String(meseNum).padStart(2, '0');
      const dataInizio = `${anno}-${mesePad}-01`;
      const dataFine   = new Date(anno, meseNum, 0).toISOString().split('T')[0];

      const rec = mesi.find(m => m.mese === meseNum);
      if (!rec) return { mese: meseNum, entrate: 0, uscite: 0 };

      // Movimenti conto del mese
      const movs = await db.movimenti_conto
        .where('data').between(dataInizio, dataFine, true, true).toArray();

      const entrate = movs.filter(m => m.tipo === 'entrata').reduce((s,m) => s+m.importo, 0);
      const uscite  = movs.filter(m => m.tipo === 'uscita').reduce((s,m) => s+m.importo, 0);

      return { mese: meseNum, entrate, uscite };
    })
  );

  // Categorie top uscite (media mensile)
  const cats = await db.categorie_budget.where('tipo').equals('uscita').toArray();
  const voci = await db.voci_budget.where('attiva').equals(1).toArray();
  const regs = await db.registrazioni.toArray();
  const movsVoce = await db.movimenti_voce.toArray();

  const catTotali = await Promise.all(cats.map(async cat => {
    const vociCat = voci.filter(v => v.categoria_id === cat.id);
    let tot = 0;
    vociCat.forEach(v => {
      const movTot = movsVoce.filter(m => m.voce_id === v.id).reduce((s,m) => s+m.importo, 0);
      const regTot = regs.filter(r => r.voce_id === v.id).reduce((s,r) => s+(r.importo_reale||0), 0);
      tot += movTot > 0 ? movTot : regTot;
    });
    return { nome: cat.nome, colore: cat.colore, totale: tot };
  }));

  const topCat = catTotali.filter(c => c.totale > 0)
    .sort((a,b) => b.totale - a.totale).slice(0, 5);

  const totEntrate = datiMesi.reduce((s,m) => s+m.entrate, 0);
  const totUscite  = datiMesi.reduce((s,m) => s+m.uscite, 0);
  const mesiConDati = datiMesi.filter(m => m.entrate > 0 || m.uscite > 0).length || 1;
  const mediaEntrate = totEntrate / mesiConDati;
  const mediaUscite  = totUscite  / mesiConDati;
  const mediaSaldo   = mediaEntrate - mediaUscite;

  root.innerHTML = `
    <!-- Sommario anno -->
    <p class="section-title">${anno} — Riepilogo annuale</p>
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-card">
        <div class="label">Entrate totali</div>
        <div class="value text-positive">${formatEur(totEntrate)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">media ${formatEur(mediaEntrate)}/mese</div>
      </div>
      <div class="kpi-card">
        <div class="label">Uscite totali</div>
        <div class="value text-negative">${formatEur(totUscite)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">media ${formatEur(mediaUscite)}/mese</div>
      </div>
      <div class="kpi-card">
        <div class="label">Saldo medio/mese</div>
        <div class="value ${mediaSaldo>=0?'text-positive':'text-negative'}">${formatEur(mediaSaldo,true)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Tasso risparmio</div>
        <div class="value ${mediaSaldo>=0?'text-positive':'text-negative'}">
          ${totEntrate > 0 ? ((mediaSaldo/mediaEntrate)*100).toFixed(1) : '0.0'}%
        </div>
      </div>
    </div>

    <!-- Grafico trend annuale -->
    <p class="section-title">Trend mensile ${anno}</p>
    <div class="card" style="margin-bottom:16px">
      <div style="position:relative;height:200px">
        <canvas id="chart-trend"></canvas>
      </div>
    </div>

    <!-- Top categorie spesa -->
    <p class="section-title">Top categorie di spesa</p>
    <div class="card" style="margin-bottom:16px;padding:0;overflow:hidden">
      ${topCat.length === 0
        ? '<div class="empty-state" style="padding:24px"><p>Nessun dato disponibile</p></div>'
        : topCat.map((cat, i) => {
            const pct = totUscite > 0 ? (cat.totale/totUscite*100).toFixed(1) : 0;
            return `
            <div style="padding:12px 14px;${i>0?'border-top:1px solid var(--border)':''}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:10px;height:10px;border-radius:50%;background:${cat.colore||'#888'};flex-shrink:0"></div>
                  <span style="font-size:0.88rem;font-weight:600">${cat.nome}</span>
                </div>
                <div style="text-align:right">
                  <div style="font-size:0.95rem;font-weight:700">${formatEur(cat.totale)}</div>
                  <div style="font-size:0.7rem;color:var(--text-muted)">${pct}% delle uscite</div>
                </div>
              </div>
              <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${cat.colore||'#888'};border-radius:2px"></div>
              </div>
            </div>`;
          }).join('')}
    </div>

    <!-- Confronto mesi -->
    <p class="section-title">Confronto mesi</p>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead>
            <tr style="background:var(--bg)">
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-muted)">Mese</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--green)">Entrate</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--red)">Uscite</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${datiMesi.filter(m => m.entrate > 0 || m.uscite > 0).map(m => {
              const saldo = m.entrate - m.uscite;
              return `
              <tr style="border-top:1px solid var(--border)">
                <td style="padding:9px 12px;font-weight:500">${MESI_NOMI[m.mese]}</td>
                <td style="padding:9px 12px;text-align:right;color:var(--green)">${formatEur(m.entrate)}</td>
                <td style="padding:9px 12px;text-align:right;color:var(--red)">${formatEur(m.uscite)}</td>
                <td style="padding:9px 12px;text-align:right;font-weight:700;
                     color:${saldo>=0?'var(--green)':'var(--red)'}">
                  ${formatEur(saldo, true)}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Grafico trend
  const ctx = document.getElementById('chart-trend')?.getContext('2d');
  if (ctx) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: MESI_NOMI.slice(1),
        datasets: [
          {
            label: 'Entrate',
            data: datiMesi.map(m => m.entrate),
            backgroundColor: 'rgba(27,175,122,0.7)',
            borderRadius: 4, borderWidth: 0
          },
          {
            label: 'Uscite',
            data: datiMesi.map(m => m.uscite),
            backgroundColor: 'rgba(227,73,72,0.7)',
            borderRadius: 4, borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatEur(ctx.raw)}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: {
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k€' : v+'€' }
          }
        }
      }
    });
  }
}