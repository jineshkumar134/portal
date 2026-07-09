/* ================================================================
   ADMISSION PORTAL — app.js
   Pure dynamic client. Every piece of data comes from MongoDB.
   Protected by user authentication.
================================================================ */

// ─── Global State ────────────────────────────────────────────────
const S = {
  leads: [], campaigns: [], tasks: [], staff: [], content: [], seo: [],
  config: {},
  charts: {},
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  dragId: null,
  dragStatus: null,
  mktTab: 'paid',   // 'paid' | 'organic'
};

// ─── API Helpers ─────────────────────────────────────────────────
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  
  const r = await fetch(path, opts);
  if (r.status === 401 && path !== '/api/auth/me') {
    handleLogout();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const GET  = p      => api('GET',    p);
const POST = (p, b) => api('POST',   p, b);
const PUT  = (p, b) => api('PUT',    p, b);
const DEL  = p      => api('DELETE', p);

// ─── Bootstrap & Auth ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  initRouter();
  initSearch();
  
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const user = await GET('/api/auth/me');
      localStorage.setItem('user', JSON.stringify(user));
      document.body.classList.remove('auth-required');
      document.body.classList.add('authenticated');
      await loadAll();
      applyUser(user);
      fetchAI();
    } catch (e) {
      handleLogout();
    }
  } else {
    handleLogout();
  }
});

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  if (tab === 'login') {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
  } else {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = gv('login-email');
  const password = gv('login-password');
  try {
    const res = await POST('/api/auth/login', { email, password });
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    document.body.classList.remove('auth-required');
    document.body.classList.add('authenticated');
    toast('Welcome back, ' + res.user.name.split(' ')[0] + '!');
    await loadAll();
    applyUser(res.user);
    fetchAI();
  } catch (err) {
    let errMsg = 'Login failed';
    try {
      const errObj = JSON.parse(err.message);
      errMsg = errObj.error || errMsg;
    } catch (ex) {
      errMsg = err.message || errMsg;
    }
    toast(errMsg, 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const name = gv('signup-name');
  const email = gv('signup-email');
  const password = gv('signup-password');
  try {
    const res = await POST('/api/auth/signup', { name, email, password });
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    document.body.classList.remove('auth-required');
    document.body.classList.add('authenticated');
    toast('Welcome, ' + res.user.name.split(' ')[0] + '! Account created.');
    await loadAll();
    applyUser(res.user);
    fetchAI();
  } catch (err) {
    let errMsg = 'Signup failed';
    try {
      const errObj = JSON.parse(err.message);
      errMsg = errObj.error || errMsg;
    } catch (ex) {
      errMsg = err.message || errMsg;
    }
    toast(errMsg, 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.body.classList.remove('authenticated');
  document.body.classList.add('auth-required');
}

async function loadAll() {
  try {
    [S.leads, S.campaigns, S.tasks, S.staff, S.content, S.config, S.seo] = await Promise.all([
      GET('/api/leads'),
      GET('/api/campaigns'),
      GET('/api/tasks'),
      GET('/api/staff'),
      GET('/api/content'),
      GET('/api/config'),
      GET('/api/seo'),
    ]);
    applyConfig();
    // Restore user info from localStorage (set on login/signup)
    const stored = localStorage.getItem('user');
    if (stored) { try { applyUser(JSON.parse(stored)); } catch(_) {} }
    renderAll();
  } catch (e) {
    toast('Failed to load data: ' + e.message, 'error');
  }
}

function applyConfig() {
  const c = S.config;
  const name = c.businessName || 'Admission Portal';
  const type = c.businessType || 'school';
  set('sidebar-brand-name', name);
  set('dash-heading', name + ' Dashboard');
  set('page-title', name + ' — Admission Portal');
  document.title = name + ' — Admission Portal';

  // prefill settings form
  val('s-biz-name', name);
  val('s-biz-type', type);
  val('s-target', c.targetValue || 0);
  val('s-currency', c.currency || 'USD');
  const npsSlider = document.getElementById('s-nps');
  if (npsSlider) { npsSlider.value = c.npsScore || 0; set('s-nps-val', c.npsScore || 0); }

  // brand
  val('brand-tagline', c.tagline || '');
}

// Apply logged-in user's name/avatar everywhere
function applyUser(user) {
  if (!user) return;
  const initials = user.name
    ? user.name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()
    : '?';
  const firstName = user.name ? user.name.split(' ')[0] : 'User';

  // Topbar avatar
  set('topbar-avatar', initials);

  // Sidebar footer
  set('sidebar-avatar', initials);
  set('sidebar-biz-name', user.name || '');
  set('sidebar-biz-type', user.email || '');
}

function renderAll() {
  renderDashboard();
  renderKanban();
  renderLeadsTable();
  renderMarketing();
  renderTasks();
  renderContent();
  renderStaff();
  renderAnalytics();
}

// ─── Sidebar & Navigation ──────────────────────────────────────────────────
function initSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger');
  const backdrop  = document.getElementById('sidebar-backdrop');
  const mainWrap  = document.querySelector('.main-wrapper');

  function isMobile() { return window.innerWidth <= 768; }

  // Mobile: slide sidebar in
  function openMobile() {
    sidebar.classList.add('sidebar-open');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  // Mobile: slide sidebar out
  function closeMobile() {
    sidebar.classList.remove('sidebar-open');
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
  // Desktop: collapse sidebar to icon rail
  function toggleDesktop() {
    const collapsed = sidebar.classList.toggle('sidebar-collapsed');
    mainWrap.classList.toggle('sidebar-collapsed', collapsed);
  }

  hamburger.addEventListener('click', () => {
    if (isMobile()) {
      sidebar.classList.contains('sidebar-open') ? closeMobile() : openMobile();
    } else {
      toggleDesktop();
    }
  });

  // Tap backdrop to close on mobile
  backdrop.addEventListener('click', closeMobile);

  // On resize, clean up state
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      closeMobile(); // remove any mobile state
    } else {
      sidebar.classList.remove('sidebar-collapsed');
      mainWrap.classList.remove('sidebar-collapsed');
    }
  });
}

function initRouter() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      nav(link.dataset.view);
    });
  });
}

