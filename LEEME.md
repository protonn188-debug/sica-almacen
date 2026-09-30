# SICA · Almacén de obra — cómo ponerlo en Internet

**JVC Consultores y Ejecutores E.I.R.L. · Obra Tránsito peatonal — C.P. San Francisco**

Esta guía está escrita para seguirla de corrido, sin saber programar. Son
**8 pasos** y toma alrededor de una hora la primera vez. Después, publicar
un cambio toma menos de un minuto.

Al terminar vas a tener:

- El sistema en Internet, con una dirección que puedes abrir desde cualquier
  computadora o celular.
- Dos usuarios con contraseña: **tú (administrador)** y **el apoyo de almacén**.
- Los datos compartidos: si el apoyo carga una guía en su celular, tú la ves
  al instante en tu Mac.
- Todo gratis, sin tarjeta de crédito.

---

## Antes de empezar: qué se instala y qué no

| | |
|---|---|
| **Se instala en la Mac** | Solo **Visual Studio Code**. Nada más. |
| **Ya viene en la Mac** | Git (la primera vez te pide un permiso, le das aceptar). |
| **No hace falta** | Node, npm, servidores, Docker, terminal, Homebrew. Nada de eso. |
| **Cuentas a crear** | **GitHub** (guarda el código y lo publica) y **Supabase** (guarda los datos y las contraseñas). Las dos gratis. |

**¿Por qué dos servicios?** GitHub publica páginas pero no guarda datos ni
maneja contraseñas. Supabase guarda los datos y maneja el inicio de sesión
pero no publica páginas. Juntos, y gratis, hacen todo.

---

## Cómo están ordenadas las carpetas

```
sica-almacen/
│
├── index.html            La página. La estructura y la pantalla de entrada.
│
├── css/
│   └── sica.css          Todos los colores, tamaños y formas.
│
├── js/
│   ├── config.js         ← EL ÚNICO ARCHIVO QUE TÚ EDITAS
│   ├── nube.js           El inicio de sesión y el guardado en Supabase.
│   └── sica.js           El sistema completo: guías, kardex, conteo, PDF.
│
├── sql/
│   └── 01-estructura.sql Se pega una vez en Supabase. Crea las tablas
│                         y las reglas de quién puede tocar qué.
│
├── manifest.json         Para poder instalarlo en el celular como una app.
├── icono-180.png         El ícono que sale en la pantalla del celular.
├── icono-512.png
├── .gitignore            Le dice a GitHub qué NO subir (basura de la Mac).
├── .nojekyll             Le dice a GitHub que publique los archivos tal cual.
└── LEEME.md              Esta guía.
```

**La regla de oro:** el único archivo que tienes que tocar es
`js/config.js`. Todo lo demás se queda como está.

---

## Paso 1 · Instalar VS Code

1. Entra a **https://code.visualstudio.com** y dale al botón azul de descarga.
   Va a decir *Mac (Universal)* o *Apple Silicon* — cualquiera de los dos sirve
   para tu M4.
2. Se baja un archivo `.zip`. Ábrelo con doble clic: aparece
   **Visual Studio Code**.
3. **Arrástralo a la carpeta Aplicaciones.** Esto es importante: si lo abres
   desde Descargas, después da problemas.
4. Ábrelo. La primera vez la Mac pregunta si estás seguro: **Abrir**.

> Cuando pregunte si quieres el idioma en español, dile que sí. Esta guía usa
> los nombres en español; entre paréntesis pongo el inglés por si te queda en
> inglés.

---

## Paso 2 · Abrir el proyecto

1. Descomprime la carpeta `sica-almacen` que te mandé y déjala donde la vas a
   encontrar — por ejemplo en **Documentos**.
2. En VS Code: **Archivo → Abrir carpeta…** (*File → Open Folder…*),
   busca `sica-almacen` y dale **Abrir**.
3. Si pregunta *¿Confías en los autores de esta carpeta?*, dile **Sí, confío**.
4. A la izquierda vas a ver el árbol de carpetas tal como está arriba.

Ya está. No hay nada que compilar ni que instalar.

---

## Paso 3 · Crear el proyecto en Supabase

Acá van a vivir los datos y los usuarios.

1. Entra a **https://supabase.com** → **Start your project** → entra con tu
   cuenta de GitHub o con tu correo.
2. **New project**. Llénalo así:
   - **Name:** `sica-san-francisco`
   - **Database Password:** dale a *Generate a password* y **guárdala en un
     lugar seguro**. No la vas a usar a diario, pero si la pierdes no se
     recupera.
   - **Region:** elige **South America (São Paulo)** — es la más cerca de
     Iquitos, así el sistema responde más rápido.
   - **Plan:** Free.
3. Dale a **Create new project** y espera. Tarda como dos minutos.

---

## Paso 4 · Crear las tablas

