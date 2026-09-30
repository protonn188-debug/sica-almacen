/* ======================================================================
   LA NUBE Y EL INICIO DE SESIÓN

   Este archivo hace tres cosas y nada más:
     1. el inicio de sesión (Supabase Auth)
     2. saber qué rol tiene el que entró: administrador o apoyo
     3. guardar y traer los datos de Supabase

   El sistema (js/sica.js) no sabe nada de Supabase: le pide los datos a
   NUBE.db con las mismas dos órdenes de siempre — dame este documento,
   guarda este documento. Así, si algún día cambias de proveedor de nube,
   se cambia este archivo y el sistema ni se entera.

   IMPORTANTE — SIN INTERNET: todo se guarda primero en el equipo y
   después se sube. Si en la obra se cae la señal, se sigue trabajando
   igual; cuando vuelve, se sincroniza solo.
   ====================================================================== */
(function(){
"use strict";

const C = window.CONFIG || {};
const HAY_NUBE = !!(C.SUPABASE_URL && C.SUPABASE_ANON);

let sb = null;                 /* el cliente de Supabase */
const NUBE = window.NUBE = {
  hayNube: HAY_NUBE,
  sesion: null,                /* {id, correo, nombre, rol} */
  db: null,
  listo: false
};

/* ---------------------------------------------------------------- arranque */
NUBE.iniciar = async function(){
  if(!HAY_NUBE){ NUBE.listo=true; return null; }
  /* Si no cargó la librería (señal caída en la obra, o el celular sin datos)
     no se puede entrar a la nube, pero el sistema NO debe dejar a nadie
     afuera: se trabaja con lo último guardado en el equipo y se sincroniza
     cuando vuelva el internet. */
  if(!window.supabase || !window.supabase.createClient){
    NUBE.sinLibreria = true; NUBE.listo = true; return null;
  }
  sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON, {
    auth:{ persistSession:true, autoRefreshToken:true, storage:window.localStorage }
  });
  NUBE.db = armarDB();
  try{
    const {data} = await sb.auth.getSession();
    if(data && data.session) await cargarPerfil(data.session.user);
  }catch(e){ /* sin internet: se entra con lo que haya guardado */ }
  NUBE.listo=true;
  return NUBE.sesion;
};

/* Trae el nombre y el rol de la tabla perfiles. Si no hay internet,
   usa el último rol conocido, guardado en el equipo. */
async function cargarPerfil(user){
  const guardado = leerPerfilLocal(user.id);
  NUBE.sesion = { id:user.id, correo:user.email,
                  nombre: guardado?guardado.nombre:(user.email||"").split("@")[0],
                  rol: guardado?guardado.rol:"apoyo" };
  try{
    const {data,error} = await sb.from("perfiles").select("nombre,rol").eq("id",user.id).single();
    if(!error && data){
      NUBE.sesion.nombre = data.nombre || NUBE.sesion.nombre;
      NUBE.sesion.rol    = data.rol==="admin" ? "admin" : "apoyo";
      guardarPerfilLocal(user.id, NUBE.sesion);
    }
  }catch(e){ /* offline: se queda con el guardado */ }
  return NUBE.sesion;
}
const LSP = "SICA_PERFIL_", LSU = "SICA_ULTIMO_PERFIL";
function guardarPerfilLocal(id,s){
  try{
    const d={nombre:s.nombre, rol:s.rol};
    localStorage.setItem(LSP+id, JSON.stringify(d));
    localStorage.setItem(LSU, JSON.stringify(Object.assign({id:id, correo:s.correo}, d)));
  }catch(e){}
}
function leerPerfilLocal(id){ try{ return JSON.parse(localStorage.getItem(LSP+id)||"null"); }catch(e){ return null; } }
function ultimoPerfil(){ try{ return JSON.parse(localStorage.getItem(LSU)||"null"); }catch(e){ return null; } }
NUBE.ultimoPerfil = ultimoPerfil;

/* ---------------------------------------------------------------- entrar y salir */
NUBE.entrar = async function(correo,clave){
  if(!HAY_NUBE) return {ok:false, msg:"Todavía no has configurado la nube en js/config.js."};
  try{
    const {data,error} = await sb.auth.signInWithPassword({email:String(correo).trim(), password:clave});
    if(error){
      const m = /Invalid login/i.test(error.message) ? "Correo o contraseña incorrectos."
              : /Email not confirmed/i.test(error.message) ? "Ese usuario todavía no está confirmado en Supabase."
              : ("No se pudo entrar: "+error.message);
      return {ok:false, msg:m};
    }
    await cargarPerfil(data.user);
    return {ok:true, sesion:NUBE.sesion};
  }catch(e){
    return {ok:false, msg:"No hay internet o no se pudo llegar a la nube. Revisa la señal."};
  }
};
NUBE.salir = async function(){
  try{ if(sb) await sb.auth.signOut(); }catch(e){}
  NUBE.sesion=null;
};

/* ---------------------------------------------------------------- los datos
   Dos tablas y nada más:
     almacen(clave, datos, ts)   → catálogo, personal, listas, ajustes…
     dias(fecha, datos, ts)      → un renglón por día de trabajo
   El sistema pide "almacen/catalogo" o "dia/2026-09-28" y acá se traduce. */
function armarDB(){
  const parte = ruta => { const i=String(ruta).indexOf("/"); return [ruta.slice(0,i), ruta.slice(i+1)]; };

  function doc(ruta){
    const [tabla,clave]=parte(ruta);
    const esDia = tabla==="dia";
    return {
      async get(){
        const q = esDia ? sb.from("dias").select("datos").eq("fecha",clave).maybeSingle()
                        : sb.from("almacen").select("datos").eq("clave",clave).maybeSingle();
        const {data,error} = await q;
        if(error) throw error;
        return { exists: !!(data && data.datos), data: ()=> (data?data.datos:null) };
      },
      async set(obj){
        const fila = esDia ? {fecha:clave, datos:obj, ts:nnTs(obj), por:(NUBE.sesion||{}).id||null}
                           : {clave:clave,  datos:obj, ts:nnTs(obj), por:(NUBE.sesion||{}).id||null};
        const {error} = esDia ? await sb.from("dias").upsert(fila,{onConflict:"fecha"})
                              : await sb.from("almacen").upsert(fila,{onConflict:"clave"});
        if(error) throw error;
      }
    };
  }
  function collection(nombre){
    let lim=240;
    const api={
      orderBy(){ return api; },
      limit(n){ lim=n; return api; },
      async get(){
        const {data,error} = await sb.from("dias").select("datos").order("fecha",{ascending:false}).limit(lim);
        if(error) throw error;
        return { docs:(data||[]).map(r=>({ data:()=>r.datos })) };
      }
    };
    return api;
  }
  return {doc, collection};
}
const nnTs = o => (o && typeof o._ts==="number") ? o._ts : Date.now();

/* ---------------------------------------------------------------- descargar archivos */
NUBE.descargar = function(nombre, contenido, tipo){
  try{
    const b = new Blob([contenido], {type: tipo || "text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    return true;
  }catch(e){ return false; }
};

/* ---------------------------------------------------------------- la pantalla de entrada */
NUBE.pintarEntrada = function(){
  const v = document.getElementById("entrada");
  if(!v) return;
  document.getElementById("en-obra").textContent   = C.OBRA || "";
  document.getElementById("en-empresa").textContent= C.EMPRESA || "";
  const aviso = document.getElementById("en-aviso");
  if(NUBE.sinLibreria){
    aviso.hidden=false;
    aviso.innerHTML = "<b>No hay internet</b>No se pudo conectar con la nube, así que no se puede verificar " +
      "tu contraseña. Puedes entrar con lo último que quedó guardado en este equipo y seguir trabajando: " +
      "lo que cargues se sube solo cuando vuelva la señal.";
    document.getElementById("en-form").hidden=true;
    const s=document.getElementById("en-solo"); s.hidden=false;
    s.querySelector("button").textContent="Trabajar sin internet";
    const u=ultimoPerfil();
    if(u) NUBE.sesion={id:u.id, correo:u.correo||"", nombre:u.nombre, rol:u.rol, offline:true};
  }
  else if(!HAY_NUBE){
    aviso.hidden=false;
    aviso.innerHTML = "<b>Todavía sin nube</b>Este equipo está trabajando solo, sin inicio de sesión y sin compartir " +
      "con nadie. Para conectarlo, pega la dirección y la llave de Supabase en <code>js/config.js</code>. " +
      "Mientras tanto puedes usar el sistema normal para probar.";
    document.getElementById("en-form").hidden=true;
    document.getElementById("en-solo").hidden=false;
  }
  v.hidden=false;
  document.body.classList.add("entrando");
};
NUBE.cerrarEntrada = function(){
  const v=document.getElementById("entrada"); if(v) v.hidden=true;
  document.body.classList.remove("entrando");
};

})();
