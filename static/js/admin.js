/**
 * admin.js — Panel Administrativo | Registro Civil Santiago del Estero
 * Maneja: autenticación, turnos, usuarios y noticias vía API Django.
 */

'use strict';

/* ════════════════════════════════════════════════
  1. CONFIGURACIÓN Y CONSTANTES
   ════════════════════════════════════════════════ */

// Credenciales obfuscadas (base64). No exposición directa en código.
const _CV = [
  atob('cmVnaXN0cm9DaXZpbEBnbWFpbC5jb20='), // registroCivil@gmail.com
  atob('MTQyMg==')                            // 1422
];

const STORAGE_KEYS = {
  SESSION:  'rc_session',
  TURNOS:   'rc_turnos',
  USUARIOS: 'rc_usuarios'
};

/* ════════════════════════════════════════════════
   2. DATOS INICIALES (seed)
   ════════════════════════════════════════════════ */

const SEED_TURNOS = [
  { id:1, numero:'T-001', fecha:'2026-04-17', hora:'09:00', nombre:'María García',    dni:'32456789', tramite:'Nacimiento',    estado:'Pendiente'  },
  { id:2, numero:'T-002', fecha:'2026-04-17', hora:'09:30', nombre:'Carlos López',    dni:'28901234', tramite:'Matrimonio',    estado:'Asistió'    },
  { id:3, numero:'T-003', fecha:'2026-04-17', hora:'10:00', nombre:'Ana Rodríguez',   dni:'35678901', tramite:'Identificación',estado:'Pendiente'  },
  { id:4, numero:'T-004', fecha:'2026-04-18', hora:'09:00', nombre:'Pedro Martínez',  dni:'30123456', tramite:'Defunción',     estado:'No asistió' },
  { id:5, numero:'T-005', fecha:'2026-04-18', hora:'09:30', nombre:'Laura Fernández', dni:'33567890', tramite:'Nacimiento',    estado:'Cancelado'  },
  { id:6, numero:'T-006', fecha:'2026-04-19', hora:'10:30', nombre:'Jorge Sánchez',   dni:'27890123', tramite:'Matrimonio',    estado:'Pendiente'  },
  { id:7, numero:'T-007', fecha:'2026-04-19', hora:'11:00', nombre:'Sofía Herrera',   dni:'38901234', tramite:'Identificación',estado:'Asistió'    }
];

const SEED_USUARIOS = [
  { id:1, nombre:'Administrador Principal', email:'registroCivil@gmail.com', rol:'admin',    password: btoa('1422') }
];

/* ════════════════════════════════════════════════
   3. STORAGE HELPERS
   ════════════════════════════════════════════════ */

const Store = {
  get(key)       { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, val)  { localStorage.setItem(key, JSON.stringify(val)); },
  init(key, def) { if (!localStorage.getItem(key)) Store.set(key, def); },

  // Inicializar todos los datos si no existen
initAll() {
    Store.init(STORAGE_KEYS.TURNOS, SEED_TURNOS);
},

  nextId(arr) { return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1; }
};

/* ════════════════════════════════════════════════
   4. AUTENTICACIÓN
   ════════════════════════════════════════════════ */

const Auth = {
  check(email, pass) {
    // Verifica contra credenciales maestras
    if (email === _CV[0] && pass === _CV[1]) return true;
    // Verifica contra usuarios creados en localStorage
    const usuarios = Store.get(STORAGE_KEYS.USUARIOS) || [];
    return usuarios.some(u => u.email === email && atob(u.password || '') === pass);
  },

  login(email) {
    Store.set(STORAGE_KEYS.SESSION, { loggedIn: true, user: email, ts: Date.now() });
  },

  logout() {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    window.location.href = '/login/';
  },

  isLogged() {
    const s = Store.get(STORAGE_KEYS.SESSION);
    return s && s.loggedIn === true;
  },

  currentUser() {
    const s = Store.get(STORAGE_KEYS.SESSION);
    return s ? s.user : null;
  },

  // Guard: redirige si no está logueado
  guard() {
    if (!Auth.isLogged()) {
      window.location.href = '/login/';
    }
  }
};

/* ════════════════════════════════════════════════
   5. TOAST NOTIFICATIONS
   ════════════════════════════════════════════════ */

const Toast = {
  show(msg, type = 'success') {
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    const container = document.getElementById('adm-toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `adm-toast ${type}`;
    el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.style.animation = 'none';
      el.style.opacity   = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all .3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
};

/* ════════════════════════════════════════════════
  6. NAVEGACIÓN (sidebar)
   ════════════════════════════════════════════════ */

function initNav() {
  document.querySelectorAll('.adm-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.section;

      // Activar ítem del sidebar
      document.querySelectorAll('.adm-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Mostrar sección correspondiente
      document.querySelectorAll('.adm-section').forEach(s => s.classList.remove('active'));
      const sec = document.getElementById(`sec-${target}`);
      if (sec) sec.classList.add('active');

      // Inicializar módulo al activar sección
      if (target === 'tramites-panel') ModTramites.init();
      if (target === 'sedes')          ModSedes.init();
      if (target === 'usuarios')       ModUsuarios.init();
      if (target === 'noticias')       ModNoticias.init();

      // Cerrar sidebar y overlay en mobile — delegado a cerrarSidebar()
      if (typeof cerrarSidebar === 'function') cerrarSidebar();
    });
  });
  // El toggle del hamburguesa lo maneja toggleAdmSidebar() desde el HTML
}

/* ════════════════════════════════════════════════
  7. MÓDULO TURNOS
   ════════════════════════════════════════════════ */