1. En Supabase, menú de la izquierda: **SQL Editor** → **New query**.
2. En VS Code abre `sql/01-estructura.sql`, selecciona **todo** el contenido
   (`Cmd + A`), cópialo (`Cmd + C`).
3. Pégalo en Supabase (`Cmd + V`) y dale al botón verde **Run**.
4. Abajo tiene que decir **Success. No rows returned**. Eso está bien: no
   devolvió filas porque lo que hizo fue crear las tablas.

> Si más adelante cambias algo del SQL, lo puedes volver a correr entero: está
> escrito para repetirse sin romper nada.

---

## Paso 5 · Conectar el sistema con Supabase

1. En Supabase: **Settings** (el engranaje, abajo a la izquierda) → **API**.
2. Vas a ver dos cosas que necesitas:
   - **Project URL** — algo como `https://abcdefghijk.supabase.co`
   - **anon public** (dentro de *Project API keys*) — una cadena larguísima que
     empieza con `eyJ...`
3. En VS Code abre `js/config.js` y pega cada una entre las comillas:

```js
  SUPABASE_URL:  "https://abcdefghijk.supabase.co",
  SUPABASE_ANON: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
```

4. Guarda con `Cmd + S`.

> **¿Esa llave es secreta?** No. La `anon public` está hecha para ir a la vista
> en la página; hasta el nombre lo dice. Lo que protege tus datos son las
> reglas que creaste en el paso 4, no esconder la llave. La que **sí** es
> secreta es la `service_role` — esa no la toques ni la copies a ningún lado.

---

## Paso 6 · Crear los dos usuarios

1. En Supabase: **Authentication** → **Users** → **Add user** →
   **Create new user**.
2. Crea el tuyo:
   - **Email:** tu correo
   - **Password:** la que quieras (mínimo 6 caracteres)
   - **Marca la casilla “Auto Confirm User”** ← importante, si no, no vas a
     poder entrar.
3. Repite para el apoyo de almacén, con su correo y su contraseña.
4. Ahora hay que decir cuál de los dos eres tú. Ve a **SQL Editor** →
   **New query**, pega esto cambiando el correo por el tuyo, y dale **Run**:

```sql
update public.perfiles
set rol = 'admin', nombre = 'Jacko Pinedo'
where id = (select id from auth.users where email = 'TU-CORREO-AQUI');
```

5. De paso, ponle nombre al apoyo:

```sql
update public.perfiles
set nombre = 'Luis Apoyo'
where id = (select id from auth.users where email = 'CORREO-DEL-APOYO');
```

6. Para comprobar que quedó bien, corre esto:

```sql
select p.nombre, p.rol, u.email
from public.perfiles p join auth.users u on u.id = p.id;
```

Tiene que salir uno con `admin` y otro con `apoyo`.

> **Todo usuario nuevo nace como apoyo.** Es a propósito: si mañana entra
> alguien más, no va a poder tocar nada delicado hasta que tú lo asciendas
> a mano con el comando de arriba.

---

## Paso 7 · Publicarlo en Internet

1. En VS Code, ícono de **Control de código fuente** en la barra de la
   izquierda (*Source Control*, el de las ramitas). Te va a decir que la
   carpeta no es un repositorio.
2. Dale a **Publicar en GitHub** (*Publish to GitHub*).
3. Te pide iniciar sesión en GitHub: se abre el navegador, entras o creas la
   cuenta gratis, y le das permiso a VS Code.
4. Te pregunta el nombre y si **público o privado**. Elige:
   - **Público** — es lo que recomiendo, y es la única forma de que GitHub
     Pages sea gratis. Lo que queda a la vista es el código, el nombre de la
     obra y el RUC — que de todos modos salen impresos en cada guía. Los
     **datos del almacén no están acá**: están en Supabase, bajo contraseña.
   - Si aun así lo quieres privado, salta al final, sección *Si lo quieres
     privado*.
5. Espera a que suba (abajo sale una rueda girando).
6. Ve a **https://github.com**, entra a tu repositorio, y arriba:
   **Settings** → en el menú de la izquierda, **Pages**.
7. En *Source* elige **Deploy from a branch**; en *Branch* elige **main** y
   carpeta **/ (root)**. Dale **Save**.
8. Espera dos o tres minutos y recarga esa página: arriba te va a aparecer
   la dirección, algo como:

```
https://tu-usuario.github.io/sica-almacen/
```

**Esa es la dirección de tu sistema.** Guárdala.

---

## Paso 8 · Probar que todo quedó bien

Abre la dirección en el navegador. Tiene que pasar esto, en este orden:

1. Sale la **pantalla de entrada** azul con el nombre de la obra.
2. Entras con tu correo y contraseña → arriba a la derecha dice tu nombre y
   **ADMINISTRADOR**, y en el menú están las 18 pantallas.
