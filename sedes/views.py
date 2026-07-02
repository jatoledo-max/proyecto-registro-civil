import json
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from .models import Sede
import urllib.request
import urllib.parse


@login_required
def listar_sedes(request):
    sedes = Sede.objects.all()
    data  = []
    for s in sedes:
        data.append({
            'id':           s.id,
            'nombre':       s.nombre,
            'direccion':    s.direccion,
            'departamento': s.departamento,
            'provincia':    s.provincia,
            'horario':      s.horario,
            'lat':          float(s.latitud)  if s.latitud  else None,
            'lng':          float(s.longitud) if s.longitud else None,
            'activo':       s.activo,
        })
    return JsonResponse({'sedes': data})


@login_required
@require_POST
def crear_sede(request):
    try:
        data         = json.loads(request.body)
        nombre       = data.get('nombre', '').strip()
        direccion    = data.get('direccion', '').strip()
        departamento = data.get('departamento', '').strip()
        provincia    = data.get('provincia', 'Santiago del Estero').strip()
        horario      = data.get('horario', '').strip()
        lat          = data.get('lat') or None
        lng          = data.get('lng') or None

        # Solo superadmin puede aprobar al crear
        activo = False
        if request.user.is_superuser:
            activo = data.get('activo', False)

        if not nombre or not direccion or not departamento or not horario:
            return JsonResponse({'error': 'Completá los campos obligatorios.'}, status=400)
        
        # Geocodificar automáticamente si no hay coordenadas manuales
        if not lat or not lng:
            lat, lng = geocodificar(direccion, departamento, provincia)

        # Solo superadmin puede aprobar al crear
        activo = False
        if request.user.is_superuser:
            activo = data.get('activo', False)

        sede = Sede.objects.create(
            nombre       = nombre,
            direccion    = direccion,
            departamento = departamento,
            provincia    = provincia,
            horario      = horario,
            latitud      = lat,
            longitud     = lng,
            activo       = activo,
            creado_por   = request.user,
        )
        return JsonResponse({'ok': True, 'id': sede.id, 'lat': lat, 'lng': lng})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def editar_sede(request, sede_id):
    try:
        from django.shortcuts import get_object_or_404
        data  = json.loads(request.body)
        sede  = get_object_or_404(Sede, id=sede_id)

        sede.nombre       = data.get('nombre', sede.nombre).strip()
        sede.direccion    = data.get('direccion', sede.direccion).strip()
        sede.departamento = data.get('departamento', sede.departamento).strip()
        sede.provincia    = data.get('provincia', sede.provincia).strip()
        sede.horario      = data.get('horario', sede.horario).strip()

        # Re-geocodificar si cambió la dirección o no tiene coordenadas
        lat_manual = data.get('lat')
        lng_manual = data.get('lng')

        if lat_manual and lng_manual:
            sede.latitud  = lat_manual
            sede.longitud = lng_manual
        elif not sede.latitud or not sede.longitud:
            lat, lng = geocodificar(sede.direccion, sede.departamento, sede.provincia)
            if lat: sede.latitud  = lat
            if lng: sede.longitud = lng

        # Solo superadmin puede cambiar el estado
        if request.user.is_superuser:
            sede.activo = data.get('activo', sede.activo)

        sede.save()
        return JsonResponse({'ok': True})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def eliminar_sede(request, sede_id):
    try:
        from django.shortcuts import get_object_or_404
        sede = get_object_or_404(Sede, id=sede_id)

        # Solo superadmin puede eliminar
        if not request.user.is_superuser:
            return JsonResponse({'error': 'No tenés permisos para eliminar sedes.'}, status=403)

        sede.delete()
        return JsonResponse({'ok': True})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    

def geocodificar(direccion, departamento, provincia='Santiago del Estero'):
    try:
        query   = f"{direccion}, {departamento}, {provincia}, Argentina"
        encoded = urllib.parse.quote(query)
        url     = f"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&limit=1"
        req     = urllib.request.Request(url, headers={'User-Agent': 'RegistroCivilSDE/1.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            import json as _json
            data = _json.loads(r.read())
            if data:
                return float(data[0]['lat']), float(data[0]['lon'])
    except:
        pass
    return None, None