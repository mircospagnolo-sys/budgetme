/* BudgetMe — estrattoBper.js
   Lettura dell'estratto conto BPER (PDF "Riepilogo mensile"): solo logica, niente DB né DOM. */

const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/;

function importoIt(s) {                         // "2.268,00" -> 2268
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
}

// Input: pagine = [ [ {s, x, y, w}, ... ], ... ] (testo e posizione dal PDF, una lista per pagina)
// Output: [ {data:'YYYY-MM-DD', tipo:'entrata'|'uscita', importo, raw} ]
export function parseBperPagine(pagine) {
  const righe = [];
  let corrente = null;
  pagine.forEach(items => {
    const testa = items.find(i => i.s.trim() === 'DATA');
    const segno = items.find(i => i.s.trim() === 'SEGNO (D/A)');
    const descr = items.find(i => i.s.trim() === 'DESCRIZIONE OPERAZIONE');
    if (!testa || !segno || !descr) return;                 // pagina senza tabella
    const yTesta = testa.y, xDescr = descr.x - 12, xSegnoMax = descr.x - 60;

    // elementi sotto l'intestazione, raggruppati per riga (stessa quota y)
    const utili = items.filter(i => i.s.trim() !== '' && i.y < yTesta - 2)
                       .sort((a, b) => b.y - a.y || a.x - b.x);
    const perY = [];
    utili.forEach(i => {
      const g = perY.find(r => Math.abs(r.y - i.y) <= 2);
      if (g) g.items.push(i); else perY.push({ y: i.y, items: [i] });
    });

    let yPrec = yTesta;
    perY.forEach(riga => {
      const dataIt = riga.items.find(i => i.x < segno.x - 20 && RE_DATA.test(i.s.trim()));
      const dist = yPrec - riga.y;
      if (dataIt) {
        const segnoIt = riga.items.find(i => (i.s.trim() === 'D' || i.s.trim() === 'A')
                                             && i.x >= segno.x - 20 && i.x < xSegnoMax);
        const impIt = riga.items.find(i => i.x > segno.x && i.x + i.w <= xSegnoMax + 60
                                           && /^[\d.]+,\d{2}$/.test(i.s.trim()));
        const desc = riga.items.filter(i => i.x >= xDescr).map(i => i.s.trim()).join(' ');
        if (segnoIt && impIt) {
          const m = RE_DATA.exec(dataIt.s.trim());
          const g = m[1].padStart(2, '0'), me = m[2].padStart(2, '0'), a = 2000 + parseInt(m[3]);
          corrente = {
            data: `${a}-${me}-${g}`,
            tipo: segnoIt.s.trim() === 'A' ? 'entrata' : 'uscita',
            importo: importoIt(impIt.s),
            raw: desc
          };
          righe.push(corrente);
        }
      } else if (corrente && dist <= 12) {
        // riga di continuazione della descrizione (anche a cavallo di pagina)
        const testo = riga.items.filter(i => i.x >= xDescr).map(i => i.s.trim()).join(' ');
        if (testo) corrente.raw += ' ' + testo;
      }
      yPrec = riga.y;
    });
  });
  righe.forEach(r => { r.raw = r.raw.replace(/\s+/g, ' ').trim(); });
  return righe;
}

// ── Pulizia delle descrizioni ────────────────────────────────────────────────
// Toglie date, numeri di carta e codici, così la stessa spesa ha sempre lo stesso testo
// e il suggerimento della voce in Categorizza funziona.
const TOGLI_PAESE = /\s+(IT|LU|LT|DE|FR|ES|IE|NL|US|GB)$/;

function ripulisciNegozio(x) {
  let n = x.replace(TOGLI_PAESE, '').replace(/^Grazie da\s+/i, '').trim();
  if (/AMAZ|AMZN/i.test(n) && !/prime/i.test(n)) return 'AMAZON';
  return n.replace(/\b(\w+)\s+\1\b/gi, '$1');                // "LATINA LATINA" -> "LATINA"
}

export function pulisciDescrizione(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  let m;
  if ((m = /^PAGAMENTO SU CIRCUITO INTERNAZIONALE (.+?) Operazione carta/i.exec(t))) return ripulisciNegozio(m[1]);
  if ((m = /^PAGAMENTO CIRC\. BANCOMAT (.+?) Operazione carta/i.exec(t))) return ripulisciNegozio(m[1]);
  if ((m = /^ADDEBITO SDD (.+?) N:/i.exec(t))) return m[1].trim();
  if (/^RATA PRESTITO/i.test(t)) return 'RATA PRESTITO';
  if (/^PRELIEVO CARDLESS/i.test(t)) return 'PRELIEVO ATM';
  if ((m = /^DISPOSIZIONE (?:BONIFICO ISTANTANEO )?a favore di (.+?) EUR\b/i.exec(t))) return 'Bonifico a ' + m[1].trim();
  if ((m = /^EMOLUMENTI o\/c:\s*(.+?)\s+ABI-CAB/i.exec(t))) return 'Emolumenti ' + m[1].trim();
  if ((m = /^BONIFICO o\/c:\s*(.+?)\s+ABI-CAB/i.exec(t))) return 'Bonifico da ' + m[1].trim();
  if ((m = /^BONIFICO (.+?) Storno op\. carta/i.exec(t))) return 'Storno ' + ripulisciNegozio(m[1]);
  return t.length > 80 ? t.slice(0, 80) + '…' : t;
}

// ── Giroconti ────────────────────────────────────────────────────────────────
// Riconosce i movimenti che sembrano spostamenti tra miei conti. `titolare` è il mio nome,
// lo scrive l'utente nell'app (non è nel codice): ordine delle parole indifferente.
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function riconosciGiroconto(raw, tipo, titolare) {
  const t = String(raw || '');
  const parole = String(titolare || '').trim().split(/\s+/).filter(Boolean).map(esc);
  if (parole.length >= 2) {
    const nome = `(?:${parole.join('\\s+')}|${[...parole].reverse().join('\\s+')})`;
    if (tipo === 'entrata' && new RegExp('o\\/c:\\s*' + nome, 'i').test(t)) return true;
    if (tipo === 'uscita' && new RegExp('a favore di\\s+' + nome, 'i').test(t)) return true;
  }
  return tipo === 'entrata' && /TRASFERIMENTO (SU|SALDO)/i.test(t);
}

// ── Righe già presenti ───────────────────────────────────────────────────────
// Confronta le righe lette con i movimenti già salvati nel conto: stessa data, tipo e importo.
// Se l'estratto ha due righe uguali e nel conto ce n'è una sola, la seconda resta "nuova".
// Un trasferimento già registrato conta come uscita sul conto di origine e come entrata sulla destinazione.
export function segnaDuplicati(righe, esistenti, contoId) {
  const mappa = new Map();
  const aggiungi = k => mappa.set(k, (mappa.get(k) || 0) + 1);
  esistenti.forEach(m => {
    const imp = Number(m.importo).toFixed(2);
    if (m.tipo === 'trasferimento') {
      if (m.conto_id === contoId)      aggiungi(`${m.data}|uscita|${imp}`);
      if (m.conto_dest_id === contoId) aggiungi(`${m.data}|entrata|${imp}`);
    } else if (m.conto_id === contoId) {
      aggiungi(`${m.data}|${m.tipo}|${imp}`);
    }
  });
  return righe.map(r => {
    const k = `${r.data}|${r.tipo}|${r.importo.toFixed(2)}`;
    const gia = (mappa.get(k) || 0) > 0;
    if (gia) mappa.set(k, mappa.get(k) - 1);
    return gia;
  });
}
