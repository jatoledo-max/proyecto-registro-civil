import json
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.utils import timezone
from .models import Tramite, CategoriaTramite


def lista_tramites(request):
    categorias = CategoriaTramite.objects.prefetch_related('tramites').all()
    resultado  = []

    for cat in categorias:
        tramites_pub = cat.tramites.filter(estado='publicado')
        if tramites_pub.exists():
            resultado.append({
                'id':       cat.id,
                'nombre':   cat.nombre,
                'icono':    cat.icono,
                'tramites': list(tramites_pub.values('id', 'nombre', 'descripcion', 'slug', 'icono'))
            })

    return render(request, 'tramites.html', {'categorias': resultado})

# ── API para el panel admin ──

@login_required
def api_listar_tramites(request):
    tramites = Tramite.objects.select_related('categoria', 'creado_por', 'aprobado_por').all()
    data = []
    for t in tramites:
        data.append({
            'id':         t.id,
            'nombre':     t.nombre,
            'categoria':  t.categoria.nombre if t.categoria else '—',
            'slug':       t.slug,
            'icono':      t.icono,
            'estado':     t.estado,
            'creado_por': (
                'Admin'    if t.creado_por and t.creado_por.is_superuser else
                'Operador' if t.creado_por and t.creado_por.is_staff else
                'Sistema'
            ),
            'es_gratuito':          t.es_gratuito,
            'precio':               str(t.precio) if t.precio else None,
            'requiere_turno':       t.requiere_turno,
            'requisitos':           t.requisitos,
            'como_se_inicia':       t.como_se_inicia,
            'modalidad_presencial': t.modalidad_presencial,
            'modalidad_digital':    t.modalidad_digital,
        })
    return JsonResponse({'tramites': data})


@login_required
@require_POST
def api_crear_tramite(request):
    try:
        data        = json.loads(request.body)
        nombre      = data.get('nombre', '').strip()
        descripcion = data.get('descripcion', '').strip()
        slug        = data.get('slug', '').strip()
        icono       = data.get('icono', 'bi-file-earmark-text').strip()
        categoria_id = data.get('categoria_id')
        es_gratuito          = data.get('es_gratuito', False)
        requiere_turno       = data.get('requiere_turno', False)
        requisitos           = data.get('requisitos', '').strip()
        como_se_inicia       = data.get('como_se_inicia', '').strip()
        modalidad_presencial = data.get('modalidad_presencial', False)
        modalidad_digital    = data.get('modalidad_digital', False)
        precio               = data.get('precio') or None

        if not nombre or not slug:
            return JsonResponse({'error': 'Nombre y slug son obligatorios.'}, status=400)

        if Tramite.objects.filter(slug=slug).exists():
            return JsonResponse({'error': 'Ya existe un trámite con ese slug.'}, status=400)

        estado = 'borrador'
        fecha_pub = None
        if request.user.is_superuser and data.get('estado') == 'publicado':
            estado    = 'publicado'
            fecha_pub = timezone.now()

        tramite = Tramite.objects.create(
            nombre       = nombre,
            descripcion  = descripcion,
            slug         = slug,
            icono        = icono,
            estado       = estado,
            categoria_id = categoria_id,
            creado_por   = request.user,
            fecha_publicacion = fecha_pub,
            es_gratuito          = es_gratuito,
            requiere_turno       = requiere_turno,
            requisitos           = requisitos,
            como_se_inicia       = como_se_inicia,
            modalidad_presencial = modalidad_presencial,
            modalidad_digital    = modalidad_digital,
            precio               = precio,
        )
        return JsonResponse({'ok': True, 'id': tramite.id})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    
@login_required
@require_POST
def api_crear_categoria(request):
    try:
        data   = json.loads(request.body)
        nombre = data.get('nombre', '').strip()
        icono  = data.get('icono', 'bi-file-earmark').strip()

        if not nombre:
            return JsonResponse({'error': 'El nombre es obligatorio.'}, status=400)

        if CategoriaTramite.objects.filter(nombre__iexact=nombre).exists():
            return JsonResponse({'error': 'Ya existe una categoría con ese nombre.'}, status=400)

        orden = CategoriaTramite.objects.count() + 1
        cat   = CategoriaTramite.objects.create(nombre=nombre, icono=icono, orden=orden)
        return JsonResponse({'ok': True, 'id': cat.id, 'nombre': cat.nombre, 'icono': cat.icono})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def api_editar_tramite(request, tramite_id):
    try:
        data    = json.loads(request.body)
        tramite = get_object_or_404(Tramite, id=tramite_id)

        tramite.nombre      = data.get('nombre', tramite.nombre).strip()
        tramite.descripcion = data.get('descripcion', tramite.descripcion).strip()
        tramite.icono       = data.get('icono', tramite.icono).strip()
        tramite.es_gratuito          = data.get('es_gratuito', tramite.es_gratuito)
        tramite.requiere_turno       = data.get('requiere_turno', tramite.requiere_turno)
        tramite.requisitos           = data.get('requisitos', tramite.requisitos).strip()
        tramite.como_se_inicia       = data.get('como_se_inicia', tramite.como_se_inicia).strip()
        tramite.modalidad_presencial = data.get('modalidad_presencial', tramite.modalidad_presencial)
        tramite.modalidad_digital    = data.get('modalidad_digital', tramite.modalidad_digital)
        tramite.precio               = data.get('precio') or None

        if data.get('categoria_id'):
            tramite.categoria_id = data['categoria_id']

        # Solo superadmin puede aprobar
        nuevo_estado = data.get('estado')
        if nuevo_estado and request.user.is_superuser:
            tramite.estado = nuevo_estado
            if nuevo_estado == 'publicado' and not tramite.fecha_publicacion:
                tramite.fecha_publicacion = timezone.now()
                tramite.aprobado_por      = request.user
        elif nuevo_estado and nuevo_estado != 'publicado':
            tramite.estado = nuevo_estado

        tramite.save()
        return JsonResponse({'ok': True})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def api_eliminar_tramite(request, tramite_id):
    try:
        if not request.user.is_superuser:
            return JsonResponse({'error': 'No tenés permisos para eliminar trámites.'}, status=403)

        tramite = get_object_or_404(Tramite, id=tramite_id)
        tramite.delete()
        return JsonResponse({'ok': True})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def api_listar_categorias(request):
    categorias = CategoriaTramite.objects.all()
    data = [{'id': c.id, 'nombre': c.nombre, 'icono': c.icono} for c in categorias]
    return JsonResponse({'categorias': data})