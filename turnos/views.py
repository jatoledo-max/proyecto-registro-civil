import json
from datetime import date, datetime, timedelta
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import get_object_or_404
from django.db.models import Count
from .models import Turno
from .emails import enviar_cancelacion_turno, enviar_reprogramacion_turno

# ── Configuración ──
MAX_POR_HORARIO = 1
MAX_TURNOS_DIA  = 20
HORA_INICIO     = 8
HORA_FIN        = 12
MINUTOS_SLOT    = 15

FERIADOS = [
    "01-01","03-03","03-04","04-02","05-01","05-25",
    "06-20","07-09","08-17","10-12","11-20","12-08","12-25"
]

def es_feriado(d):
    return f"{d.month:02d}-{d.day:02d}" in FERIADOS

def es_habil(d):
    if d.weekday() >= 5: return False   # sábado=5, domingo=6
    if es_feriado(d):    return False
    if d < date.today(): return False
    return True

def generar_slots():
    slots = []
    h, m = HORA_INICIO, 0
    while h < HORA_FIN:
        slots.append(f"{h:02d}:{m:02d}")
        m += MINUTOS_SLOT
        if m >= 60:
            m -= 60
            h += 1
    return slots

SLOTS = generar_slots()


# ── API pública — disponibilidad (sin login) ──
def disponibilidad(request):
    fecha_str = request.GET.get('fecha')
    if not fecha_str:
        return JsonResponse({'error': 'Falta el parámetro fecha.'}, status=400)

    try:
        d = date.fromisoformat(fecha_str)
    except ValueError:
        return JsonResponse({'error': 'Formato de fecha inválido.'}, status=400)

    if not es_habil(d):
        return JsonResponse({'habil': False, 'slots': []})

    turnos_del_dia = Turno.objects.filter(
        fecha=d, estado__in=['pendiente', 'asistio']
    )
    conteo = {}
    for t in turnos_del_dia:
        hora_key = t.hora.strftime('%H:%M')
        conteo[hora_key] = conteo.get(hora_key, 0) + 1

    total_dia = turnos_del_dia.count()

    slots_info = []
    for slot in SLOTS:
        usados = conteo.get(slot, 0)
        libres = MAX_POR_HORARIO - usados
        slots_info.append({
            'hora':   slot,
            'libres': max(libres, 0),
            'lleno':  libres <= 0,
        })

    return JsonResponse({
        'habil':     True,
        'habil_dia': total_dia < MAX_TURNOS_DIA,
        'slots':     slots_info,
    })


