"""
Tests para la app 'cuentas'.
Cubre: login, logout, permisos de acceso y endpoints de la sesión.

Ejecutar con:
    python manage.py test cuentas
"""

from django.test import TestCase, Client, override_settings
from django.urls import reverse
from django.contrib.auth.models import User


_STORAGE_OVERRIDE = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# Desactivamos axes y el manifest de whitenoise durante los tests
@override_settings(AXES_ENABLED=False, STORAGES=_STORAGE_OVERRIDE)
class LoginViewTests(TestCase):
    """Pruebas del formulario de login."""

    def setUp(self):
        self.client = Client()

        # Usuario con acceso al panel (is_staff=True)
        self.staff_user = User.objects.create_user(
            username='admin@test.com',
            password='Password123!',
            is_staff=True,
            is_active=True,
        )
        # Usuario sin permisos de staff
        self.user_sin_permisos = User.objects.create_user(
            username='operador@test.com',
            password='Password123!',
            is_staff=False,
            is_active=True,
        )
        # Usuario desactivado
        self.user_inactivo = User.objects.create_user(
            username='inactivo@test.com',
            password='Password123!',
            is_staff=True,
            is_active=False,
        )

    # ── GET ──────────────────────────────────────────────────────────────────

    def test_get_muestra_formulario_de_login(self):
        """Un GET al login debe mostrar el formulario sin errores."""
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'login.html')

    def test_usuario_ya_autenticado_redirige_al_panel(self):
        """Si el usuario ya está logueado, el login lo redirige al panel."""
        self.client.force_login(self.staff_user)
        response = self.client.get(reverse('login'))
        self.assertRedirects(response, reverse('admin_panel'))

    # ── POST: casos exitosos ──────────────────────────────────────────────────

    def test_login_exitoso_redirige_al_panel(self):
        """Credenciales correctas de un usuario staff → redirige al panel."""
        response = self.client.post(reverse('login'), {
            'username': 'admin@test.com',
            'password': 'Password123!',
        })
        self.assertRedirects(response, reverse('admin_panel'))

    def test_login_exitoso_crea_sesion(self):
        """Después del login, el usuario debe estar autenticado."""
        self.client.post(reverse('login'), {
            'username': 'admin@test.com',
            'password': 'Password123!',
        })
        response = self.client.get(reverse('admin_panel'))
        self.assertEqual(response.status_code, 200)

    # ── POST: casos de error ──────────────────────────────────────────────────

    def test_login_credenciales_incorrectas(self):
        """Contraseña errónea → vuelve al formulario con mensaje de error."""
        response = self.client.post(reverse('login'), {
            'username': 'admin@test.com',
            'password': 'ContraseñaMal!',
        })
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'login.html')
        self.assertIn('error', response.context)

    def test_login_usuario_sin_permiso_staff(self):
        """Usuario válido pero sin is_staff → muestra error de permisos."""
        response = self.client.post(reverse('login'), {
            'username': 'operador@test.com',
            'password': 'Password123!',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('error', response.context)

    def test_login_usuario_inactivo(self):
        """Usuario desactivado → muestra error aunque la contraseña sea correcta."""
        response = self.client.post(reverse('login'), {
            'username': 'inactivo@test.com',
            'password': 'Password123!',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('error', response.context)

    # ── Logout ────────────────────────────────────────────────────────────────

    def test_logout_redirige_al_login(self):
        """El logout debe cerrar la sesión y redirigir al login."""
        self.client.force_login(self.staff_user)
        response = self.client.get(reverse('logout'))
        self.assertRedirects(response, reverse('login'))

    def test_logout_cierra_la_sesion(self):
        """Después del logout, el usuario no debe poder acceder al panel."""
        self.client.force_login(self.staff_user)
        self.client.get(reverse('logout'))
        response = self.client.get(reverse('admin_panel'))
        self.assertNotEqual(response.status_code, 200)


@override_settings(AXES_ENABLED=False, STORAGES=_STORAGE_OVERRIDE)
class AdminPanelTests(TestCase):
    """Pruebas del panel de administración."""

    def setUp(self):
        self.client = Client()
        self.staff_user = User.objects.create_user(
            username='admin@test.com',
            password='Password123!',
            is_staff=True,
            is_active=True,
        )

    def test_panel_requiere_autenticacion(self):
        """Sin login, el panel debe redirigir al login."""
        response = self.client.get(reverse('admin_panel'))
        self.assertRedirects(
            response,
            f"{reverse('login')}?next={reverse('admin_panel')}"
        )

    def test_panel_accesible_con_login(self):
        """Con login válido, el panel debe responder 200."""
        self.client.force_login(self.staff_user)
        response = self.client.get(reverse('admin_panel'))
        self.assertEqual(response.status_code, 200)

    def test_panel_pasa_rol_al_contexto(self):
        """El contexto del panel debe incluir el rol del usuario."""
        self.client.force_login(self.staff_user)
        response = self.client.get(reverse('admin_panel'))
        self.assertIn('rol', response.context)


@override_settings(AXES_ENABLED=False)
class UsuarioActualTests(TestCase):
    """Pruebas del endpoint /api/usuario-actual/."""

    def setUp(self):
        self.client = Client()
        self.staff_user = User.objects.create_user(
            username='admin@test.com',
            password='Password123!',
            first_name='Juan',
            last_name='Pérez',
            email='admin@test.com',
            is_staff=True,
        )

    def test_retorna_json_con_datos_del_usuario(self):
        """El endpoint debe devolver los datos del usuario autenticado."""
        self.client.force_login(self.staff_user)
        response = self.client.get(reverse('usuario_actual'))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['username'], 'admin@test.com')
        self.assertIn('nombre', data)
        self.assertIn('rol', data)

    def test_sin_autenticacion_redirige(self):
        """Sin login, el endpoint debe redirigir al login."""
        response = self.client.get(reverse('usuario_actual'))
        self.assertEqual(response.status_code, 302)

    def test_superusuario_tiene_rol_super_admin(self):
        """Un superusuario debe tener rol 'super_admin'."""
        superuser = User.objects.create_superuser(
            username='super@test.com',
            password='Password123!',
        )
        self.client.force_login(superuser)
        response = self.client.get(reverse('usuario_actual'))
        data = response.json()
        self.assertEqual(data['rol'], 'super_admin')