const ModTurnos = {

  async cargar() {
    const r    = await fetch('/api/turnos/');
    const data = await r.json();
    return data.turnos || [];
  },

  estadoBadge(estado) {
    const map = {
      'pendiente':  'badge-pendiente',
      'asistio':    'badge-asistio',
      'no_asistio': 'badge-noasistio',
      'cancelado':  'badge-cancelado',
    };
    const labels = {
      'pendiente':  'Pendiente',
      'asistio':    'Asistió',
      'no_asistio': 'No asistió',
      'cancelado':  'Cancelado',
    };
    return `<span class="badge-estado ${map[estado] || ''}">${labels[estado] || estado}</span>`;
  },

  origenBadge(origen) {
    if (origen === 'manual') {
      return `<span class="badge-estado badge-admin" title="Cargado por empleado">
                <i class="bi bi-person-fill me-1"></i>Manual
              </span>`;
    }
    return `<span class="badge-estado badge-operador" title="Solicitado por el ciudadano">
              <i class="bi bi-globe me-1"></i>Sistema
            </span>`;
  },

render(turnos) {
  const tbody = document.getElementById('turnos-tbody');
  if (!tbody) return;

  // Stats — IDs que coinciden con el HTML
  const statTotal   = document.getElementById('stat-total-turnos');
  const statPend    = document.getElementById('stat-pendientes');
  const statAsistio = document.getElementById('stat-asistio');
  const statCancel  = document.getElementById('stat-cancelado');
  const badge       = document.getElementById('nav-badge-turnos');

  if (statTotal)   statTotal.innerText   = turnos.length;
  if (statPend)    statPend.innerText    = turnos.filter(t => t.estado === 'pendiente').length;
  if (statAsistio) statAsistio.innerText = turnos.filter(t => t.estado === 'asistio').length;
  if (statCancel)  statCancel.innerText  = turnos.filter(t => t.estado === 'no_asistio' || t.estado === 'cancelado').length;
  if (badge)       badge.textContent     = turnos.filter(t => t.estado === 'pendiente').length;

  this.renderTabla(turnos, tbody);
  this.aplicarFiltros(turnos);
},

  renderTabla(turnos, tbody) {
    if (turnos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No hay turnos registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = turnos.map(t => `
      <tr>
        <td><strong>${t.numero_turno}</strong></td>
        <td>${t.fecha}</td>
        <td>${t.hora}</td>
        <td>${t.nombre}<br/><small style="color:#888;">${t.dni}</small></td>
        <td><small>${t.tramite}</small></td>
        <td>${this.origenBadge(t.origen)}</td>
        <td>${this.estadoBadge(t.estado)}</td>
        <td>
          <select class="estado-select" onchange="ModTurnos.cambiarEstado(${t.id}, this.value)">
            <option value="pendiente"  ${t.estado === 'pendiente'  ? 'selected' : ''}>Pendiente</option>
            <option value="asistio"    ${t.estado === 'asistio'    ? 'selected' : ''}>Asistió</option>
            <option value="no_asistio" ${t.estado === 'no_asistio' ? 'selected' : ''}>No asistió</option>
            <option value="cancelado"  ${t.estado === 'cancelado'  ? 'selected' : ''}>Cancelado</option>
          </select>
        </td>
        <td style="text-align:center;">
          <button
            class="btn-adm-icon edit"
            title="Reprogramar turno"
            onclick="ModTurnos.openModalReprogramar(${JSON.stringify(t).replace(/"/g, '&quot;')})"
            style="padding:4px 8px;">
            <i class="bi bi-calendar2-week"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },

aplicarFiltros(turnos) {
  const filtroNombre  = document.getElementById('filtro-turno');
  const filtroTramite = document.getElementById('filtro-tramite');
  const tbody         = document.getElementById('turnos-tbody');

  const filtrar = () => {
    const texto   = filtroNombre?.value.toLowerCase() || '';
    const tramite = filtroTramite?.value || '';

    const filtrados = turnos.filter(t => {
      const coincideTexto   = !texto ||
        t.nombre.toLowerCase().includes(texto) ||
        t.dni.includes(texto) ||
        t.numero_turno.toLowerCase().includes(texto);
      const coincideTramite = !tramite || t.tramite_slug === tramite;
      return coincideTexto && coincideTramite;
    });

    this.renderTabla(filtrados, tbody);
  };

  filtroNombre?.addEventListener('input',  filtrar);
  filtroTramite?.addEventListener('change', filtrar);
},

  async cambiarEstado(id, estado) {
    try {
      const r    = await fetch(`/api/turnos/${id}/estado/`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken':  this.getCookie('csrftoken'),
        },
        body: JSON.stringify({ estado }),
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }
      Toast.show('Estado actualizado.', 'success');
      await this.init();

    } catch { Toast.show('Error al cambiar estado.', 'error'); }
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  },

async init() {
  const btnNuevo = document.getElementById('btn-nuevo-turno');
  if (btnNuevo) btnNuevo.onclick = () => this.openModal();

  const turnos = await this.cargar();
  this.render(turnos);
},

openModal(turno = null) {
  const modal = document.getElementById('modal-turno');
  if (!modal) return;
  // Resetear form si existe
  const form = document.getElementById('form-turno');
  if (form) form.reset();
  new bootstrap.Modal(modal).show();
},

openModal(turno = null) {
  const form  = document.getElementById('form-turno');
  const titulo = document.getElementById('modal-turno-titulo');
  if (!form) return;

  form.reset();
  form['turno-id'].value = '';
  titulo.textContent = 'Nuevo Turno Manual';

  // Fecha mínima = hoy
  const fechaInput = document.getElementById('adm-turno-fecha');
  if (fechaInput) {
    const hoy = new Date().toISOString().split('T')[0];
    fechaInput.min = hoy;
    fechaInput.onchange = () => ModTurnos.cargarHorarios();
  }

  // Reset horarios
  const selectHora = document.getElementById('adm-turno-hora');
  if (selectHora) selectHora.innerHTML = '<option value="">Seleccioná una fecha primero</option>';

  new bootstrap.Modal(document.getElementById('modal-turno')).show();
},

async cargarHorarios() {
  const fecha     = document.getElementById('adm-turno-fecha').value;
  const selectH   = document.getElementById('adm-turno-hora');
  const aviso     = document.getElementById('adm-fecha-aviso');
  const avisoMsg  = document.getElementById('adm-fecha-aviso-msg');
  if (!fecha || !selectH) return;

  selectH.innerHTML = '<option value="">Cargando...</option>';
  aviso.style.display = 'none';

  try {
    const r    = await fetch(`/api/turnos/disponibilidad/?fecha=${fecha}`);
    const data = await r.json();

    selectH.innerHTML = '<option value="">Seleccioná un horario</option>';

    if (!data.habil) {
      aviso.style.display = 'block';
      avisoMsg.textContent = 'Este día no es hábil (feriado o fin de semana).';
      selectH.innerHTML = '<option value="">No hay turnos este día</option>';
      return;
    }

    if (!data.habil_dia) {
      aviso.style.display = 'block';
      avisoMsg.textContent = 'Este día ya no tiene más turnos disponibles (máximo 20).';
      return;
    }

    data.slots.forEach(slot => {
      const opt = document.createElement('option');
      opt.value = slot.hora;
      opt.textContent = slot.lleno
        ? `${slot.hora} hs. — Sin disponibilidad`
        : `${slot.hora} hs.`;
      opt.disabled = slot.lleno;
      selectH.appendChild(opt);
    });

  } catch {
    selectH.innerHTML = '<option value="">Error al cargar horarios</option>';
  }
},

openModalReprogramar(turno) {
  const form = document.getElementById('form-reprogramar');
  if (!form) return;

  form.reset();
  form['reprog-turno-id'].value = turno.id;

  // Info del turno actual
  document.getElementById('reprog-info-nombre').textContent  = turno.nombre;
  document.getElementById('reprog-info-tramite').textContent = turno.tramite;
  document.querySelector('#reprog-info-actual span').textContent =
    `${turno.fecha} a las ${turno.hora} hs.`;

  // Fecha mínima = hoy
  const fechaInput = document.getElementById('reprog-fecha');
  if (fechaInput) {
    const hoy = new Date().toISOString().split('T')[0];
    fechaInput.min = hoy;
    fechaInput.onchange = () => ModTurnos.cargarHorariosReprogramar();
  }

  // Reset hora select y aviso
  const selectH = document.getElementById('reprog-hora');
  if (selectH) selectH.innerHTML = '<option value="">Seleccioná una fecha primero</option>';
  const aviso = document.getElementById('reprog-fecha-aviso');
  if (aviso) aviso.style.display = 'none';

  // Botón confirmar
  const btnConfirmar = document.getElementById('btn-confirmar-reprogramar');
  if (btnConfirmar) btnConfirmar.onclick = () => ModTurnos.handleReprogramarSave();

  new bootstrap.Modal(document.getElementById('modal-reprogramar')).show();
},

async cargarHorariosReprogramar() {
  const fecha   = document.getElementById('reprog-fecha').value;
  const selectH = document.getElementById('reprog-hora');
  const aviso   = document.getElementById('reprog-fecha-aviso');
  if (!fecha || !selectH) return;

  selectH.innerHTML = '<option value="">Cargando...</option>';
  if (aviso) aviso.style.display = 'none';

  try {
    const r    = await fetch(`/api/turnos/disponibilidad/?fecha=${fecha}`);
    const data = await r.json();

    selectH.innerHTML = '<option value="">Seleccioná un horario</option>';

    if (!data.habil) {
      if (aviso) {
        aviso.style.display = 'block';
        aviso.textContent = 'Este día no es hábil (feriado o fin de semana).';
      }
      selectH.innerHTML = '<option value="">No hay turnos este día</option>';
      return;
    }

    data.slots.forEach(slot => {
      const opt = document.createElement('option');
      opt.value = slot.hora;
      opt.textContent = slot.lleno
        ? `${slot.hora} hs. — Sin disponibilidad`
        : `${slot.hora} hs.`;
      opt.disabled = slot.lleno;
      selectH.appendChild(opt);
    });

  } catch {
    selectH.innerHTML = '<option value="">Error al cargar horarios</option>';
  }
},

async handleReprogramarSave() {
  const form = document.getElementById('form-reprogramar');
  if (!form) return;

  const id    = form['reprog-turno-id'].value;
  const fecha = document.getElementById('reprog-fecha').value;
  const hora  = document.getElementById('reprog-hora').value;

  if (!fecha || !hora) {
    Toast.show('Seleccioná fecha y horario.', 'error');
    return;
  }

  try {
    const r = await fetch(`/api/turnos/${id}/reprogramar/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken':  this.getCookie('csrftoken'),
      },
      body: JSON.stringify({ fecha, hora }),
    });
    const data = await r.json();

    if (data.error) { Toast.show(data.error, 'error'); return; }

    bootstrap.Modal.getInstance(document.getElementById('modal-reprogramar'))?.hide();
    Toast.show('Turno reprogramado. Se notificó al ciudadano por correo.', 'success');
    await this.init();

  } catch { Toast.show('Error al reprogramar turno.', 'error'); }
},

