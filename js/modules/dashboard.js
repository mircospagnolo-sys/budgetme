/* BudgetMe — dashboard.js */
import { patrimonioNetto, getOrCreateMeseCorrente,
         totaleUsciteMese, totaleEntrateMese } from '../db.js';
import { formatEur, formatPct, MESI_NOMI } from '../utils.js';

export async function init() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="spinner"></div>`;

  try {
    const [patrimonio, mese] = await Promise.all([
      patrimonioNetto(),
      getOrCreateMeseCorrente()
    ]);

    const uscite  = await totaleUsciteMese(mese.id);
    const entrate = await totaleEntrateMese(mese.id);
    const saldo   = entrate - uscite;
    const tassoRisparmio = entrate > 0 ? saldo / entrate : 0;

    content.innerHTML = `
      <!-- Patrimonio netto -->
      <div class="card" style="background:var(--blue);border:none;margin-bottom:16px">
        <div class="card-title" style="color:rgba(255,255,255,0.75)">PATRIMONIO NETTO</div>
        <div class="card-value large" style="color:#fff">${formatEur(patrimonio.totale)}</div>
        <div style="display:flex;gap:12px;margin-top:12px;font-size:0.78rem;
               color:rgba(255,255,255,0.85);flex-wrap:wrap">
          <span>🏦 C/C ${formatEur(patrimonio.cc)}</span>
          <span>🏛 Dep. ${formatEur(patrimonio.dep)}</span>
          <span>📈 Portaf. ${formatEur(patrimonio.pac)}</span>
          ${patrimonio.beni > 0 ? `<span>🥇 Beni ${formatEur(patrimonio.beni)}</span>` : ''}
        </div>
      </div>

      <!-- Mese corrente -->
      <p class="section-title">${MESI_NOMI[mese.mese]} ${mese.anno}</p>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="label">Entrate</div>
          <div class="value text-positive">${formatEur(entrate)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Uscite</div>
          <div class="value text-negative">${formatEur(uscite)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Saldo mese</div>
          <div class="value ${saldo >= 0 ? 'text-positive' : 'text-negative'}">${formatEur(saldo, true)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Tasso risparmio</div>
          <div class="value ${tassoRisparmio >= 0.1 ? 'text-positive' : 'text-negative'}">${formatPct(tassoRisparmio)}</div>
        </div>
      </div>

      <!-- Composizione patrimonio -->
      <p class="section-title mt-24">Composizione patrimonio</p>
      <div class="card">
        <div class="chart-container" style="height:180px">
          <canvas id="chart-patrimonio"></canvas>
        </div>
      </div>

      <!-- Guida rapida se dati vuoti -->
      ${patrimonio.totale === 0 ? `
      <div class="card mt-16" style="border-color:var(--blue-light);background:var(--blue-light)">
        <p style="font-size:0.85rem;color:var(--blue);font-weight:600">👋 Benvenuto in BudgetMe!</p>
        <p style="font-size:0.82rem;color:var(--blue);margin-top:6px">
          Inizia aggiungendo i tuoi conti correnti nella sezione <strong>Conti</strong>,
          poi registra i movimenti per vedere il patrimonio aggiornarsi in tempo reale.
        </p>
      </div>` : ''}
    `;

    // Grafico ciambella patrimonio
    if (patrimonio.totale > 0) {
      const ctx = document.getElementById('chart-patrimonio').getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Conti correnti', 'Conti deposito', 'PAC ETF'],
          datasets: [{
            data: [
              Math.max(0, patrimonio.cc),
              Math.max(0, patrimonio.dep),
              Math.max(0, patrimonio.pac)
            ],
            backgroundColor: ['#2a78d6','#1baf7a','#7c3d9e'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
            tooltip: { callbacks: { label: ctx => ' ' + formatEur(ctx.raw) } }
          }
        }
      });
    } else {
      document.getElementById('chart-patrimonio').parentElement.innerHTML =
        '<div class="empty-state"><p>Aggiungi conti per vedere il grafico</p></div>';
    }

  } catch(err) {
    console.error(err);
    content.innerHTML = '<div class="empty-state"><p>Errore caricamento dashboard</p></div>';
  }
}
