import json
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from .models import Noticia

IMAGEN_DEFAULT = 'https://i.pinimg.com/736x/8c/c2/b2/8cc2b2e8191e930d298607a299fb92c8.jpg'

MESES_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]


def format_fecha_publica(fecha):
    if not fecha:
        return ''
    return f"{fecha.day} de {MESES_ES[fecha.month - 1]} de {fecha.year}"


def get_imagen_url(noticia, request):
    if noticia.imagen:
        return noticia.imagen.url
    return IMAGEN_DEFAULT


@login_required
def listar_noticias(request):
    noticias = Noticia.objects.select_related('creado_por', 'aprobado_por').all()
    data = []
    for n in noticias:
        data.append({
            'id':          n.id,
            'titulo':      n.titulo,
            'cuerpo':      n.cuerpo,
            'tag':         n.tag,
            'imagen':      get_imagen_url(n, request),
            'estado':      n.estado,
            'creado_por':  n.creado_por.get_full_name() if n.creado_por else 'Sistema',
            'fecha':       n.fecha_creacion.strftime('%d/%m/%Y'),
        })
    return JsonResponse({'noticias': data})


def noticias_publicas(request):
    noticias = Noticia.objects.filter(estado='publicada').order_by('-fecha_publicacion')[:6]
    data = []
    for n in noticias:
        data.append({
            'id':     n.id,
            'titulo': n.titulo,
            'cuerpo': n.cuerpo,
            'tag':    n.tag,
            'imagen': get_imagen_url(n, request),
            'fecha':  format_fecha_publica(n.fecha_publicacion),
        })
    return JsonResponse({'noticias': data})


@login_required
def crear_noticia(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido.'}, status=405)
    try:
        titulo = request.POST.get('titulo', '').strip()
        cuerpo = request.POST.get('cuerpo', '').strip()
        tag    = request.POST.get('tag', 'General').strip()
        estado = request.POST.get('estado', 'borrador').strip()

        if not titulo or not cuerpo:
            return JsonResponse({'error': 'Título y cuerpo son obligatorios.'}, status=400)

        # Solo superadmin puede publicar directamente
        if estado == 'publicada' and not request.user.is_superuser:
            estado = 'revision'

        noticia = Noticia(
            titulo     = titulo,
            cuerpo     = cuerpo,
            tag        = tag,
            estado     = estado,
            creado_por = request.user,
        )

        if estado == 'publicada':
            noticia.fecha_publicacion = timezone.now()
            noticia.aprobado_por      = request.user

        if 'imagen' in request.FILES:
            noticia.imagen = request.FILES['imagen']

        noticia.save()
        return JsonResponse({'ok': True, 'id': noticia.id})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def editar_noticia(request, noticia_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido.'}, status=405)
    try:
        noticia = Noticia.objects.get(id=noticia_id)

        titulo = request.POST.get('titulo', noticia.titulo).strip()
        cuerpo = request.POST.get('cuerpo', noticia.cuerpo).strip()
        tag    = request.POST.get('tag', noticia.tag).strip()
        estado = request.POST.get('estado', noticia.estado).strip()

        if not request.user.is_superuser and estado == 'publicada':
            estado = noticia.estado

        noticia.titulo = titulo
        noticia.cuerpo = cuerpo
        noticia.tag    = tag

        if estado != noticia.estado:
            noticia.estado = estado
            if estado == 'publicada' and not noticia.fecha_publicacion:
                noticia.fecha_publicacion = timezone.now()
                noticia.aprobado_por      = request.user

        if 'imagen' in request.FILES:
            noticia.imagen = request.FILES['imagen']

        noticia.save()
        return JsonResponse({'ok': True})

    except Noticia.DoesNotExist:
        return JsonResponse({'error': 'Noticia no encontrada.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def eliminar_noticia(request, noticia_id):
    try:
        if not request.user.is_superuser:
            return JsonResponse({'error': 'Sin permisos.'}, status=403)
        Noticia.objects.get(id=noticia_id).delete()
        return JsonResponse({'ok': True})
    except Noticia.DoesNotExist:
        return JsonResponse({'error': 'Noticia no encontrada.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)