async handleFormSave() {
  const form = document.getElementById('form-turno');
  if (!form) return;

  const tramite   = form['turno-tramite'].value;
  const fecha     = form['turno-fecha'].value;
  const hora      = form['turno-hora'].value;
  const nombre    = form['turno-nombre'].value.trim();
  const dni       = form['turno-dni'].value.trim();
  const email     = form['turno-email'].value.trim();
  const telefono  = form['turno-telefono']?.value.trim() || '';
  const direccion = form['turno-direccion']?.value.trim() || '';
  const estado    = form['turno-estado'].value;

  if (!tramite || !fecha || !hora || !nombre || !dni || !email) {
    Toast.show('Completá todos los campos obligatorios.', 'error');
    return;
  }

  try {
    const r    = await fetch('/api/turnos/crear/', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken':  this.getCookie('csrftoken'),
      },
      body: JSON.stringify({
        tramite, fecha, hora, nombre, dni, email,
        telefono, direccion,
        origen: 'manual',
        estado,
      }),
    });
    const data = await r.json();

    if (data.error) { Toast.show(data.error, 'error'); return; }

    bootstrap.Modal.getInstance(document.getElementById('modal-turno'))?.hide();
    Toast.show(`Turno ${data.numero_turno} creado correctamente.`, 'success');
    await this.init();

  } catch { Toast.show('Error al guardar turno.', 'error'); }
},

};

/* ════════════════════════════════════════════════
  8. MÓDULO USUARIOS
   ════════════════════════════════════════════════ */

