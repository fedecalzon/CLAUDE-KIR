# Instalar PIE 2.3.0

## A. Si ya tenés instalada la beta (beta.2 a beta.5)
1. Abrí la app en el celular **con señal** y esperá que arriba diga **«Al día»** (que no quede nada sin enviar).
2. En la planilla **PIE - CORE › Extensiones › Apps Script**, reemplazá el contenido completo de estos tres archivos por los de la carpeta `1 - Apps Script`:
   - **Code.gs**
   - **Beta.gs** (esta vez también cambia)
   - **Index.html**
   `appsscript.json` sigue igual. No agregues otro archivo con funciones repetidas. Guardá.
3. **Implementar › Administrar implementaciones › ✏️ › Versión: Nueva versión › Implementar**. El enlace `/exec` sigue siendo el mismo.
4. **Equipos de medición:** en la hoja **EQUIPOS DE MEDICIÓN** completá la columna **CALIBRACIÓN VENCE** de cada equipo (dd/mm/aaaa). Si la hoja no existe, creala con **PIE › Crear hoja de equipos de medición**. Sin esa fecha no se puede liberar una etapa que usó un equipo con N° de serie. Si recalibrás un equipo, podés agregar otra fila con la misma serie: vale el vencimiento más lejano.
5. Las láminas `.webp` y `planos.json` **no cambiaron**: no hace falta volver a subirlas.
6. En el iPhone, abrí la app desde el ícono **con señal**. Si aparece **«Hay una versión nueva de la app»**, tocá **Recargar**. Después **Ajustes › Enviar y actualizar ahora**.

## B. Instalación desde cero
1. Subí `PIE - CORE.xlsx` a Drive y guardalo como **Hoja de cálculo de Google**.
2. **Extensiones › Apps Script**:
   - Pegá `Code.gs` y `Beta.gs` (**＋ › Secuencia de comandos**, nombre `Beta`).
   - Pegá `Index.html` (**＋ › HTML**, nombre `Index`).
   - Pegá `appsscript.json` (**Configuración del proyecto › Mostrar el archivo de manifiesto**).
   - Guardá.
3. Elegí la función **autorizar** y tocá **▶ Ejecutar**: aceptá los permisos (planillas, Drive y menús). Recargá la planilla y aparece el menú **PIE**.
4. Desde el menú **PIE**:
   - **Configurar clave de acceso**.
   - **Vincular FOD 02**.
   - **Vincular FOG 01**.
   - **Crear hoja de equipos de medición**, y completá los vencimientos.
5. **PIE › Planos: abrir carpeta y verificar**. En la carpeta que se abre, subí las **7 láminas `.webp`** y **`planos.json`** (carpeta `2 - Planos` del zip). Volvé a abrir ese menú: todas tienen que figurar con ✔.
6. **Implementar › Nueva implementación › Aplicación web**:
   - Ejecutar como: **Yo**.
   - Acceso: **Cualquier persona**.
   - Copiá el enlace que termina en `/exec`.
7. En el iPhone, abrí ese enlace en Safari y tocá **Compartir › Agregar a inicio**. Abrí la app desde el ícono, cargá la clave en **Ajustes** y tocá **Enviar y actualizar ahora**. En un registro con plano, tocá **Bajar las que faltan** para tener las láminas sin señal.

## Sin señal
- Con la app abierta desde el enlace `/exec` podés seguir cargando aunque se corte la señal: todo queda en el celular y se envía solo al volver.
- Lo que el enlace de Google no permite es **abrir** la app desde cero sin señal. Para eso hace falta publicar la carpeta `pwa` en un sitio propio (opcional).

## Volver atrás
En Apps Script, **Implementar › Administrar implementaciones** permite volver a la versión anterior. No borres el almacenamiento del celular mientras haya cambios sin enviar.