function nav(viewId) {
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === viewId);
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('hidden', v.id !== `view-${viewId}`);
  });
  if (viewId === 'analytics') renderAnalytics();
  if (viewId === 'content') renderCalendar();
  // Close sidebar on mobile after nav
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('sidebar-open');
    document.getElementById('sidebar-backdrop').classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ─── Dashboard ───────────────────────────────────────────────────
function renderDashboard() {
  const total    = S.leads.length;
  const enrolled = S.leads.filter(l => l.status === 'enrolled').length;
  const visits   = S.leads.filter(l => ['visit-scheduled','registered','enrolled'].includes(l.status)).length;
  const convRate = total ? ((enrolled / total) * 100).toFixed(1) : '0.0';
  const target   = S.config.targetValue || 0;
  const pct      = target > 0 ? Math.min(Math.round((enrolled / target) * 100), 100) : 0;

  set('kpi-total', total);
  set('kpi-visits', visits);
  set('kpi-enrolled', enrolled);
  set('kpi-conv', convRate + '%');

  const highLeads = S.leads.filter(l => l.priority === 'high').length;
  set('kpi-total-badge', total === 0 ? 'No contacts yet' : `${highLeads} high priority`);
  set('kpi-visits-badge', visits === 0 ? 'None in progress' : `${visits} active`);
  set('kpi-enrolled-badge', target > 0 ? `${pct}% of target` : 'Set a target');
  set('kpi-conv-badge', convRate > 0 ? (convRate > 20 ? '↑ Strong' : '→ Growing') : 'Add contacts');

  // Target ring
  drawRing(pct);
  set('ring-pct', pct + '%');
  set('ring-detail', `${enrolled} / ${target || '—'} goal`);
  set('funnel-total-label', `${total} contacts total`);

  // Funnel chart
  destroyChart('funnelChart');
  const fCtx = document.getElementById('funnelChart');
  if (fCtx) {
    const counts = [
      S.leads.filter(l => l.status === 'inquiry').length,
      S.leads.filter(l => l.status === 'contacted').length,
      S.leads.filter(l => l.status === 'visit-scheduled').length,
      S.leads.filter(l => l.status === 'registered').length,
      S.leads.filter(l => l.status === 'enrolled').length,
    ];
    S.charts.funnelChart = new Chart(fCtx, {
      type: 'bar',
      data: {
        labels: ['Inquiry', 'Contacted', 'Meeting Booked', 'Proposal Sent', 'Converted'],
        datasets: [{ data: counts, backgroundColor: ['#f97316','#3b82f6','#eab308','#a855f7','#22c55e'], borderRadius: 8, barThickness: 24 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } }
    });
  }

  // Tasks preview (max 5)
  const taskContainer = document.getElementById('dash-tasks-list');
  const pending = S.tasks.filter(t => !t.checked).slice(0, 5);
  if (!pending.length) {
    taskContainer.innerHTML = `<div class="empty-state-mini">No pending tasks — <button class="inline-link" onclick="openModal('task-modal')">add one</button></div>`;
  } else {
    taskContainer.innerHTML = pending.map(t => `
      <div class="task-row">
        <button class="task-check-btn ${t.checked ? 'checked' : ''}" onclick="toggleTask('${t.id}', ${!t.checked})">
          <i class="fa-solid fa-check"></i>
        </button>
        <span class="task-text">${esc(t.text)}</span>
        <span class="priority-tag p-${t.priority}">${t.priority}</span>
        ${t.dueDate ? `<span class="task-due">${t.dueDate}</span>` : ''}
      </div>
    `).join('');
  }
}

function drawRing(pct) {
  const canvas = document.getElementById('ringCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2, cy = canvas.height / 2, r = 60;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.lineWidth = 12; ctx.strokeStyle = '#e2e8f0'; ctx.stroke();
  if (pct > 0) {
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, (-Math.PI / 2) + (pct / 100) * 2 * Math.PI);
    ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.strokeStyle = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f97316' : '#3b82f6'; ctx.stroke();
  }
}

// ─── Kanban CRM ──────────────────────────────────────────────────
function renderKanban() {
  const statuses = ['inquiry', 'contacted', 'visit-scheduled', 'registered', 'enrolled'];
  statuses.forEach(status => {
    const col = document.getElementById(`kcol-${status}`);
    const cnt = document.getElementById(`cnt-${status}`);
    if (!col) return;
    const leads = S.leads.filter(l => l.status === status);
    if (cnt) cnt.textContent = leads.length;
    col.innerHTML = leads.length === 0
      ? `<div class="kanban-empty">Drop a contact here</div>`
      : leads.map(l => kanbanCard(l)).join('');
    // Drag events on cards
    col.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', e => { S.dragId = card.dataset.id; card.classList.add('dragging'); });
      card.addEventListener('dragend', e => card.classList.remove('dragging'));
    });
    // Drop zone on column
    const colEl = col.closest('.kanban-col');
    colEl.addEventListener('dragover', e => { e.preventDefault(); colEl.classList.add('drag-over'); });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('drag-over'));
    colEl.addEventListener('drop', async () => {
      colEl.classList.remove('drag-over');
      if (S.dragId && S.dragId !== '') {
        await PUT(`/api/leads/${S.dragId}`, { status });
        S.dragId = null;
        await loadAll();
      }
    });
  });
}

