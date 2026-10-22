# Superadministración

Módulo separado en `/superadmin` (sin enlace público; los superadmins lo ven en *Mi cuenta → Plataforma*). La interfaz solo decide qué mostrar:
**toda operación valida en la base** (`private.is_platform_admin()` dentro de cada `public.admin_*`), así que saltear la interfaz no da acceso.

## Rol de plataforma
- Tabla `private.platform_admins`: separada de `tenant_members`, sin grants ni políticas para clientes. **Nadie se autoasigna el rol** y `user_metadata` (editable por la persona) nunca se lee.
- Un superadmin no puede moderar un comercio que administra.
- Sin credenciales privilegiadas en el navegador: se usa la sesión del usuario y la clave publicable.

### Alta inicial (manual, restringida)
Solo con acceso directo a la base (SQL editor del proyecto, con la cuenta dueña del proyecto de Supabase). La persona primero crea su cuenta normal en la app.
```sql
insert into private.platform_admins (user_id)
select id from auth.users where email = '<correo-del-superadmin>';
-- Baja:  delete from private.platform_admins where user_id = (select id from auth.users where email = '<correo>');
```
Recomendación: dos superadmins como máximo al inicio, con verificación en dos pasos en la cuenta de Supabase del proyecto.

## Qué puede hacer
| Acción | Función | Notas |
|---|---|---|
| Bandeja y búsqueda | `admin_moderation_queue` | por estado y nombre; lo pendiente, más antiguo primero |
| Ficha completa | `admin_tenant_detail` | perfil, ubicación (con enlace al mapa), faltantes, suscripción, historial |
| Aprobar / rechazar / pedir correcciones | `admin_review_tenant` | motivo obligatorio salvo al aprobar; lo ve el dueño |
| Suspender / reactivar | `admin_set_suspension` | motivo obligatorio al suspender; oculta carta y explorador; **no cancela reservas existentes** |
| Suscripción manual | `admin_set_subscription` | extender prueba, activar período pago, marcar en mora, cancelar; motivo obligatorio |
| Destacados | `admin_set_featured` / `admin_clear_featured` | ventana de hasta 90 días; sin precio ni cobro |

Todo deja registro en `private.admin_audit_log` (quién, cuándo, acción, motivo y estado anterior/posterior) y se ve en el historial de la ficha.

## Políticas
- **Cambios posteriores** (nombre, dirección o mover el pin >200 m) de un comercio aprobado lo devuelven a revisión: sale del explorador, **la carta y las reservas existentes siguen**.
- **Cobro:** hoy no hay integración con Mercado Pago; la activación es manual. El comercio **no puede** editar su estado de pago ni extender su prueba (sin grants sobre `tenant_subscriptions`). Los estados `past_due` y `canceled` ya existen para un proveedor futuro. Volver de una pantalla de pago **nunca** confirma un pago: solo el panel (o, a futuro, un webhook verificado) cambia el estado.
- **Destacados:** apagado por defecto. Aparecen en un bloque aparte (primera página, orden Relevancia o Nombre; nunca en «Más cercanos»), con la etiqueta «Destacado», y **respetan todos los filtros y la visibilidad** (un destacado suspendido, sin aprobar o con la prueba vencida no aparece).

## Consola completa (secciones)
Navegación fija en `/superadmin`: **Bandeja** (moderación), **Resumen** (cifras reales de la base), **Comercios** (búsqueda, *crear restaurante*), **Suscripciones** (por estado y pruebas por vencer), **Usuarios**, **Administradores** (alta por email de una cuenta ya registrada y confirmada, baja; nadie se quita a sí mismo y siempre queda uno), **Auditoría** (filtro por acción) y **Sistema** (estado de avisos y pagos, últimos eventos con el email enmascarado, y el ajuste «carta con acceso vencido»). Cierre de sesión en la cabecera.

| Acción | Función | Notas |
|---|---|---|
| Crear restaurante | `admin_create_tenant` | para un dueño con cuenta confirmada, o para el propio superadmin; queda sin publicar y en borrador |
| Pausar / reactivar | `admin_set_suspension` | oculta carta y explorador; no borra nada |
| Promoción | `admin_set_promotion` / `admin_clear_promotion` | una por comercio, hasta 90 días; se ve en la carta pública y en las tarjetas del explorador solo mientras está vigente y el comercio es visible; el explorador tiene el filtro «Con promoción» (`promo=1`) |
| Eliminar | `admin_delete_tenant` | **definitivo**: borra carta, reservas, horarios, membresías y favoritos; exige escribir el slug exacto y un motivo; queda en auditoría con nombre y slug. Las imágenes del Storage no se borran |
| Administradores | `admin_add_admin` / `admin_remove_admin` | auditado |
| Ajuste | `admin_set_platform_setting` | solo `public_menu_when_access_lapsed` |

Pruebas: pgTAP `250_superadmin_consola.sql` y E2E live (`superadmin.spec.ts`).
