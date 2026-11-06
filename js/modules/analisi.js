/* BudgetMe — analisi.js */
import db from '../db.js';
import { formatEur, MESI_NOMI } from '../utils.js';

// ── CONFIGURAZIONE ───────────────────────────────────────────────────────────
// Categorie che non sono spese: restano fuori dalle uscite e da "Top categorie"
const CAT_NON_SPESA = ['Risparmio e Liquidità', 'Investimento Lungo Termine'];
// Nomi usati in passato dal modulo Conti per risparmio e investimenti
const NOMI_LEGACY_NON_SPESA = ['Risparmio', 'Investimento PAC'];
// Entrate una tantum (assegni, vendite, regali): fuori da media e tasso di risparmio
const CAT_ENTRATE_STRAORD = ['Entrate Straordinarie'];

const somma = righe => righe.reduce((s, m) => s + m.importo, 0);

export async function init() {
  const root = document.getElementById('analisi-root');
  root.innerHTML = `<div class="spinner" style="margin:32px auto"></div>`;

  const anno = new Date().getFullYear();

  const [mesi, cats, voci, regs, movsVoce] = await Promise.all([
    db.mesi.where('anno').equals(anno).toArray(),
    db.categorie_budget.toArray(),
    db.voci_budget.toArray(),
    db.registrazioni.toArray(),
    db.movimenti_voce.toArray()
  ]);

  // ── Riconoscimento di risparmio/investimenti e di entrate straordinarie ──
  const idCatNonSpesa = new Set(cats.filter(c => CAT_NON_SPESA.includes(c.nome)).map(c => c.id));
  const idCatStraord  = new Set(cats.filter(c => CAT_ENTRATE_STRAORD.includes(c.nome)).map(c => c.id));
  const vociNonSpesa  = voci.filter(v => idCatNonSpesa.has(v.categoria_id));
  const vociStraord   = voci.filter(v => idCatStraord.has(v.categoria_id));

  const nomiNonSpesa = new Set([...CAT_NON_SPESA, ...NOMI_LEGACY_NON_SPESA,
                                ...vociNonSpesa.map(v => v.nome)]);
  const nomiStraord  = new Set([...CAT_ENTRATE_STRAORD, ...vociStraord.map(v => v.nome)]);

  const idVoceNonSpesa = new Set(vociNonSpesa.map(v => v.id));
  const idVoceStraord  = new Set(vociStraord.map(v => v.id));

  // Un movimento del conto è collegato al Budget tramite voce_budget_id
  // (= id del movimento voce); in mancanza, si guarda il nome della categoria
  const idMovNonSpesa = new Set(movsVoce
    .filter(m => idVoceNonSpesa.has(m.voce_id) || m.note === 'Prima te stesso')
    .map(m => m.id));
  const idMovStraord = new Set(movsVoce
    .filter(m => idVoceStraord.has(m.voce_id)).map(m => m.id));

  const isNonSpesa = m => idMovNonSpesa.has(m.voce_budget_id) || nomiNonSpesa.has(m.categoria);
  const isStraord  = m => idMovStraord.has(m.voce_budget_id)  || nomiStraord.has(m.categoria);

  // ── Dati mensili dai movimenti dei conti ──
  const datiMesi = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const meseNum = i + 1;
      const mesePad = String(meseNum).padStart(2, '0');
      const dataInizio = `${anno}-${mesePad}-01`;
      const dataFine   = `${anno}-${mesePad}-${String(new Date(anno, meseNum, 0).getDate()).padStart(2, '0')}`;

      const movs = await db.movimenti_conto
        .where('data').between(dataInizio, dataFine, true, true).toArray();

      return {
        mese: meseNum,
        entrate:       somma(movs.filter(m => m.tipo === 'entrata' && !isStraord(m))),
        uscite:        somma(movs.filter(m => m.tipo === 'uscita'  && !isNonSpesa(m))),
        straordinarie: somma(movs.filter(m => m.tipo === 'entrata' &&  isStraord(m))),
        risparmio:     somma(movs.filter(m => m.tipo === 'uscita'  &&  isNonSpesa(m)))
      };
    })
  );

  // ── Top categorie di spesa (solo anno corrente, senza risparmio/investimenti) ──
  // Reale di una voce in un mese: movimenti voce se esistono, altrimenti importo diretto
  const idMesiAnno = new Set(mesi.map(m => m.id));
  const movPerVoceMese = {};
  movsVoce.filter(m => idMesiAnno.has(m.mese_id)).forEach(m => {
    const k = `${m.voce_id}_${m.mese_id}`;
    movPerVoceMese[k] = (movPerVoceMese[k] || 0) + m.importo;
  });
  const realeVoce = {};
  Object.entries(movPerVoceMese).forEach(([k, v]) => {
    const voceId = k.split('_')[0];
    realeVoce[voceId] = (realeVoce[voceId] || 0) + v;
  });
  regs.filter(r => idMesiAnno.has(r.mese_id)).forEach(r => {
    if (movPerVoceMese[`${r.voce_id}_${r.mese_id}`] === undefined)
      realeVoce[r.voce_id] = (realeVoce[r.voce_id] || 0) + (r.importo_reale || 0);
  });

  const vociAttive = voci.filter(v => v.attiva);
  const catTotali = cats
    .filter(c => c.tipo === 'uscita' && !idCatNonSpesa.has(c.id))
    .map(cat => ({
      nome: cat.nome, colore: cat.colore,
      totale: vociAttive.filter(v => v.categoria_id === cat.id)
                        .reduce((s, v) => s + (realeVoce[v.id] || 0), 0)
    }));
  const totSpeseCat = catTotali.reduce((s, c) => s + c.totale, 0);
  const topCat = catTotali.filter(c => c.totale > 0)
    .sort((a, b) => b.totale - a.totale).slice(0, 5);

  // ── Totali e medie ──
  const totEntrate = datiMesi.reduce((s, m) => s + m.entrate, 0);
  const totUscite  = datiMesi.reduce((s, m) => s + m.uscite, 0);
  const totStraord = datiMesi.reduce((s, m) => s + m.straordinarie, 0);
  const totRisp    = datiMesi.reduce((s, m) => s + m.risparmio, 0);
  const mesiConDati = datiMesi.filter(m => m.entrate > 0 || m.uscite > 0).length || 1;
  const mediaEntrate = totEntrate / mesiConDati;
  const mediaUscite  = totUscite  / mesiConDati;
  const mediaSaldo   = mediaEntrate - mediaUscite;

  const esclusi = [];
  if (totStraord > 0) esclusi.push(`entrate straordinarie ${formatEur(totStraord)}`);
  if (totRisp > 0)    esclusi.push(`risparmio e investimenti versati ${formatEur(totRisp)}`);

  root.innerHTML = `
    <!-- Sommario anno -->
    <p class="section-title">${anno} — Riepilogo annuale</p>
    <div class="kpi-grid" style="margin-bottom:${esclusi.length ? 8 : 16}px">
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
    ${esclusi.length ? `
    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:16px;line-height:1.4">
      Non contati nei totali: ${esclusi.join(' · ')}
    </div>` : ''}

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
            const pct = totSpeseCat > 0 ? (cat.totale/totSpeseCat*100).toFixed(1) : 0;
            return `
            <div style="padding:12px 14px;${i>0?'border-top:1px solid var(--border)':''}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:10px;height:10px;border-radius:50%;background:${cat.colore||'#888'};flex-shrink:0"></div>
                  <span style="font-size:0.88rem;font-weight:600">${cat.nome}</span>
                </div>
                <div style="text-align:right">
                  <div style="font-size:0.95rem;font-weight:700">${formatEur(cat.totale)}</div>
                  <div style="font-size:0.7rem;color:var(--text-muted)">${pct}% delle spese</div>
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