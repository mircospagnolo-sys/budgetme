/* BudgetMe — patrimonio.js */

let currentTab = 'conti';

export async function init() {
  setupTabs();
  await renderTab();
}

function setupTabs() {
  document.querySelectorAll('#patrimonio-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#patrimonio-tabs .tab-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      await renderTab();
    });
  });
}

async function renderTab() {
  if (currentTab === 'conti')        await loadModule('conti');
  else if (currentTab === 'depositi') await loadModule('depositi');
  else if (currentTab === 'investimenti') await loadModule('pac');
}

async function loadModule(name) {
  const root = document.getElementById('patrimonio-root');
  try {
    // Carica HTML della sotto-pagina
    const res = await fetch(`pages/${name}.html?v=` + Date.now());
    root.innerHTML = await res.text();
    // Inizializza il modulo corrispondente
    const mod = await import(`./${name}.js?v=` + Date.now());
    if (mod?.init) await mod.init();
  } catch(e) {
    root.innerHTML = '<div class="empty-state"><p>Errore caricamento.</p></div>';
    console.error(e);
  }
}