function kanbanCard(l) {
  const priorityColor = { high: '#ef4444', medium: '#f97316', low: '#64748b' }[l.priority] || '#64748b';
  return `
    <div class="kanban-card" draggable="true" data-id="${l.id}">
      <div class="kc-head">
        <strong>${esc(l.name)}</strong>
        <div class="kc-actions">
          <button class="icon-btn-sm" onclick="editLead('${l.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn-sm danger" onclick="deleteLead('${l.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      ${l.secondary ? `<p class="kc-sub">${esc(l.secondary)}</p>` : ''}
      ${l.category  ? `<p class="kc-cat">${esc(l.category)}</p>` : ''}
      ${l.phone     ? `<p class="kc-meta"><i class="fa-solid fa-phone"></i> ${esc(l.phone)}</p>` : ''}
      <div class="kc-foot">
        <span class="priority-dot" style="background:${priorityColor}" title="${l.priority}"></span>
        <span class="kc-date">${l.date || ''}</span>
      </div>
    </div>`;
}

// ─── Contacts Table ───────────────────────────────────────────────
function renderLeadsTable() {
  const tbody = document.getElementById('leads-tbody');
  const empty = document.getElementById('leads-empty');
  const statusFilter = document.getElementById('leads-status-filter')?.value || '';
  const searchQ = (document.getElementById('leads-search')?.value || '').toLowerCase();

  let filtered = S.leads;
  if (statusFilter) filtered = filtered.filter(l => l.status === statusFilter);
  if (searchQ) filtered = filtered.filter(l =>
    l.name.toLowerCase().includes(searchQ) ||
    (l.secondary || '').toLowerCase().includes(searchQ) ||
    (l.phone || '').includes(searchQ) ||
    (l.email || '').toLowerCase().includes(searchQ)
  );

  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const statusLabel = { inquiry: 'Inquiry', contacted: 'Contacted', 'visit-scheduled': 'Meeting Booked', registered: 'Proposal Sent', enrolled: 'Converted' };
  const statusClass = { inquiry: 'stage-inquiry', contacted: 'stage-contacted', 'visit-scheduled': 'stage-visit', registered: 'stage-reg', enrolled: 'stage-enrolled' };

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td><strong>${esc(l.name)}</strong></td>
      <td>${esc(l.secondary || '—')}</td>
      <td>${esc(l.category || '—')}</td>
      <td>${l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : '—'}</td>
      <td>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '—'}</td>
      <td><span class="stage-badge ${statusClass[l.status] || ''}">${statusLabel[l.status] || l.status}</span></td>
      <td><span class="priority-tag p-${l.priority}">${l.priority}</span></td>
      <td>${l.date || '—'}</td>
      <td class="actions-cell">
        <button class="icon-btn-sm" onclick="editLead('${l.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm danger" onclick="deleteLead('${l.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

function filterLeadsTable() { renderLeadsTable(); }

// ─── Lead CRUD ────────────────────────────────────────────────────
function openLeadModalForStatus(status) {
  openModal('lead-modal');
  document.getElementById('lf-status').value = status;
}

function openModal(id) {
  document.getElementById(id).showModal();
}
function closeModal(id) {
  document.getElementById(id).close();
}

function openAddLead() {
  document.getElementById('lead-form').reset();
  val('lf-id', '');
  set('lead-modal-title', 'Add Contact');
  set('lead-submit-btn', 'Save Contact');
  val('lf-date', today());
  openModal('lead-modal');
}

async function editLead(id) {
  const l = S.leads.find(x => x.id === id);
  if (!l) return;
  set('lead-modal-title', 'Edit Contact');
  set('lead-submit-btn', 'Update Contact');
  val('lf-id', l.id);
  val('lf-name', l.name);
  val('lf-secondary', l.secondary || '');
  val('lf-category', l.category || '');
  val('lf-phone', l.phone || '');
  val('lf-email', l.email || '');
  val('lf-date', l.date || today());
  val('lf-status', l.status);
  val('lf-priority', l.priority || 'medium');
  val('lf-notes', l.notes || '');
  openModal('lead-modal');
}