const ModUsuarios = {
  async cargar() {
    const r = await fetch('/api/usuarios/');
    const data = await r.json();
    return data.usuarios || [];
  },

  render(usuarios) {
    const tbody = document.getElementById('usuarios-tbody');
    if (!tbody) return;

    const stat = document.getElementById('stat-total-usuarios');
    if (stat) stat.innerText = usuarios.length;

    if (usuarios.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No hay usuarios registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = usuarios.map(u => `
      <tr data-uid="${u.id}">
        <td><strong>${u.nombre}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge-estado ${u.rol === 'super_admin' ? 'badge-admin' : 'badge-operador'}">
          ${u.rol === 'super_admin' ? 'Super Admin' : 'Operador'}
        </span></td>
        <td><span class="badge-estado ${u.activo ? 'badge-asistio' : 'badge-noasistio'}">
          ${u.activo ? 'Activo' : 'Inactivo'}
        </span></td>
        <td>
          <button class="btn-adm-icon edit" data-edit-user="${u.id}"
            data-nombre="${u.nombre}" data-email="${u.email}" data-rol="${u.rol}" title="Editar">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn-adm-icon trash" data-toggle-user="${u.id}" data-activo="${u.activo}" title="${u.activo ? 'Desactivar' : 'Activar'}">
            <i class="bi bi-${u.activo ? 'person-slash' : 'person-check'}"></i>
          </button>
        </td>
      </tr>`).join('');

    // Botón editar
    tbody.querySelectorAll('[data-edit-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openModal({
          id:btn.dataset.editUser,
          nombre:btn.dataset.nombre,
          email:btn.dataset.email,
          rol:btn.dataset.rol,
        });
      });
    });

    // Botón activar/desactivar
    tbody.querySelectorAll('[data-toggle-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleUser;
        const activo = btn.dataset.activo === 'true';
        this.toggleEstado(id, activo);
      });
    });
  },

  openModal(usuario = null) {
    const titulo = document.getElementById('modal-user-titulo');
    const form = document.getElementById('form-usuario');
    const passHelp = document.getElementById('pass-help');
    if (!form) return;

    if (usuario) {
      titulo.textContent  ='Editar Usuario';
      form['user-id'].value =usuario.id;
      form['user-nombre'].value =usuario.nombre;
      form['user-email'].value =usuario.email;
      form['user-rol'].value =usuario.rol;
      form['user-pass'].value = '';
      form['user-pass'].placeholder = 'Dejar vacío para no cambiar';
      if (passHelp) passHelp.textContent = 'Dejá vacío para mantener la contraseña actual.';
    } else {
      titulo.textContent = 'Nuevo Usuario';
      form.reset();
      form['user-id'].value = '';
      form['user-pass'].placeholder = 'Contraseña';
      if (passHelp) passHelp.textContent = 'Requerida para nuevos usuarios.';
    }

    new bootstrap.Modal(document.getElementById('modal-usuario')).show();
  },

  async handleFormSave() {
    const form   = document.getElementById('form-usuario');
    if (!form) return;

    const id = form['user-id'].value;
    const nombre = form['user-nombre'].value.trim();
    const email = form['user-email'].value.trim();
    const rol = form['user-rol'].value;
    const password = form['user-pass'].value.trim();

    if (!nombre || !email) { Toast.show('Nombre y email son requeridos', 'error'); return; }
    if (!id && !password)  { Toast.show('La contraseña es requerida para nuevos usuarios', 'error'); return; }

    const url = id ? `/api/usuarios/${id}/editar/` : '/api/usuarios/crear/';
    const body = { nombre, email, rol };
    if (password) body.password = password;

    try {
      const r = await fetch(url, {
        method:'POST',
        headers: {
          'Content-Type':'application/json',
          'X-CSRFToken':this.getCookie('csrftoken'),
        },
        body:JSON.stringify(body),
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }

      bootstrap.Modal.getInstance(document.getElementById('modal-usuario'))?.hide();
      Toast.show(id ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success');
      await this.init();

    } catch { Toast.show('Error al guardar usuario.', 'error'); }
  },

  async toggleEstado(id, activo) {
    const accion = activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿Querés ${accion} este usuario?`)) return;

    try {
      const r = await fetch(`/api/usuarios/${id}/desactivar/`, {
        method:'POST',
        headers: { 'X-CSRFToken': this.getCookie('csrftoken') },
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }
      Toast.show(`Usuario ${data.estado} correctamente.`, 'success');
      await this.init();

    } catch { Toast.show('Error al cambiar estado.', 'error'); }
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  },

async init() {
    const btnNuevo   = document.getElementById('btn-nuevo-usuario');
    const btnGuardar = document.getElementById('btn-guardar-usuario');

    // onclick reemplaza el handler anterior, no lo acumula
    if (btnNuevo)   btnNuevo.onclick   = () => this.openModal();
    if (btnGuardar) btnGuardar.onclick = () => this.handleFormSave();

    const usuarios = await this.cargar();
    this.render(usuarios);

    const badge = document.getElementById('nav-badge-usuarios');
    if (badge) badge.textContent = usuarios.length;
  }
};

/* ════════════════════════════════════════════════
  9. MÓDULO NOTICIAS
   ════════════════════════════════════════════════ */

const ModNoticias = {
  _cache: [],

  async cargar() {
    const r    = await fetch('/api/noticias/');
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error al cargar noticias');
    return data.noticias || [];
  },

  estadoBadge(estado) {
    const map = {
      borrador:  { cls: 'badge-pendiente',  label: 'Borrador' },
      revision:  { cls: 'badge-operador',   label: 'En revisión' },
      publicada: { cls: 'badge-asistio',    label: 'Publicada' },
      archivada: { cls: 'badge-noasistio',  label: 'Archivada' },
    };
    const e = map[estado] || { cls: '', label: estado };
    return `<span class="badge-estado ${e.cls}">${e.label}</span>`;
  },

  render(noticias) {
    this._cache = noticias;
    const grid = document.getElementById('noticias-admin-grid');
    if (!grid) return;

    const stat = document.getElementById('stat-total-noticias');
    const badge = document.getElementById('nav-badge-noticias');
    const publicadas = noticias.filter(n => n.estado === 'publicada').length;

    if (stat) stat.innerText = publicadas;
    if (badge) badge.textContent = noticias.length;

    if (noticias.length === 0) {
      grid.innerHTML = `<div class="col-12"><div class="adm-empty"><i class="bi bi-newspaper"></i><p>No hay noticias. Creá una nueva.</p></div></div>`;
      return;
    }

    grid.innerHTML = noticias.map(n => {
      const preview = n.cuerpo.length > 90 ? `${n.cuerpo.substring(0, 90)}…` : n.cuerpo;
      const thumb = n.imagen
        ? `<img src="${n.imagen}" alt="">`
        : `<i class="bi bi-newspaper"></i>`;

      return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="adm-noticia-card">
          <div class="adm-noticia-thumb">${thumb}</div>
          <div class="adm-noticia-body">
            <span class="adm-noticia-tag">${n.tag || 'General'}</span>
            <div class="adm-noticia-titulo">${n.titulo}</div>
            <div class="adm-noticia-fecha"><i class="bi bi-calendar3"></i> ${n.fecha}</div>
            <div class="mb-2">${this.estadoBadge(n.estado)}</div>
            <div class="adm-noticia-cuerpo-preview">${preview}</div>
            <div class="adm-noticia-actions">
              <button class="btn-adm-icon edit" data-edit-noticia="${n.id}" title="Editar">
                <i class="bi bi-pencil-square"></i>
              </button>
              <button class="btn-adm-icon trash" data-delete-noticia="${n.id}" title="Eliminar">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-edit-noticia]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = this._cache.find(x => x.id === parseInt(btn.dataset.editNoticia, 10));
        if (n) this.openModal(n);
      });
    });

    grid.querySelectorAll('[data-delete-noticia]').forEach(btn => {
      btn.addEventListener('click', () => this.eliminar(parseInt(btn.dataset.deleteNoticia, 10)));
    });
  },

  openModal(noticia = null) {
    const titulo  = document.getElementById('modal-noticia-titulo');
    const form    = document.getElementById('form-noticia');
    const preview = document.getElementById('noticia-imagen-preview');
    if (!form) return;

    form.reset();
    if (preview) preview.style.display = 'none';

    if (noticia) {
      titulo.textContent = 'Editar Noticia';
      form['noticia-id'].value     = noticia.id;
      form['noticia-titulo'].value = noticia.titulo;
      form['noticia-tag'].value    = noticia.tag || 'General';
      form['noticia-estado'].value = noticia.estado || 'borrador';
      form['noticia-cuerpo'].value = noticia.cuerpo;

      if (noticia.imagen && preview) {
        preview.querySelector('img').src = noticia.imagen;
        preview.style.display = 'block';
      }
    } else {
      titulo.textContent = 'Nueva Noticia';
      form['noticia-id'].value       = '';
      form['noticia-estado'].value   = 'borrador';
    }

    new bootstrap.Modal(document.getElementById('modal-noticia-form')).show();
  },

  async handleFormSave() {
    const form = document.getElementById('form-noticia');
    if (!form) return;

    const id     = form['noticia-id'].value;
    const titulo = form['noticia-titulo'].value.trim();
    const cuerpo = form['noticia-cuerpo'].value.trim();
    const tag    = form['noticia-tag'].value;
    const estado = form['noticia-estado'].value;
    const imagen = form['noticia-imagen']?.files?.[0];

    if (!titulo || !cuerpo) {
      Toast.show('Título y contenido son requeridos', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('titulo', titulo);
    formData.append('cuerpo', cuerpo);
    formData.append('tag', tag);
    formData.append('estado', estado);
    if (imagen) formData.append('imagen', imagen);

    const url = id ? `/api/noticias/${id}/editar/` : '/api/noticias/crear/';

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'X-CSRFToken': this.getCookie('csrftoken') },
        body: formData,
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }

      bootstrap.Modal.getInstance(document.getElementById('modal-noticia-form'))?.hide();
      Toast.show(id ? 'Noticia actualizada correctamente' : 'Noticia creada correctamente', 'success');
      await this.init();
    } catch {
      Toast.show('Error al guardar noticia.', 'error');
    }
  },

  async eliminar(id) {
    if (!confirm('¿Eliminar esta noticia? Esta acción no se puede deshacer.')) return;

    try {
      const r = await fetch(`/api/noticias/${id}/eliminar/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': this.getCookie('csrftoken') },
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }
      Toast.show('Noticia eliminada', 'warning');
      await this.init();
    } catch {
      Toast.show('Error al eliminar noticia.', 'error');
    }
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  },

  async init() {
    const btnNueva   = document.getElementById('btn-nueva-noticia');
    const btnGuardar = document.getElementById('btn-guardar-noticia');

    if (btnNueva)   btnNueva.onclick   = () => this.openModal();
    if (btnGuardar) btnGuardar.onclick = () => this.handleFormSave();

    const inputImagen = document.querySelector('[name="noticia-imagen"]');
    if (inputImagen && !inputImagen.dataset.bound) {
      inputImagen.dataset.bound = '1';
      inputImagen.addEventListener('change', () => {
        const preview = document.getElementById('noticia-imagen-preview');
        if (!preview || !inputImagen.files?.[0]) return;
        preview.querySelector('img').src = URL.createObjectURL(inputImagen.files[0]);
        preview.style.display = 'block';
      });
    }

    try {
      const noticias = await this.cargar();
      this.render(noticias);
    } catch {
      Toast.show('Error al cargar noticias.', 'error');
    }
  }
};

