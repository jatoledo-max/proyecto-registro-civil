from django.db import models
from django.contrib.auth.models import User

class PerfilEmpleado(models.Model):
    ROLES = [
        ('operador','Operador'),
        ('super_admin','Super Admin'),
    ]
    user=models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfil')
    rol=models.CharField(max_length=20, choices=ROLES, default='operador')
    fecha_alta=models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.get_full_name()} — {self.get_rol_display()}"

    class Meta:
        verbose_name = 'Perfil de empleado'
        verbose_name_plural = 'Perfiles de empleados'