async function submitLead(e) {
  e.preventDefault();
  const id = gv('lf-id');
  const payload = {
    name:      gv('lf-name'),
    secondary: gv('lf-secondary'),
    category:  gv('lf-category'),
    phone:     gv('lf-phone'),
    email:     gv('lf-email'),
    date:      gv('lf-date') || today(),
    status:    gv('lf-status'),
    priority:  gv('lf-priority'),
    notes:     gv('lf-notes'),
  };
  try {
    if (id) { await PUT(`/api/leads/${id}`, payload); toast('Contact updated!'); }
    else     { await POST('/api/leads', payload); toast('Contact added!'); }
    closeModal('lead-modal');
    document.getElementById('lead-form').reset();
    await loadAll();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteLead(id) {
  confirm2('Delete this contact? This cannot be undone.', async () => {
    await DEL(`/api/leads/${id}`);
    toast('Contact deleted.');
    await loadAll();
  });
}

// ─── Campaigns ───────────────────────────────────────────────────
// ─── Marketing (Paid + Organic) ───────────────────────────────────
function renderMarketing() {
  // Keep active tab in sync
  switchMktTab(S.mktTab, false);
}

function switchMktTab(tab, save = true) {
  if (save) S.mktTab = tab;
  ['paid','organic'].forEach(t => {
    const btn = document.getElementById(`mkt-tab-${t}`);
    const pane = document.getElementById(`mkt-pane-${t}`);
    if (btn)  btn.classList.toggle('active', t === tab);
    if (pane) pane.classList.toggle('hidden', t !== tab);
  });
  if (tab === 'paid')    renderCampaigns();
  if (tab === 'organic') renderOrganic();
}

// ─── Organic Marketing ────────────────────────────────────────────
const SEO_CATS = {
  'local-seo':  { label: 'Local SEO',       icon: 'fa-map-pin',        color: '#f97316' },
  'on-page':    { label: 'On-Page SEO',     icon: 'fa-file-code',      color: '#3b82f6' },
  'ai-search':  { label: 'AI / ChatGPT',    icon: 'fa-robot',          color: '#a855f7' },
  'backlinks':  { label: 'Backlinks',        icon: 'fa-link',           color: '#22c55e' },
  'social':     { label: 'Social Content',  icon: 'fa-hashtag',        color: '#ec4899' },
};
const SEO_STATUS = {
  'todo':        { label: 'To Do',       cls: 'badge-gray'    },
  'in-progress': { label: 'In Progress', cls: 'badge-blue'    },
  'done':        { label: 'Done',        cls: 'badge-green'   },
};
const SEO_PRIORITY = {
  high:   { label: 'High',   cls: 'badge-danger'  },
  medium: { label: 'Medium', cls: 'badge-warning' },
  low:    { label: 'Low',    cls: 'badge-gray'    },
};

function renderOrganic() {
  renderSeoStats();
  renderSeoList();
  renderOrganicContent();
}

function renderSeoStats() {
  const total  = S.seo.length;
  const done   = S.seo.filter(s => s.status === 'done').length;
  const inProg = S.seo.filter(s => s.status === 'in-progress').length;
  const todo   = S.seo.filter(s => s.status === 'todo').length;
  set('seo-stat-total',  total);
  set('seo-stat-done',   done);
  set('seo-stat-prog',   inProg);
  set('seo-stat-todo',   todo);
  const pct = total ? Math.round((done / total) * 100) : 0;
  set('seo-progress-pct', pct + '%');
  const bar = document.getElementById('seo-progress-bar');
  if (bar) bar.style.width = pct + '%';
}

function renderSeoList() {
  const container = document.getElementById('seo-tasks-list');
  const empty     = document.getElementById('seo-tasks-empty');
  const catFilter = document.getElementById('seo-cat-filter')?.value || '';
  const stFilter  = document.getElementById('seo-st-filter')?.value  || '';

  let items = [...S.seo];
  if (catFilter) items = items.filter(s => s.category === catFilter);
  if (stFilter)  items = items.filter(s => s.status   === stFilter);

  if (!items.length) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = items.map(s => {
    const cat  = SEO_CATS[s.category]  || { label: s.category, icon: 'fa-circle-dot', color: '#64748b' };
    const st   = SEO_STATUS[s.status]  || { label: s.status,  cls: 'badge-gray' };
    const pr   = SEO_PRIORITY[s.priority] || { label: s.priority, cls: 'badge-gray' };
    return `
    <div class="seo-row ${s.status === 'done' ? 'seo-row-done' : ''}">
      <span class="seo-cat-icon" style="color:${cat.color}"><i class="fa-solid ${cat.icon}"></i></span>
      <div class="seo-row-main">
        <div class="seo-row-title">${esc(s.title)}${s.keyword ? ` <span class="seo-keyword">${esc(s.keyword)}</span>` : ''}</div>
        <div class="seo-row-meta">
          <span class="badge ${st.cls}">${st.label}</span>
          <span class="badge ${pr.cls}">${pr.label}</span>
          <span class="seo-cat-label">${cat.label}</span>
          ${s.notes ? `<span class="seo-notes-preview">${esc(s.notes)}</span>` : ''}
        </div>
      </div>
      <div class="seo-row-actions">
        ${s.status !== 'done'
          ? `<button class="btn btn-sm btn-ghost" onclick="markSeoDone('${s.id}')" title="Mark Done"><i class="fa-solid fa-check"></i></button>`
          : `<button class="btn btn-sm btn-ghost" onclick="markSeoTodo('${s.id}')" title="Reopen"><i class="fa-solid fa-rotate-left"></i></button>`
        }
        <button class="icon-btn-sm" onclick="editSeoTask('${s.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm danger" onclick="deleteSeoTask('${s.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function renderOrganicContent() {
  // Show blog, instagram, youtube from content calendar
  const ORGANIC = ['blog','instagram','youtube','shorts','podcast'];
  const organicItems = S.content
    .filter(c => ORGANIC.includes(c.channel?.toLowerCase()))
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  const container = document.getElementById('organic-content-list');
  const empty     = document.getElementById('organic-content-empty');
  if (!container) return;

  if (!organicItems.length) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  const CHANNEL_ICONS = {
    blog:      { icon: 'fa-pen-nib',      color: '#f97316' },
    instagram: { icon: 'fa-instagram',    color: '#e1306c' },
    youtube:   { icon: 'fa-youtube',      color: '#ff0000' },
    shorts:    { icon: 'fa-film',         color: '#ff0000' },
    podcast:   { icon: 'fa-microphone',   color: '#a855f7' },
  };
  const STATUS_CLS = { published: 'badge-green', planned: 'badge-blue', draft: 'badge-gray' };

  container.innerHTML = organicItems.map(c => {
    const ch  = CHANNEL_ICONS[c.channel?.toLowerCase()] || { icon: 'fa-circle-dot', color: '#64748b' };
    const stCls = STATUS_CLS[c.status] || 'badge-gray';
    return `
    <div class="organic-content-row ${c.status === 'published' ? 'organic-published' : ''}">
      <span class="seo-cat-icon" style="color:${ch.color}"><i class="fa-brands ${ch.icon}"></i></span>
      <div class="seo-row-main">
        <div class="seo-row-title">${esc(c.title)}</div>
        <div class="seo-row-meta">
          <span class="badge ${stCls}">${c.status}</span>
          <span class="seo-cat-label">${c.channel}</span>
          <span class="seo-notes-preview"><i class="fa-regular fa-calendar"></i> ${c.date}</span>
          ${c.notes ? `<span class="seo-notes-preview">${esc(c.notes)}</span>` : ''}
        </div>
      </div>
      <div class="seo-row-actions">
        ${c.status !== 'published'
          ? `<button class="btn btn-sm btn-ghost" onclick="markContentPublished('${c.id}')" title="Mark Published"><i class="fa-solid fa-check"></i></button>`
          : ''
        }
        <button class="icon-btn-sm" onclick="editContent('${c.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm danger" onclick="deleteContent('${c.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ─── SEO Task CRUD ────────────────────────────────────────────────
function openAddSeoTask() {
  set('seo-modal-title','Add SEO Task');
  val('seo-id',''); val('seo-title',''); val('seo-cat','local-seo');
  val('seo-status','todo'); val('seo-priority','medium');
  val('seo-keyword',''); val('seo-notes','');
  openModal('seo-modal');
}

function editSeoTask(id) {
  const s = S.seo.find(x => x.id === id);
  if (!s) return;
  set('seo-modal-title','Edit SEO Task');
  val('seo-id', s.id); val('seo-title', s.title);
  val('seo-cat', s.category); val('seo-status', s.status);
  val('seo-priority', s.priority); val('seo-keyword', s.keyword || '');
  val('seo-notes', s.notes || '');
  openModal('seo-modal');
}

async function submitSeoTask(e) {
  e.preventDefault();
  const id = gv('seo-id');
  const payload = {
    title: gv('seo-title'), category: gv('seo-cat'),
    status: gv('seo-status'), priority: gv('seo-priority'),
    keyword: gv('seo-keyword'), notes: gv('seo-notes'),
  };
  try {
    if (id) { await PUT(`/api/seo/${id}`, payload); toast('SEO task updated!'); }
    else    { await POST('/api/seo', payload);       toast('SEO task added!');   }
    closeModal('seo-modal');
    document.getElementById('seo-form').reset();
    val('seo-id','');
    S.seo = await GET('/api/seo');
    renderOrganic();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteSeoTask(id) {
  confirm2('Delete this SEO task?', async () => {
    await DEL(`/api/seo/${id}`);
    toast('Deleted.');
    S.seo = await GET('/api/seo');
    renderOrganic();
  });
}

async function markSeoDone(id) {
  await PUT(`/api/seo/${id}`, { status: 'done' });
  S.seo = await GET('/api/seo');
  renderOrganic();
  toast('Marked as done! ✓');
}

async function markSeoTodo(id) {
  await PUT(`/api/seo/${id}`, { status: 'todo' });
  S.seo = await GET('/api/seo');
  renderOrganic();
}

async function markContentPublished(id) {
  await PUT(`/api/content/${id}`, { status: 'published' });
  S.content = await GET('/api/content');
  renderOrganicContent();
  renderContent();
  toast('Marked as published! 🎉');
}

function openAddOrganicContent() {
  // Pre-fill channel to Blog and open the content modal
  const titleEl = document.getElementById('content-modal-title');
  if (titleEl) titleEl.textContent = 'Add Organic Content';
  val('ctf-id',''); val('ctf-title',''); val('ctf-channel','blog');
  val('ctf-date', new Date().toISOString().split('T')[0]);
  val('ctf-status','planned'); val('ctf-notes','');
  openModal('content-modal');
}

function renderCampaigns() {

  const grid  = document.getElementById('campaigns-grid');
  const empty = document.getElementById('campaigns-empty');
  if (!S.campaigns.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  const statusColors = { active: '#22c55e', paused: '#f97316', ended: '#64748b' };
  grid.innerHTML = S.campaigns.map(c => {
    const cpl = c.leads > 0 ? (c.spend / c.leads).toFixed(1) : '—';
    const deals = Math.round(c.leads * (c.conversion / 100));
    return `
      <div class="camp-card">
        <div class="camp-head">
          <div>
            <h4>${esc(c.name)}</h4>
            <span class="camp-source">${esc(c.source)}</span>
          </div>
          <div class="camp-actions">
            <span class="status-dot" style="background:${statusColors[c.status] || '#64748b'}" title="${c.status}"></span>
            <button class="icon-btn-sm" onclick="editCampaign('${c.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn-sm danger" onclick="deleteCampaign('${c.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div class="camp-metrics">
          <div class="camp-metric"><span>Budget</span><strong>$${c.spend.toLocaleString()}</strong></div>
          <div class="camp-metric"><span>Leads</span><strong>${c.leads}</strong></div>
          <div class="camp-metric"><span>CPL</span><strong>${cpl !== '—' ? '$'+cpl : '—'}</strong></div>
          <div class="camp-metric"><span>Conv %</span><strong>${c.conversion}%</strong></div>
          <div class="camp-metric"><span>Est. Deals</span><strong style="color:#22c55e">${deals}</strong></div>
        </div>
        ${c.startDate ? `<p class="camp-date">Started: ${c.startDate}</p>` : ''}
      </div>`;
  }).join('');
}

function calcROI() {
  const budget = parseFloat(document.getElementById('roi-budget')?.value) || 0;
  const cpl    = parseFloat(document.getElementById('roi-cpl')?.value) || 0;
  const conv   = parseFloat(document.getElementById('roi-conv')?.value) || 0;
  if (!budget || !cpl) { set('roi-out-leads','—'); set('roi-out-deals','—'); set('roi-out-cpa','—'); return; }
  const leads = Math.round(budget / cpl);
  const deals = Math.round(leads * conv / 100);
  const cpa   = deals > 0 ? '$' + Math.round(budget / deals) : '—';
  set('roi-out-leads', leads);
  set('roi-out-deals', deals);
  set('roi-out-cpa', cpa);
}

function editCampaign(id) {
  const c = S.campaigns.find(x => x.id === id);
  if (!c) return;
  set('campaign-modal-title', 'Edit Campaign');
  val('cf-id', c.id);
  val('cf-name', c.name);
  val('cf-source', c.source);
  val('cf-spend', c.spend);
  val('cf-leads', c.leads || 0);
  val('cf-conv', c.conversion || 0);
  val('cf-date', c.startDate || '');
  val('cf-status', c.status || 'active');
  openModal('campaign-modal');
}

async function submitCampaign(e) {
  e.preventDefault();
  const id = gv('cf-id');
  const payload = {
    name: gv('cf-name'), source: gv('cf-source'),
    spend: parseFloat(gv('cf-spend')),
    leads: parseInt(gv('cf-leads')) || 0,
    conversion: parseFloat(gv('cf-conv')) || 0,
    startDate: gv('cf-date'),
    status: gv('cf-status'),
  };
  try {
    if (id) { await PUT(`/api/campaigns/${id}`, payload); toast('Campaign updated!'); }
    else     { await POST('/api/campaigns', payload); toast('Campaign added!'); }
    closeModal('campaign-modal');
    document.getElementById('campaign-form').reset();
    val('cf-id', '');
    set('campaign-modal-title', 'Add Campaign');
    await loadAll();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteCampaign(id) {
  confirm2('Delete this campaign?', async () => {
    await DEL(`/api/campaigns/${id}`);
    toast('Campaign deleted.');
    await loadAll();
  });
}

// ─── Tasks ────────────────────────────────────────────────────────
function renderTasks() {
  const container = document.getElementById('tasks-list');
  const empty     = document.getElementById('tasks-empty');
  const pFilter   = document.getElementById('task-priority-filter')?.value || '';
  const sFilter   = document.getElementById('task-status-filter')?.value || '';

  let filtered = [...S.tasks];
  if (pFilter)          filtered = filtered.filter(t => t.priority === pFilter);
  if (sFilter === 'done')    filtered = filtered.filter(t => t.checked);
  if (sFilter === 'pending') filtered = filtered.filter(t => !t.checked);

  if (!filtered.length) { container.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  container.innerHTML = filtered.map(t => `
    <div class="task-row ${t.checked ? 'task-done' : ''}">
      <button class="task-check-btn ${t.checked ? 'checked' : ''}" onclick="toggleTask('${t.id}', ${!t.checked})">
        <i class="fa-solid fa-check"></i>
      </button>
      <span class="task-text">${esc(t.text)}</span>
      <span class="priority-tag p-${t.priority}">${t.priority}</span>
      ${t.dueDate ? `<span class="task-due"><i class="fa-regular fa-calendar"></i> ${t.dueDate}</span>` : ''}
      <div class="task-actions">
        <button class="icon-btn-sm" onclick="editTask('${t.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm danger" onclick="deleteTask('${t.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('');
}

async function toggleTask(id, checked) {
  await PUT(`/api/tasks/${id}`, { checked });
  await loadAll();
}

function editTask(id) {
  const t = S.tasks.find(x => x.id === id);
  if (!t) return;
  set('task-modal-title', 'Edit Task');
  val('tf-id', t.id);
  val('tf-text', t.text);
  val('tf-priority', t.priority || 'medium');
  val('tf-due', t.dueDate || '');
  openModal('task-modal');
}

async function submitTask(e) {
  e.preventDefault();
  const id = gv('tf-id');
  const payload = { text: gv('tf-text'), priority: gv('tf-priority'), dueDate: gv('tf-due') };
  try {
    if (id) { await PUT(`/api/tasks/${id}`, payload); toast('Task updated!'); }
    else     { await POST('/api/tasks', payload); toast('Task added!'); }
    closeModal('task-modal');
    document.getElementById('task-form').reset();
    val('tf-id', '');
    set('task-modal-title', 'Add Task');
    await loadAll();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteTask(id) {
  confirm2('Delete this task?', async () => {
    await DEL(`/api/tasks/${id}`);
    toast('Task deleted.');
    await loadAll();
  });
}

// ─── Content Calendar ─────────────────────────────────────────────
function renderContent() {
  const list  = document.getElementById('content-list');
  const empty = document.getElementById('content-empty');
  if (!S.content.length) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const channelIcon = { instagram:'fa-instagram', facebook:'fa-facebook', youtube:'fa-youtube', blog:'fa-pen-nib', email:'fa-envelope', ad:'fa-rectangle-ad', linkedin:'fa-linkedin', other:'fa-globe' };
  const statusColors = { planned:'#3b82f6', draft:'#f97316', published:'#22c55e' };
  list.innerHTML = S.content.map(c => `
    <div class="content-item">
      <div class="content-icon" style="color:${statusColors[c.status] || '#64748b'}">
        <i class="fa-brands ${channelIcon[c.channel] || 'fa-globe'}"></i>
      </div>
      <div class="content-info">
        <strong>${esc(c.title)}</strong>
        <span>${c.date} · ${c.channel}</span>
      </div>
      <span class="status-chip" style="background:${statusColors[c.status]}20; color:${statusColors[c.status]}">${c.status}</span>
      <div class="content-actions">
        <button class="icon-btn-sm" onclick="editContent('${c.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm danger" onclick="deleteContent('${c.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('');
  renderCalendar();
}

let calState = { year: new Date().getFullYear(), month: new Date().getMonth() };

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const { year, month } = calState;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  set('cal-month-label', `${monthNames[month]} ${year}`);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const contentByDate = {};
  S.content.forEach(c => {
    if (c.date) {
      const d = new Date(c.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const k = d.getDate();
        if (!contentByDate[k]) contentByDate[k] = [];
        contentByDate[k].push(c);
      }
    }
  });

  let html = days.map(d => `<div class="cal-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const items = contentByDate[d] || [];
    const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
    const chIcons = { instagram:'fa-instagram', facebook:'fa-facebook', youtube:'fa-youtube', blog:'fa-pen-nib', email:'fa-envelope', ad:'fa-rectangle-ad', linkedin:'fa-linkedin', other:'fa-globe' };
    html += `<div class="cal-cell ${isToday ? 'cal-today' : ''}">
      <span class="cal-date">${d}</span>
      ${items.map(c => `<div class="cal-event" title="${esc(c.title)}"><i class="fa-brands ${chIcons[c.channel]||'fa-globe'}"></i> ${esc(c.title.substring(0,14))}${c.title.length>14?'…':''}</div>`).join('')}
    </div>`;
  }
  grid.innerHTML = html;
}

function prevMonth() { if (calState.month === 0) { calState.month = 11; calState.year--; } else calState.month--; renderCalendar(); }
function nextMonth() { if (calState.month === 11) { calState.month = 0; calState.year++; } else calState.month++; renderCalendar(); }

function openAddContent() {
  const titleEl = document.getElementById('content-modal-title');
  if (titleEl) titleEl.textContent = 'Schedule Content';
  val('ctf-id', '');
  val('ctf-title', '');
  val('ctf-channel', 'instagram');
  val('ctf-date', new Date().toISOString().split('T')[0]);
  val('ctf-status', 'planned');
  val('ctf-notes', '');
  openModal('content-modal');
}

function editContent(id) {
  const c = S.content.find(x => x.id === id);
  if (!c) return;
  const titleEl = document.getElementById('content-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Content';
  val('ctf-id', c.id);
  val('ctf-title', c.title);
  val('ctf-channel', c.channel);
  val('ctf-date', c.date);
  val('ctf-status', c.status);
  val('ctf-notes', c.notes || '');
  openModal('content-modal');
}

async function submitContent(e) {
  e.preventDefault();
  const id = gv('ctf-id');
  const payload = { title: gv('ctf-title'), channel: gv('ctf-channel'), date: gv('ctf-date'), status: gv('ctf-status'), notes: gv('ctf-notes') };
  try {
    if (id) { await PUT(`/api/content/${id}`, payload); toast('Content updated!'); }
    else     { await POST('/api/content', payload); toast('Content scheduled!'); }
    closeModal('content-modal');
    document.getElementById('content-form').reset();
    val('ctf-id', '');
    await loadAll();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteContent(id) {
  confirm2('Delete this content item?', async () => {
    await DEL(`/api/content/${id}`);
    toast('Content deleted.');
    await loadAll();
  });
}

// ─── Staff ────────────────────────────────────────────────────────
function renderStaff() {
  const container = document.getElementById('staff-list');
  const empty     = document.getElementById('staff-empty');
  if (!S.staff.length) { container.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const sorted = [...S.staff].sort((a, b) => b.conversions - a.conversions);
  container.innerHTML = sorted.map((s, i) => {
    const pct = s.target > 0 ? Math.min(Math.round((s.conversions / s.target) * 100), 100) : 0;
    const medals = ['🥇','🥈','🥉'];
    return `
      <div class="staff-row">
        <div class="staff-rank">${medals[i] || (i + 1)}</div>
        <div class="staff-avatar">${s.name[0].toUpperCase()}</div>
        <div class="staff-info">
          <strong>${esc(s.name)}</strong>
          <span>${esc(s.role || 'Team Member')}</span>
        </div>
        <div class="staff-stats">
          <div class="staff-bar-wrap">
            <div class="staff-bar" style="width:${pct}%"></div>
          </div>
          <span>${s.conversions} / ${s.target || '—'} deals</span>
        </div>
        <div class="staff-actions">
          <button class="icon-btn-sm" onclick="editStaff('${s.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn-sm danger" onclick="deleteStaff('${s.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

function editStaff(id) {
  const s = S.staff.find(x => x.id === id);
  if (!s) return;
  set('staff-modal-title', 'Edit Staff Member');
  val('sf-id', s.id);
  val('sf-name', s.name);
  val('sf-role', s.role || '');
  val('sf-conv', s.conversions || 0);
  val('sf-target', s.target || 0);
  openModal('staff-modal');
}

async function submitStaff(e) {
  e.preventDefault();
  const id = gv('sf-id');
  const payload = { name: gv('sf-name'), role: gv('sf-role'), conversions: parseInt(gv('sf-conv')) || 0, target: parseInt(gv('sf-target')) || 0 };
  try {
    if (id) { await PUT(`/api/staff/${id}`, payload); toast('Staff updated!'); }
    else     { await POST('/api/staff', payload); toast('Staff added!'); }
    closeModal('staff-modal');
    document.getElementById('staff-form').reset();
    val('sf-id', '');
    set('staff-modal-title', 'Add Staff Member');
    await loadAll();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteStaff(id) {
  confirm2('Remove this staff member?', async () => {
    await DEL(`/api/staff/${id}`);
    toast('Staff removed.');
    await loadAll();
  });
}

// ─── Analytics Charts ─────────────────────────────────────────────
function renderAnalytics() {
  destroyChart('sourceChart');
  destroyChart('pipelineChart');
  destroyChart('campChart');
  destroyChart('priorityChart');

  // Source (from campaigns)
  const sourceCounts = {};
  S.campaigns.forEach(c => { sourceCounts[c.source] = (sourceCounts[c.source] || 0) + c.leads; });
  const sCtx = document.getElementById('sourceChart');
  if (sCtx) {
    S.charts.sourceChart = new Chart(sCtx, {
      type: 'doughnut',
      data: { labels: Object.keys(sourceCounts), datasets: [{ data: Object.values(sourceCounts), backgroundColor: ['#f97316','#3b82f6','#22c55e','#a855f7','#eab308','#ec4899','#06b6d4'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // Pipeline
  const stages = ['inquiry','contacted','visit-scheduled','registered','enrolled'];
  const stageCounts = stages.map(s => S.leads.filter(l => l.status === s).length);
  const pCtx = document.getElementById('pipelineChart');
  if (pCtx) {
    S.charts.pipelineChart = new Chart(pCtx, {
      type: 'bar',
      data: {
        labels: ['Inquiry','Contacted','Meeting Booked','Proposal Sent','Converted'],
        datasets: [{ data: stageCounts, backgroundColor: ['#f97316','#3b82f6','#eab308','#a855f7','#22c55e'], borderRadius: 8 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }
    });
  }

  // Campaign spend vs leads
  const cCtx = document.getElementById('campChart');
  if (cCtx && S.campaigns.length) {
    S.charts.campChart = new Chart(cCtx, {
      type: 'bar',
      data: {
        labels: S.campaigns.map(c => c.name.substring(0, 20)),
        datasets: [
          { label: 'Budget ($)', data: S.campaigns.map(c => c.spend), backgroundColor: '#3b82f680', borderRadius: 6 },
          { label: 'Leads', data: S.campaigns.map(c => c.leads), backgroundColor: '#22c55e80', borderRadius: 6 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } } } }
    });
  }

  // Priority distribution
  const prios = { high: 0, medium: 0, low: 0 };
  S.leads.forEach(l => { if (prios[l.priority] !== undefined) prios[l.priority]++; });
  const prCtx = document.getElementById('priorityChart');
  if (prCtx) {
    S.charts.priorityChart = new Chart(prCtx, {
      type: 'pie',
      data: { labels: ['High', 'Medium', 'Low'], datasets: [{ data: [prios.high, prios.medium, prios.low], backgroundColor: ['#ef4444','#f97316','#64748b'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }
}

function destroyChart(id) {
  if (S.charts[id]) { S.charts[id].destroy(); delete S.charts[id]; }
}

// ─── Settings ─────────────────────────────────────────────────────
async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    businessName: gv('s-biz-name'),
    businessType: gv('s-biz-type'),
    targetValue: parseInt(gv('s-target')) || 0,
    currency: gv('s-currency'),
    npsScore: parseInt(document.getElementById('s-nps').value) || 0,
  };
  try {
    S.config = await PUT('/api/config', payload);
    applyConfig();
    renderAll();
    toast('Settings saved!');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function confirmClear(collection) {
  confirm2(`Delete ALL ${collection}? This is irreversible!`, async () => {
    const items = S[collection];
    for (const item of items) {
      await DEL(`/api/${collection}/${item.id}`);
    }
    toast(`All ${collection} deleted.`);
    await loadAll();
  });
}

// ─── Brand / USPs ─────────────────────────────────────────────────
function saveUSPs() {
  localStorage.setItem('usps', JSON.stringify([gv('usp1'), gv('usp2'), gv('usp3')]));
  toast('USPs saved locally.');
}

function savePitch() {
  const pitch = gv('brand-pitch');
  const tagline = gv('brand-tagline');
  localStorage.setItem('pitch', pitch);
  set('pitch-preview', pitch || '');
  // Also save tagline to config
  PUT('/api/config', { ...S.config, tagline }).then(() => toast('Pitch saved!'));
}

// Load brand data from localStorage on init
function loadBrandLocals() {
  const usps = JSON.parse(localStorage.getItem('usps') || '[]');
  if (usps[0]) val('usp1', usps[0]);
  if (usps[1]) val('usp2', usps[1]);
  if (usps[2]) val('usp3', usps[2]);
  const pitch = localStorage.getItem('pitch');
  if (pitch) { val('brand-pitch', pitch); set('pitch-preview', pitch); }
}

// ─── AI Insights ──────────────────────────────────────────────────
async function fetchAI() {
  set('ai-text', 'Analysing your pipeline…');
  try {
    const data = await GET('/api/ai-insights');
    set('ai-text', data.advice);
  } catch (e) {
    set('ai-text', 'AI insight unavailable. Check your Groq API key in .env.');
  }
}

// ─── Global Search ────────────────────────────────────────────────
function initSearch() {
  document.getElementById('global-search').addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    if (!q) return;
    // Switch to contacts view and filter
    nav('leads-list');
    val('leads-search', q);
    filterLeadsTable();
  });
}

// ─── Utility Helpers ─────────────────────────────────────────────
function set(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function val(id, v)    { const el = document.getElementById(id); if (el) el.value = v; }
function gv(id)        { return document.getElementById(id)?.value ?? ''; }
function esc(s)        { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function today()       { return new Date().toISOString().split('T')[0]; }

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type} toast-show`;
  setTimeout(() => el.classList.remove('toast-show'), 3200);
}

function confirm2(msg, onOk) {
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', async () => { closeModal('confirm-modal'); await onOk(); });
  openModal('confirm-modal');
}

// ─── Hook modal "Add Contact" button ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Pre-fill today's date in lead form when opening
  document.getElementById('lead-modal').addEventListener('click', () => {});
  document.querySelectorAll('button[onclick="openModal(\'lead-modal\')"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('lead-form').reset();
      val('lf-id', '');
      val('lf-date', today());
      set('lead-modal-title', 'Add Contact');
    });
  });
  loadBrandLocals();
});
