/* ============================================
   BudgetMe — router.js
   Navigazione SPA tra le 5 sezioni
   ============================================ */

const routes = {
  dashboard: { page: 'pages/dashboard.html', module: 'js/modules/dashboard.js', label: 'Dashboard' },
  budget:    { page: 'pages/budget.html',    module: 'js/modules/budget.js',    label: 'Budget' },
  conti:     { page: 'pages/conti.html',     module: 'js/modules/conti.js',     label: 'Conti' },
  depositi:  { page: 'pages/depositi.html',  module: 'js/modules/depositi.js',  label: 'Depositi' },
  pac:       { page: 'pages/pac.html',       module: 'js/modules/pac.js',       label: 'PAC' }
};

let currentRoute = null;
let loadedModules = {};

export async function navigate(routeName) {
  if (!routes[routeName]) return;
  if (currentRoute === routeName) return;

  const route = routes[routeName];
  const content = document.getElementById('content');

  // Aggiorna navbar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeName);
  });

  // Aggiorna titolo header
  document.getElementById('page-title').textContent = route.label;

  // Carica HTML della pagina
  try {
    const res = await fetch(route.page);
    const html = await res.text();
    content.innerHTML = html;
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Pagina non disponibile</p></div>';
    return;
  }

  // Carica e inizializza modulo JS
  if (!loadedModules[routeName]) {
    const mod = await import(`../${route.module}`);
    loadedModules[routeName] = mod;
  }
  if (loadedModules[routeName]?.init) {
    await loadedModules[routeName].init();
  }

  currentRoute = routeName;

  // Salva rotta corrente per reload
  sessionStorage.setItem('lastRoute', routeName);
}

export function initRouter() {
  // Intercetta click navbar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.route));
  });

  // Ripristina ultima rotta o vai alla dashboard
  const last = sessionStorage.getItem('lastRoute') || 'dashboard';
  navigate(last);
}
