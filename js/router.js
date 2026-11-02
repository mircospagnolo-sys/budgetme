/* BudgetMe — router.js v2 */
const routes = {
  home:       { page: 'pages/dashboard.html', module: './modules/dashboard.js', label: 'Home' },
  mese:       { page: 'pages/mese.html',      module: './modules/mese.js',      label: 'Mese' },
  patrimonio: { page: 'pages/patrimonio.html',module: './modules/patrimonio.js',label: 'Patrimonio' },
  analisi:    { page: 'pages/analisi.html',   module: './modules/analisi.js',   label: 'Analisi' }
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

  const mod = await import(route.module.replace('./js/', './') + '?v=' + Date.now());
  if (mod?.init) await mod.init();

  currentRoute = routeName;
  sessionStorage.setItem('lastRoute', routeName);
}

export function initRouter() {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.route)));
  const last = sessionStorage.getItem('lastRoute') || 'home';
  navigate(last);
}
