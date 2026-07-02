import json
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from .models import PerfilEmpleado


@login_required
def listar_usuarios(request):
    empleados = PerfilEmpleado.objects.select_related('user').all()
    data = []
    for emp in empleados:
        data.append({
            'id': emp.user.id,
            'nombre': emp.user.get_full_name(),
            'email': emp.user.email,
            'rol': emp.rol,
            'activo': emp.user.is_active,
            'fecha_alta': emp.fecha_alta.strftime('%d/%m/%Y'),
        })
    return JsonResponse({'usuarios': data})


@login_required
@require_POST
def crear_usuario(request):
    try:
        data = json.loads(request.body)
        nombre = data.get('nombre', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()
        rol = data.get('rol', 'operador')

        if not nombre or not email or not password:
            return JsonResponse({'error':'Todos los campos son obligatorios.'}, status=400)

        if User.objects.filter(username=email).exists():
            return JsonResponse({'error':'Ya existe un usuario con ese correo.'}, status=400)

        # Separamos nombre y apellido
        partes = nombre.split(' ',1)
        first = partes[0]
        last = partes[1] if len(partes) > 1 else ''

        user = User.objects.create_user(
            username = email,
            email = email,
            password = password,
            first_name = first,
            last_name = last,
            is_staff = True,
        )
        PerfilEmpleado.objects.create(user=user,rol=rol)

        return JsonResponse({'ok':True,'id':user.id})

    except Exception as e:
        return JsonResponse({'error':str(e)},status=500)


@login_required
@require_POST
def editar_usuario(request, user_id):
    user = get_object_or_404(User, id=user_id)
    perfil = get_object_or_404(PerfilEmpleado, user=user)
    try:
        data = json.loads(request.body)

        nombre = data.get('nombre', '').strip()
        if nombre:
            partes = nombre.split(' ',1)
            user.first_name = partes[0]
            user.last_name  = partes[1] if len(partes) > 1 else ''

        if data.get('email'):
            user.email = data['email']
            user.username = data['email']

        if data.get('password'):
            user.set_password(data['password'])

        if data.get('rol'):
            perfil.rol = data['rol']

        user.save()
        perfil.save()

        return JsonResponse({'ok':True})

    except Exception as e:
        return JsonResponse({'error':str(e)},status=500)


@login_required
@require_POST
def desactivar_usuario(request, user_id):
    try:
        user = get_object_or_404(User, id=user_id)

        # No permitir que se desactive a sí mismo
        if user == request.user:
            return JsonResponse({'error':'No podés desactivar tu propio usuario.'},status=400)

        user.is_active = not user.is_active
        user.save()

        estado ='activado' if user.is_active else 'desactivado'
        return JsonResponse({'ok': True, 'estado':estado, 'activo':user.is_active})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)