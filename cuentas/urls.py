from django.urls import path
from .views import defuncion, identificacion, inicio, login_view, admin_panel, logout_view, matrimonio, nacimiento, sedes, tramite_detalle, usuario_actual, chatbot_view
from tramites_app.views import lista_tramites

urlpatterns = [
    path('login/',           login_view,      name='login'),
    path('admin-panel/',     admin_panel,     name='admin_panel'),
    path('logout/',          logout_view,     name='logout'),
    path('',                 inicio,          name='inicio'),
    path('api/usuario-actual/', usuario_actual, name='usuario_actual'),
    path('identificacion/', identificacion,  name='identificacion'),
    path('tramites/',        lista_tramites,  name='tramites'),
    path('tramites/<str:slug>/', tramite_detalle, name='tramite_detalle'),
    path('sedes/',           sedes,           name='sedes'),
    path('nacimiento/',      nacimiento,      name='nacimiento'),
    path('matrimonio/',      matrimonio,      name='matrimonio'),
    path('defuncion/',       defuncion,       name='defuncion'),
    path('api/chatbot/',     chatbot_view,    name='chatbot'),
]