# ── API pública — crear turno (ciudadano) ──
@csrf_exempt
@require_POST
def crear_turno(request):
    try:
        data      = json.loads(request.body)
        tramite   = data.get('tramite', '').strip()
        nombre    = data.get('nombre', '').strip()
        dni       = data.get('dni', '').strip()
        email     = data.get('email', '').strip()
        telefono  = data.get('telefono', '').strip()
        direccion = data.get('direccion', '').strip()
        fecha_str = data.get('fecha', '').strip()
        hora_str  = data.get('hora', '').strip()
        origen    = data.get('origen', 'sistema')

        # Validaciones básicas
        if not all([tramite, nombre, dni, email, telefono, direccion, fecha_str, hora_str]):
            return JsonResponse({'error': 'Completá todos los campos.'}, status=400)

        fecha = date.fromisoformat(fecha_str)
        hora  = datetime.strptime(hora_str, '%H:%M').time()

        if not es_habil(fecha):
            return JsonResponse({'error': 'La fecha seleccionada no es hábil.'}, status=400)

        if hora_str not in SLOTS:
            return JsonResponse({'error': 'El horario seleccionado no es válido.'}, status=400)

        # Verificar disponibilidad
        turno_en_slot = Turno.objects.filter(
            fecha=fecha, hora=hora,
            estado__in=['pendiente', 'asistio']
        ).count()
        if turno_en_slot >= MAX_POR_HORARIO:
            return JsonResponse({'error': 'Ese horario ya no está disponible. Elegí otro.'}, status=400)

        total_dia = Turno.objects.filter(
            fecha=fecha,
            estado__in=['pendiente', 'asistio']
        ).count()
        if total_dia >= MAX_TURNOS_DIA:
            return JsonResponse({'error': 'No hay más turnos disponibles para ese día.'}, status=400)

        # Crear turno
        turno = Turno.objects.create(
            tramite   = tramite,
            nombre    = nombre,
            dni       = dni,
            email     = email,
            telefono  = telefono,
            direccion = direccion,
            fecha     = fecha,
            hora      = hora,
            origen    = origen,
            estado    = data.get('estado', 'pendiente'),
        )

        return JsonResponse({
            'ok':           True,
            'numero_turno': turno.numero_turno,
            'fecha':        fecha_str,
            'hora':         hora_str,
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ── API del panel admin ──
@login_required
def listar_turnos(request):
    turnos = Turno.objects.all().select_related('atendido_por')
    data   = []
    for t in turnos:
        data.append({
            'id':           t.id,
            'numero_turno': t.numero_turno,
            'tramite':      t.get_tramite_display(),
            'nombre':       t.nombre,
            'dni':          t.dni,
            'email':        t.email,
            'telefono':     t.telefono,
            'fecha':        t.fecha.strftime('%d/%m/%Y'),
            'hora':         t.hora.strftime('%H:%M'),
            'estado':       t.estado,
            'origen':       t.origen,
            'tramite_slug': t.tramite,  # ← el valor raw del modelo (dni-5-8, etc.)
        })
    return JsonResponse({'turnos': data})


@login_required
@require_POST
def cambiar_estado(request, turno_id):
    try:
        data   = json.loads(request.body)
        turno  = Turno.objects.get(id=turno_id)
        estado = data.get('estado')

        estados_validos = ['pendiente', 'asistio', 'no_asistio', 'cancelado']
        if estado not in estados_validos:
            return JsonResponse({'error': 'Estado inválido.'}, status=400)

        turno.estado = estado
        if estado in ['asistio', 'no_asistio']:
            turno.atendido_por = request.user
        turno.save()

        # Notificar al ciudadano si el turno fue cancelado
        if estado == 'cancelado':
            enviar_cancelacion_turno(turno)

        return JsonResponse({'ok': True, 'estado': estado})

    except Turno.DoesNotExist:
        return JsonResponse({'error': 'Turno no encontrado.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    
@login_required
@require_POST
def reprogramar_turno(request, turno_id):
    """Permite al personal reprogramar fecha y hora de un turno existente."""
    turno = get_object_or_404(Turno, id=turno_id)
    try:
        data          = json.loads(request.body)
        nueva_fecha_str = data.get('fecha', '').strip()
        nueva_hora_str  = data.get('hora', '').strip()

        if not nueva_fecha_str or not nueva_hora_str:
            return JsonResponse({'error': 'Fecha y hora son obligatorias.'}, status=400)

        try:
            nueva_fecha = date.fromisoformat(nueva_fecha_str)
            nueva_hora  = datetime.strptime(nueva_hora_str, '%H:%M').time()
        except ValueError:
            return JsonResponse({'error': 'Formato de fecha u hora inválido.'}, status=400)

        if not es_habil(nueva_fecha):
            return JsonResponse({'error': 'La fecha seleccionada no es hábil.'}, status=400)

        if nueva_hora_str not in SLOTS:
            return JsonResponse({'error': 'El horario seleccionado no es válido.'}, status=400)

        # Verificar disponibilidad excluyendo el turno actual
        ocupado = Turno.objects.filter(
            fecha=nueva_fecha,
            hora=nueva_hora,
            estado__in=['pendiente', 'asistio'],
        ).exclude(id=turno_id).count()

        if ocupado >= MAX_POR_HORARIO:
            return JsonResponse(
                {'error': 'Ese horario ya no está disponible. Elegí otro.'}, status=400
            )

        # Guardar valores anteriores para el correo
        fecha_anterior = turno.fecha
        hora_anterior  = turno.hora

        turno.fecha  = nueva_fecha
        turno.hora   = nueva_hora
        turno.estado = 'pendiente'   # Vuelve a pendiente tras reprogramación
        turno.save()

        # Notificar al ciudadano
        enviar_reprogramacion_turno(turno, fecha_anterior, hora_anterior)

        return JsonResponse({
            'ok':   True,
            'fecha': nueva_fecha_str,
            'hora':  nueva_hora_str,
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def estadisticas(request):
    from datetime import date, timedelta

    hoy     = date.today()
    hace_7  = hoy - timedelta(days=6)

    # ── Totales generales ──
    total         = Turno.objects.count()
    pendientes    = Turno.objects.filter(estado='pendiente').count()
    asistieron    = Turno.objects.filter(estado='asistio').count()
    no_asistieron = Turno.objects.filter(estado='no_asistio').count()
    cancelados    = Turno.objects.filter(estado='cancelado').count()

    # ── Por origen ──
    sistema = Turno.objects.filter(origen='sistema').count()
    manual  = Turno.objects.filter(origen='manual').count()

    # ── Por trámite ──
    por_tramite = list(
        Turno.objects.values('tramite')
        .annotate(total=Count('id'))
        .order_by('-total')
    )

    # ── Últimos 7 días — compatible SQLite ──
    ultimos_7 = []
    for i in range(6, -1, -1):
        dia = hoy - timedelta(days=i)
        count = Turno.objects.filter(fecha=dia).count()
        ultimos_7.append({'dia': str(dia), 'total': count})

    # ── Tasa de asistencia ──
    atendidos = asistieron + no_asistieron
    tasa_asistencia = round((asistieron / atendidos * 100), 1) if atendidos > 0 else 0

    # ── Hoy ──
    hoy_total      = Turno.objects.filter(fecha=hoy).count()
    hoy_pendientes = Turno.objects.filter(fecha=hoy, estado='pendiente').count()

    return JsonResponse({
        'total':           total,
        'pendientes':      pendientes,
        'asistieron':      asistieron,
        'no_asistieron':   no_asistieron,
        'cancelados':      cancelados,
        'sistema':         sistema,
        'manual':          manual,
        'por_tramite':     por_tramite,
        'ultimos_7':       ultimos_7,
        'tasa_asistencia': tasa_asistencia,
        'hoy_total':       hoy_total,
        'hoy_pendientes':  hoy_pendientes,
    })