3. Abajo del título dice **Versión 24 · 27/09/2026 · web**.
4. En el recuadro de abajo a la izquierda dice **Nube al día**.
5. Carga una guía de prueba y dale a **Salir**.
6. Vuelve a entrar **con el usuario del apoyo**: tiene que ver **solo**
   Cargar guía, Stock y Kardex — y la guía que cargaste tú tiene que estar ahí.
   Eso te prueba las dos cosas de una vez: que los roles funcionan y que los
   datos se comparten.

### Ponerlo en el celular

Abre la misma dirección en el celular:

- **iPhone (Safari):** botón de compartir → **Añadir a pantalla de inicio**.
- **Android (Chrome):** menú de los tres puntos → **Instalar aplicación**.

Queda con su ícono, abre a pantalla completa y se ve como una app.

---

## Cómo hacer un cambio de aquí en adelante

Esto es lo que vas a repetir cada vez:

1. Editas el archivo en VS Code y guardas con `Cmd + S`.
2. Ícono de **Control de código fuente** (el de las ramitas).
3. Escribes arriba, en el cuadro, qué cambiaste. Por ejemplo:
   `se agregó el almacén del 3er piso`.
4. Le das a **Confirmar** (*Commit*) y después a **Sincronizar cambios**
   (*Sync Changes*).
5. Un minuto después la dirección de Internet ya tiene el cambio.

Si en el sistema no ves el cambio, dale al botón **traer la última** que está
debajo del título: eso obliga al navegador a bajar la versión nueva.

---

## Lo que tienes que saber, dicho de frente

**Sin internet sigue funcionando.** Todo se guarda primero en el equipo y se
sube después. Si en la obra se cae la señal, sigues cargando guías; cuando
vuelve, se sincroniza solo. Si la señal está caída cuando abres el sistema, te
sale un botón **Trabajar sin internet** que te deja entrar con lo último
guardado en ese equipo.

**El bloqueo del apoyo es fuerte en el sistema y grueso en la base de datos.**
En pantalla, el apoyo no puede ni ver las pantallas prohibidas. En Supabase, las
reglas le permiten escribir solo el catálogo, las listas y los días de la última
semana — no puede volver atrás a cambiar un mes ya cerrado ni tocar el personal.
Pero dentro de esos días puede escribir cualquier cosa, no solo entradas.
Para un compañero de obra sobra; te lo digo para que sepas exactamente qué
tienes.

**Haz respaldos.** En el sistema, **Ajustes → Descargar respaldo** te baja un
archivo con todo. Hazlo el último día de cada mes y guárdalo. Es tu red por si
alguien borra algo por error.

**El plan gratis de Supabase** alcanza de sobra para esta obra. Lo único que
pide: si nadie entra al sistema durante **una semana entera**, el proyecto se
pausa solo y lo tienes que despausar desde el panel (un botón). Como vas a
entrar a diario, no te va a pasar.

---

## Si algo sale mal

| Qué ves | Qué pasó | Qué hacer |
|---|---|---|
| «Correo o contraseña incorrectos» | El usuario no existe o la clave está mal | Supabase → Authentication → Users. Con los tres puntitos puedes cambiar la contraseña. |
| «Ese usuario todavía no está confirmado» | Se te olvidó marcar *Auto Confirm User* | Bórralo y vuelve a crearlo con la casilla marcada. |
| Entra pero dice APOYO y eres tú | Falta el comando del paso 6.4 | Córrelo en el SQL Editor. |
| Dice «Sin nube · datos locales» | No hay internet, o la URL/llave están mal | Revisa `js/config.js`. Si está bien, es la señal. |
| La página sale en blanco | El navegador tiene guardada una versión a medias | Dale a **traer la última**, o `Cmd + Shift + R`. |
| Algo no responde | — | Dale a **revisar el sistema**, botón **Copiar**, y me lo pegas en el chat. Ahí sale el error exacto. |

---

## Si lo quieres privado

GitHub Pages solo es gratis en repositorios públicos. Si prefieres que el
código no se vea, usa **Cloudflare Pages**, que sí publica repositorios
privados gratis:

1. En el paso 7.4 elige **Privado**.
2. Entra a **https://pages.cloudflare.com**, crea la cuenta gratis y dale a
   **Create a project → Connect to Git**.
3. Conecta tu GitHub, elige el repositorio y dale a **Save and Deploy**.
   No llenes nada de *build*: el proyecto no necesita compilarse.
4. Te da una dirección `.pages.dev` que funciona igual.

---

## Qué NO hagas nunca

- **No borres ni edites `js/sica.js`, `js/nube.js` ni `css/sica.css`** a mano.
  Si necesitas un cambio, me lo pides y te mando el archivo.
- **No copies la llave `service_role`** de Supabase a ningún archivo. Esa sí
  es secreta y abre todo sin preguntar.
- **No borres las reglas de seguridad** de Supabase (*Authentication →
  Policies*). Son las que impiden que el apoyo toque lo que no debe.
