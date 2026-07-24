/* BudgetMe — router.js */
const routes = {
  dashboard: { page: 'pages/dashboard.html', module: './js/modules/dashboard.js', label: 'Dashboard' },
  budget:    { page: 'pages/budget.html',    module: './js/modules/budget.js',    label: 'Budget' },
  conti:     { page: 'pages/conti.html',     module: './js/modules/conti.js',     label: 'Conti' },
  depositi:  { page: 'pages/depositi.html',  module: './js/modules/depositi.js',  label: 'Depositi' },
  pac:       { page: 'pages/pac.html',       module: './js/modules/pac.js',       label: 'Investimenti' }
};

let currentRoute = null;

export async function navigate(routeName) {
  if (!routes[routeName]) return;
  const route = routes[routeName];
  const content = document.getElementById('content');

  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.route === routeName));
  document.getElementById('page-title').textContent = route.label;

  try {
    const res = await fetch(route.page + '?v=' + Date.now());
    content.innerHTML = await res.text();
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Pagina non disponibile</p></div>';
    return;
  }

  // Importa sempre fresh — nessuna cache dei moduli
  const mod = await import(route.module.replace('./js/', './') + '?v=' + Date.now());
  if (mod?.init) await mod.init();

  currentRoute = routeName;
  sessionStorage.setItem('lastRoute', routeName);
}

export function initRouter() {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.route)));
  const last = sessionStorage.getItem('lastRoute') || 'dashboard';
  navigate(last);
}
