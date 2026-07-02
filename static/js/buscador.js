const INDICE_BUSQUEDA = [
  { texto: "Nacimiento inscripción acta recién nacido registro",          url: "/nacimiento/",       icono: "bi-person-fill-add",          cat: "Trámite" },
  { texto: "DNI documento nacional identidad primer ejemplar renovación actualización cambio domicilio duplicado extravío",
                                                                          url: "/identificacion/",   icono: "bi-credit-card-2-front",       cat: "Trámite" },
  { texto: "DNI actualización 5 8 años",                                  url: "/tramites/dni-5-8/", icono: "bi-person-fill",               cat: "Trámite" },
  { texto: "DNI actualización 14 años",                                   url: "/tramites/dni-14/",  icono: "bi-person-fill",               cat: "Trámite" },
  { texto: "DNI cambio de domicilio",                                     url: "/tramites/dni-domicilio/", icono: "bi-house-fill",          cat: "Trámite" },
  { texto: "DNI nuevo ejemplar robo extravío deterioro",                  url: "/tramites/dni-nuevo/",    icono: "bi-person-badge-fill",    cat: "Trámite" },
  { texto: "Pasaporte viaje exterior RENAPER",                            url: "/tramites/pasaporte/",    icono: "bi-passport",             cat: "Trámite" },
  { texto: "Turno solicitar turno DNI presencial",                        url: "#",                  icono: "bi-calendar-check-fill",      cat: "Turno" },
  { texto: "Matrimonio casamiento civil unión",                           url: "/matrimonio/",       icono: "bi-people-fill",              cat: "Trámite" },
  { texto: "Defunción fallecimiento muerte acta",                         url: "/defuncion/",        icono: "bi-file-earmark-medical-fill",cat: "Trámite" },
  { texto: "Identificación documento identidad género",                   url: "/identificacion/",   icono: "bi-person-vcard-fill",         cat: "Trámite" },
  { texto: "Todos los trámites lista completa",                           url: "/tramites/",         icono: "bi-list-ul",                  cat: "Sección" },
  { texto: "Sedes oficinas locales registro civil dirección",             url: "/sedes/",            icono: "bi-geo-alt-fill",             cat: "Sección" },
];

document.addEventListener("DOMContentLoaded", function () {
  const input   = document.getElementById("buscador-input");
  const btnBusc = document.getElementById("buscador-btn");
  const panel   = document.getElementById("buscador-resultados");

  if (!input || !panel) return;

  function buscar(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) { panel.style.display = "none"; return; }

    const palabras = q.split(/\s+/);
    const matches  = INDICE_BUSQUEDA
      .map(item => {
        const hay  = item.texto.toLowerCase();
        const hits = palabras.filter(p => hay.includes(p)).length;
        return { ...item, hits };
      })
      .filter(item => item.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 6);

    if (!matches.length) { panel.style.display = "none"; return; }

    panel.innerHTML = matches.map(m => `
      <a href="${m.url}" style="
        display:flex; align-items:center; gap:12px;
        padding:11px 16px; text-decoration:none; color:#222;
        border-bottom:1px solid #f5f5f5; transition:background .15s;
        font-family:'Barlow',sans-serif; font-size:14px;
      " onmouseover="this.style.background='#fff5f7'" onmouseout="this.style.background=''">
        <i class="bi ${m.icono}" style="font-size:1.2rem;color:#c8102e;flex-shrink:0;"></i>
        <div>
          <div style="font-weight:600;">${m.texto.split(" ").slice(0,4).join(" ")}</div>
          <div style="font-size:11px;color:#888;">${m.cat}</div>
        </div>
        <i class="bi bi-arrow-right-short" style="margin-left:auto;color:#bbb;font-size:1.1rem;"></i>
      </a>
    `).join("");

    panel.style.display = "block";
  }

  function irPrimerResultado(q) {
    q = q.trim().toLowerCase();
    if (!q) return;
    const palabras = q.split(/\s+/);
    const mejor = INDICE_BUSQUEDA
      .map(item => {
        const hay  = item.texto.toLowerCase();
        const hits = palabras.filter(p => hay.includes(p)).length;
        return { ...item, hits };
      })
      .filter(i => i.hits > 0)
      .sort((a, b) => b.hits - a.hits)[0];

    if (mejor) window.location.href = mejor.url;
  }

  input.addEventListener("input",   () => buscar(input.value));
  input.addEventListener("keydown",  e => {
    if (e.key === "Enter")  { panel.style.display = "none"; irPrimerResultado(input.value); }
    if (e.key === "Escape") panel.style.display = "none";
  });
  btnBusc?.addEventListener("click", () => { panel.style.display = "none"; irPrimerResultado(input.value); });

  document.addEventListener("click", e => {
    if (!input.contains(e.target) && !panel.contains(e.target)) panel.style.display = "none";
  });
});