/* ════════════════════════════════════════════════
  10. MÓDULO TRÁMITES
   ════════════════════════════════════════════════ */
const ModTramites = {

  async cargar() {
    const r    = await fetch('/api/tramites/');
    const data = await r.json();
    return data.tramites || [];
  },

  async cargarCategorias() {
    const r    = await fetch('/api/categorias/');
    const data = await r.json();
    return data.categorias || [];
  },

  estadoBadge(estado) {
    const map = {
      'borrador':  'badge-cancelado',
      'revision':  'badge-pendiente',
      'publicado': 'badge-asistio',
      'archivado': 'badge-noasistio',
    };
    const labels = {
      'borrador':  'Borrador',
      'revision':  'En revisión',
      'publicado': 'Publicado',
      'archivado': 'Archivado',
    };
    return `<span class="badge-estado ${map[estado] || ''}">${labels[estado] || estado}</span>`;
  },

  render(tramites) {
    const tbody = document.getElementById('tbody-tramites-panel');
    if (!tbody) return;

    const statTotal      = document.getElementById('stat-total-tramites-panel');
    const statPublicados = document.getElementById('stat-tramites-publicados');
    const statPendientes = document.getElementById('stat-tramites-pendientes');
    const badge          = document.getElementById('nav-badge-tramites-panel');

    if (statTotal)      statTotal.innerText      = tramites.length;
    if (statPublicados) statPublicados.innerText  = tramites.filter(t => t.estado === 'publicado').length;
    if (statPendientes) statPendientes.innerText  = tramites.filter(t => t.estado === 'revision').length;
    if (badge)          badge.textContent         = tramites.length;

    this.renderTabla(tramites, tbody);
    this.aplicarFiltros(tramites);
  },

  renderTabla(tramites, tbody) {
    if (tramites.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No hay trámites registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = tramites.map(t => `
      <tr>
        <td><strong>${t.nombre}</strong></td>
        <td>${t.categoria}</td>
        <td><code style="font-size:12px;">${t.slug}</code></td>
        <td>${this.estadoBadge(t.estado)}</td>
        <td>${t.creado_por}</td>
        <td>
          <button class="btn-adm-icon edit btn-editar-tramite"
            data-id="${t.id}" data-nombre="${t.nombre}"
            data-categoria="${t.categoria_id || ''}"
            data-slug="${t.slug}" data-icono="${t.icono}"
            data-descripcion="${t.descripcion || ''}"
            data-estado="${t.estado}"
            title="Editar">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn-adm-icon trash btn-eliminar-tramite"
            data-id="${t.id}" title="Eliminar">
            <i class="bi bi-trash3"></i>
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-editar-tramite').forEach(btn => {
      btn.onclick = () => this.openModal({
        id:          btn.dataset.id,
        nombre:      btn.dataset.nombre,
        categoria:   btn.dataset.categoria,
        slug:        btn.dataset.slug,
        icono:       btn.dataset.icono,
        descripcion: btn.dataset.descripcion,
        estado:      btn.dataset.estado,
      });
    });

    tbody.querySelectorAll('.btn-eliminar-tramite').forEach(btn => {
      btn.onclick = () => this.eliminar(btn.dataset.id);
    });
  },

  aplicarFiltros(tramites) {
    const filtroNombre = document.getElementById('filtro-tramite-panel');
    const filtroEstado = document.getElementById('filtro-tramite-estado');
    const tbody        = document.getElementById('tbody-tramites-panel');

    const filtrar = () => {
      const texto  = filtroNombre?.value.toLowerCase() || '';
      const estado = filtroEstado?.value;

      const filtrados = tramites.filter(t => {
        const coincideTexto  = !texto || t.nombre.toLowerCase().includes(texto);
        const coincideEstado = !estado || t.estado === estado;
        return coincideTexto && coincideEstado;
      });

      this.renderTabla(filtrados, tbody);
    };

    filtroNombre?.addEventListener('input',  filtrar);
    filtroEstado?.addEventListener('change', filtrar);
  },

  async openModal(tramite = null) {
    const form   = document.getElementById('form-tramite-panel');
    const titulo = document.getElementById('modal-tramite-panel-titulo');
    if (!form) return;

    // Cargar categorías en el select
    const categorias = await this.cargarCategorias();
    const select     = document.getElementById('select-categoria-tramite');
    select.innerHTML = '<option value="">Seleccionar categoría</option>';
    categorias.forEach(c => {
      const opt      = document.createElement('option');
      opt.value      = c.id;
      opt.textContent = c.nombre;
      select.appendChild(opt);
    });

    if (tramite) {
      titulo.textContent                              = 'Editar Trámite';
      form['tramite-id'].value                        = tramite.id;
      form['tramite-nombre'].value                    = tramite.nombre;
      form['tramite-slug'].value                      = tramite.slug;
      // form['tramite-icono'].value                     = tramite.icono;
      form['tramite-descripcion'].value               = tramite.descripcion || '';
      form['tramite-requisitos'].value                = tramite.requisitos || '';
      form['tramite-como-se-inicia'].value            = tramite.como_se_inicia || '';
      form['tramite-estado'].value                    = tramite.estado;
      if (tramite.categoria) select.value             = tramite.categoria;
      // Deshabilitar slug en edición para no romper URLs
      form['tramite-slug'].disabled = true;
      const gratuito = tramite.es_gratuito;
      document.getElementById('tramite-gratuito').checked = gratuito;
      document.getElementById('precio-wrap').style.display = gratuito ? 'none' : 'block';
      if (!gratuito && tramite.precio) form['tramite-precio'].value = tramite.precio;
      const chkTurno = document.getElementById('tramite-requiere-turno');
      if (chkTurno) chkTurno.checked = !!tramite.requiere_turno;
      const chkPresencial = document.getElementById('tramite-modalidad-presencial');
      const chkDigital    = document.getElementById('tramite-modalidad-digital');
      if (chkPresencial) chkPresencial.checked = !!tramite.modalidad_presencial;
      if (chkDigital)    chkDigital.checked    = !!tramite.modalidad_digital;
    } else {
      titulo.textContent = 'Nuevo Trámite';
      form.reset();
      form['tramite-id'].value      = '';
      form['tramite-slug'].disabled = false;
      // form['tramite-icono'].value   = 'bi-file-earmark-text';
    }

    new bootstrap.Modal(document.getElementById('modal-tramite-panel')).show();
  },

async handleFormSave() {
    const form = document.getElementById('form-tramite-panel');
    if (!form) return;

    const id              = form['tramite-id'].value;
    const nombre          = form['tramite-nombre'].value.trim();
    const slug            = form['tramite-slug'].value.trim();
    const descripcion     = form['tramite-descripcion'].value.trim();
    const requisitos      = form['tramite-requisitos'].value.trim();
    const comoSeInicia    = form['tramite-como-se-inicia'].value.trim();
    const estado          = form['tramite-estado'].value;
    const categoriaId     = document.getElementById('select-categoria-tramite').value;
    const gratuito        = document.getElementById('tramite-gratuito').checked;
    const requiereTurno   = document.getElementById('tramite-requiere-turno')?.checked || false;
    const modPresencial   = document.getElementById('tramite-modalidad-presencial')?.checked || false;
    const modDigital      = document.getElementById('tramite-modalidad-digital')?.checked || false;
    const precio          = gratuito ? null : (form['tramite-precio'].value || null);

    if (!nombre) { Toast.show('El nombre es obligatorio.', 'error'); return; }
    if (!id && !slug) { Toast.show('El identificador de URL es obligatorio.', 'error'); return; }

    const url  = id ? `/api/tramites/${id}/editar/` : '/api/tramites/crear/';
    const body = {
      nombre, descripcion, estado,
      requisitos,
      como_se_inicia:      comoSeInicia,
      categoria_id:        categoriaId || null,
      es_gratuito:         gratuito,
      requiere_turno:      requiereTurno,
      modalidad_presencial: modPresencial,
      modalidad_digital:    modDigital,
      precio,
    };
    if (!id) body.slug = slug;

    try {
      const r    = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken':  this.getCookie('csrftoken'),
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }

      bootstrap.Modal.getInstance(document.getElementById('modal-tramite-panel'))?.hide();
      Toast.show(id ? 'Trámite actualizado.' : 'Trámite creado correctamente.', 'success');
      await this.init();

    } catch { Toast.show('Error al guardar trámite.', 'error'); }
},

  async eliminar(id) {
    if (!confirm('¿Eliminar este trámite? Esta acción no se puede deshacer.')) return;

    try {
      const r    = await fetch(`/api/tramites/${id}/eliminar/`, {
        method:  'POST',
        headers: { 'X-CSRFToken': this.getCookie('csrftoken') },
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }
      Toast.show('Trámite eliminado.', 'warning');
      await this.init();

    } catch { Toast.show('Error al eliminar trámite.', 'error'); }
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  },

  async init() {
    const btnNuevo = document.getElementById('btn-nuevo-tramite-panel');
    if (btnNuevo) btnNuevo.onclick = () => this.openModal();

    const tramites = await this.cargar();
    this.render(tramites);
  }
};

// Botón nueva categoría
const btnNuevaCat     = document.getElementById('btn-nueva-categoria');
const btnConfirmarCat = document.getElementById('btn-confirmar-categoria');
const btnCancelarCat  = document.getElementById('btn-cancelar-categoria');
const wrapNuevaCat    = document.getElementById('nueva-categoria-wrap');

if (btnNuevaCat) btnNuevaCat.onclick = () => {
  wrapNuevaCat.style.display = 'block';
  document.getElementById('nueva-categoria-nombre').focus();
};

if (btnCancelarCat) btnCancelarCat.onclick = () => {
  wrapNuevaCat.style.display = 'none';
  document.getElementById('nueva-categoria-nombre').value = '';
};

if (btnConfirmarCat) btnConfirmarCat.onclick = async () => {
  const nombre = document.getElementById('nueva-categoria-nombre').value.trim();
  const icono  = document.getElementById('nueva-categoria-icono').value;

  if (!nombre) { Toast.show('Escribí el nombre de la categoría.', 'warning'); return; }

  try {
    const r    = await fetch('/api/categorias/crear/', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken':  ModTramites.getCookie('csrftoken'),
      },
      body: JSON.stringify({ nombre, icono }),
    });
    const data = await r.json();

    if (data.error) { Toast.show(data.error, 'error'); return; }

    // Agregar la nueva categoría al select y seleccionarla
    const opt       = document.createElement('option');
    opt.value       = data.id;
    opt.textContent = data.nombre;
    select.appendChild(opt);
    select.value = data.id;

    // Ocultar el campo
    wrapNuevaCat.style.display = 'none';
    document.getElementById('nueva-categoria-nombre').value = '';
    Toast.show(`Categoría "${data.nombre}" creada.`, 'success');

  } catch { Toast.show('Error al crear categoría.', 'error'); }
};


/* ════════════════════════════════════════════════
  11. LOGIN (login.html)
   ════════════════════════════════════════════════ */

function initLogin() {
  if (!document.getElementById('login-form')) return;

  // Si ya está logueado, ir directo al admin
  if (Auth.isLogged()) { window.location.href = '/admin-panel/'; return; }

  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');

    if (!email || !pass) {
      errEl.textContent = 'Por favor completá todos los campos.';
      errEl.style.display = 'block'; return;
    }

    if (Auth.check(email, pass)) {
      Auth.login(email);
      window.location.href = '/admin-panel/';
    } else {
      errEl.textContent   = 'Credenciales incorrectas. Verificá tu email y contraseña.';
      errEl.style.display = 'block';
      document.getElementById('login-pass').value = '';
      document.getElementById('login-pass').focus();
    }
  });
}

/* ════════════════════════════════════════════════
  12. MÓDULO SEDES
   ════════════════════════════════════════════════ */
const ModSedes = {

  _cache: [],

abrirEdicion(id) {
  const sede = this._cache.find(s => s.id === id);
  if (sede) this.openModal(sede);
},

  async cargar() {
    const r    = await fetch('/api/sedes/');
    const data = await r.json();
    return data.sedes || [];
  },

  render(sedes) {
    this._cache = sedes;
    const tbody  = document.getElementById('tbody-sedes');
    if (!tbody) return;

    const statTotal     = document.getElementById('stat-total-sedes');
    const statActivas   = document.getElementById('stat-sedes-activas');
    const statPendientes = document.getElementById('stat-sedes-pendientes');
    const badge         = document.getElementById('nav-badge-sedes');

    if (statTotal)      statTotal.innerText      = sedes.length;
    if (statActivas)    statActivas.innerText     = sedes.filter(s => s.activo).length;
    if (statPendientes) statPendientes.innerText  = sedes.filter(s => !s.activo).length;
    if (badge)          badge.textContent         = sedes.length;

    if (sedes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No hay sedes registradas.</td></tr>`;
      return;
    }

tbody.innerHTML = sedes.map(s => `
  <tr data-id="${s.id}">
    <td><strong>${s.nombre}</strong></td>
    <td>${s.direccion}</td>
    <td>${s.departamento}</td>
    <td>${s.horario}</td>
    <td>
      <span class="badge-estado ${s.activo ? 'badge-asistio' : 'badge-pendiente'}">
        ${s.activo ? 'Activa' : 'Pendiente'}
      </span>
    </td>
    <td>
      <button class="btn-adm-icon edit btn-editar-sede"
        data-id="${s.id}"
        data-nombre="${s.nombre.replace(/"/g, '&quot;')}"
        data-direccion="${s.direccion.replace(/"/g, '&quot;')}"
        data-departamento="${s.departamento}"
        data-provincia="${s.provincia}"
        data-horario="${s.horario.replace(/"/g, '&quot;')}"
        data-lat="${s.lat || ''}"
        data-lng="${s.lng || ''}"
        data-activo="${s.activo}"
        title="Editar">
        <i class="bi bi-pencil-square"></i>
      </button>
      <button class="btn-adm-icon trash"
        onclick="ModSedes.eliminar(${s.id})"
        title="Eliminar">
        <i class="bi bi-trash3"></i>
      </button>
    </td>
  </tr>
`).join('');

// Asignar eventos a botones editar
tbody.querySelectorAll('.btn-editar-sede').forEach(btn => {
  btn.onclick = () => ModSedes.openModal({
    id:           btn.dataset.id,
    nombre:       btn.dataset.nombre,
    direccion:    btn.dataset.direccion,
    departamento: btn.dataset.departamento,
    provincia:    btn.dataset.provincia,
    horario:      btn.dataset.horario,
    lat:          btn.dataset.lat,
    lng:          btn.dataset.lng,
    activo:       btn.dataset.activo === 'true',
  });
});

    // Filtros
    this.aplicarFiltros(sedes);
  },

  aplicarFiltros(sedes) {
    const filtroNombre  = document.getElementById('filtro-sede');
    const filtroEstado  = document.getElementById('filtro-sede-estado');

    const filtrar = () => {
      const texto  = filtroNombre?.value.toLowerCase() || '';
      const estado = filtroEstado?.value;

      const filtradas = sedes.filter(s => {
        const coincideTexto  = !texto || s.nombre.toLowerCase().includes(texto) || s.direccion.toLowerCase().includes(texto);
        const coincideEstado = estado === '' || s.activo.toString() === estado;
        return coincideTexto && coincideEstado;
      });

      const tbody = document.getElementById('tbody-sedes');
      if (!tbody) return;

      if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No hay resultados.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtradas.map(s => `
        <tr>
          <td><strong>${s.nombre}</strong></td>
          <td>${s.direccion}</td>
          <td>${s.departamento}</td>
          <td>${s.horario}</td>
          <td><span class="badge-estado ${s.activo ? 'badge-asistio' : 'badge-pendiente'}">
            ${s.activo ? 'Activa' : 'Pendiente'}
          </span></td>
          <td>
            <button class="btn-adm-icon edit" title="Editar"
  onclick="ModSedes.abrirEdicion(${s.id})">
  <i class="bi bi-pencil-square"></i>
</button>
            <button class="btn-adm-icon trash" data-eliminar="${s.id}" title="Eliminar">
              <i class="bi bi-trash3"></i>
            </button>
          </td>
        </tr>
      `).join('');
    };

    filtroNombre?.addEventListener('input', filtrar);
    filtroEstado?.addEventListener('change', filtrar);
  },

  openModal(sede = null) {
    const form   = document.getElementById('form-sede');
    const titulo = document.getElementById('modal-sede-titulo');
    if (!form) return;

    if (sede) {
      titulo.textContent                          = 'Editar Sede';
      form['sede-id'].value                       = sede.id;
      form['sede-nombre'].value                   = sede.nombre;
      form['sede-direccion'].value                = sede.direccion;
      form['sede-departamento'].value             = sede.departamento;
      form['sede-provincia'].value                = sede.provincia;
      form['sede-horario'].value                  = sede.horario;
      form['sede-lat'].value                      = sede.lat;
      form['sede-lng'].value                      = sede.lng;
      if (form['sede-activo'])
        form['sede-activo'].value                 = sede.activo.toString();
    } else {
      titulo.textContent = 'Nueva Sede';
      form.reset();
      form['sede-id'].value      = '';
      form['sede-provincia'].value = 'Santiago del Estero';
    }

    new bootstrap.Modal(document.getElementById('modal-sede')).show();
  },

  async handleFormSave() {
    const form = document.getElementById('form-sede');
    if (!form) return;

    const id           = form['sede-id'].value;
    const nombre       = form['sede-nombre'].value.trim();
    const direccion    = form['sede-direccion'].value.trim();
    const departamento = form['sede-departamento'].value.trim();
    const provincia    = form['sede-provincia'].value.trim();
    const horario      = form['sede-horario'].value.trim();
    const lat          = form['sede-lat'].value;
    const lng          = form['sede-lng'].value;
    const activo       = form['sede-activo'] ? form['sede-activo'].value === 'true' : false;

    if (!nombre || !direccion || !departamento || !horario) {
      Toast.show('Completá los campos obligatorios.', 'error');
      return;
    }

    const url  = id ? `/api/sedes/${id}/editar/` : '/api/sedes/crear/';
    const body = { nombre, direccion, departamento, provincia, horario, lat, lng, activo };

    try {
      const r    = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken':  this.getCookie('csrftoken'),
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }

      bootstrap.Modal.getInstance(document.getElementById('modal-sede'))?.hide();
      Toast.show(id ? 'Sede actualizada.' : 'Sede creada correctamente.', 'success');
      await this.init();

    } catch { Toast.show('Error al guardar sede.', 'error'); }
  },

  async eliminar(id) {
    if (!confirm('¿Eliminar esta sede? Esta acción no se puede deshacer.')) return;

    try {
      const r    = await fetch(`/api/sedes/${id}/eliminar/`, {
        method:  'POST',
        headers: { 'X-CSRFToken': this.getCookie('csrftoken') },
      });
      const data = await r.json();

      if (data.error) { Toast.show(data.error, 'error'); return; }
      Toast.show('Sede eliminada.', 'warning');
      await this.init();

    } catch { Toast.show('Error al eliminar sede.', 'error'); }
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  },

  async init() {
    const btnNueva = document.getElementById('btn-nueva-sede');
    if (btnNueva) btnNueva.onclick = () => this.openModal();

    const sedes = await this.cargar();
    this.render(sedes);
  }
};

