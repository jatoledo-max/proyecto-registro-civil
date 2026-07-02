"""
Helpers de correo electrónico para la app 'turnos'.

En desarrollo los correos se imprimen en la consola (EMAIL_BACKEND=console).
En producción se envían via SMTP configurado en settings.py / .env.
"""

from django.core.mail import send_mail
from django.conf import settings


def enviar_cancelacion_turno(turno):
    """Notifica al ciudadano que su turno fue cancelado."""
    asunto = f'Turno {turno.numero_turno} cancelado – Registro Civil'
    mensaje = (
        f'Estimado/a {turno.nombre},\n\n'
        f'Le informamos que su turno ha sido cancelado:\n\n'
        f'  Número de turno : {turno.numero_turno}\n'
        f'  Trámite         : {turno.get_tramite_display()}\n'
        f'  Fecha           : {turno.fecha.strftime("%d/%m/%Y")}\n'
        f'  Hora            : {turno.hora.strftime("%H:%M")}\n\n'
        f'Si lo desea puede solicitar un nuevo turno ingresando al portal.\n\n'
        f'Registro Civil – Provincia de Santiago del Estero\n'
        f'Este correo es automático, por favor no responda.'
    )
    send_mail(
        subject=asunto,
        message=mensaje,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[turno.email],
        fail_silently=True,   # No queremos que un error de correo rompa la vista
    )


def enviar_reprogramacion_turno(turno, fecha_anterior, hora_anterior):
    """Notifica al ciudadano que su turno fue reprogramado."""
    asunto = f'Turno {turno.numero_turno} reprogramado – Registro Civil'
    mensaje = (
        f'Estimado/a {turno.nombre},\n\n'
        f'Su turno ha sido reprogramado por el personal del Registro Civil:\n\n'
        f'  Número de turno : {turno.numero_turno}\n'
        f'  Trámite         : {turno.get_tramite_display()}\n\n'
        f'  Fecha anterior  : {fecha_anterior.strftime("%d/%m/%Y")} '
        f'a las {hora_anterior.strftime("%H:%M")}\n'
        f'  Nueva fecha     : {turno.fecha.strftime("%d/%m/%Y")} '
        f'a las {turno.hora.strftime("%H:%M")}\n\n'
        f'Por favor presentese en el horario indicado.\n\n'
        f'Registro Civil – Provincia de Santiago del Estero\n'
        f'Este correo es automático, por favor no responda.'
    )
    send_mail(
        subject=asunto,
        message=mensaje,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[turno.email],
        fail_silently=True,
    )
