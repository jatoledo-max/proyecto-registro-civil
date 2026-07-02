/* ════════════════════════════════════════════
   Módulo de Turnos — Registro Civil
   ════════════════════════════════════════════ */

const ModTurnos = {

  pasoActual: 1,

  tramiteLabels: {
    'dni-5-8':      'DNI – Actualización 5-8 años',
    'dni-14':       'DNI – Actualización 14 años',
    'dni-domicilio':'DNI – Cambio de domicilio',
    'dni-nuevo':    'DNI – Nuevo ejemplar',
    'pasaporte':    'Pasaporte',
  },

  // ── Inicializar ──
  init() {
    // Fecha mínima = hoy
    const hoy = new Date().toISOString().split('T')[0];
    const inputFecha = document.getElementById('turno-fecha');
    if (inputFecha) {
      inputFecha.min = hoy;
      inputFecha.addEventListener('change', () => this.generarHorarios());
    }

    // Limpiar al cerrar el modal
    document.getElementById('modalTurno')?.addEventListener('hidden.bs.modal', () => {
      this.resetear();
    });
  },

  // ── Generar horarios consultando disponibilidad real en Django ──
async generarHorarios() {
  const fecha  = document.getElementById('turno-fecha').value;
  const select = document.getElementById('turno-horario');
  const resumen = document.getElementById('turno-resumen');
  if (!fecha) return;

  select.innerHTML = '<option value="">Cargando horarios...</option>';
  if (resumen) resumen.style.display = 'none';

  try {
    const r    = await fetch(`/api/turnos/disponibilidad/?fecha=${fecha}`);
    const data = await r.json();

    select.innerHTML = '<option value="">Seleccioná un horario</option>';

    if (!data.habil) {
      select.innerHTML = '<option value="">No hay turnos este día (feriado o fin de semana)</option>';
      return;
    }

    if (!data.habil_dia) {
      select.innerHTML = '<option value="">No hay más turnos disponibles para este día</option>';
      return;
    }

    data.slots.forEach(slot => {
      const opt = document.createElement('option');
      opt.value = slot.hora;
      opt.textContent = slot.lleno
        ? `${slot.hora} hs. — Sin disponibilidad`
        : `${slot.hora} hs.`;
      opt.disabled = slot.lleno;
      select.appendChild(opt);
    });

    select.addEventListener('change', () => this.actualizarResumen());

  } catch (e) {
    select.innerHTML = '<option value="">Error al cargar horarios. Reintentá.</option>';
  }
},
  // ── Actualizar resumen ──
  actualizarResumen() {
    const fecha   = document.getElementById('turno-fecha').value;
    const horario = document.getElementById('turno-horario').value;
    const tramite = document.querySelector('input[name="turno-tramite"]:checked')?.value;
    const resumen = document.getElementById('turno-resumen');

    if (!fecha || !horario || !tramite) return;

    // Formatear fecha
    const [y, m, d]   = fecha.split('-');
    const fechaFormato = `${d}/${m}/${y}`;
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const diaNombre = dias[new Date(fecha + 'T00:00:00').getDay()];

    document.getElementById('res-tramite').textContent = this.tramiteLabels[tramite] || tramite;
    document.getElementById('res-nombre').textContent  = document.getElementById('turno-nombre').value;
    document.getElementById('res-dni').textContent     = document.getElementById('turno-dni').value;
    document.getElementById('res-fecha').textContent   = `${diaNombre} ${fechaFormato}`;
    document.getElementById('res-horario').textContent = `${horario} hs.`;

    resumen.style.display = 'block';
  },

  // ── Validar paso actual ──
  validarPaso() {
    if (this.pasoActual === 1) {
      const tramite = document.querySelector('input[name="turno-tramite"]:checked');
      if (!tramite) {
        document.getElementById('error-tramite').style.display = 'flex';
        return false;
      }
      document.getElementById('error-tramite').style.display = 'none';
      return true;
    }

    if (this.pasoActual === 2) {
      const nombre    = document.getElementById('turno-nombre').value.trim();
      const dni       = document.getElementById('turno-dni').value.trim();
      const email     = document.getElementById('turno-email').value.trim();
      const telefono  = document.getElementById('turno-telefono').value.trim();
      const direccion = document.getElementById('turno-direccion').value.trim();

      if (!nombre || !dni || !email || !telefono || !direccion) {
        document.getElementById('error-datos').style.display = 'flex';
        return false;
      }
      if (!/^\d{7,8}$/.test(dni)) {
        document.getElementById('error-datos').style.display = 'flex';
        document.getElementById('error-datos').innerHTML =
          '<i class="bi bi-exclamation-circle-fill me-1"></i> El DNI debe tener 7 u 8 dígitos.';
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('error-datos').style.display = 'flex';
        document.getElementById('error-datos').innerHTML =
          '<i class="bi bi-exclamation-circle-fill me-1"></i> Ingresá un email válido.';
        return false;
      }
      document.getElementById('error-datos').style.display = 'none';
      return true;
    }

    if (this.pasoActual === 3) {
      const fecha   = document.getElementById('turno-fecha').value;
      const horario = document.getElementById('turno-horario').value;
      const dia     = fecha ? new Date(fecha + 'T00:00:00').getDay() : -1;

      if (!fecha || !horario || dia === 0 || dia === 6) {
        document.getElementById('error-fecha').style.display = 'flex';
        return false;
      }
      document.getElementById('error-fecha').style.display = 'none';
      this.actualizarResumen();
      return true;
    }

    return true;
  },

  // ── Avanzar paso ──
  siguiente() {
    if (!this.validarPaso()) return;

    if (this.pasoActual === 3) {
      this.confirmar();
      return;
    }

    this.pasoActual++;
    this.mostrarPaso();
  },

  // ── Retroceder paso ──
  anterior() {
    if (this.pasoActual > 1) {
      this.pasoActual--;
      this.mostrarPaso();
    }
  },

  // ── Mostrar paso actual ──
  mostrarPaso() {
    for (let i = 1; i <= 3; i++) {
      const paso = document.getElementById(`turno-paso-${i}`);
      if (paso) paso.style.display = i === this.pasoActual ? 'block' : 'none';

      // Indicadores
      const ind = document.getElementById(`step-ind-${i}`);
      if (ind) {
        const circle = ind.querySelector('.step-circle');
        if (i < this.pasoActual)       circle.className = 'step-circle done';
        else if (i === this.pasoActual) circle.className = 'step-circle active';
        else                            circle.className = 'step-circle';
      }
    }

    // Botones
    const btnAnterior  = document.getElementById('btn-turno-anterior');
    const btnSiguiente = document.getElementById('btn-turno-siguiente');

    btnAnterior.style.display  = this.pasoActual > 1 ? 'inline-flex' : 'none';
    btnSiguiente.innerHTML     = this.pasoActual === 3
      ? '<i class="bi bi-check-circle-fill me-1"></i> Confirmar turno'
      : 'Siguiente <i class="bi bi-arrow-right ms-1"></i>';
  },

// ── Confirmar turno — envía a Django ──
async confirmar() {
  const tramite   = document.querySelector('input[name="turno-tramite"]:checked')?.value;
  const nombre    = document.getElementById('turno-nombre').value;
  const dni       = document.getElementById('turno-dni').value;
  const email     = document.getElementById('turno-email').value;
  const telefono  = document.getElementById('turno-telefono').value;
  const direccion = document.getElementById('turno-direccion').value;
  const fecha     = document.getElementById('turno-fecha').value;
  const horario   = document.getElementById('turno-horario').value;

  const btnConfirmar = document.getElementById('btn-turno-siguiente');
  btnConfirmar.disabled = true;
  btnConfirmar.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...';

  try {
    const r    = await fetch('/api/turnos/crear/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tramite, nombre, dni, email, telefono, direccion,
        fecha, hora: horario, origen: 'sistema'
      }),
    });
    const data = await r.json();

    if (data.error) {
      document.getElementById('error-fecha').style.display = 'flex';
      document.getElementById('error-fecha').innerHTML =
        `<i class="bi bi-exclamation-circle-fill me-1"></i>${data.error}`;
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Confirmar turno';
      return;
    }

    // Mostrar confirmación
    const [y, m, d]    = fecha.split('-');
    const fechaFormato = `${d}/${m}/${y}`;
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const diaNombre = dias[new Date(fecha + 'T00:00:00').getDay()];

    document.getElementById('conf-email').textContent     = email;
    document.getElementById('conf-tramite').textContent   = this.tramiteLabels[tramite] || tramite;
    document.getElementById('conf-fecha-hora').textContent =
      `${diaNombre} ${fechaFormato} – ${horario} hs. · Nº ${data.numero_turno}`;

    for (let i = 1; i <= 3; i++) {
      const p = document.getElementById(`turno-paso-${i}`);
      if (p) p.style.display = 'none';
    }
    document.getElementById('turno-paso-4').style.display = 'block';
    document.getElementById('turno-footer').style.display = 'none';

    for (let i = 1; i <= 3; i++) {
      const circle = document.querySelector(`#step-ind-${i} .step-circle`);
      if (circle) circle.className = 'step-circle done';
    }

  } catch (e) {
    document.getElementById('error-fecha').style.display = 'flex';
    document.getElementById('error-fecha').innerHTML =
      '<i class="bi bi-exclamation-circle-fill me-1"></i> Error de conexión. Reintentá.';
    btnConfirmar.disabled = false;
    btnConfirmar.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Confirmar turno';
  }
},

  // ── Resetear modal ──
  resetear() {
    this.pasoActual = 1;
    document.querySelectorAll('input[name="turno-tramite"]').forEach(r => r.checked = false);
    ['turno-nombre','turno-dni','turno-email','turno-telefono','turno-direccion','turno-fecha'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const selectH = document.getElementById('turno-horario');
    if (selectH) selectH.innerHTML = '<option value="">Seleccioná un horario</option>';
    document.getElementById('turno-resumen').style.display  = 'none';
    document.getElementById('turno-paso-4').style.display   = 'none';
    document.getElementById('turno-footer').style.display   = 'flex';

    for (let i = 1; i <= 4; i++) {
      const p = document.getElementById(`turno-paso-${i}`);
      if (p) p.style.display = i === 1 ? 'block' : 'none';
    }
    this.mostrarPaso();
  }
};

// Funciones globales para los onclick del HTML
function turnoSiguiente() { ModTurnos.siguiente(); }
function turnoAnterior()  { ModTurnos.anterior();  }

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', () => ModTurnos.init());