/* ════════════════════════════════════════════════
  12. MÓDULO ESTADÍSTICAS
   ════════════════════════════════════════════════ */
const ModEstadisticas = {

  async cargar() {
    const r    = await fetch('/api/turnos/estadisticas/');
    const data = await r.json();
    return data;
  },

  barras(containerId, items, colorFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const max = Math.max(...items.map(i => i.valor), 1);

    container.innerHTML = items.map(item => `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span style="font-weight:600;color:#2d3748;">${item.label}</span>
          <span style="font-weight:700;color:#2d3748;">${item.valor}</span>
        </div>
        <div style="background:#f0f2f5;border-radius:20px;height:10px;overflow:hidden;">
          <div style="
            width:${Math.round(item.valor / max * 100)}%;
            height:100%;
            background:${colorFn(item)};
            border-radius:20px;
            transition:width .6s ease;
          "></div>
        </div>
      </div>
    `).join('');
  },

  render(data) {
    // Cards resumen
    document.getElementById('est-hoy-total').textContent     = data.hoy_total;
    document.getElementById('est-hoy-pendientes').textContent = data.hoy_pendientes;
    document.getElementById('est-tasa').textContent           = `${data.tasa_asistencia}%`;
    document.getElementById('est-total').textContent          = data.total;

    // Por estado
    this.barras('est-por-estado', [
      { label: 'Pendientes',   valor: data.pendientes,    color: '#b8860b' },
      { label: 'Asistieron',   valor: data.asistieron,    color: '#1e7e34' },
      { label: 'No asistieron',valor: data.no_asistieron, color: '#c8102e' },
      { label: 'Cancelados',   valor: data.cancelados,    color: '#6c757d' },
    ], item => item.color);

    // Por origen
    const totalOrigen = (data.sistema + data.manual) || 1;
    this.barras('est-por-origen', [
      { label: `Sistema (ciudadanos) — ${Math.round(data.sistema/totalOrigen*100)}%`,
        valor: data.sistema, color: '#0066cc' },
      { label: `Manual (empleados) — ${Math.round(data.manual/totalOrigen*100)}%`,
        valor: data.manual,  color: '#c8102e' },
    ], item => item.color);

    // Por trámite
    const tramiteLabels = {
      'dni-5-8':       'DNI 5-8 años',
      'dni-14':        'DNI 14 años',
      'dni-domicilio': 'Cambio domicilio',
      'dni-nuevo':     'Nuevo ejemplar',
      'pasaporte':     'Pasaporte',
    };
    this.barras('est-por-tramite',
      data.por_tramite.map(t => ({
        label: tramiteLabels[t.tramite] || t.tramite,
        valor: t.total
      })),
      () => '#c8102e'
    );

    // Últimos 7 días
    const contenedor7 = document.getElementById('est-ultimos-7');
    if (contenedor7) {
      if (data.ultimos_7.length === 0) {
        contenedor7.innerHTML = '<p style="color:#888;font-size:13px;text-align:center;padding:20px 0;">Sin datos en los últimos 7 días.</p>';
      } else {
        const max7 = Math.max(...data.ultimos_7.map(d => d.total), 1);
        contenedor7.innerHTML = data.ultimos_7.map(d => {
          const [y, m, dia] = d.dia.split('-');
          const fecha = `${dia}/${m}`;
          const pct   = Math.round(d.total / max7 * 100);
          return `
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
                <span style="font-weight:600;color:#2d3748;">${fecha}</span>
                <span style="font-weight:700;color:#2d3748;">${d.total}</span>
              </div>
              <div style="background:#f0f2f5;border-radius:20px;height:8px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:#c8102e;border-radius:20px;transition:width .6s ease;"></div>
              </div>
            </div>`;
        }).join('');
      }
    }
  },

  async init() {
    try {
      const data = await this.cargar();
      this.render(data);
    } catch (e) {
      console.error('[ModEstadisticas]', e);
    }
  }
};

/* ════════════════════════════════════════════════
  13. INIT GENERAL ADMIN
   ════════════════════════════════════════════════ */

function initAdmin() {
  if (!document.querySelector('.admin-body')) return;
  if (document.getElementById('sec-sedes')) ModSedes.init();
  if (document.getElementById('sec-tramites-panel')) ModTramites.init();
  if (document.getElementById('sec-estadisticas')) ModEstadisticas.init();

  // Guard de autenticación
  /* Auth.guard(); */

  // Seed datos
  Store.initAll();

  // Mostrar usuario actual
const userDisplay = document.getElementById('adm-current-user');
if (userDisplay) {
    fetch('/api/usuario-actual/')
        .then(r => r.json())
        .then(data => { userDisplay.textContent = data.nombre || data.username; })
        .catch(() => { userDisplay.textContent = 'Admin'; });
}

  // Botón cerrar sesión
  document.querySelectorAll('.btn-logout-global').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('¿Cerrar sesión?')) Auth.logout();
    });
  });

  // Inicializar navegación y módulos
  initNav();
  ModTurnos.init();
  ModUsuarios.init();
  ModNoticias.init();
}

/* ════════════════════════════════════════════════
  14. BOOTSTRAP
   ════════════════════════════════════════════════ */

   // Limpiar backdrop de modales al cerrar
document.addEventListener('hidden.bs.modal', () => {
  document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow   = '';
  document.body.style.paddingRight = '';
});

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initAdmin();
});
