"use strict";
/* ======================================================================
   SICA — Kardex de Almacén de Obra
   JVC Consultores y Ejecutores E.I.R.L. · Obra C.P. San Francisco
   Estructura: CATÁLOGO → ENTRADAS / SALIDAS → STOCK → KARDEX → CONTROL DIARIO
   Guarda en el dispositivo y, si hay nube, sincroniza.
   ====================================================================== */

/* ---------- utilidades ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const esc = v => String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = p => (p||"x")+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const hoy = ()=> new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const ahora = ()=> new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(11,16);
const nn = v => { const n=parseFloat(String(v==null?"":v).replace(",",".")); return isFinite(n)?n:0; };
const q2 = n => Math.round(nn(n)*100)/100;
const fmt = n => { const v=q2(n); return Number.isInteger(v)?String(v):v.toFixed(2); };
const fFecha = f => { if(!f) return "—"; const p=String(f).split("-"); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:f; };
const dias = (a,b)=> Math.round((new Date(b+"T00:00")-new Date(a+"T00:00"))/864e5);
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","setiembre","octubre","noviembre","diciembre"];
const DSEM  = ["D","L","M","M","J","V","S"];
const mesDe = f => String(f||"").slice(0,7);
const nomMes = ym => { const [a,m]=String(ym).split("-"); return (MESES[nn(m)-1]||"")+" "+a; };
const soles = n => "S/ "+q2(n).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2});

const CARGOS = ["Residente de obra","Maestro de obra","Capataz","Almacenero","Operario","Oficial","Peón","Operador de maquinaria","Chofer","Prevencionista","Administrativo"];
const AUTORIZA_CARGOS = ["Residente de obra","Maestro de obra","Capataz","Administrativo"];
const UNIDADES = ["und","bls","kg","m","m2","m3","gal","lt","p2","p3","par","caja","rll","pqt","mll","juego","plancha","varilla","balde","cil","sob"];

/* familias de material, tomadas de la estructura del kardex de obra */
const CLASIF = [
  "MATERIAL DE CONSTRUCCION","AGREGADO","MADERA","MATERIAL PVC - SANITARIO","MATERIAL ELECTRICO",
  "PINTURA","ADITIVO","HERRAMIENTA MANUAL","EQUIPO A COMBUSTIBLE","EQUIPO ELECTRICO",
  "EQUIPO TOPOGRAFICO","EPP","SEGURIDAD Y SEÑALIZACION","COMBUSTIBLE Y LUBRICANTE","REPUESTO",
  "UTILES DE OFICINA","PRODUCTOS DE LIMPIEZA","TOPICO - ENFERMERIA","SUMINISTROS"
];
/* las familias cuyos ítems se prestan y tienen que volver */
const CLASIF_RETORNA = ["HERRAMIENTA MANUAL","EQUIPO A COMBUSTIBLE","EQUIPO ELECTRICO","EQUIPO TOPOGRAFICO"];

/* motivos: la columna que explica por qué se movió el stock */
const MOT_E = [
  {v:"INGRESO",    t:"INGRESO — compra que llega a la obra",              ay:"Llegó material comprado, con guía o factura."},
  {v:"DEVOLUCION", t:"DEVOLUCIÓN — vuelve lo que se prestó",              ay:"Regresa una herramienta o equipo que salió prestado."},
  {v:"PRESTAMO",   t:"PRÉSTAMO — otra obra nos presta algo",              ay:"Entra algo que no es nuestro y hay que regresar."},
  {v:"SALDO",      t:"SALDO INICIAL — lo que ya había en el almacén",     ay:"Solo se usa una vez, al abrir el kardex."},
  {v:"TRANSFERENCIA",t:"TRANSFERENCIA — viene de otro almacén de la empresa", ay:"Material que estaba en el almacén de abajo y pasa al tuyo."},
  {v:"RECONTEO",   t:"RECONTEO — el conteo salió mayor que el saldo",     ay:"Corrige el saldo cuando al contar hay más de lo anotado."}
];
const MOT_S = [
  {v:"OBRA",       t:"OBRA — se consume y no vuelve",                     ay:"Material que se usa en la obra: cemento, fierro, clavos."},
  {v:"PRESTAMO",   t:"PRÉSTAMO — tiene que volver al almacén",            ay:"Herramienta o equipo que se entrega y se espera de vuelta."},
  {v:"REPARACION", t:"REPARACIÓN — sale a arreglar y vuelve",             ay:"Sale al taller. Queda pendiente hasta que regrese."},
  {v:"DEVOLUCION", t:"DEVOLUCIÓN — se regresa al proveedor u otra obra",  ay:"Sale porque se devuelve lo que no era nuestro o vino malo."},
  {v:"ENVIO",      t:"ENVÍO — se manda a otro frente u obra",             ay:"Sale del almacén hacia otro destino de la empresa."},
  {v:"TRANSFERENCIA",t:"TRANSFERENCIA — pasa a otro almacén de la empresa", ay:"Sale de tu almacén hacia el de abajo u otro frente. No es consumo."},
  {v:"RECONTEO",   t:"RECONTEO — el conteo salió menor que el saldo",     ay:"Corrige el saldo cuando al contar falta."}
];
const MOT_RETORNA = ["PRESTAMO","REPARACION"];
const motT = (s,v)=>{ const l=(s==="E"?MOT_E:MOT_S).find(m=>m.v===v); return l?l.v:(v||"—"); };

const TDOC_E = ["G/R","FACTURA","BOLETA","GUÍA DE ALMACÉN","VALE","ACTA DE RECONTEO"];
const TDOC_S = ["VALE","CUA. ALM.","NOTA DE SALIDA","ACTA DE RECONTEO"];

/* Sube cada vez que se publica: sirve para saber si el equipo está viendo
   la última versión o una guardada en la memoria del navegador. */
const VERSION = "28 · 01/10/2026 · web";
function toast(msg,mal){
  const t=$("#toast"); t.textContent=msg; t.hidden=false; t.classList.toggle("mal",!!mal);
  clearTimeout(toast._t); toast._t=setTimeout(()=>{t.hidden=true},3800);
}

/* ---------- estado ---------- */
const VACIO = ()=>({
  meta:{ empresa:"JVC Consultores y Ejecutores E.I.R.L.", ruc:"20567140220",
         direccion:"Calle Alzamora N° 270 – Iquitos", obra:"Tránsito peatonal",
         cp:"C.P. San Francisco", ubicacion:"Belén — Maynas, Loreto", cui:"2653411",
         metaPres:"", almacenero:"Jacko", inicioKardex:hoy(),
         proxVale:21, proxCua:1, proxReq:1, proxActa:1, proxSD:1, tema:"", _ts:0 },
  catalogo:{items:[],_ts:0}, personal:{items:[],_ts:0}, maquinaria:{items:[],_ts:0},
  listas:{areas:[],proveedores:[],destinos:[],_ts:0}, requerimientos:{items:[],_ts:0},
  conteos:{mes:{},_ts:0}, dias:{}
});
let S = VACIO();
const LS = "SICA_JVC_SANFRANCISCO_v2";
let DB=null, DL=null, AS=null, ultimoPull=0;

function dia(f){
  if(!S.dias[f]) S.dias[f]={fecha:f, movs:[], horometro:[], apertura:null, cierre:null, _ts:0};
  const d=S.dias[f];
  if(!d.movs) d.movs=[]; if(!d.horometro) d.horometro=[];
  return d;
}
const diasOrden = ()=> Object.keys(S.dias).sort();

/* ---------- persistencia local ---------- */
function guardarLocal(){
  try{ localStorage.setItem(LS, JSON.stringify(S)); }
  catch(e){ toast("El almacenamiento está lleno. Descarga el respaldo y quita fotos antiguas en Ajustes.",true); }
}
function cargarLocal(){
  try{
    const raw = localStorage.getItem(LS); if(!raw) return false;
    const d = JSON.parse(raw); if(!d || !d.meta) return false;
    S = Object.assign(VACIO(), d);
    S.dias = d.dias||{};
    S.listas = Object.assign({areas:[],proveedores:[],destinos:[],_ts:0}, d.listas||{});
    S.conteos = Object.assign({mes:{},_ts:0}, d.conteos||{}); if(!S.conteos.mes) S.conteos.mes={};
    return true;
  }catch(e){ return false; }
}

/* ---------- nube ---------- */
function marca(o){ if(o) o._ts = Date.now(); return o; }
const LLAVES = ["meta","catalogo","personal","maquinaria","listas","requerimientos","conteos"];

async function iniciarNube(){
  DL=null; AS=null;
  DB = (window.NUBE && NUBE.sesion && NUBE.db) ? NUBE.db : null;
  if(!DB){ estadoSync("off", window.NUBE && NUBE.hayNube ? "Sin sesión" : "Solo este equipo"); return; }
  await sincronizar(true);
  /* cada dos minutos se vuelve a mirar la nube, por si el otro equipo cargó algo */
  clearInterval(iniciarNube._t);
  iniciarNube._t = setInterval(()=>{ if(DB && document.visibilityState==="visible") sincronizar(false); }, 120000);
}
function estadoSync(cl,tx){
  const s=$("#sync"); if(!s) return;
  s.className="sync "+(cl||""); $("#sync-tx").textContent=tx;
}
async function sincronizar(inicial){
  if(!DB){ toast("No hay nube en este equipo. Todo se guarda aquí mismo."); return; }
  estadoSync("","Sincronizando…");
  try{
    for(const k of LLAVES){
      const snap = await DB.doc("almacen/"+k).get();
      const rem = snap.exists ? snap.data() : null;
      const loc = S[k];
      if(rem && (rem._ts||0) > (loc._ts||0)) S[k]=rem;
      else if((loc._ts||0) > (rem?(rem._ts||0):-1) || (inicial && !rem))
        await DB.doc("almacen/"+k).set(JSON.parse(JSON.stringify(loc)));
    }
    const qs = await DB.collection("dia").orderBy("fecha","desc").limit(240).get();
    qs.docs.forEach(d=>{
      const rem=d.data(); if(!rem||!rem.fecha) return;
      const loc=S.dias[rem.fecha];
      if(!loc || (rem._ts||0) > (loc._ts||0)) S.dias[rem.fecha]=rem;
    });
    for(const f of diasOrden()){
      const loc=S.dias[f]; if(!loc._pendiente) continue;
      const c=JSON.parse(JSON.stringify(loc)); delete c._pendiente;
      await DB.doc("dia/"+f).set(c); delete loc._pendiente;
    }
    ultimoPull=Date.now(); guardarLocal();
    estadoSync("on","Nube al día · "+ahora());
  }catch(e){
    estadoSync("off", e && e.code==="quota_exceeded" ? "Nube llena" : "Sin nube · datos locales");
  }
  indexar(); pintar();
}
async function subir(k){
  marca(S[k]); guardarLocal(); indexar();
  if(!DB) return;
  try{ await DB.doc("almacen/"+k).set(JSON.parse(JSON.stringify(S[k]))); estadoSync("on","Nube al día · "+ahora()); }
  catch(e){ estadoSync("off","Guardado aquí · falta subir"); }
}
async function subirDia(f){
  const d=dia(f); marca(d); d._pendiente=true; guardarLocal(); indexar();
  if(!DB) return;
  try{
    const c=JSON.parse(JSON.stringify(d)); delete c._pendiente;
    await DB.doc("dia/"+f).set(c); delete d._pendiente; guardarLocal();
    estadoSync("on","Nube al día · "+ahora());
  }catch(e){ estadoSync("off","Guardado aquí · falta subir"); }
}

/* ======================================================================
   CATÁLOGO Y SALDOS
   El stock no se guarda: se calcula. saldo = inicial + entradas − salidas.
   Así el kardex y el almacén nunca pueden discrepar por un dato viejo.
   ====================================================================== */
let IX = {item:{}, movs:[]};
const cat  = c => S.catalogo.items.find(i=>i.cod===c);
const catId= id=> S.catalogo.items.find(i=>i.id===id);
const retornable = it => !it ? false : (it.retorna!==undefined ? !!it.retorna : CLASIF_RETORNA.includes(it.clasif));

function indexar(){
  IX = {item:{}, movs:[]};
  S.catalogo.items.forEach(i=>{ IX.item[i.cod]={ini:nn(i.inicial), ing:0, sal:0}; });
  for(const f of diasOrden()){
    for(const m of (S.dias[f].movs||[])){
      if(!m.fecha) m.fecha=f;
      IX.movs.push(m);
      for(const l of (m.items||[])){
        const a = IX.item[l.cod] || (IX.item[l.cod]={ini:0,ing:0,sal:0});
        if(m.sentido==="E") a.ing += nn(l.cant); else a.sal += nn(l.cant);
      }
    }
  }
  IX.movs.sort((a,b)=> (a.fecha+(a.hora||"")) < (b.fecha+(b.hora||"")) ? -1 : 1);
}
const totIng = c => q2((IX.item[c]||{}).ing||0);
const totSal = c => q2((IX.item[c]||{}).sal||0);
const saldo  = c => { const a=IX.item[c]; return a? q2(a.ini+a.ing-a.sal) : 0; };

/** Saldo del ítem al cierre del día anterior a `f`. Es el SALDO de arranque del kardex y de la matriz. */
function saldoAntes(c,f){
  const a=IX.item[c]; let s=a?a.ini:0;
  IX.movs.forEach(m=>{
    if(m.fecha>=f) return;
    (m.items||[]).forEach(l=>{ if(l.cod!==c) return; s += (m.sentido==="E"? nn(l.cant) : -nn(l.cant)); });
  });
  return q2(s);
}
/** Movimientos que tocan un ítem, en orden, opcionalmente dentro de un rango de fechas. */
function movsItem(c,desde,hasta){
  const r=[];
  IX.movs.forEach(m=>{
    if(desde && m.fecha<desde) return;
    if(hasta && m.fecha>hasta) return;
    (m.items||[]).forEach(l=>{ if(l.cod===c) r.push({m,l}); });
  });
  return r;
}
function movsRango(desde,hasta,sentido){
  return IX.movs.filter(m=> (!desde||m.fecha>=desde) && (!hasta||m.fecha<=hasta) && (!sentido||m.sentido===sentido));
}
const movPorId = id => IX.movs.find(m=>m.id===id);
/* Si la pantalla quedó vieja (llegaron datos de la nube, se formalizó en otro
   equipo, se anuló algo), el botón apuntaba a algo que ya no está y el clic se
   quedaba mudo. Ahora avisa y repinta, que es lo único útil que puede hacer. */
function movExige(id){
  const m=movPorId(id);
  if(!m){ toast("Ese movimiento ya no está: la pantalla estaba vieja. Ya la actualicé.",true); pintar(); }
  return m;
}
/** Busca un pendiente por su clave, y aguanta que la clave sea la de cualquiera de sus partes. */
function pendExige(k){
  const l=provisionales();
  const g = l.find(x=>(x.m.grupo||x.m.id)===k)
         || l.find(x=>x.partes.some(p=>p.id===k || p.grupo===k));
  if(!g){ toast("Ese ingreso ya no está pendiente: puede que ya lo hayas formalizado. Ya actualicé la lista.",true); pintar(); }
  return g;
}
const cantMov  = m => q2((m.items||[]).reduce((s,l)=>s+nn(l.cant),0));
const importeMov = m => q2((m.items||[]).reduce((s,l)=>s+nn(l.cant)*nn(l.precio),0));

/** Préstamos que todavía no vuelven: salida PRÉSTAMO/REPARACIÓN menos lo devuelto y lo dado por perdido. */
function prestamos(){
  const dev={};
  IX.movs.forEach(m=>{
    if(m.sentido!=="E" || !m.ref) return;
    (m.items||[]).forEach(l=>{ const k=m.ref+"|"+l.cod; dev[k]=(dev[k]||0)+nn(l.cant); });
  });
  const r=[];
  IX.movs.forEach(m=>{
    if(m.sentido!=="S" || !MOT_RETORNA.includes(m.motivo)) return;
    (m.items||[]).forEach(l=>{
      const d=dev[m.id+"|"+l.cod]||0;
      const p=q2(nn(l.cant)-d-nn(l.perdido));
      if(p>0.0001) r.push({m,l,pend:p,dev:q2(d),diasFuera:Math.max(0,dias(m.fecha,hoy()))});
    });
  });
  return r.sort((a,b)=> b.diasFuera-a.diasFuera || (a.m.fecha<b.m.fecha?-1:1));
}
function fueraMapa(){ const o={}; prestamos().forEach(p=>{ o[p.l.cod]=(o[p.l.cod]||0)+p.pend; }); return o; }
const bajoMinimo = ()=> S.catalogo.items.filter(i=>i.activo!==false && nn(i.min)>0 && saldo(i.cod)<=nn(i.min));

/* ---------- códigos de ubicación física: MA-301 ---------- */
const TIPO_UB = {M:"Material",H:"Herramienta",E:"EPP",C:"Combustible",R:"Repuesto",O:"Oficina y varios"};
function codigoDe(tipo,estante,nivel,casillero){
  return `${tipo}${String(estante||"A").toUpperCase()}-${String(nivel||1)}${String(casillero||1).padStart(2,"0")}`;
}
function siguienteCasillero(tipo,estante,nivel){
  const pre=`${tipo}${String(estante||"A").toUpperCase()}-${String(nivel||1)}`;
  let max=0; S.catalogo.items.forEach(i=>{ if(String(i.cod).startsWith(pre)){ const c=parseInt(String(i.cod).slice(pre.length),10); if(c>max) max=c; } });
  return max+1;
}

/* ---------- personal y listas ---------- */
const per = id => S.personal.items.find(p=>p.id===id);
function nom(id,fb){ const p=per(id); return p?((p.nombres+" "+p.apellidos).trim()+(p.cargo?"":"")):(fb||"—"); }
function nomCargo(id){ const p=per(id); return p?((p.nombres+" "+p.apellidos).trim()+" · "+(p.cargo||"")):"—"; }
const activos = ()=> S.personal.items.filter(p=>p.activo!==false);
const autorizantes = ()=> activos().filter(p=>p.puedeAutorizar || AUTORIZA_CARGOS.includes(p.cargo));
const operadores = ()=> activos().filter(p=>/Operador|Chofer|Operario/.test(p.cargo||""));

function lista(k){ if(!S.listas[k]) S.listas[k]=[]; return S.listas[k]; }
/* La obra tiene dos almacenes en pisos distintos. Se siembran una vez y
   se pueden renombrar o agregar más desde Listas. */
const ALM_DEF = ["1ER PISO","2DO PISO"];
function almacenes(){ const l=lista("almacenes"); return l.length?l:ALM_DEF; }
const almDe = it => (it && it.alm) ? it.alm : "";
function optAlm(val){ return opts(almacenes(), val||almacenes()[0], false); }
function sumaLista(k,v){
  v=String(v||"").trim(); if(!v) return;
  const l=lista(k); if(!l.some(x=>x.toUpperCase()===v.toUpperCase())){ l.push(v); l.sort(); subir("listas"); }
}
const dl = (k)=> `<datalist id="dl-${k}">`+lista(k).map(v=>`<option value="${esc(v)}">`).join("")+`</datalist>`;

/* ---------- <select> ---------- */
function opts(l,val,vacio){
  let h = vacio!==false ? `<option value="">— elegir —</option>` : "";
  l.forEach(o=>{
    const v=typeof o==="string"?o:o.v, t=typeof o==="string"?o:o.t;
    h += `<option value="${esc(v)}"${String(v)===String(val)?" selected":""}>${esc(t)}</option>`;
  });
  return h;
}
const optPersonal = (val,l)=> opts((l||activos()).map(p=>({v:p.id,t:(p.nombres+" "+p.apellidos).trim()+" · "+(p.cargo||"")})),val);
function optCatalogo(val,filtro){
  const l = S.catalogo.items.filter(i=>i.activo!==false && (!filtro||filtro(i)))
    .sort((a,b)=> String(a.cod)<String(b.cod)?-1:1)
    .map(i=>({v:i.cod, t:`${i.cod} · ${i.desc} (${i.uni})`}));
  return opts(l,val);
}

/* ---------- buscador de artículos ----------------------------------------
   El desplegable de siempre obliga a bajar por doscientos artículos de uno
   en uno, y en el celular ni siquiera deja escribir. Esto es una cajita
   donde se escribe y la lista se va achicando sola: "clavo 3" encuentra
   CLAVO C/CABEZA 3". Busca por nombre y por código, no le importan las
   tildes ni el orden de las palabras, y muestra el saldo al lado para no
   despachar lo que no hay.

   El código elegido queda en un input escondido con el mismo id o la misma
   clase que tenía el desplegable, así que todo lo que ya leía ese valor
   sigue funcionando sin tocarse. ------------------------------------------ */
const sinTil = t => String(t||"").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/Ñ/g,"N");

function artBuscar(txt, filtro, tope){
  const lista = S.catalogo.items.filter(i=>i.activo!==false && (!filtro||filtro(i)));
  const porCod = (a,b)=> String(a.cod)<String(b.cod)?-1:1;
  const q = sinTil(txt).trim();
  if(!q) return lista.sort(porCod).slice(0, tope||80);
  const pal = q.split(/\s+/);
  const nota = i=>{
    const d=sinTil(i.desc), c=sinTil(i.cod);
    if(!pal.every(p=>d.includes(p)||c.includes(p))) return -1;   /* todas las palabras, en cualquier orden */
    let p=0;
    if(c===q) p+=1000;
    if(d===q) p+=900;
    if(d.startsWith(q)) p+=500;
    if(c.startsWith(q)) p+=300;
    if(saldo(i.cod)>0) p+=40;                                     /* lo que sí hay, primero */
    return p + Math.max(0, 120-d.length);
  };
  return lista.map(i=>({i,p:nota(i)})).filter(x=>x.p>=0)
              .sort((a,b)=> b.p-a.p || porCod(a.i,b.i))
              .map(x=>x.i).slice(0, tope||80);
}
const artRotulo = it => it ? it.cod+" · "+it.desc : "";

/** La cajita. `ref` es "#id" o ".clase", el mismo con el que el resto del
    sistema lee el artículo elegido. */
function comboArt(ref, cod, ix){
  const it = cat(cod);
  const attr = (ref.charAt(0)==="#" ? `id="${ref.slice(1)}"` : `class="${ref.slice(1)}"`)
             + (ix!=null ? ` data-ix="${ix}"` : "");
  return `<div class="combo">
    <input type="hidden" ${attr} value="${esc(cod||"")}">
    <input class="combo-txt" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
           placeholder="Escribe el nombre o el código…" value="${esc(artRotulo(it))}">
    <div class="combo-lista" hidden></div>
  </div>`;
}

function engancharCombos(raiz){
  $$(".combo", raiz||document).forEach(c=>{
    if(c.dataset.listo) return;
    c.dataset.listo="1";
    const oculto = c.querySelector("input[type=hidden]");
    const txt    = c.querySelector(".combo-txt");
    const lis    = c.querySelector(".combo-lista");
    if(!oculto||!txt||!lis) return;
    let halla=[], marca=-1;

    /* la lista va suelta sobre la pantalla: así no la recorta el modal ni la tabla.
       Se abre hacia abajo si hay sitio y hacia arriba si no, y nunca más alta
       que el hueco que le queda: en el celular, con el teclado abierto, el hueco
       es poco y la lista se tiene que achicar, no desbordarse. */
    const colocar = ()=>{
      const r=txt.getBoundingClientRect(), m=8, tope=Math.round(innerHeight*0.46);
      const abajo=innerHeight-r.bottom-m, arriba=r.top-m;
      const vaAbajo = abajo>=Math.min(tope,200) || abajo>=arriba;
      const hueco = vaAbajo ? abajo : arriba;
      const alto = Math.max(110, Math.min(tope, hueco));
      const ancho = Math.min(r.width, innerWidth-12);
      lis.style.maxHeight = alto+"px";
      lis.style.width = ancho+"px";
      lis.style.left = Math.max(6, Math.min(r.left, innerWidth-ancho-6))+"px";
      if(vaAbajo){
        lis.style.top = Math.min(r.bottom+3, Math.max(m, innerHeight-alto-m))+"px";
        lis.style.bottom = "auto";
      } else {
        lis.style.bottom = Math.min(innerHeight-r.top+3, Math.max(m, innerHeight-alto-m))+"px";
        lis.style.top = "auto";
      }
    };
    const cerrarLista = ()=>{
      lis.hidden=true; marca=-1;
      removeEventListener("scroll",colocar,true); removeEventListener("resize",colocar);
    };
    const pinta = ()=>{
      halla = artBuscar(txt.value);
      lis.innerHTML = halla.length
        ? halla.map((i,n)=>{
            const s=saldo(i.cod);
            return `<div class="combo-op${n===marca?" sel":""}" data-n="${n}">
              <span class="c">${esc(i.cod)}</span>
              <span class="d">${esc(i.desc)}</span>
              <span class="s${s<=0?" cero":""}">${fmt(s)} ${esc(i.uni)}</span>
            </div>`;
          }).join("")
        : `<div class="combo-nada"><b>No hay ningún artículo que se llame así.</b>
             Prueba con una sola palabra — por ejemplo <b>clavo</b> en vez de <i>clavo de 3 pulgadas</i>.</div>`;
      lis.hidden=false; colocar();
      addEventListener("scroll",colocar,true); addEventListener("resize",colocar);
    };
    const elegir = n=>{
      const it=halla[n]; if(!it) return;
      oculto.value=it.cod; txt.value=artRotulo(it); cerrarLista();
      oculto.dispatchEvent(new Event("change",{bubbles:true}));
    };
    const mover = d=>{
      if(lis.hidden) return pinta();
      marca = Math.max(0, Math.min(halla.length-1, marca+d));
      $$(".combo-op",lis).forEach((e,n)=>e.classList.toggle("sel", n===marca));
      const s=lis.querySelector(".combo-op.sel"); if(s) s.scrollIntoView({block:"nearest"});
    };

    txt.addEventListener("focus", ()=>{ txt.select(); marca=-1; pinta(); });
    txt.addEventListener("input", ()=>{ marca=-1; pinta(); });
    txt.addEventListener("keydown", e=>{
      if(e.key==="ArrowDown"){ e.preventDefault(); mover(1); }
      else if(e.key==="ArrowUp"){ e.preventDefault(); mover(-1); }
      else if(e.key==="Enter" && !lis.hidden){ e.preventDefault(); elegir(marca<0?0:marca); }
      else if(e.key==="Escape"){ cerrarLista(); txt.blur(); }
    });
    /* si se va sin elegir, se repone lo que estaba: no se queda a medio escribir */
    txt.addEventListener("blur", ()=>setTimeout(()=>{
      cerrarLista();
      if(!txt.value.trim()){
        if(oculto.value){ oculto.value=""; oculto.dispatchEvent(new Event("change",{bubbles:true})); }
        return;
      }
      txt.value = artRotulo(cat(oculto.value));
    },150));
    /* pointerdown y no click: tiene que ganarle al blur, si no se cierra sin elegir */
    lis.addEventListener("pointerdown", e=>{
      const op=e.target.closest(".combo-op"); if(!op) return;
      e.preventDefault(); elegir(+op.dataset.n);
    });
    if(oculto.id){
      const lb=document.querySelector('label[for="'+oculto.id+'"]');
      if(lb) lb.addEventListener("click", e=>{ e.preventDefault(); txt.focus(); });
    }
  });
}

/* ---------- la salida del almacén ----------------------------------------
   Las salidas las firma siempre el mismo papel (NOTA DE SALIDA) y las
   autoriza siempre la misma gente, así que no tiene sentido preguntarlo
   cada vez: el sistema lo pone y el almacenero solo escribe lo que cambia. */

/** El siguiente número de nota de salida. Se saca de las notas que ya están
    cargadas, no de un contador aparte: así no se desacomoda si se anula una
    o si se carga desde otro equipo. */
function proxNotaSalida(){
  let max=0;
  IX.movs.forEach(m=>{
    if(m.sentido!=="S" || m.tipoDoc!=="NOTA DE SALIDA") return;
    const n=parseInt(String(m.nroDoc||"").replace(/\D/g,""),10);
    if(n>max) max=n;
  });
  return String(max+1).padStart(3,"0");
}

/** Quién puede autorizar una salida: el residente y el maestro de obra, nadie
    más. Si no hubiera ninguno cargado se cae a la lista de siempre, para no
    dejar al almacenero sin poder despachar. */
const CARGOS_SALIDA = ["Residente de obra","Maestro de obra"];
function autorizanSalida(){
  const l = activos().filter(p=>CARGOS_SALIDA.includes(p.cargo));
  return l.length ? l : autorizantes();
}


/* ---------- modal ---------- */
function modal(tit,body,botones,ancho){
  $("#m-tit").textContent=tit; $("#m-body").innerHTML=body;
  const pie=$("#m-pie"); pie.innerHTML="";
  (botones||[]).forEach(b=>{
    const el=document.createElement("button");
    el.className="b"+(b.clase?" "+b.clase:""); el.textContent=b.t; el.onclick=b.fn;
    if(b.izq) el.classList.add("izq");
    pie.appendChild(el);
  });
  $("#velo").hidden=false;
  const m=$(".modal"); m.style.width = ancho ? "min("+ancho+"px,100%)" : "";
  document.body.style.overflow="hidden";
  engancharCombos($("#m-body"));
  setTimeout(()=>{ const f=$("#m-body input:not([type=hidden]),#m-body select,#m-body textarea"); if(f) f.focus(); },60);
}
function cerrar(){ $("#velo").hidden=true; document.body.style.overflow=""; }
$("#m-x").onclick=cerrar;
$("#velo").addEventListener("click",e=>{ if(e.target.id==="velo") cerrar(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !$("#velo").hidden) cerrar(); });
function confirmar(tit,txt,fn,etq,peligro){
  modal(tit,`<p style="font-size:17px;margin:0">${txt}</p>`,[
    {t:"Cancelar",clase:"sec",fn:cerrar},
    {t:etq||"Confirmar",clase:peligro?"peligro":"",fn:()=>{cerrar();fn();}}
  ],560);
}
function leer(id){ const e=$("#"+id); return e?String(e.value).trim():""; }
function leerN(id){ return nn(leer(id)); }

/* ---------- fotos ---------- */
function comprimirFoto(file,max,cal){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error("No se pudo leer la foto"));
    fr.onload=()=>{
      const im=new Image();
      im.onerror=()=>rej(new Error("Imagen no válida"));
      im.onload=()=>{
        const k=Math.min(1,(max||760)/Math.max(im.width,im.height));
        const c=document.createElement("canvas");
        c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
        c.getContext("2d").drawImage(im,0,0,c.width,c.height);
        res(c.toDataURL("image/jpeg",cal||0.55));
      };
      im.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function guardarFoto(dataUrl){
  if(AS){
    try{
      const bin=atob(dataUrl.split(",")[1]); const u8=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
      const r=await AS.upload(new Blob([u8],{type:"image/jpeg"}));
      return {k:"a",u:r.url};
    }catch(e){}
  }
  return {k:"d",u:dataUrl};
}
const fotoSrc = f => !f ? "" : (typeof f==="string"?f:f.u);

/* ---------- navegación ---------- */
const MOD = [
  {k:"tablero",  t:"Tablero",        i:"▤", g:1, sub:"Lo que se movió hoy y lo que está fuera del almacén."},
  {k:"guias",    t:"Cargar guía",    i:"⇥", g:1, sub:"Pasar el taco de guías al sistema, una por una y rápido."},
  {k:"entradas", t:"Entradas",       i:"▼", g:1, sub:"Todo lo que llega al almacén. Es lo único que suma saldo."},
  {k:"salidas",  t:"Salidas",        i:"▲", g:1, sub:"Todo lo que sale. Vale firmado o anotado en el cuaderno."},
  {k:"prestamos",t:"Préstamos",      i:"↺", g:1, sub:"Herramienta y equipo que salió y todavía no vuelve."},
  {k:"horometro",t:"Horómetro",      i:"◷", g:1, sub:"Horas de máquina, operador y foto del tablero."},
  {k:"stock",    t:"Stock",          i:"⊞", g:2, sub:"Saldo de cada ítem: inicial + entradas − salidas."},
  {k:"kardex",   t:"Kardex",         i:"☰", g:2, sub:"Historia de un solo ítem, movimiento por movimiento."},
  {k:"diario",   t:"Control diario", i:"▦", g:2, sub:"La matriz del mes: cada ítem contra cada día."},
  {k:"conteo",   t:"Contar almacén",i:"⊟", g:2, sub:"El inventario físico: se elige un piso y se cuenta estante por estante."},
  {k:"inventario",t:"Inventario",    i:"✓", g:2, sub:"Apertura, cierre y cuadre del día."},
  {k:"requerimientos",t:"Requerimientos",i:"✎", g:3, sub:"Lo que el almacén pide a la empresa."},
  {k:"reportes", t:"Reportes",       i:"▥", g:3, sub:"Consumo por frente, valorizado y quién retira."},
  {k:"catalogo", t:"Catálogo",       i:"⌗", g:4, sub:"Cada ítem con su código de ubicación y su familia."},
  {k:"ubicar",   t:"Ubicar",         i:"⌂", g:4, sub:"Darle estante definitivo a lo que se creó al vuelo."},
  {k:"personal", t:"Personal",       i:"◉", g:4, sub:"Quién manda a pedir, quién lleva, quién despacha."},
  {k:"listas",   t:"Listas",         i:"⋮", g:4, sub:"Frentes de trabajo, proveedores, destinos y máquinas."},
  {k:"ajustes",  t:"Ajustes",        i:"⚒", g:4, sub:"Datos de obra, numeración, respaldo y cargas."}
];
const TABS_MOVIL = ["tablero","guias","entradas","stock","kardex","__mas"];

/* ======================================================================
   QUIÉN ENTRÓ Y QUÉ PUEDE TOCAR
   Dos roles. El administrador ve todo el sistema. El apoyo de almacén
   solo carga entradas: ve Cargar guía, Stock y Kardex, y puede crear
   artículos al vuelo mientras tipea una guía. No puede anular, ni hacer
   salidas, ni tocar inventario, personal ni ajustes.
   Esto es el candado de la pantalla. El candado de los datos está en
   Supabase (sql/01-estructura.sql) y los dos trabajan juntos.
   ====================================================================== */
const MOD_APOYO = ["guias","stock","kardex"];
/* lo único que el apoyo puede accionar */
const ACC_APOYO = {};
("guGuardar guModo guNueva guAgregar guQuita guArtNuevo guLimpiaBusca linAgrega linQuita "
+"movAdd movVer resumenGuias pdfResumen csvMovs "
+"impStock csvStock impKardex csvKardex verKardex "
+"recargar revisar").split(/\s+/).forEach(a=>{ ACC_APOYO[a]=1; });

const rolActual = ()=> (window.NUBE && NUBE.sesion) ? NUBE.sesion.rol : "admin";
const esAdmin   = ()=> rolActual()==="admin";
const puedeVer  = k => esAdmin() || MOD_APOYO.indexOf(k)>=0;
const puedeHacer= a => esAdmin() || !!ACC_APOYO[a];
const MODS      = ()=> MOD.filter(m=>puedeVer(m.k));
const negado    = ()=> toast("Tu usuario es apoyo de almacén: solo puede registrar entradas.",true);
let vistaActual="tablero";

function alertas(){
  const d=dia(hoy());
  return {
    tablero:0,
    guias: (guLeeBorr()?1:0)+provisionales().length,
    entradas:0,
    salidas:0,
    prestamos: prestamos().filter(p=>p.diasFuera>=1).length,
    horometro: S.maquinaria.items.filter(m=>m.activo!==false && m.tipo!=="vehiculo")
                 .filter(m=>!(d.horometro||[]).some(h=>h.maqId===m.id && h.fin!=null && h.fin!=="")).length,
    stock:0, kardex:0, diario:0,
    inventario:(!d.apertura?1:0)+(!d.cierre?1:0),
    requerimientos: S.requerimientos.items.filter(r=>r.estado!=="atendido").length,
    reportes:0, catalogo: bajoMinimo().length, ubicar: sinUbicar().length,
    conteo: (function(){ const a=avanceConteo(mesDe(hoy())); return a.reduce((n,x)=>n+(x.total-x.contados),0); })(),
    personal:0, listas:0, ajustes:0
  };
}
function pintarNav(){
  const al=alertas();
  [1,2,3,4].forEach(g=>{
    const n=$("#nav"+g); if(!n) return;
    n.innerHTML = MODS().filter(m=>m.g===g).map(m=>
      `<button data-ir="${m.k}"${vistaActual===m.k?' aria-current="page"':''}>${m.t}${al[m.k]>0?`<span class="pip">${al[m.k]}</span>`:""}</button>`).join("");
  });
  $("#mtabs").innerHTML = TABS_MOVIL.filter(k=>k==="__mas"||puedeVer(k)).map(k=>{
    if(k==="__mas") return `<button data-ir="__mas"><i>⋯</i>Más</button>`;
    const m=MOD.find(x=>x.k===k);
    return `<button data-ir="${m.k}"${vistaActual===m.k?' aria-current="page"':''}><i>${m.i}</i>${m.t}${al[m.k]>0?`<span class="pip">${al[m.k]}</span>`:""}</button>`;
  }).join("");
}
function ir(k){
  if(k!=="__mas" && !puedeVer(k)) return negado();
  if(k==="__mas"){
    modal("Ir a", `<div class="tarjetas" style="margin:0">`+MODS().map(m=>
      `<a data-ir="${m.k}"><div class="n" style="font-size:24px">${m.i}</div><div class="l" style="font-size:15px;color:var(--texto)">${m.t}</div></a>`).join("")+`</div>`,
      [{t:"Cerrar",clase:"sec",fn:cerrar}]);
    return;
  }
  vistaActual=k; cerrar(); window.scrollTo(0,0); pintar();
}
/* ----------------------------------------------------------------------
   El almacén no tiene a nadie que sepa abrir la consola del navegador.
   Así que cuando algo revienta, el sistema lo dice en pantalla y lo guarda,
   para poder leerlo después en «revisar el sistema». -------------------- */
const FALLAS=[];
function anotarFalla(err,donde){
  const m = (err && err.message) ? err.message : String(err);
  FALLAS.push({h:fFecha(hoy())+" "+ahora(), donde:donde||"", m:m, pila:String((err&&err.stack)||"").split("\n").slice(0,4).join(" ⏎ ")});
  if(FALLAS.length>25) FALLAS.shift();
  try{ toast("Falló"+(donde?" «"+donde+"»":"")+": "+m+" — dale a «revisar el sistema» arriba",true); }catch(e){}
  return m;
}
window.addEventListener("error", e=>{ anotarFalla(e.error||e.message,"la página"); });
window.addEventListener("unhandledrejection", e=>{ anotarFalla(e.reason,"la nube"); });

document.addEventListener("click",e=>{
  const t=e.target.closest("[data-ir]"); if(t){ e.preventDefault(); ir(t.dataset.ir); return; }
  const a=e.target.closest("[data-acc]");
  if(!a) return;
  e.preventDefault();
  const f=ACC[a.dataset.acc];
  if(!f) return anotarFalla("no existe esa acción","botón "+a.dataset.acc);
  if(!puedeHacer(a.dataset.acc)) return negado();
  try{ f(a.dataset,a); }
  catch(err){ anotarFalla(err,a.dataset.acc); }
});
const ACC={};
/** Lo que hace falta para entender por qué algo no anda, en una pantalla. */
function informe(){
  const pv=provisionales();
  const l=[];
  l.push("SICA · versión "+VERSION);
  l.push("Equipo: "+(navigator.userAgent||"—"));
  l.push("Ancho de pantalla: "+window.innerWidth+" px");
  l.push("Nube: "+(DB?"conectada":"no hay")+" · "+($("#sync-tx")?$("#sync-tx").textContent:"—"));
  l.push("Guardado en el equipo: "+(function(){ try{ const b=(localStorage.getItem(LS)||"").length;
    return b?Math.round(b/1024)+" KB":"vacío"; }catch(e){ return "BLOQUEADO ("+e.message+")"; } })());
  l.push("Artículos: "+S.catalogo.items.length+" · movimientos: "+IX.movs.length+" · días: "+Object.keys(S.dias).length);
  l.push("Pendientes sin papel: "+pv.length);
  pv.forEach(g=>l.push("   · "+g.m.nroDoc+" | "+g.m.fecha+" | partes "+g.partes.length
      +" | clave "+(g.m.grupo||g.m.id)+" | "+(g.m.contra||"sin proveedor")));
  l.push("Acciones cargadas: "+Object.keys(ACC).length+(ACC.formalizar?" · formalizar SÍ está":" · FALTA formalizar"));
  l.push(FALLAS.length?("Fallas guardadas ("+FALLAS.length+"):"):"Sin fallas guardadas.");
  FALLAS.slice().reverse().forEach(f=>l.push("   · "+f.h+" ["+f.donde+"] "+f.m+(f.pila?" | "+f.pila:"")));
  return l.join("\n");
}
ACC.revisar = ()=>{
  const txt=informe();
  modal("Revisar el sistema", `
    ${expl("Para qué sirve esto",[
      "Si algo no responde, acá sale qué versión tienes, cómo está la nube y qué falló exactamente.",
      "Dale a <b>Copiar</b> y pégamelo en el chat: con eso ubico el problema sin adivinar."
    ])}
    <textarea id="rv-txt" readonly style="min-height:300px; font-family:var(--f-mono); font-size:12.5px; white-space:pre">${esc(txt)}</textarea>`,
    [{t:"Copiar",clase:"sec",izq:true,fn:()=>{
        const e=$("#rv-txt"); e.select(); e.setSelectionRange(0,999999);
        let bien=false;
        try{ bien=document.execCommand("copy"); }catch(x){}
        if(!bien && navigator.clipboard){ navigator.clipboard.writeText(e.value).then(()=>toast("Copiado")).catch(()=>toast("Selecciónalo y cópialo a mano.",true)); }
        else toast(bien?"Copiado: pégamelo en el chat":"Selecciónalo y cópialo a mano.",!bien);
     }},
     {t:"Borrar las fallas",clase:"sec",fn:()=>{ FALLAS.length=0; cerrar(); toast("Listo, a probar de nuevo."); }},
     {t:"Cerrar",fn:cerrar}], 820);
};

/** Vuelve a bajar el sistema, por si el navegador tiene guardada una versión vieja. */
ACC.recargar = ()=>{
  confirmar("Traer la última versión",
    "Se vuelve a bajar el sistema desde cero, por si el navegador te tiene guardada una versión vieja.<br><br>" +
    "<b>Tus datos no se tocan</b>: quedan guardados en este equipo igual que siempre.",
    ()=>{ try{ location.replace(location.pathname+"?v="+Date.now()+location.hash); }catch(e){ location.reload(); } },
    "Recargar");
};

const VISTAS={};
function pintar(){
  /* Último candado: aunque algo pusiera la pantalla a mano, si el rol no
     la tiene permitida no se pinta. La navegación ya lo impide; esto es
     por si en el futuro alguien cambia vistaActual desde otro lado. */
  if(!puedeVer(vistaActual)) vistaActual = (MODS()[0]||MOD[0]).k;
  const m=MOD.find(x=>x.k===vistaActual)||MODS()[0]||MOD[0];
  $("#t-titulo").textContent=m.t;
  $("#t-sub").textContent=m.sub;
  $("#t-acciones").innerHTML="";
  $("#impresion").innerHTML="";
  $("#impresion").className="cuerpo";
  const f=VISTAS[m.k];
  $("#vista").innerHTML = f ? f() : `<div class="vacio"><b>En preparación</b></div>`;
  pintarNav();
  $("#rail-obra").textContent=S.meta.obra||"—";
  $("#rail-cp").textContent=S.meta.cp||"";
  $("#rail-cui").textContent="CUI "+(S.meta.cui||"—");
  if(typeof engancha==="function") engancha();
}

/* cabecera reusable: bloque de explicación plana */
function expl(tit,lineas){
  return `<div class="expl"><b>${esc(tit)}</b><ul>${lineas.map(l=>`<li>${l}</li>`).join("")}</ul></div>`;
}
function campo(id,etq,ayuda,control){
  return `<div class="campo"><label for="${id}">${esc(etq)}</label>${control}${ayuda?`<span class="ayuda">${ayuda}</span>`:""}</div>`;
}
function vacio(tit,txt,btn){
  return `<div class="vacio"><b>${esc(tit)}</b>${esc(txt||"")}${btn?`<div style="margin-top:14px">${btn}</div>`:""}</div>`;
}
/* ======================================================================
   FORMULARIO DE MOVIMIENTO — sirve para ENTRADA y para SALIDA
   Cada campo lleva debajo, en letra chica, qué se escribe ahí.
   ====================================================================== */
let LIN = [];

function lineasHTML(sentido){
  const esE = sentido==="E";
  const filas = LIN.map((l,ix)=>{
    const it = cat(l.cod);
    return `<tr data-ix="${ix}">
      <td data-r="ARTÍCULO">${comboArt(".l-cod", l.cod, ix)}
        <span class="uni">${it?esc(it.uni)+" · saldo "+fmt(saldo(it.cod)):"—"}</span></td>
      ${esE?`<td class="q n" data-r="SEGÚN GUÍA"><input class="l-guia" data-ix="${ix}" inputmode="decimal" value="${l.guia!=null&&l.guia!==""?esc(l.guia):""}" placeholder="—"></td>`:""}
      <td class="q n" data-r="${esE?"RECIBIDO DE VERDAD":"CANTIDAD"}"><input class="l-cant" data-ix="${ix}" inputmode="decimal" value="${l.cant!=null&&l.cant!==""?esc(l.cant):""}"></td>
      <td class="p n" data-r="PRECIO UNIT. (opcional)"><input class="l-precio" data-ix="${ix}" inputmode="decimal" value="${l.precio!=null&&l.precio!==""?esc(l.precio):""}" placeholder="—"></td>
      <td class="x" data-r=""><button type="button" class="quita" data-acc="linQuita" data-ix="${ix}" aria-label="Quitar">&times;</button></td>
    </tr>`;
  }).join("");
  const tot = q2(LIN.reduce((s,l)=>s+nn(l.cant)*nn(l.precio),0));
  return `<table class="lin">
    <thead><tr><th>Artículo</th>${esE?`<th>Según guía</th>`:""}<th>${esE?"Recibido":"Cantidad"}</th><th>Precio unit.</th><th></th></tr></thead>
    <tbody>${filas || `<tr><td colspan="5" style="color:var(--texto-2);padding:14px 8px">Todavía no has agregado ningún artículo.</td></tr>`}</tbody>
    ${tot>0?`<tfoot><tr><td colspan="${esE?3:2}" style="text-align:right">Valorizado del documento</td><td class="n" style="text-align:right;font-family:var(--f-mono)">${soles(tot)}</td><td></td></tr></tfoot>`:""}
  </table>
  <div style="margin-top:12px"><button type="button" class="b sec chico" data-acc="linAgrega">+ Agregar artículo</button></div>`;
}

function pintaLineas(sentido){
  const c=$("#zona-lineas"); if(!c) return;
  c.innerHTML=lineasHTML(sentido);
  $$(".l-cod",c).forEach(e=>{ e.onchange=()=>{
    const ix=e.dataset.ix;
    leerLineas(); pintaLineas(sentido);
    const q=$(`.l-cant[data-ix="${ix}"]`); if(q){ q.focus(); q.select(); }
  }; });
  engancharCombos(c);
}
ACC.linAgrega = ()=>{ LIN.push({cod:"",cant:"",precio:"",guia:""}); pintaLineas($("#f-sentido").value); };
ACC.linQuita  = d=>{ LIN.splice(+d.ix,1); pintaLineas($("#f-sentido").value); };

function leerLineas(){
  $$(".l-cod").forEach(e=> LIN[+e.dataset.ix].cod = e.value);
  $$(".l-cant").forEach(e=> LIN[+e.dataset.ix].cant = e.value);
  $$(".l-precio").forEach(e=> LIN[+e.dataset.ix].precio = e.value);
  $$(".l-guia").forEach(e=> LIN[+e.dataset.ix].guia = e.value);
}

function formMov(sentido, movId, prefill){
  const esE = sentido==="E";
  const m = movId ? movPorId(movId) : null;
  const base = m || Object.assign({
    fecha:hoy(), hora:ahora(), sentido, motivo: esE?"INGRESO":"OBRA",
    tipoDoc: esE?"G/R":"VALE", nroDoc:"", contra:"", area:"", destino:"",
    persona:"", autoriza:"", almacenero:"", obs:"", items:[]
  }, prefill||{});
  LIN = (base.items||[]).map(l=>Object.assign({},l));
  if(!LIN.length) LIN=[{cod:"",cant:"",precio:"",guia:""}];

  /* en una salida el número lo pone el sistema; en una que ya está guardada se respeta el suyo */
  const tdocS  = (m && m.tipoDoc) ? m.tipoDoc : "NOTA DE SALIDA";
  const numSug = esE ? "" : (m ? "" : proxNotaSalida());

  const cuerpo = `
  <input type="hidden" id="f-sentido" value="${sentido}">
  <input type="hidden" id="f-id" value="${m?esc(m.id):""}">
  <input type="hidden" id="f-ref" value="${esc(base.ref||"")}">

  ${!esE ? "" : expl("Qué se registra aquí",[
    "Todo lo que <b>entra</b> al almacén: compras que llegan, herramienta que vuelve de un préstamo, o el saldo que ya había cuando se abrió el kardex.",
    "Lo que escribas aquí <b>suma</b> al saldo de cada artículo.",
    "Si la guía dice 100 bolsas y solo bajaron 98, escribe 100 en <i>Según guía</i> y 98 en <i>Recibido</i>. El sistema deja anotada la diferencia."
  ])}

  <div class="bloque"><h2>1 · EL PAPEL</h2><div class="pad">
    <div class="campos">
      ${campo("f-fecha","FECHA","El día en que de verdad se movió, no el día en que lo estás pasando al sistema.",
        `<input type="date" id="f-fecha" value="${esc(base.fecha)}">`)}
      ${campo("f-hora","HORA","Ayuda a ordenar cuando hay varios movimientos del mismo día.",
        `<input type="time" id="f-hora" value="${esc(base.hora||ahora())}">`)}
      ${campo("f-motivo","MOTIVO","Por qué se movió. Es la columna que después explica el saldo.",
        `<select id="f-motivo">${opts((esE?MOT_E:MOT_S).map(o=>({v:o.v,t:o.t})),base.motivo,false)}</select>`)}
      ${esE
        ? campo("f-tipodoc","TIPO DE DOCUMENTO","Con qué papel llegó: G/R es guía de remisión.",
            `<select id="f-tipodoc">${opts(TDOC_E,base.tipoDoc,false)}</select>`)
        : campo("f-tipodoc-v","TIPO DE DOCUMENTO","Todas las salidas se registran con nota de salida.",
            `<input id="f-tipodoc-v" value="${esc(tdocS)}" readonly tabindex="-1" class="fijo">
             <input type="hidden" id="f-tipodoc" value="${esc(tdocS)}">`)}
      ${campo("f-nrodoc","N° DE DOCUMENTO", esE
        ? "El número que está impreso o escrito en el papel."
        : "Sale solo, siguiendo la cuenta de la última nota. Cámbialo únicamente si el papel trae otro número.",
        `<input id="f-nrodoc" class="mono" value="${esc(base.nroDoc|| numSug)}" placeholder="${esE?"001-000123":"001"}">`)}
      ${esE?campo("f-nrodoc2","N° DE BOLETA O FACTURA","El comprobante que vino junto con la guía. Opcional.",
        `<input id="f-nrodoc2" class="mono" value="${esc(base.nroDoc2||"")}" placeholder="F001-00456">`):""}
      ${campo("f-contra", esE?"PROVEEDOR O DE DÓNDE VIENE":"DESTINO",
        esE?"Quién lo trajo: la ferretería, la empresa, u otra obra.":"A dónde va: la obra misma, otro frente, el taller, el proveedor.",
        `<input id="f-contra" list="dl-${esE?"proveedores":"destinos"}" value="${esc(base.contra||(esE?"":S.meta.cp||""))}" placeholder="${esE?"Aceros Arequipa":"Obra San Francisco"}">`)}
      ${!esE ? "" : campo("f-area","FRENTE O ÁREA DE TRABAJO","En qué parte de la obra se va a usar. Por ejemplo: vaciado de vereda, encofrado, mezcladora.",
        `<input id="f-area" list="dl-areas" value="${esc(base.area||"")}" placeholder="Vaciado de vereda tramo 2">`)}
    </div>

    <div class="corte" style="margin:20px 0"></div>

    <div class="campos">
      ${campo("f-autoriza","AUTORIZA — quién manda a pedir",
        esE?"La persona que ordenó el pedido. Normalmente el maestro de obra, el capataz o el residente."
           :"Solo el residente o el maestro de obra pueden autorizar una salida. <b>No</b> es quien viene a recogerla.",
        `<select id="f-autoriza">${optPersonal(base.autoriza, esE?autorizantes():autorizanSalida())}</select>`)}
      ${esE
        ? campo("f-persona","RECIBIÓ Y DESCARGÓ — quién bajó la carga",
            "La persona de la obra que estuvo presente cuando bajaron el material y lo contó.",
            `<select id="f-persona">${optPersonal(base.persona)}</select>`)
        : campo("f-persona","ENTREGADO A — quién vino a llevárselo",
            "Escribe el nombre de quien se paró en el almacén y se llevó las cosas. Es quien responde si no vuelven. Si ya está en el sistema aparece al escribir; si es nuevo, se crea solo.",
            `<input id="f-persona" list="dl-personas" value="${esc(base.persona?nom(base.persona,""):"")}" placeholder="Nombre y apellido">`)}
      ${campo("f-almacenero","ALMACENERO QUE ATENDIÓ","Quién del almacén hizo el despacho o la recepción.",
        `<input id="f-almacenero" value="${esc(base.almacenero||S.meta.almacenero||"")}">`)}
    </div>

    <div class="campos" style="margin-top:16px">
      ${campo("f-obs","OBSERVACIÓN","Cualquier cosa rara que convenga dejar escrita: faltó una bolsa, llegó mojado, la herramienta salió con la punta doblada.",
        `<textarea id="f-obs" placeholder="Opcional">${esc(base.obs||"")}</textarea>`)}
    </div>
  </div></div>

  <div class="bloque"><h2>2 · LO QUE SE MUEVE</h2><div class="pad">
    <p class="nota" style="margin:0 0 12px">Agrega una fila por cada artículo distinto. Si el mismo vale lleva cemento y clavos, van dos filas.</p>
    <div id="zona-lineas">${lineasHTML(sentido)}</div>
  </div></div>
  ${dl("areas")}${dl("proveedores")}${dl("destinos")}${esE?"":dlPersonas()}`;

  modal(m?("Editar "+(esE?"entrada":"salida")):(esE?"Registrar entrada al almacén":"Registrar salida del almacén"), cuerpo, [
    {t:"Cancelar",clase:"sec",fn:cerrar},
    {t:"Guardar",fn:()=>guardarMov(sentido)}
  ], 920);

  const sel=$("#f-motivo");
  if(sel) sel.onchange=()=>{ const o=(esE?MOT_E:MOT_S).find(x=>x.v===sel.value); if(o) sel.parentNode.querySelector(".ayuda").innerHTML=esc(o.ay); };
  pintaLineas(sentido);
}

function guardarMov(sentido){
  const esE = sentido==="E";
  leerLineas();
  /* Se leen TODOS los campos ahora, antes de cualquier ventana de confirmación:
     la confirmación reemplaza el cuerpo del modal y los campos dejarían de existir. */
  const d = {
    id: leer("f-id"), fecha: leer("f-fecha"), hora: leer("f-hora")||ahora(),
    motivo: leer("f-motivo"), tipoDoc: leer("f-tipodoc"), nroDoc: leer("f-nrodoc").toUpperCase(),
    nroDoc2: leer("f-nrodoc2").toUpperCase(),
    contra: leer("f-contra"), area: leer("f-area"), persona: leer("f-persona"),
    autoriza: leer("f-autoriza"), almacenero: leer("f-almacenero"), obs: leer("f-obs"), ref: leer("f-ref")
  };

  if(!d.fecha) return toast("Falta la fecha.",true);
  if(!d.motivo) return toast("Falta decir el motivo del movimiento.",true);
  if(!d.nroDoc) return toast("Falta el número del documento.",true);
  if(!esE && !d.autoriza) return toast("Falta AUTORIZA: quién mandó a pedir. Sin eso no se despacha.",true);
  if(!esE && !d.persona)  return toast("Falta ENTREGADO A: quién se lo llevó.",true);
  /* en una salida el nombre se escribe a mano: si esa persona todavía no existe, se crea */
  if(!esE && d.persona && !per(d.persona)) d.persona = personaOCrear(d.persona);

  const items = LIN.filter(l=>l.cod && nn(l.cant)>0).map(l=>{
    const o={cod:l.cod, cant:q2(l.cant)};
    if(nn(l.precio)>0) o.precio=q2(l.precio);
    if(esE && nn(l.guia)>0) o.guia=q2(l.guia);
    return o;
  });
  if(!items.length) return toast("Agrega por lo menos un artículo con cantidad.",true);
  const repes = items.map(i=>i.cod).filter((c,i,a)=>a.indexOf(c)!==i);
  if(repes.length) return toast("El artículo "+repes[0]+" está dos veces. Júntalo en una sola fila.",true);

  /* el mismo número de documento no puede usarse dos veces */
  const choque = IX.movs.find(x=>x.id!==d.id && x.sentido===sentido && x.tipoDoc===d.tipoDoc && x.nroDoc===d.nroDoc);
  if(choque) return toast(`El documento ${d.tipoDoc} ${d.nroDoc} ya está registrado el ${fFecha(choque.fecha)}. Un documento, un solo uso.`,true);

  d.items = items;

  if(!esE){
    const faltan = items.filter(l=> q2(saldo(l.cod)-l.cant) < 0);
    if(faltan.length){
      const it=cat(faltan[0].cod);
      confirmar("El saldo va a quedar en negativo",
        `Según el kardex quedan ${fmt(saldo(faltan[0].cod))} ${it?esc(it.uni):""} de ${it?esc(it.desc):esc(faltan[0].cod)} y estás sacando ${fmt(faltan[0].cant)}.<br><br>Puede pasar si todavía falta registrar una entrada. Se guarda igual y queda visible en el cuadre para que lo arregles.`,
        ()=>escribirMov(sentido,d), "Guardar de todos modos");
      return;
    }
  }
  escribirMov(sentido,d);
}

function escribirMov(sentido,d){
  const esE = sentido==="E";
  const mov = {
    id: d.id || uid("mv"), sentido, fecha:d.fecha, hora:d.hora,
    motivo:d.motivo, tipoDoc:d.tipoDoc, nroDoc:d.nroDoc,
    tipoDoc2:d.nroDoc2?"FACTURA/BOLETA":"", nroDoc2:d.nroDoc2||"",
    contra:d.contra, area:d.area, persona:d.persona, autoriza:d.autoriza,
    almacenero:d.almacenero, obs:d.obs, items:d.items
  };
  if(d.ref) mov.ref=d.ref;
  if(REQ_ACTIVO && esE) mov.reqId=REQ_ACTIVO;

  sumaLista("areas", mov.area);
  if(esE) sumaLista("proveedores", mov.contra); else sumaLista("destinos", mov.contra);

  /* si se movió de día al editar, hay que sacarlo del día viejo */
  if(d.id){
    for(const f of diasOrden()){
      const dd=S.dias[f]; const ix=(dd.movs||[]).findIndex(x=>x.id===d.id);
      if(ix>=0){ dd.movs.splice(ix,1); if(f!==mov.fecha) subirDia(f); break; }
    }
  }
  dia(mov.fecha).movs.push(mov);

  if(!esE){
    const n=parseInt(String(mov.nroDoc).replace(/\D/g,""),10);
    if(isFinite(n)){
      if(mov.tipoDoc==="VALE" && n>=nn(S.meta.proxVale)){ S.meta.proxVale=n+1; subir("meta"); }
      if(mov.tipoDoc==="CUA. ALM." && n>=nn(S.meta.proxCua)){ S.meta.proxCua=n+1; subir("meta"); }
    }
  }
  subirDia(mov.fecha);
  if(mov.reqId){
    const r=S.requerimientos.items.find(x=>x.id===mov.reqId);
    if(r){ const a=reqAtendido(r); r.estado = a.ok>=a.t ? "atendido" : "parcial"; subir("requerimientos"); }
  }
  REQ_ACTIVO=null;
  cerrar(); pintar();
  toast((esE?"Entrada":"Salida")+" "+mov.tipoDoc+" "+mov.nroDoc+" registrada.");
}

ACC.movNuevoE = ()=>{ REQ_ACTIVO=null; formMov("E"); };
ACC.movNuevoS = ()=>{ REQ_ACTIVO=null; formMov("S"); };
ACC.movEditar = d=>{ REQ_ACTIVO=null; const m=movPorId(d.id); if(m) formMov(m.sentido,m.id); };
/** Borra movimientos y deja bien numeradas las partes que queden de esa guía. */
function anularMovs(l){
  if(!l.length) return;
  const td=l[0].tipoDoc, nr=l[0].nroDoc, tocado={};
  /* si algo entró como devolución de una salida que se anula, también se va */
  const ids={}; l.forEach(m=>ids[m.id]=1);
  const ligados=IX.movs.filter(x=>x.ref && ids[x.ref] && !ids[x.id]);
  const todos=l.concat(ligados);
  todos.forEach(m=>{ const d=dia(m.fecha); d.movs=d.movs.filter(x=>x.id!==m.id); tocado[m.fecha]=1; });
  indexar();
  regruparGuia(td,nr).forEach(m=>{ tocado[m.fecha]=1; });
  indexar();
  Object.keys(tocado).forEach(f=>subirDia(f));
  pintar();
  toast(td+" "+nr+(todos.length>1?" · "+todos.length+" movimientos anulados":" anulado")
        +(ligados.length?" (también su devolución)":"")+" · el saldo se recalculó solo");
}
ACC.movBorrar = d=>{
  const m=movExige(d.id); if(!m) return;
  const partes=IX.movs.filter(x=>x.sentido===m.sentido && x.tipoDoc===m.tipoDoc && x.nroDoc===m.nroDoc)
                      .sort((a,b)=> a.fecha<b.fecha?-1:1);
  const uds=x=>fmt(cantMov(x));
  if(partes.length>1){
    return modal("Anular "+m.tipoDoc+" "+m.nroDoc, `
      ${expl("Esta guía está partida en "+partes.length+" días",[
        "Se cargó con material que llegó en fechas distintas, así que en el kardex son <b>"+partes.length+" movimientos</b> con el mismo número.",
        "Puedes borrar <b>solo el día</b> que está mal, o <b>toda la guía</b> de una vez.",
        "El saldo se recalcula solo. Esto no se puede deshacer."
      ])}
      <div class="tabla-env"><table class="reg">
        <thead><tr><th>Fecha</th><th class="num">Artículos</th><th class="num">Unidades</th><th></th></tr></thead>
        <tbody>${partes.map(x=>`<tr${x.id===m.id?' style="background:var(--tinta-suave)"':""}>
          <td class="num">${fFecha(x.fecha)}</td><td class="num">${(x.items||[]).length}</td>
          <td class="num">${uds(x)}</td><td>${x.id===m.id?'<span class="et t">el que abriste</span>':""}</td></tr>`).join("")}</tbody>
      </table></div>`,
      [{t:"Cancelar",clase:"sec",fn:cerrar},
       {t:"Solo el "+fFecha(m.fecha),clase:"peligro",fn:()=>{cerrar();anularMovs([m]);}},
       {t:"Toda la guía",clase:"peligro",fn:()=>{cerrar();anularMovs(partes);}}], 720);
  }
  confirmar("Anular este movimiento",
    `Vas a borrar <b>${esc(m.tipoDoc)} ${esc(m.nroDoc)}</b> del ${fFecha(m.fecha)} —
     ${(m.items||[]).length} ${(m.items||[]).length===1?"artículo":"artículos"}, ${uds(m)} unidades.
     El saldo se va a recalcular solo.<br><br>Esto no se puede deshacer.`,
    ()=>anularMovs([m]), "Anular", true);
};
ACC.movVer = d=>{
  const m=movExige(d.id); if(!m) return;
  const esE=m.sentido==="E";
  const tot=importeMov(m);
  modal((esE?"Entrada":"Salida")+" · "+m.tipoDoc+" "+m.nroDoc, `
    <div class="kcab">
      <div class="ident"><span>${esE?"ENTRÓ AL ALMACÉN":"SALIÓ DEL ALMACÉN"}</span><b>${esc(m.tipoDoc)} ${esc(m.nroDoc)}</b><i>${fFecha(m.fecha)} · ${esc(m.hora||"")} · motivo ${esc(m.motivo)}${m.deQ>1?" · parte "+m.parte+" de "+m.deQ+" (la guía trae varias fechas)":""}${m.nroDoc2?" · comprobante "+esc(m.nroDoc2):""}${m.transporte?" · trajo "+esc(m.transporte):""}</i></div>
      <div><span>${esE?"PROVEEDOR / ORIGEN":"DESTINO"}</span><b style="font-size:16px;font-family:var(--f-label)">${esc(m.contra||"—")}</b></div>
      <div><span>${esE?"PUNTO DE LLEGADA":"FRENTE O ÁREA"}</span><b style="font-size:16px;font-family:var(--f-label)">${esc((esE?m.llegada:m.area)||"—")}</b></div>
      <div><span>AUTORIZA · quién mandó a pedir</span><b style="font-size:16px;font-family:var(--f-label)">${esc(nomCargo(m.autoriza))}</b></div>
      <div><span>${esE?"RECIBIÓ Y DESCARGÓ":"ENTREGADO A · quién se lo llevó"}</span><b style="font-size:16px;font-family:var(--f-label)">${esc(nomCargo(m.persona))}</b></div>
    </div>
    <div class="tabla-env"><table class="reg">
      <thead><tr><th>Código</th><th>Artículo</th><th>Und.</th><th class="num">${esE?"Guía":""}</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
      <tbody>${(m.items||[]).map(l=>{ const it=cat(l.cod); const dif=esE&&nn(l.guia)>0&&q2(l.guia)!==q2(l.cant);
        return `<tr><td class="cod">${esc(l.cod)}</td><td>${esc(it?it.desc:"(fuera del catálogo)")}${dif?` <span class="et p">faltó ${fmt(nn(l.guia)-nn(l.cant))}</span>`:""}</td>
        <td class="und">${esc(it?it.uni:"—")}</td>
        <td class="num">${esE?(nn(l.guia)?fmt(l.guia):"—"):""}</td><td class="num">${fmt(l.cant)}</td>
        <td class="num">${nn(l.precio)?soles(l.precio):"—"}</td><td class="num">${nn(l.precio)?soles(nn(l.precio)*nn(l.cant)):"—"}</td></tr>`;}).join("")}</tbody>
      ${tot>0?`<tfoot><tr><th colspan="6" style="text-align:right">Valorizado</th><th class="num">${soles(tot)}</th></tr></tfoot>`:""}
    </table></div>
    ${(function(){ if(m.sentido!=="E") return "";
      const l=IX.movs.filter(x=>x.sentido==="E" && x.tipoDoc===m.tipoDoc && x.nroDoc===m.nroDoc)
                     .sort((a,b)=> a.fecha<b.fecha?-1:1);
      if(l.length<2) return "";
      return `<div class="aviso-caja" style="margin-top:14px"><b>Esta guía está partida en ${l.length} días</b>
        ${l.map(x=>fFecha(x.fecha)+" ("+fmt(cantMov(x))+" unidades)").join(" · ")}.
        Estás viendo la parte del ${fFecha(m.fecha)}. Si en realidad todo entró el mismo día, dale a
        <b>Unir días</b>.</div>`;})()}
    ${m.obs?`<p class="nota"><b>Observación:</b> ${esc(m.obs)}</p>`:""}
    <p class="nota">Atendió: ${esc(m.almacenero||"—")}</p>`,
    [{t:"Anular",clase:"peligro",izq:true,fn:()=>{cerrar();ACC.movBorrar({id:m.id});}},
     {t:"+ Artículo",clase:"sec",fn:()=>{cerrar();ACC.movAdd({id:m.id});}},
     ...(esE && IX.movs.filter(x=>x.sentido==="E"&&x.tipoDoc===m.tipoDoc&&x.nroDoc===m.nroDoc).length>1
         ?[{t:"Unir días",clase:"sec",fn:()=>{cerrar();ACC.unirPartes({id:m.id});}}]:[]),
     ...(esE?[{t:"Juntar otra guía",clase:"sec",fn:()=>{cerrar();ACC.juntarGuias({id:m.id});}}]:[]),
     {t:"Imprimir",clase:"sec",fn:()=>{cerrar();imprimirMov(m.id);}},
     {t:"Editar",clase:"sec",fn:()=>{cerrar();formMov(m.sentido,m.id);}},
     {t:"Cerrar",fn:cerrar}], 880);
};
/* ======================================================================
   TABLERO
   ====================================================================== */
VISTAS.tablero = function(){
  const f=hoy(), d=dia(f);
  const ent=(d.movs||[]).filter(m=>m.sentido==="E"), sal=(d.movs||[]).filter(m=>m.sentido==="S");
  const pr=prestamos(), uds=q2(pr.reduce((s,p)=>s+p.pend,0)), bm=bajoMinimo();
  const sinCat = S.catalogo.items.length===0;

  if(sinCat){
    return expl("Primero hay que levantar el catálogo",[
    ])+`<div class="bloque"><div class="pad" style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="b" data-ir="catalogo">Ir al catálogo</button>
      <button class="b sec" data-ir="ajustes">Descargar la plantilla</button>
    </div></div>`;
  }

  const labores=[
    {k:"apertura", t:"Inventario de apertura", ok:!!d.apertura, ir:"inventario"},
    {k:"movs",     t:"Pasar al sistema los vales y guías del día", ok:(d.movs||[]).length>0, ir:"salidas"},
    {k:"horo",     t:"Horómetro de cada máquina", ok:S.maquinaria.items.filter(m=>m.activo!==false&&m.tipo!=="vehiculo").every(m=>(d.horometro||[]).some(h=>h.maqId===m.id&&h.fin)), ir:"horometro"},
    {k:"prest",    t:"Revisar la herramienta que no ha vuelto", ok:pr.filter(p=>p.diasFuera>=2).length===0, ir:"prestamos"},
    {k:"cierre",   t:"Inventario de cierre", ok:!!d.cierre, ir:"inventario"}
  ];

  return `
  <div class="faltante">
    <div class="cifra ${uds>0?"rojo":""}">${fmt(uds)}</div>
    <div class="qc">
      <b>${uds>0?"unidades fuera del almacén":"nada pendiente de volver"}</b>
      <p>${uds>0?`Herramienta y equipo que salió en préstamo y todavía no regresa. Son ${pr.length} ${pr.length===1?"pendiente":"pendientes"} de ${new Set(pr.map(p=>p.m.persona)).size} ${new Set(pr.map(p=>p.m.persona)).size===1?"persona":"personas"}.`:"Todo lo que salió prestado ya volvió al almacén."}</p>
    </div>
    ${uds>0?`<button class="b" data-ir="prestamos">Ver quién la tiene</button>`:""}
  </div>

  <div class="tarjetas">
    <a data-ir="entradas" class="${ent.length?"ok":""}"><div class="n">${ent.length}</div><div class="l">entradas de hoy</div></a>
    <a data-ir="salidas"><div class="n">${sal.length}</div><div class="l">salidas de hoy</div></a>
    <a data-ir="guias" class="${provisionales().length?"al":""}"><div class="n">${provisionales().length}</div><div class="l">esperando guía de almacén</div></a>
    <a data-ir="catalogo" class="${bm.length?"al":""}"><div class="n">${bm.length}</div><div class="l">artículos en el mínimo</div></a>
    <a data-ir="requerimientos"><div class="n">${S.requerimientos.items.filter(r=>r.estado!=="atendido").length}</div><div class="l">requerimientos abiertos</div></a>
  </div>

  <div class="bloque"><h2>LAS 5 LABORES DE HOY · ${fFecha(f)}</h2>
    <ul class="pasos">${labores.map((l,i)=>`<li class="${l.ok?"hecho":""}">
      <span class="mk">${l.ok?"✓":i+1}</span><span class="tx">${esc(l.t)}</span>
      <span class="der">${l.ok?`<span class="et k">listo</span>`:`<button class="b sec chico" data-ir="${l.ir}">Hacer</button>`}</span></li>`).join("")}</ul>
  </div>

  ${pr.filter(p=>p.diasFuera>=2).length?`<div class="bloque"><h2>NO HA VUELTO EN 2 DÍAS O MÁS<span class="der"><button class="b sec chico" data-ir="prestamos">Ver todo</button></span></h2>
    <div class="tabla-env"><table class="reg"><thead><tr><th>Artículo</th><th>Lo tiene</th><th class="num">Falta</th><th class="num">Días</th></tr></thead>
    <tbody>${pr.filter(p=>p.diasFuera>=2).slice(0,8).map(p=>{const it=cat(p.l.cod);
      return `<tr class="baja"><td class="cod">${esc(p.l.cod)}</td><td>${esc(nom(p.m.persona))}<br><span class="nota">${esc(it?it.desc:"")}</span></td><td class="num">${fmt(p.pend)}</td><td class="num">${p.diasFuera}</td></tr>`;}).join("")}</tbody></table></div>
  </div>`:""}

  ${bm.length?`<div class="bloque"><h2>EN EL MÍNIMO O POR DEBAJO<span class="der"><button class="b sec chico" data-acc="reqDeMinimos">Generar requerimiento</button></span></h2>
    <div class="tabla-env"><table class="reg"><thead><tr><th>Código</th><th>Artículo</th><th class="num">Saldo</th><th class="num">Mínimo</th></tr></thead>
    <tbody>${bm.slice(0,12).map(i=>`<tr class="baja"><td class="cod">${esc(i.cod)}</td><td>${esc(i.desc)}</td><td class="num">${fmt(saldo(i.cod))} ${esc(i.uni)}</td><td class="num">${fmt(i.min)}</td></tr>`).join("")}</tbody></table></div>
  </div>`:""}

  <div class="bloque"><h2>MOVIMIENTOS DE HOY</h2>
    ${(d.movs||[]).length? tablaMovs((d.movs||[]).slice().reverse(), true) : vacio("Hoy todavía no se ha movido nada","Registra la primera entrada o salida cuando pase.",
      `<button class="b" data-acc="movNuevoS">Registrar una salida</button> <button class="b sec" data-acc="movNuevoE">Registrar una entrada</button>`)}
  </div>`;
};

/* ======================================================================
   TABLA DE MOVIMIENTOS reutilizable
   ====================================================================== */
function tablaMovs(l, conSentido){
  if(!l.length) return vacio("No hay movimientos con ese filtro","Prueba cambiando el mes o el motivo.");
  return `<div class="tabla-env"><table class="reg">
    <thead><tr>
      <th>Fecha</th>${conSentido?`<th>E/S</th>`:""}<th>Documento</th><th>Motivo</th>
      <th>Proveedor / destino</th><th>Frente</th><th>Quién</th><th class="num">Ítems</th><th class="num">Cant.</th><th></th>
    </tr></thead><tbody>
    ${l.map(m=>`<tr>
      <td class="num">${fFecha(m.fecha)}<br><span class="nota">${esc(m.hora||"")}</span></td>
      ${conSentido?`<td><span class="et ${m.sentido==="E"?"k":"p"}">${m.sentido==="E"?"ENTRA":"SALE"}</span></td>`:""}
      <td class="cod">${esc(m.tipoDoc)}<br>${esc(m.nroDoc)}</td>
      <td><span class="et n">${esc(m.motivo)}</span></td>
      <td>${esc(m.contra||"—")}</td>
      <td>${esc(m.area||"—")}</td>
      <td>${esc(nom(m.persona))}<br><span class="nota">autoriza: ${esc(nom(m.autoriza))}</span></td>
      <td class="num">${(m.items||[]).length}</td>
      <td class="num">${fmt(cantMov(m))}</td>
      <td class="acc"><button class="b sec chico" data-acc="movVer" data-id="${esc(m.id)}">Ver</button></td>
    </tr>`).join("")}
    </tbody></table></div>`;
}

/* filtros compartidos */
let FIL = {mes:"", motivo:"", txt:""};
function barraFiltros(sentido){
  const meses = Array.from(new Set(IX.movs.filter(m=>m.sentido===sentido).map(m=>mesDe(m.fecha)))).sort().reverse();
  return `<div class="filtros">
    ${campo("fl-mes","MES","",`<select id="fl-mes"><option value="">Todos los meses</option>${meses.map(x=>`<option value="${x}"${FIL.mes===x?" selected":""}>${nomMes(x)}</option>`).join("")}</select>`)}
    ${campo("fl-motivo","MOTIVO","",`<select id="fl-motivo"><option value="">Todos</option>${(sentido==="E"?MOT_E:MOT_S).map(o=>`<option value="${o.v}"${FIL.motivo===o.v?" selected":""}>${o.v}</option>`).join("")}</select>`)}
    ${campo("fl-txt","BUSCAR","",`<input id="fl-txt" value="${esc(FIL.txt)}" placeholder="N° doc, artículo, persona, frente">`)}
  </div>`;
}
function aplicaFiltros(sentido){
  let l=IX.movs.filter(m=>m.sentido===sentido);
  if(FIL.mes) l=l.filter(m=>mesDe(m.fecha)===FIL.mes);
  if(FIL.motivo) l=l.filter(m=>m.motivo===FIL.motivo);
  if(FIL.txt){
    const t=FIL.txt.toUpperCase();
    l=l.filter(m=>{
      if((m.nroDoc||"").toUpperCase().includes(t)) return true;
      if((m.contra||"").toUpperCase().includes(t)) return true;
      if((m.area||"").toUpperCase().includes(t)) return true;
      if(nom(m.persona).toUpperCase().includes(t)) return true;
      if(nom(m.autoriza).toUpperCase().includes(t)) return true;
      return (m.items||[]).some(x=>{ const it=cat(x.cod); return x.cod.toUpperCase().includes(t) || (it&&it.desc.toUpperCase().includes(t)); });
    });
  }
  return l.reverse();
}
function engancha(){
  const ids=["fl-mes","fl-motivo","fl-txt"];
  ids.forEach(id=>{
    const e=$("#"+id); if(!e) return;
    const k=id.slice(3);
    const ev = id==="fl-txt" ? "input" : "change";
    e.addEventListener(ev, ()=>{
      FIL[k]=e.value;
      const c=$("#zona-lista");
      if(c){ c.innerHTML = tablaMovs(aplicaFiltros(vistaActual==="entradas"?"E":"S")); }
      else pintar();
    });
  });
  if(typeof enganchaExtra==="function") enganchaExtra();
}

/* ======================================================================
   ENTRADAS
   ====================================================================== */
VISTAS.entradas = function(){
  const l=aplicaFiltros("E");
  const mes = FIL.mes||mesDe(hoy());
  const delMes = IX.movs.filter(m=>m.sentido==="E" && mesDe(m.fecha)===mes);
  const val = q2(delMes.reduce((s,m)=>s+importeMov(m),0));
  return `
  <div class="bloque">
    <h2>ENTRADAS REGISTRADAS<span class="der">
      <span class="et t">${delMes.length} en ${nomMes(mes)}</span>
      ${val>0?`<span class="et n">${soles(val)}</span>`:""}
      <button class="b sec chico" data-acc="csvMovs" data-s="E">Descargar Excel</button>
      <button class="b chico" data-acc="movNuevoE">+ Nueva entrada</button>
    </span></h2>
    ${barraFiltros("E")}
    <div id="zona-lista">${tablaMovs(l)}</div>
  </div>`;
};

/* ======================================================================
   SALIDAS
   ====================================================================== */
VISTAS.salidas = function(){
  const l=aplicaFiltros("S");
  const mes = FIL.mes||mesDe(hoy());
  const delMes = IX.movs.filter(m=>m.sentido==="S" && mesDe(m.fecha)===mes);
  const conVale = delMes.filter(m=>m.tipoDoc==="NOTA DE SALIDA" || m.tipoDoc==="VALE").length;
  return `
  <div class="bloque">
    <h2>SALIDAS REGISTRADAS<span class="der">
      <span class="et t">${delMes.length} en ${nomMes(mes)}</span>
      <span class="et n">${conVale} con vale</span>
      <button class="b sec chico" data-acc="csvMovs" data-s="S">Descargar Excel</button>
      <button class="b chico" data-acc="movNuevoS">+ Nueva salida</button>
    </span></h2>
    ${barraFiltros("S")}
    <div id="zona-lista">${tablaMovs(l)}</div>
  </div>`;
};

/* ======================================================================
   PRÉSTAMOS
   ====================================================================== */
VISTAS.prestamos = function(){
  const pr=prestamos();
  const porPersona={};
  pr.forEach(p=>{ const k=p.m.persona||"—"; (porPersona[k]=porPersona[k]||[]).push(p); });
  return `
  ${!pr.length ? `<div class="bloque"><div class="pad">${vacio("Nada pendiente","Todo lo que salió prestado ya regresó al almacén.")}</div></div>` :
  Object.keys(porPersona).sort((a,b)=>nom(a)<nom(b)?-1:1).map(k=>{
    const g=porPersona[k];
    return `<div class="bloque"><h2>${esc(nomCargo(k))}<span class="der"><span class="et ${g.some(p=>p.diasFuera>=2)?"p":"n"}">${g.length} ${g.length===1?"pendiente":"pendientes"}</span></span></h2>
      <div class="tabla-env"><table class="reg">
      <thead><tr><th>Código</th><th>Artículo</th><th>Salió con</th><th>Frente</th><th class="num">Falta</th><th class="num">Días</th><th></th></tr></thead>
      <tbody>${g.map(p=>{const it=cat(p.l.cod);
        return `<tr class="${p.diasFuera>=2?"baja":""}">
          <td class="cod">${esc(p.l.cod)}</td>
          <td>${esc(it?it.desc:"—")}<br><span class="nota">salieron ${fmt(p.l.cant)}${p.dev?` · ya volvieron ${fmt(p.dev)}`:""}</span></td>
          <td class="cod">${esc(p.m.tipoDoc)} ${esc(p.m.nroDoc)}<br><span class="nota">${fFecha(p.m.fecha)}</span></td>
          <td>${esc(p.m.area||"—")}</td>
          <td class="num">${fmt(p.pend)} ${esc(it?it.uni:"")}</td>
          <td class="num">${p.diasFuera}</td>
          <td class="acc">
            <button class="b chico" data-acc="devolver" data-id="${esc(p.m.id)}" data-cod="${esc(p.l.cod)}" data-pend="${p.pend}">Devolver</button>
            <button class="b sec chico" data-acc="perder" data-id="${esc(p.m.id)}" data-cod="${esc(p.l.cod)}" data-pend="${p.pend}">Perdida</button>
          </td></tr>`;}).join("")}</tbody></table></div></div>`;
  }).join("")}`;
};

ACC.devolver = d=>{
  const m=movPorId(d.id), it=cat(d.cod); if(!m) return;
  modal("Registrar devolución", `
    ${expl("Qué se va a guardar",[
      `Una <b>entrada</b> al almacén con motivo DEVOLUCIÓN que cierra el préstamo ${esc(m.tipoDoc)} ${esc(m.nroDoc)}.`,
      "El saldo del artículo sube automáticamente por la cantidad que vuelve."
    ])}
    <div class="campos">
      ${campo("dv-cant","CUÁNTO VOLVIÓ",`Salieron ${fmt(d.pend)} ${esc(it?it.uni:"")} y todavía no vuelven.`,
        `<input id="dv-cant" class="mono" inputmode="decimal" value="${esc(d.pend)}">`)}
      ${campo("dv-fecha","FECHA EN QUE VOLVIÓ","",`<input type="date" id="dv-fecha" value="${hoy()}">`)}
      ${campo("dv-hora","HORA","",`<input type="time" id="dv-hora" value="${ahora()}">`)}
      ${campo("dv-estado","EN QUÉ ESTADO VOLVIÓ","Si volvió dañada, déjalo escrito: sirve para el descuento o el reclamo.",
        `<select id="dv-estado">${opts(["Bueno","Observado","Dañado"],"Bueno",false)}</select>`)}
      ${campo("dv-obs","OBSERVACIÓN","",`<input id="dv-obs" placeholder="Opcional">`)}
    </div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Guardar devolución",fn:()=>{
      const c=leerN("dv-cant"), f=leer("dv-fecha");
      if(c<=0) return toast("Escribe cuánto volvió.",true);
      if(c>nn(d.pend)+0.001) return toast("Estás devolviendo más de lo que falta.",true);
      const est=leer("dv-estado");
      const mov={ id:uid("mv"), sentido:"E", fecha:f, hora:leer("dv-hora")||ahora(),
        motivo:"DEVOLUCION", tipoDoc:"GUÍA DE ALMACÉN", nroDoc:"DEV-"+String(m.nroDoc).replace(/\s/g,""),
        contra:nom(m.persona), area:m.area||"", persona:m.persona, autoriza:m.autoriza,
        almacenero:S.meta.almacenero||"", ref:m.id,
        obs:("Devolución de "+m.tipoDoc+" "+m.nroDoc+" · estado "+est+(leer("dv-obs")?" · "+leer("dv-obs"):"")),
        items:[{cod:d.cod, cant:q2(c), estado:est}] };
      dia(f).movs.push(mov); subirDia(f); cerrar(); pintar();
      toast("Devolución registrada. El saldo ya subió.");
    }}], 720);
};
ACC.perder = d=>{
  const m=movPorId(d.id), it=cat(d.cod); if(!m) return;
  modal("Dar por perdida", `
    ${expl("Cuidado con esto",[
      "Cierra el pendiente pero <b>no</b> devuelve el saldo, porque la herramienta ya no está en el almacén.",
      "Queda anotado en el préstamo original quién la tenía. Sirve para el descuento o el acta."
    ])}
    <div class="campos">
      ${campo("pd-cant","CUÁNTAS SE PERDIERON",`Faltan ${fmt(d.pend)} ${esc(it?it.uni:"")}.`,`<input id="pd-cant" class="mono" inputmode="decimal" value="${esc(d.pend)}">`)}
      ${campo("pd-obs","QUÉ PASÓ","Déjalo claro: se perdió, se rompió, se la llevaron.",`<input id="pd-obs" placeholder="Ej.: se rompió el mango en el vaciado">`)}
    </div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Dar por perdida",clase:"peligro",fn:()=>{
      const c=leerN("pd-cant"); if(c<=0) return toast("Escribe la cantidad.",true);
      const l=(m.items||[]).find(x=>x.cod===d.cod); if(!l) return;
      l.perdido=q2(nn(l.perdido)+c);
      l.notaPerdida=(l.notaPerdida?l.notaPerdida+" | ":"")+(leer("pd-obs")||"sin detalle")+" ("+hoy()+")";
      subirDia(m.fecha); cerrar(); pintar(); toast("Anotado como perdida.");
    }}], 660);
};
/* ======================================================================
   STOCK — el resumen de todos los artículos
   saldo = saldo inicial + entradas − salidas
   ====================================================================== */
let FST = {clasif:"", txt:"", solo:"", alm:""};

VISTAS.stock = function(){
  let l=S.catalogo.items.filter(i=>i.activo!==false);
  if(FST.alm) l=l.filter(i=>FST.alm==="__" ? !almDe(i) : almDe(i)===FST.alm);
  if(FST.clasif) l=l.filter(i=>i.clasif===FST.clasif);
  if(FST.txt){ const t=FST.txt.toUpperCase(); l=l.filter(i=>String(i.cod).toUpperCase().includes(t)||String(i.desc).toUpperCase().includes(t)); }
  const fu=fueraMapa();
  if(FST.solo==="min") l=l.filter(i=>nn(i.min)>0 && saldo(i.cod)<=nn(i.min));
  if(FST.solo==="cero") l=l.filter(i=>saldo(i.cod)<=0);
  if(FST.solo==="fuera") l=l.filter(i=>nn(fu[i.cod])>0);
  l.sort((a,b)=> String(a.cod)<String(b.cod)?-1:1);

  const val = q2(l.reduce((s,i)=>s+saldo(i.cod)*nn(i.precio),0));
  const clasifs = Array.from(new Set(S.catalogo.items.map(i=>i.clasif).filter(Boolean))).sort();
  /* cuánto hay en cada piso, que es lo que pregunta el encargado */
  const porAlm = almacenes().concat([""]).map(a=>{
    const g=S.catalogo.items.filter(i=>i.activo!==false && almDe(i)===a);
    return {a, n:g.length, val:q2(g.reduce((x,i)=>x+saldo(i.cod)*nn(i.precio),0))};
  }).filter(x=>x.n>0);

  return `
  ${porAlm.length>1?`<div class="kcab">${porAlm.map(x=>
    `<div><span>${x.a?esc(x.a):"SIN ALMACÉN ASIGNADO"}</span><b${x.a?"":' class="rojo"'}>${x.n}</b>
      <i>artículos${x.val?" · "+soles(x.val):""}</i></div>`).join("")}</div>`:""}
  <div class="bloque">
    <h2>SALDO DE ALMACÉN<span class="der">
      <span class="et t">${l.length} artículos</span>
      ${val>0?`<span class="et n">valorizado ${soles(val)}</span>`:""}
      <button class="b sec chico" data-acc="csvStock">Descargar Excel</button>
      <button class="b sec chico" data-acc="impStock">Imprimir</button>
    </span></h2>
    <div class="filtros">
      ${campo("fs-alm","ALMACÉN","",`<select id="fs-alm"><option value="">Todos los almacenes</option>${almacenes().map(a=>`<option value="${esc(a)}"${FST.alm===a?" selected":""}>${esc(a)}</option>`).join("")}<option value="__"${FST.alm==="__"?" selected":""}>— sin asignar —</option></select>`)}
      ${campo("fs-clasif","FAMILIA","",`<select id="fs-clasif"><option value="">Todas</option>${clasifs.map(c=>`<option value="${esc(c)}"${FST.clasif===c?" selected":""}>${esc(c)}</option>`).join("")}</select>`)}
      ${campo("fs-solo","VER SOLO","",`<select id="fs-solo">${opts([{v:"",t:"Todos"},{v:"min",t:"En el mínimo o menos"},{v:"cero",t:"Sin saldo"},{v:"fuera",t:"Con algo prestado"}],FST.solo,false)}</select>`)}
      ${campo("fs-txt","BUSCAR","",`<input id="fs-txt" value="${esc(FST.txt)}" placeholder="Código o descripción">`)}
    </div>
    ${!l.length?vacio("No hay artículos con ese filtro","") : `<div class="tabla-env"><table class="reg">
      <thead><tr>
        <th>Código</th><th>Artículo</th><th>Und.</th><th>Almacén</th><th>Familia</th>
        <th class="num">Inicial</th><th class="num">Entradas</th><th class="num">Salidas</th>
        <th class="num">Saldo</th><th class="num">Fuera</th><th class="num">Mínimo</th><th></th>
      </tr></thead><tbody>
      ${l.map(i=>{ const s=saldo(i.cod), bajo=nn(i.min)>0&&s<=nn(i.min);
        return `<tr class="${bajo?"baja":""}">
        <td class="cod">${esc(i.cod)}</td>
        <td>${esc(i.desc)}${nn(i.precio)?`<br><span class="nota">${soles(i.precio)} c/u</span>`:""}</td>
        <td>${esc(i.uni)}</td>
        <td>${almDe(i)?`<span class="et n">${esc(almDe(i))}</span>`:`<span class="et p">falta</span>`}</td>
        <td><span class="nota">${esc(i.clasif||"—")}</span></td>
        <td class="num">${fmt(i.inicial)}</td>
        <td class="num">${fmt(totIng(i.cod))}</td>
        <td class="num">${fmt(totSal(i.cod))}</td>
        <td class="num" style="font-weight:700;font-size:16.5px">${fmt(s)}</td>
        <td class="num">${nn(fu[i.cod])?fmt(fu[i.cod]):"—"}</td>
        <td class="num">${nn(i.min)?fmt(i.min):"—"}</td>
        <td class="acc"><button class="b sec chico" data-acc="verKardex" data-cod="${esc(i.cod)}">Kardex</button></td>
      </tr>`;}).join("")}
      </tbody></table></div>`}
  </div>`;
};
ACC.verKardex = d=>{ KX.cod=d.cod; KX.mes=""; ir("kardex"); };

/* ======================================================================
   KARDEX — la historia de un solo artículo
   ====================================================================== */
let KX = {cod:"", mes:""};

VISTAS.kardex = function(){
  const meses = Array.from(new Set(IX.movs.map(m=>mesDe(m.fecha)))).sort().reverse();
  const sel = `<div class="bloque"><h2>ELIGE EL ARTÍCULO</h2><div class="pad">
    <div class="campos">
      ${campo("kx-cod","ARTÍCULO","Escribe parte del nombre o el código y la lista se va achicando sola.",comboArt("#kx-cod", KX.cod))}
      ${campo("kx-mes","PERIODO","Déjalo en «Todo» para ver la historia completa desde que abrió el almacén.",
        `<select id="kx-mes"><option value="">Todo el kardex</option>${meses.map(x=>`<option value="${x}"${KX.mes===x?" selected":""}>${nomMes(x)}</option>`).join("")}</select>`)}
    </div>
  </div></div>`;

  if(!KX.cod) return expl("Kardex de un artículo",[
    
  ])+sel;

  const it=cat(KX.cod);
  if(!it) return sel+vacio("Ese código ya no está en el catálogo","");

  const desde = KX.mes ? KX.mes+"-01" : "";
  const hasta = KX.mes ? KX.mes+"-31" : "";
  const arranque = desde ? saldoAntes(KX.cod, desde) : nn(it.inicial);
  const mv = movsItem(KX.cod, desde, hasta);
  let s = arranque, ing=0, sal=0;
  const filas = mv.map(({m,l})=>{
    const e = m.sentido==="E" ? nn(l.cant) : 0, x = m.sentido==="S" ? nn(l.cant) : 0;
    ing+=e; sal+=x; s = q2(s+e-x);
    return `<tr>
      <td class="num">${fFecha(m.fecha)}</td>
      <td><span class="et ${m.sentido==="E"?"k":"p"}">${m.sentido==="E"?"ENTRA":"SALE"}</span></td>
      <td class="cod">${esc(m.tipoDoc)} ${esc(m.nroDoc)}</td>
      <td><span class="et n">${esc(m.motivo)}</span></td>
      <td>${esc(m.contra||"—")}</td>
      <td>${esc(m.area||"—")}</td>
      <td>${esc(nom(m.persona))}<br><span class="nota">autoriza: ${esc(nom(m.autoriza))}</span></td>
      <td class="num">${e?fmt(e):""}</td>
      <td class="num">${x?fmt(x):""}</td>
      <td class="num" style="font-weight:700">${fmt(s)}</td>
      <td class="acc"><button class="b sec chico" data-acc="movVer" data-id="${esc(m.id)}">Ver</button></td>
    </tr>`;
  }).join("");

  const fu=fueraMapa()[KX.cod]||0;
  const cuadra = q2(s)===q2(saldo(KX.cod)) || !!KX.mes;

  return sel+`
  <div class="kcab">
    <div class="ident"><span>ARTÍCULO</span><b>${esc(it.cod)} · ${esc(it.desc)}</b><i>${esc(it.uni)} · ${esc(it.clasif||"sin familia")} · ${KX.mes?nomMes(KX.mes):"kardex completo"}</i></div>
    <div><span>SALDO AL EMPEZAR</span><b>${fmt(arranque)}</b><i>${KX.mes?"al cerrar el mes anterior":"saldo inicial del almacén"}</i></div>
    <div><span>TOTAL INGRESADO</span><b class="verde">${fmt(ing)}</b><i>${mv.filter(x=>x.m.sentido==="E").length} entradas</i></div>
    <div><span>TOTAL SALIDA</span><b class="rojo">${fmt(sal)}</b><i>${mv.filter(x=>x.m.sentido==="S").length} salidas</i></div>
    <div><span>SALDO ACTUAL</span><b class="azul">${fmt(s)}</b><i>${esc(it.uni)} en el almacén</i></div>
    ${fu?`<div><span>PRESTADO SIN VOLVER</span><b class="rojo">${fmt(fu)}</b><i>ya está restado del saldo</i></div>`:""}
  </div>
  ${!cuadra?`<div class="aviso-caja rojo"><b>El saldo corrido no coincide con el saldo del stock</b>Debería dar ${fmt(saldo(KX.cod))} y el corrido da ${fmt(s)}. Revisa si hay un movimiento con fecha fuera de rango.</div>`:""}
  <div class="bloque">
    <h2>MOVIMIENTO POR MOVIMIENTO<span class="der">
      <button class="b sec chico" data-acc="csvKardex">Descargar Excel</button>
      <button class="b sec chico" data-acc="impKardex">Imprimir</button>
    </span></h2>
    ${!mv.length ? vacio("Este artículo no tiene movimientos en el periodo","Prueba con «Todo el kardex».") :
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>Fecha</th><th>E/S</th><th>Documento</th><th>Motivo</th><th>Proveedor / destino</th><th>Frente</th><th>Quién</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Saldo</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`}
  </div>`;
};

function enganchaExtra(){
  engancharCombos(document);
  const k1=$("#kx-cod"); if(k1) k1.onchange=()=>{ KX.cod=k1.value; pintar(); };
  const k2=$("#kx-mes"); if(k2) k2.onchange=()=>{ KX.mes=k2.value; pintar(); };
  const a=$("#fs-clasif"); if(a) a.onchange=()=>{ FST.clasif=a.value; pintar(); };
  const b=$("#fs-solo");   if(b) b.onchange=()=>{ FST.solo=b.value; pintar(); };
  const ba=$("#fs-alm");   if(ba) ba.onchange=()=>{ FST.alm=ba.value; pintar(); };
  const c=$("#fs-txt");    if(c) c.oninput=()=>{ FST.txt=c.value; pintar(); };
  const d1=$("#dr-mes");   if(d1) d1.onchange=()=>{ DR.mes=d1.value; pintar(); };
  const d2=$("#dr-clasif");if(d2) d2.onchange=()=>{ DR.clasif=d2.value; pintar(); };
  const d4=$("#dr-alm");   if(d4) d4.onchange=()=>{ DR.alm=d4.value; pintar(); };
  const d3=$("#dr-solo");  if(d3) d3.onchange=()=>{ DR.solo=d3.checked; pintar(); };
  const r1=$("#rp-mes");   if(r1) r1.onchange=()=>{ RP.mes=r1.value; pintar(); };
  const i1=$("#iv-fecha"); if(i1) i1.onchange=()=>{ IV.fecha=i1.value; pintar(); };
  const h1=$("#ho-fecha"); if(h1) h1.onchange=()=>{ HO.fecha=h1.value; pintar(); };
  const e1=$("#fc-clasif"); if(e1) e1.onchange=()=>{ FC.clasif=e1.value; pintar(); };
  const e2=$("#fc-txt");    if(e2) e2.oninput=()=>{ FC.txt=e2.value; pintar(); };
  $$(".cnt-in").forEach(e=> e.onchange=()=>guardarConteo(e.dataset.cod, e.value));
  if(vistaActual==="conteo") engancharConteo();
  const v1=$("#vl-lineas"); if(v1) v1.onchange=()=>fijarVale("lineas",v1.value);
  const v2=$("#vl-dev");    if(v2) v2.onchange=()=>fijarVale("devolucion",v2.checked);
  const v3=$("#vl-mar");    if(v3) v3.onchange=()=>fijarVale("marcas",v3.checked);
  $$("input[name=vh]").forEach(e=> e.onchange=()=>{ VALE_HOJA=e.value; pintar();
    toast(e.value==="vale"?"Se imprimirá en página de 15 × 15 cm.":"Se imprimirá centrado en hoja A4."); });
  if(typeof enganchaGuias==="function") enganchaGuias();
}
/* ======================================================================
   CONTROL DIARIO — la matriz del mes
   Filas: cada artículo, con una fila de entradas y otra de salidas.
   Columnas: cada día del mes, más los totales, el conteo físico y la diferencia.
   ====================================================================== */
let DR = {mes:"", clasif:"", solo:true, alm:""};

const diasDelMes = ym => { const [a,m]=ym.split("-").map(Number); return new Date(a,m,0).getDate(); };
const fechaDM = (ym,d)=> ym+"-"+String(d).padStart(2,"0");
const dowDM = (ym,d)=> new Date(ym+"-"+String(d).padStart(2,"0")+"T00:00").getDay();

function conteoMes(ym){ if(!S.conteos.mes[ym]) S.conteos.mes[ym]={}; return S.conteos.mes[ym]; }
function guardarConteo(cod,val){
  const ym=DR.mes||mesDe(hoy()); const c=conteoMes(ym);
  if(String(val).trim()==="") delete c[cod]; else c[cod]={c:q2(val), f:hoy()};
  subir("conteos"); pintar();
}
ACC.obsConteo = d=>{
  const ym=DR.mes||mesDe(hoy()); const c=conteoMes(ym); const it=cat(d.cod);
  modal("Observación del conteo", `
    ${expl("Para qué sirve",[
      "Aquí se escribe por qué el conteo no cuadra con el saldo: se mojó, se rompió, se prestó sin vale, sobró de un vaciado.",
      "Esta columna es la que después defiende el inventario frente al residente o la supervisión."
    ])}
    <div class="campos">${campo("co-obs","OBSERVACIÓN","", `<textarea id="co-obs" placeholder="Ej.: faltan 2 bls, se reventaron al descargar">${esc((c[d.cod]||{}).o||"")}</textarea>`)}</div>
    <p class="nota">${esc(it?it.cod+" · "+it.desc:d.cod)}</p>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Guardar",fn:()=>{
      if(!c[d.cod]) c[d.cod]={c:"",f:hoy()};
      c[d.cod].o=leer("co-obs"); subir("conteos"); cerrar(); pintar(); toast("Observación guardada.");
    }}],680);
};

function datosMatriz(ym){
  const nd=diasDelMes(ym), desde=fechaDM(ym,1), hasta=fechaDM(ym,nd);
  let items=S.catalogo.items.filter(i=>i.activo!==false);
  if(DR.alm) items=items.filter(i=> DR.alm==="__" ? !almDe(i) : almDe(i)===DR.alm);
  if(DR.clasif) items=items.filter(i=>i.clasif===DR.clasif);
  const cel={};
  movsRango(desde,hasta).forEach(m=>{
    const d=parseInt(m.fecha.slice(8,10),10);
    (m.items||[]).forEach(l=>{
      const k=l.cod+"|"+m.sentido+"|"+d;
      cel[k]=(cel[k]||0)+nn(l.cant);
    });
  });
  const conMov=new Set(); Object.keys(cel).forEach(k=>conMov.add(k.split("|")[0]));
  if(DR.solo) items=items.filter(i=>conMov.has(i.cod));
  items.sort((a,b)=>String(a.cod)<String(b.cod)?-1:1);
  return {nd,items,cel,desde,hasta};
}

VISTAS.diario = function(){
  const ym = DR.mes || mesDe(hoy());
  const meses = Array.from(new Set(IX.movs.map(m=>mesDe(m.fecha)).concat([mesDe(hoy())]))).sort().reverse();
  const clasifs = Array.from(new Set(S.catalogo.items.map(i=>i.clasif).filter(Boolean))).sort();
  const {nd,items,cel} = datosMatriz(ym);
  const cnt = conteoMes(ym);

  const cab1=[], cab2=[];
  for(let d=1;d<=nd;d++){
    const w=dowDM(ym,d), dom=w===0;
    cab1.push(`<th class="${dom?"dom":""}">${d}</th>`);
    cab2.push(`<th class="${dom?"dom":""}">${DSEM[w]}</th>`);
  }

  let tIng=0,tSal=0,desc=0;
  const filas = items.map(i=>{
    const arr = saldoAntes(i.cod, fechaDM(ym,1));
    let ing=0,sal=0;
    const cE=[], cS=[];
    for(let d=1;d<=nd;d++){
      const w=dowDM(ym,d), dom=w===0?" dom":"";
      const e=nn(cel[i.cod+"|E|"+d]), x=nn(cel[i.cod+"|S|"+d]);
      ing+=e; sal+=x;
      cE.push(`<td class="v${e?" hay":""}${dom}">${e?fmt(e):"·"}</td>`);
      cS.push(`<td class="v${x?" hay":""}${dom}">${x?fmt(x):"·"}</td>`);
    }
    tIng+=ing; tSal+=sal;
    const fin = q2(arr+ing-sal);
    const co = cnt[i.cod];
    const tieneC = co && co.c!=="" && co.c!=null;
    const dif = tieneC ? q2(nn(co.c)-fin) : null;
    if(dif!==null && dif!==0) desc++;
    return `<tr class="rE">
      <td class="fija cd" rowspan="2">${esc(i.cod)}</td>
      <td class="fija2 ds" rowspan="2" style="left:78px">${esc(i.desc)}</td>
      <td class="fija2 und" rowspan="2" style="left:308px;font-size:12px">${esc(i.uni)}</td>
      <td class="es">ENT</td>
      <td class="v tot" rowspan="2" style="background:var(--papel-3)">${fmt(arr)}</td>
      ${cE.join("")}
      <td class="tot">${fmt(ing)}</td>
      <td class="tot" rowspan="2">${fmt(sal)}</td>
      <td class="sal" rowspan="2">${fmt(fin)}</td>
      <td class="cnt" rowspan="2"><input class="cnt-in" data-cod="${esc(i.cod)}" inputmode="decimal" value="${tieneC?esc(co.c):""}" placeholder="—" aria-label="Conteo real de ${esc(i.cod)}"></td>
      <td class="dif ${dif===null?"":(dif===0?"ok":"mal")}" rowspan="2">${dif===null?"—":(dif===0?"OK":(dif>0?"+":"")+fmt(dif))}</td>
      <td class="ob" rowspan="2"><button class="txt" style="font-size:12.5px" data-acc="obsConteo" data-cod="${esc(i.cod)}">${co&&co.o?esc(co.o):"anotar"}</button></td>
    </tr>
    <tr class="rS"><td class="es">SAL</td>${cS.join("")}<td class="tot">${fmt(sal)}</td></tr>`;
  }).join("");

  const av=avanceConteo(ym);

  return `

  ${av.length?`<div class="tarjetas">
    ${av.map(x=>{ const falta=x.total-x.contados, listo=falta===0;
      return `<a class="${listo?"ok":(x.dif?"al":"")}" data-acc="hojaConteo">
        <div class="n">${x.contados}<span style="font-size:17px;color:var(--texto-2)"> de ${x.total}</span></div>
        <div class="l">${esc(x.alm?x.alm:"sin almacén asignado")} · ${listo?"contado entero":"faltan "+falta}${x.dif?" · "+x.dif+" con diferencia":""}</div></a>`;}).join("")}
  </div>`:""}
  <div class="bloque">
    <h2>CONTROL DIARIO · ${nomMes(ym).toUpperCase()}<span class="der">
      <span class="et k">entró ${fmt(tIng)}</span>
      <span class="et p">salió ${fmt(tSal)}</span>
      ${desc?`<span class="et p">${desc} ${desc===1?"descuadre":"descuadres"}</span>`:`<span class="et n">sin descuadres</span>`}
      <button class="b chico" data-ir="conteo">Contar almacén</button>
      <button class="b sec chico" data-acc="hojaConteo">Hoja en papel</button>
      <button class="b sec chico" data-acc="csvDiario">Descargar Excel</button>
      <button class="b sec chico" data-acc="impDiario">Imprimir</button>
    </span></h2>
    <div class="filtros">
      ${campo("dr-mes","MES","",`<select id="dr-mes">${meses.map(x=>`<option value="${x}"${ym===x?" selected":""}>${nomMes(x)}</option>`).join("")}</select>`)}
      ${campo("dr-alm","ALMACÉN","",`<select id="dr-alm"><option value="">Los dos pisos</option>${almacenes().map(a=>`<option value="${esc(a)}"${DR.alm===a?" selected":""}>${esc(a)}</option>`).join("")}<option value="__"${DR.alm==="__"?" selected":""}>— sin asignar —</option></select>`)}
      ${campo("dr-clasif","FAMILIA","",`<select id="dr-clasif"><option value="">Todas</option>${clasifs.map(c=>`<option value="${esc(c)}"${DR.clasif===c?" selected":""}>${esc(c)}</option>`).join("")}</select>`)}
      <div class="campo" style="min-width:auto"><label>&nbsp;</label><label class="dupla"><input type="checkbox" id="dr-solo"${DR.solo?" checked":""}> Solo los que se movieron este mes</label></div>
    </div>
    ${!items.length ? vacio("Ningún artículo se movió en "+nomMes(ym), DR.solo?"Desmarca la casilla para ver todo el catálogo.":"") :
    `<div class="mz-env"><table class="mz">
      <thead>
        <tr><th class="fija">COD</th><th class="fija2" style="left:78px">ARTÍCULO</th><th class="fija2 und" style="left:308px">UND</th><th>E/S</th><th>SALDO<br>INI</th>${cab1.join("")}<th>ENTRA</th><th>SALE</th><th>SALDO</th><th>CONTEO<br>REAL</th><th>DIF</th><th>OBSERVACIÓN</th></tr>
        <tr class="d2"><th class="fija"></th><th class="fija2" style="left:78px"></th><th class="fija2 und" style="left:308px"></th><th></th><th></th>${cab2.join("")}<th></th><th></th><th></th><th></th><th></th><th></th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table></div>
    <div class="mz-leyenda">
      <span><b>·</b> ese día no hubo movimiento</span>
      <span><b>DIF en rojo</b> el conteo no cuadra con el saldo</span>
      <span><b>${items.length}</b> artículos en el cuadro</span>
    </div>`}
  </div>`;
};
/* ======================================================================
   CONTAR EL ALMACÉN
   Una pantalla sola para hacer el inventario, porque contar no se parece
   a nada más del sistema: se camina un piso, se recorre estante por
   estante, se anota lo que hay, y lo que no está en la lista se crea ahí
   mismo sin salir. Al final el sistema ajusta el saldo y saca el acta.
   Los números se guardan en el mismo sitio que Control diario, así que
   las dos pantallas muestran siempre lo mismo.
   ====================================================================== */
let CT = {alm:"", ym:"", txt:"", soloFalta:false};

function guardarConteoEn(ym,cod,val,callado){
  const c=conteoMes(ym);
  if(String(val).trim()==="") delete c[cod];
  else { const a=c[cod]||{}; a.c=q2(val); a.f=hoy(); c[cod]=a; }
  subir("conteos");
  if(!callado) pintar();
}
const conteoDe = (ym,cod)=>{ const x=conteoMes(ym)[cod]; return (x && x.c!=="" && x.c!=null) ? x : null; };
const difDe = (ym,cod)=>{ const x=conteoDe(ym,cod); return x ? q2(nn(x.c)-saldo(cod)) : null; };

/** Lo que hay que contar en un piso, ya agrupado por estante y filtrado. */
function loQueFalta(ym,alm,txt,soloFalta){
  let l=itemsDeAlmacen(alm);
  if(soloFalta) l=l.filter(i=>!conteoDe(ym,i.cod));
  if(txt){ const t=txt.toUpperCase();
    l=l.filter(i=>String(i.cod).toUpperCase().includes(t)||String(i.desc).toUpperCase().includes(t)); }
  const g=[];
  l.forEach(i=>{ const e=estanteDe(i.cod); let u=g[g.length-1];
    if(!u||u.est!==e){ u={est:e,items:[]}; g.push(u); } u.items.push(i); });
  return {grupos:g, total:l.length};
}

VISTAS.conteo = function(){
  const ym = CT.ym || mesDe(hoy());
  const meses = Array.from(new Set(IX.movs.map(m=>mesDe(m.fecha)).concat([mesDe(hoy())]))).sort().reverse();

  /* ---------- todavía no eligió piso: la pantalla de arranque ---------- */
  if(!CT.alm){
    const av=avanceConteo(ym);
    return `
    <div class="bloque"><h2>DE QUÉ MES ES ESTE CONTEO</h2><div class="pad">
      <div class="campos"><div class="campo" style="max-width:280px"><label for="ct-mes">MES</label>
        <select id="ct-mes">${opts(meses.map(x=>({v:x,t:nomMes(x)})),ym,false)}</select>
        <span class="ayuda">Normalmente el mes en curso. Los conteos quedan guardados por mes.</span></div></div>
    </div></div>

    ${(function(){ const ac=actasDelMes(ym); if(!ac.length) return "";
      return `<div class="bloque"><h2>ACTAS DE ESTE MES</h2>
        <p class="nota" style="padding:12px 18px 0;margin:0">Cada vez que ajustas un piso queda un acta. Acá la vuelves a imprimir cuando la necesites.</p>
        <div class="tabla-env"><table class="reg">
          <thead><tr><th>N° de acta</th><th>Fecha</th><th>Almacén</th><th>Contó</th><th class="num">Artículos</th><th></th></tr></thead>
          <tbody>${ac.map(a=>`<tr><td class="cod">${esc(a.nro)}</td><td class="num">${fFecha(a.fecha)}</td>
            <td>${esc(nomAlm(a.alm))}</td><td>${esc(nom(a.persona))}</td>
            <td class="num">${a.partes.reduce((n,m)=>n+(m.items||[]).length,0)}</td>
            <td class="acc"><button class="b sec chico" data-acc="verActa" data-n="${esc(a.nro)}">Imprimir</button></td></tr>`).join("")}</tbody>
        </table></div></div>`;})()}

    ${!av.length ? vacio("Todavía no hay nada que contar","Primero carga artículos al catálogo o sube unas guías.") :
    `<div class="bloque"><h2>POR DÓNDE EMPIEZAS</h2>
      <div class="pad"><div class="pisos">
      ${av.map(x=>{ const falta=x.total-x.contados, listo=falta===0;
        return `<div class="piso ${listo?"ok":(x.contados?"medio":"")}">
          <b>${esc(x.alm||"Sin almacén asignado")}</b>
          <div class="barra-c"><i style="width:${x.total?Math.round(x.contados/x.total*100):0}%"></i></div>
          <span>${x.contados} de ${x.total} contados${x.dif?" · "+x.dif+" con diferencia":""}</span>
          <div class="pbtn">
            <button class="b" data-acc="ctEmpezar" data-a="${esc(x.alm||"__")}">${x.contados?"Seguir contando":"Empezar a contar"}</button>
            <button class="b sec chico" data-acc="hojaConteo">Llevarlo en papel</button>
          </div></div>`;}).join("")}
      </div></div></div>`}`;
  }

  /* ---------- contando ---------- */
  const {grupos,total}=loQueFalta(ym,CT.alm,CT.txt,CT.soloFalta);
  const todos=itemsDeAlmacen(CT.alm);
  const hechos=todos.filter(i=>conteoDe(ym,i.cod)).length;
  const difs=todos.filter(i=>{ const d=difDe(ym,i.cod); return d!==null && d!==0; }).length;
  const pct = todos.length?Math.round(hechos/todos.length*100):0;

  return `
  <div class="ct-cab">
    <div class="ct-i">
      <span class="pe">CONTANDO</span>
      <b>${esc(nomAlm(CT.alm))}</b>
      <i>${nomMes(ym)}</i>
    </div>
    <div class="ct-i">
      <span class="pe">AVANCE</span>
      <b class="cif" id="ct-av">${hechos} de ${todos.length}</b>
      <div class="barra-c"><i id="ct-barra" style="width:${pct}%"></i></div>
    </div>
    <div class="ct-i">
      <span class="pe">DIFERENCIAS</span>
      <b class="cif ${difs?"rojo":""}" id="ct-dif">${difs}</b>
      <i>${difs?"hay que ajustar":"todo cuadra"}</i>
    </div>
    <div class="ct-i der">
      <button class="b" data-acc="ctNuevo">+ No está en la lista</button>
      <button class="b sec" data-acc="ctTerminar">Terminar el conteo</button>
      <button class="b sec chico" data-acc="ctSalir">Cambiar de piso</button>
    </div>
  </div>

  <div class="bloque">
    <h2>${esc(nomAlm(CT.alm))}<span class="der">
      <span class="et n">${total} en esta lista</span>
      <button class="b sec chico" data-acc="hojaConteo">Hoja en papel</button>
    </span></h2>
    <div class="filtros">
      ${campo("ct-txt","BUSCAR","Por código o por nombre.",`<input id="ct-txt" value="${esc(CT.txt)}" placeholder="cemento">`)}
      <div class="campo" style="min-width:auto"><label>&nbsp;</label>
        <label class="dupla"><input type="checkbox" id="ct-falta"${CT.soloFalta?" checked":""}> Solo los que me faltan</label></div>
    </div>
    ${!total ? vacio(CT.soloFalta?"Ya contaste todo este piso":"Nada coincide con la búsqueda",
        CT.soloFalta?"Dale a Terminar el conteo para ver las diferencias.":"Prueba con otra palabra.") :
    `<div class="tabla-env"><table class="reg ct-tab">
      <thead><tr><th>Código</th><th>Artículo</th><th>Und.</th><th class="num">Cuánto hay</th><th class="num">Sistema</th><th>Estado</th><th></th></tr></thead>
      <tbody>${grupos.map(g=>`
        <tr class="ct-est"><td colspan="7">${esc(nomEstante(g.est))} · ${g.items.length} ${g.items.length===1?"artículo":"artículos"}</td></tr>
        ${g.items.map(i=>{ const x=conteoDe(ym,i.cod), d=difDe(ym,i.cod);
          return `<tr id="fc-${esc(i.cod)}">
            <td class="cod">${esc(i.cod)}</td>
            <td>${esc(i.desc)}</td>
            <td class="und">${esc(i.uni)}</td>
            <td class="num"><input class="ct-in" data-cod="${esc(i.cod)}" inputmode="decimal"
                 value="${x?esc(x.c):""}" placeholder="—" aria-label="Cuánto hay de ${esc(i.desc)}"></td>
            <td class="num">${fmt(saldo(i.cod))}</td>
            <td id="ce-${esc(i.cod)}">${estadoConteo(d)}</td>
            <td class="acc"><button class="b sec chico" data-acc="obsConteo" data-cod="${esc(i.cod)}">${(conteoMes(ym)[i.cod]||{}).o?"ver nota":"anotar"}</button></td>
          </tr>`;}).join("")}`).join("")}
      </tbody></table></div>`}
  </div>`;
};
function estadoConteo(d){
  if(d===null) return `<span class="et n">sin contar</span>`;
  if(d===0)    return `<span class="et k">cuadra</span>`;
  return `<span class="et p">${d>0?"sobran "+fmt(d):"faltan "+fmt(-d)}</span>`;
}

ACC.ctEmpezar = d=>{ CT.alm=d.a; CT.txt=""; CT.soloFalta=false; vistaActual="conteo"; window.scrollTo(0,0); pintar(); };
ACC.ctSalir   = ()=>{ CT.alm=""; CT.txt=""; pintar(); };

/** Se guarda sin repintar toda la pantalla: si repinta, se pierde el cursor. */
function anotarConteo(inp){
  const ym=CT.ym||mesDe(hoy()), cod=inp.dataset.cod;
  guardarConteoEn(ym,cod,inp.value,true);
  const ce=document.getElementById("ce-"+cod); if(ce) ce.innerHTML=estadoConteo(difDe(ym,cod));
  const todos=itemsDeAlmacen(CT.alm);
  const hechos=todos.filter(i=>conteoDe(ym,i.cod)).length;
  const difs=todos.filter(i=>{ const d=difDe(ym,i.cod); return d!==null && d!==0; }).length;
  const a=$("#ct-av"); if(a) a.textContent=hechos+" de "+todos.length;
  const b=$("#ct-barra"); if(b) b.style.width=(todos.length?Math.round(hechos/todos.length*100):0)+"%";
  const t=$("#ct-dif"); if(t){ t.textContent=difs; t.classList.toggle("rojo",difs>0); }
}
function engancharConteo(){
  const ins=$$(".ct-in");
  ins.forEach((e,ix)=>{
    e.onchange=()=>anotarConteo(e);
    e.onkeydown=ev=>{
      if(ev.key!=="Enter") return;
      ev.preventDefault(); anotarConteo(e);
      const sig=ins[ix+1]; if(sig){ sig.focus(); sig.select(); } else e.blur();
    };
  });
  const t=$("#ct-txt");
  if(t) t.oninput=()=>{ const p=t.selectionStart; CT.txt=t.value; pintar();
    const n=$("#ct-txt"); if(n){ n.focus(); try{ n.setSelectionRange(p,p); }catch(x){} } };
  const f=$("#ct-falta"); if(f) f.onchange=()=>{ CT.soloFalta=f.checked; pintar(); };
  const m=$("#ct-mes");   if(m) m.onchange=()=>{ CT.ym=m.value; pintar(); };
}

/* ---------- lo que no estaba en la lista ---------- */
ACC.ctNuevo = ()=>{
  const alm = CT.alm==="__" ? "" : CT.alm;
  modal("Agregar algo que no está en la lista", `
    ${expl("Qué va a pasar",[
      "Se crea el artículo <b>y se anota de una vez cuánto hay</b>, sin salir del conteo.",
      alm?("Queda guardado en <b>"+esc(alm)+"</b>, el piso que estás contando."):"Queda sin almacén asignado, igual que el resto de esta lista.",
      "El código sale solo y queda en el <b>estante Z</b>, que quiere decir «todavía sin sitio». Cuando termines de contar le das su estante en <b>Ubicar</b>.",
      "El saldo del sistema no se toca todavía: se acomoda al final, cuando ajustes el inventario."
    ])}
    <div class="campos">
      ${campo("cn-desc","QUÉ ES","Cópialo como está marcado en el envase o la etiqueta.",
        `<input id="cn-desc" class="mays" placeholder="CLAVO PARA CALAMINA 2 1/2">`)}
      ${campo("cn-cant","CUÁNTO HAY","Lo que contaste ahora mismo en el estante.",
        `<input id="cn-cant" class="mono" inputmode="decimal" placeholder="0">`)}
      ${campo("cn-uni","UNIDAD DE MEDIDA","",`<select id="cn-uni">${opts(UNIDADES,"und",false)}</select>`)}
      ${campo("cn-clasif","FAMILIA","De aquí sale la primera letra del código.",
        `<select id="cn-clasif">${opts(CLASIF,"MATERIAL DE CONSTRUCCION",false)}</select>`)}
    </div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},
     {t:"Crear y anotar",fn:()=>{
        const desc=leer("cn-desc").toUpperCase();
        if(!desc) return toast("Falta decir qué es.",true);
        const cant=leerN("cn-cant");
        const cl=leer("cn-clasif"), tipo=tipoDeClasif(cl);
        const o={ id:uid("it"), cod:codigoProvisional(tipo), desc:desc, uni:leer("cn-uni"),
                  clasif:cl, alm:alm, inicial:0, min:0, precio:0, activo:true };
        S.catalogo.items.push(o); subir("catalogo");
        guardarConteoEn(CT.ym||mesDe(hoy()), o.cod, cant, true);
        cerrar(); pintar();
        toast("Creado "+o.cod+" · "+o.desc+" · contado "+fmt(cant)+" — quedó sin ubicar");
     }}], 720);
};

/* ---------- terminar: ver las diferencias y ajustar el saldo ---------- */
const nroActa = ()=> "ACT-"+String(nn(S.meta.proxActa)||1).padStart(4,"0");
function difsDelPiso(ym,alm){
  return itemsDeAlmacen(alm).map(i=>{ const d=difDe(ym,i.cod); return d===null?null:{it:i,dif:d,sal:saldo(i.cod),con:nn(conteoDe(ym,i.cod).c)}; })
    .filter(x=>x && x.dif!==0);
}
ACC.ctTerminar = ()=>{
  const ym=CT.ym||mesDe(hoy()), alm=CT.alm;
  const todos=itemsDeAlmacen(alm), hechos=todos.filter(i=>conteoDe(ym,i.cod)).length;
  const falta=todos.length-hechos, l=difsDelPiso(ym,alm);
  const sobra=l.filter(x=>x.dif>0), falto=l.filter(x=>x.dif<0);
  modal("Terminar el conteo de "+nomAlm(alm), `
    ${expl("Qué significa esto",[
      "<b>Ajustar</b> deja el saldo del sistema igual a lo que contaste. Es el único momento en que el conteo cambia el stock.",
      "Se hace con un <b>acta</b>: lo que sobró entra como RECONTEO y lo que faltó sale como RECONTEO, con su número y sus firmas.",
      "Lo que cuadra no se toca. Lo que no contaste tampoco: queda como estaba."
    ])}
    <div class="kcab">
      <div><span>CONTADOS</span><b>${hechos} de ${todos.length}</b></div>
      <div><span>SIN CONTAR</span><b class="${falta?"rojo":""}">${falta}</b></div>
      <div><span>SOBRA</span><b class="verde">${sobra.length}</b></div>
      <div><span>FALTA</span><b class="rojo">${falto.length}</b></div>
    </div>
    ${falta?`<div class="aviso-caja"><b>Todavía te faltan ${falta} ${falta===1?"artículo":"artículos"} por contar</b>
      Puedes ajustar igual — lo que no contaste queda intacto — pero el inventario no estará completo.</div>`:""}
    ${!l.length?vacio("Todo cuadra","No hay nada que ajustar en este piso."):
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>Código</th><th>Artículo</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Observación</th></tr></thead>
      <tbody>${l.map(x=>`<tr class="${x.dif<0?"baja":""}">
        <td class="cod">${esc(x.it.cod)}</td><td>${esc(x.it.desc)} <span class="nota">${esc(x.it.uni)}</span></td>
        <td class="num">${fmt(x.sal)}</td><td class="num" style="font-weight:700">${fmt(x.con)}</td>
        <td class="num" style="font-weight:700;color:${x.dif<0?"var(--sello)":"var(--ok)"}">${x.dif>0?"+":""}${fmt(x.dif)}</td>
        <td class="nota">${esc((conteoMes(ym)[x.it.cod]||{}).o||"—")}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="campos" style="margin-top:16px">
      ${campo("ct-quien","QUIÉN CONTÓ","Queda en el acta.",`<select id="ct-quien">${optPersonal("")}</select>`)}
    </div>`}`,
    [{t:"Seguir contando",clase:"sec",izq:true,fn:cerrar},
     ...(l.length?[{t:"Imprimir el acta",clase:"sec",fn:()=>{ cerrar();
        imprimirActaConteo(alm,l.map(x=>Object.assign({},x,{obs:(conteoMes(ym)[x.it.cod]||{}).o||""})),false); }},
                   {t:"Ajustar el saldo",clase:"peligro",fn:()=>{
        const q=leer("ct-quien");
        if(!q) return toast("Falta decir quién contó.",true);
        ajustarConteo(ym,alm,q);
     }}]:[{t:"Cerrar",fn:cerrar}])], 900);
};
function ajustarConteo(ym,alm,quien){
  const l=difsDelPiso(ym,alm);
  if(!l.length){ cerrar(); return toast("No hay nada que ajustar."); }
  const nro=nroActa(), f=hoy(), c=conteoMes(ym);
  const base={motivo:"RECONTEO", tipoDoc:"ACTA DE RECONTEO", nroDoc:nro, contra:"AJUSTE POR CONTEO FÍSICO",
              area:"", llegada:"", transporte:"", persona:quien, autoriza:"",
              almacenero:S.meta.almacenero||"", hora:ahora(),
              obs:"Conteo físico de "+nomMes(ym)+" · "+nomAlm(alm)};
  [["E",l.filter(x=>x.dif>0)],["S",l.filter(x=>x.dif<0)]].forEach(([sent,g])=>{
    if(!g.length) return;
    /* se guarda el saldo de antes y lo contado: así el acta se puede volver a imprimir */
    dia(f).movs.push(Object.assign({id:uid("mv"), fecha:f, sentido:sent, acta:{alm:alm, ym:ym},
      items:g.map(x=>({cod:x.it.cod, cant:Math.abs(x.dif), sist:x.sal, cont:x.con,
                       nota:(c[x.it.cod]||{}).o||""}))}, base));
  });
  l.forEach(x=>{ const a=c[x.it.cod]; if(a){ a.aj=nro; a.f=f; } });
  S.meta.proxActa=(nn(S.meta.proxActa)||1)+1; subir("meta"); subir("conteos");
  subirDia(f);
  const conObs=l.map(x=>Object.assign({},x,{obs:(c[x.it.cod]||{}).o||""}));
  cerrar(); pintar();
  toast(nro+" · saldo ajustado en "+l.length+" "+(l.length===1?"artículo":"artículos"));
  modal("Inventario ajustado", `
    ${expl("Listo",[
      "El saldo del sistema ya quedó igual a lo que contaste en <b>"+esc(nomAlm(alm))+"</b>.",
      "Quedó registrado como <b>"+esc(nro)+"</b>, con una entrada por lo que sobró y una salida por lo que faltó.",
      "<b>Imprime el acta y hazla firmar.</b> Si la pierdes, la vuelves a sacar desde la pantalla de contar."
    ])}
    <div class="kcab"><div class="ident"><span>ACTA</span><b>${esc(nro)}</b>
      <i>${fFecha(hoy())} · ${esc(nomAlm(alm))} · ${l.length} ${l.length===1?"artículo ajustado":"artículos ajustados"}</i></div></div>`,
    [{t:"Después",clase:"sec",fn:cerrar},
     {t:"Imprimir el acta",fn:()=>{ cerrar(); imprimirActaConteo(alm,conObs,nro); }}], 700);
}
/** Las actas ya guardadas del mes, para volver a imprimirlas. */
function actasDelMes(ym){
  const vis={}, r=[];
  IX.movs.forEach(m=>{
    if(m.tipoDoc!=="ACTA DE RECONTEO" || !m.acta || m.acta.ym!==ym) return;
    if(!vis[m.nroDoc]){ vis[m.nroDoc]={nro:m.nroDoc, fecha:m.fecha, alm:m.acta.alm, persona:m.persona, partes:[]}; r.push(vis[m.nroDoc]); }
    vis[m.nroDoc].partes.push(m);
  });
  return r.sort((a,b)=> a.nro<b.nro?1:-1);
}
ACC.verActa = d=>{
  const a=actasDelMes(CT.ym||mesDe(hoy())).find(x=>x.nro===d.n); if(!a) return;
  const l=[];
  a.partes.forEach(m=>(m.items||[]).forEach(x=>{
    l.push({it:cat(x.cod)||{cod:x.cod,desc:"(ya no está en el catálogo)",uni:""},
            dif:(m.sentido==="E"?1:-1)*nn(x.cant), sal:nn(x.sist), con:nn(x.cont), obs:x.nota||""});
  }));
  imprimirActaConteo(a.alm, l, a.nro);
};
function imprimirActaConteo(alm,l,nro){
  const sobra=l.filter(x=>x.dif>0), falto=l.filter(x=>x.dif<0);
  lanzar(`<div class="doc">
    ${membrete("ACTA DE INVENTARIO FÍSICO", nomAlm(alm)+(nro?" · "+nro:" · PROPUESTA"))}
    <p style="font-size:10pt;margin:0 0 3mm">En la fecha se recorrió el almacén indicado, artículo por artículo, y se
    comparó lo contado contra el saldo del sistema. ${nro?"El saldo <b>quedó ajustado</b> a lo contado mediante este acta."
    :"Este documento es la <b>propuesta de ajuste</b>: todavía no se ha tocado el saldo."}</p>
    <table><tr>
      <th style="width:18%">FECHA DEL CONTEO</th><td>${fFecha(hoy())}</td>
      <th style="width:16%">ALMACÉN</th><td>${esc(nomAlm(alm))}</td>
      <th style="width:14%">DIFERENCIAS</th><td style="font-weight:700">${l.length}</td>
    </tr></table>
    <table style="margin-top:3mm"><thead><tr>
      <th style="width:13%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:8%">UND.</th>
      <th style="width:12%">SEGÚN SISTEMA</th><th style="width:12%">CONTADO</th><th style="width:12%">DIFERENCIA</th><th style="width:22%">POR QUÉ</th>
    </tr></thead><tbody>
      ${l.map(x=>`<tr><td style="font-family:monospace">${esc(x.it.cod)}</td><td>${esc(x.it.desc)}</td>
        <td style="text-align:center">${esc(x.it.uni)}</td>
        <td style="text-align:right">${fmt(x.sal)}</td><td style="text-align:right;font-weight:700">${fmt(x.con)}</td>
        <td style="text-align:right;font-weight:700">${x.dif>0?"+":""}${fmt(x.dif)}</td>
        <td>${esc(x.obs||"")}</td></tr>`).join("")}
    </tbody></table>
    <p style="font-size:10pt;margin-top:3mm"><b>${sobra.length}</b> ${sobra.length===1?"artículo sobró":"artículos sobraron"} ·
      <b>${falto.length}</b> ${falto.length===1?"artículo faltó":"artículos faltaron"}.</p>
    <p style="font-size:8.5pt">La columna POR QUÉ es la que defiende el inventario ante el residente y la supervisión:
    ahí se explica cada diferencia. Lo que quedó sin explicación es faltante puro.</p>
    ${firmas(["CONTÓ · ","ALMACENERO · "+(S.meta.almacenero||""),"RESIDENTE DE OBRA · ","SUPERVISIÓN · "])}
  </div>`);
}

/* ======================================================================
   EL CONTEO FÍSICO, PISO POR PISO
   Contar no se hace por código ni por familia: se hace caminando. Se sube
   a un piso, se recorre estante por estante y se anota lo que hay. Por eso
   la hoja sale filtrada por almacén y agrupada por estante, en el mismo
   orden en que se camina.
   ====================================================================== */
const estanteDe = c => (String(c||"").charAt(1)||"?").toUpperCase();
const nomEstante = e => e==="Z" ? "SIN UBICAR — estante Z" : "ESTANTE "+e;

/** Los artículos de un piso, en el orden en que se recorren los estantes. */
function itemsDeAlmacen(alm){
  let l=S.catalogo.items.filter(i=>i.activo!==false);
  if(alm) l=l.filter(i=> alm==="__" ? !almDe(i) : almDe(i)===alm);
  return l.sort((a,b)=>{
    const ea=estanteDe(a.cod), eb=estanteDe(b.cod);
    if(ea!==eb) return ea==="Z" ? 1 : (eb==="Z" ? -1 : (ea<eb?-1:1));
    return String(a.cod)<String(b.cod)?-1:1;
  });
}
/** Cuánto lleva contado cada piso este mes. */
function avanceConteo(ym){
  const c=conteoMes(ym), hecho=k=>{ const x=c[k]; return !!(x && x.c!=="" && x.c!=null); };
  return almacenes().concat([""]).map(a=>{
    const l=itemsDeAlmacen(a||"__");
    const n=l.filter(i=>hecho(i.cod)).length;
    let dif=0;
    l.forEach(i=>{ const x=c[i.cod]; if(x && x.c!=="" && x.c!=null && q2(nn(x.c))!==saldo(i.cod)) dif++; });
    return {alm:a, total:l.length, contados:n, dif:dif};
  }).filter(x=>x.total>0);
}

/* ---------- la hoja para llevar al almacén ---------- */
let HC = null;
ACC.hojaConteo = ()=>{
  const ym=DR.mes||mesDe(hoy());
  if(!HC) HC={alm:(DR.alm||almacenes()[0]||""), falta:false, ciego:false};
  modal("Hoja de conteo físico", `
    ${expl("Cómo se usa",[
      "Sale <b>una hoja por piso</b>, agrupada por estante y en el orden en que se camina el almacén.",
      "La llenas a mano recorriendo los estantes y después pasas los números a <b>Control diario</b>, columna CONTEO REAL.",
      "<b>A ciegas</b> quiere decir sin el saldo del sistema impreso: cuentas lo que hay de verdad, sin que el número te influya. Es como se hace un inventario en serio.",
      "Si ya empezaste, marca <b>solo los que faltan</b> y sales con la hoja de lo que queda."
    ])}
    <div class="campos">
      ${campo("hc-alm","QUÉ PISO","Se recorre uno por vez.",
        `<select id="hc-alm">${opts(almacenes().concat([{v:"__",t:"— sin almacén asignado —"}]),HC.alm,false)}</select>`)}
      ${campo("hc-mes","DE QUÉ MES ES EL CONTEO","",
        `<select id="hc-mes">${opts(Array.from(new Set(IX.movs.map(m=>mesDe(m.fecha)).concat([mesDe(hoy())]))).sort().reverse().map(x=>({v:x,t:nomMes(x)})),ym,false)}</select>`)}
    </div>
    <div style="margin-top:14px">
      <label class="dupla" style="margin:6px 0"><input type="checkbox" id="hc-falta"${HC.falta?" checked":""}> Solo los que todavía no he contado</label>
      <label class="dupla" style="margin:6px 0"><input type="checkbox" id="hc-ciego"${HC.ciego?" checked":""}> A ciegas — no imprimir el saldo del sistema</label>
    </div>`,
    [{t:"Cancelar",clase:"sec",izq:true,fn:()=>{HC=null;cerrar();}},
     {t:"Imprimir",clase:"sec",fn:()=>{
        const d=leerHC(); cerrar(); imprimirConteo(d.alm,d.ym,d.falta,d.ciego);
     }},
     {t:"Descargar PDF",fn:()=>{
        const d=leerHC(); cerrar();
        const r=pdfConteo(d.alm,d.ym,d.falta,d.ciego);
        if(r) descargar(r.nombre,r.bytes,"application/pdf");
     }}], 720);
};
function leerHC(){
  HC={alm:leer("hc-alm"), falta:$("#hc-falta").checked, ciego:$("#hc-ciego").checked};
  return {alm:HC.alm, ym:leer("hc-mes")||mesDe(hoy()), falta:HC.falta, ciego:HC.ciego};
}
/** Arma las filas de la hoja, ya agrupadas por estante. */
function filasConteo(alm,ym,falta){
  const c=conteoMes(ym);
  let l=itemsDeAlmacen(alm);
  if(falta) l=l.filter(i=>{ const x=c[i.cod]; return !(x && x.c!=="" && x.c!=null); });
  const grupos=[];
  l.forEach(i=>{
    const e=estanteDe(i.cod);
    let g=grupos[grupos.length-1];
    if(!g || g.est!==e){ g={est:e, items:[]}; grupos.push(g); }
    g.items.push(i);
  });
  return {grupos, total:l.length};
}
const nomAlm = a => a==="__" ? "SIN ALMACÉN ASIGNADO" : String(a||"").toUpperCase();

function imprimirConteo(alm,ym,falta,ciego){
  const {grupos,total}=filasConteo(alm,ym,falta);
  if(!total) return toast(falta?"Ya contaste todo lo de ese piso.":"No hay artículos en ese piso.",true);
  let n=0;
  lanzar(`<div class="doc">
    ${membrete("HOJA DE CONTEO FÍSICO", nomAlm(alm)+" · "+nomMes(ym)+(falta?" · solo lo que falta":"")+(ciego?" · a ciegas":""))}
    <p style="font-size:9pt;margin:0 0 3mm">Se recorre estante por estante en el orden de esta hoja y se anota la cantidad
    que de verdad hay. ${ciego?"<b>El saldo del sistema no sale impreso a propósito:</b> primero se cuenta, después se compara.":"La columna DIFERENCIA se llena solo si el conteo no coincide con el saldo."}</p>
    <table><thead><tr>
      <th style="width:6%">N°</th><th style="width:13%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:8%">UND.</th>
      ${ciego?"":`<th style="width:12%">SALDO SISTEMA</th>`}
      <th style="width:13%">CONTEO REAL</th><th style="width:${ciego?18:11}%">DIFERENCIA</th><th style="width:${ciego?22:16}%">OBSERVACIÓN</th>
    </tr></thead><tbody>
    ${grupos.map(g=>`<tr><td colspan="${ciego?7:8}" style="background:#eceff6;font-weight:700;font-size:9pt">${esc(nomEstante(g.est))} — ${g.items.length} ${g.items.length===1?"artículo":"artículos"}</td></tr>`
      + g.items.map(i=>{ n++;
        return `<tr><td style="text-align:center">${n}</td><td style="font-family:monospace">${esc(i.cod)}</td>
        <td>${esc(i.desc)}</td><td style="text-align:center">${esc(i.uni)}</td>
        ${ciego?"":`<td style="text-align:right">${fmt(saldo(i.cod))}</td>`}
        <td></td><td></td><td></td></tr>`;}).join("")).join("")}
    </tbody></table>
    <p style="font-size:8.5pt;margin-top:2mm">${total} ${total===1?"artículo":"artículos"} por contar en ${esc(nomAlm(alm))}.
    Al terminar, los números se pasan a Control diario y el sistema calcula la diferencia solo.</p>
    ${firmas(["CONTÓ · ","ALMACENERO · "+(S.meta.almacenero||""),"RESIDENTE DE OBRA · "])}
  </div>`);
}

function pdfConteo(alm,ym,falta,ciego){
  const {grupos,total}=filasConteo(alm,ym,falta);
  if(!total){ toast(falta?"Ya contaste todo lo de ese piso.":"No hay artículos en ese piso.",true); return null; }
  const D=pdfDoc();
  const est={y:0, tit:"HOJA DE CONTEO FÍSICO",
             sub:nomAlm(alm)+" · "+nomMes(ym)+(falta?" · solo lo que falta":"")+(ciego?" · a ciegas":"")};
  est.y=pdfMembrete(D,est.tit,est.sub);

  const av=avanceConteo(ym).find(x=>(x.alm||"__")===alm) || {total:total,contados:0,dif:0};
  est.y=pdfCifras(D,est.y,[
    {e:"POR CONTAR EN ESTA HOJA",v:String(total)},
    {e:"YA CONTADOS ESTE MES",v:av.contados+" de "+av.total},
    {e:"CON DIFERENCIA",v:String(av.dif),rojo:av.dif>0}
  ]);

  const cols = ciego
    ? [{t:"N°",w:9,a:"c"},{t:"CÓDIGO",w:22},{t:"ARTÍCULO",w:70,parte:1},{t:"UND.",w:13,a:"c"},
       {t:"CONTEO REAL",w:26,a:"c"},{t:"OBSERVACIÓN",w:46}]
    : [{t:"N°",w:9,a:"c"},{t:"CÓDIGO",w:22},{t:"ARTÍCULO",w:62,parte:1},{t:"UND.",w:13,a:"c"},
       {t:"SALDO",w:18,a:"d"},{t:"CONTEO REAL",w:24,a:"c"},{t:"DIF.",w:15,a:"c"},{t:"OBSERVACIÓN",w:23}];
  const filas=[]; let n=0;
  grupos.forEach(g=>{
    filas.push({banda:nomEstante(g.est), der:g.items.length+(g.items.length===1?" artículo":" artículos")});
    g.items.forEach(i=>{ n++;
      const b=[String(n), i.cod, i.desc, i.uni];
      if(!ciego) b.push(fmt(saldo(i.cod)));
      b.push(""); if(!ciego) b.push(""); b.push("");
      filas.push({c:b});
    });
  });
  pdfTabla(D,est,cols,filas);

  pdfSitio(D,est,28);
  D.txt(PDF_M.i,est.y+3, ciego
    ? "El saldo del sistema no sale impreso a propósito: primero se cuenta lo que hay, después se compara en Control diario."
    : "Al terminar, los números se pasan a Control diario y el sistema calcula la diferencia solo.",
    {tam:7.2,color:PDF_GRIS});
  pdfFirmas(D,est.y+20,["CONTÓ · ","ALMACENERO · "+(S.meta.almacenero||""),"RESIDENTE DE OBRA · "]);
  pdfPies(D,"SICA · conteo físico · "+nomAlm(alm));
  return {bytes:D.bytes(), nombre:"CONTEO_"+nomAlm(alm).replace(/[^A-Z0-9]+/g,"_")+"_"+ym.replace("-","")+".pdf"};
}

/* ======================================================================
   INVENTARIO — apertura, cierre y cuadre del día
   El conteo artículo por artículo va en Control diario, columna CONTEO REAL.
   Aquí solo se abre y se cierra el almacén, y se revisa que el día cuadre.
   ====================================================================== */
let IV = {fecha:""};

function cuadreDia(f){
  const d=dia(f);
  const ent={}, sal={};
  (d.movs||[]).forEach(m=>(m.items||[]).forEach(l=>{
    if(m.sentido==="E") ent[l.cod]=(ent[l.cod]||0)+nn(l.cant);
    else sal[l.cod]=(sal[l.cod]||0)+nn(l.cant);
  }));
  const cods=Array.from(new Set(Object.keys(ent).concat(Object.keys(sal))));
  return cods.sort().map(c=>{
    const ini=saldoAntes(c,f), e=nn(ent[c]), s=nn(sal[c]);
    return {cod:c, it:cat(c), ini, ent:q2(e), sal:q2(s), fin:q2(ini+e-s)};
  });
}

VISTAS.inventario = function(){
  const f = IV.fecha || hoy();
  const d = dia(f);
  const cu = cuadreDia(f);
  const negativos = S.catalogo.items.filter(i=>i.activo!==false && saldo(i.cod)<0);

  return `
  ${expl("Para qué sirve abrir y cerrar el almacén",[
    "La <b>apertura</b> deja constancia de con qué saldo arrancó el día y quién lo revisó. Si algo falta a media mañana, se sabe que no faltaba al abrir.",
    "El <b>cierre</b> hace lo mismo al terminar la jornada y guarda el saldo con el que queda el almacén bajo llave.",
    "El <b>cuadre</b> de abajo revisa que la cuenta del día salga: saldo al abrir + entradas − salidas = saldo al cerrar. Si no sale, es que falta pasar un papel."
  ])}
  <div class="bloque"><h2>DÍA A REVISAR</h2><div class="pad">
    <div class="campos">
      ${campo("iv-fecha","FECHA","Puedes revisar días pasados para cerrar lo que quedó pendiente.",`<input type="date" id="iv-fecha" value="${f}" max="${hoy()}">`)}
    </div>
  </div></div>

  <div class="tarjetas">
    <a class="${d.apertura?"ok":"al"}" data-acc="${d.apertura?"verAp":"hacerAp"}" data-f="${f}">
      <div class="n" style="font-size:24px">${d.apertura?"✓":"—"}</div>
      <div class="l">${d.apertura?"Apertura registrada "+esc(d.apertura.hora):"Apertura sin registrar"}</div>
    </a>
    <a class="${d.cierre?"ok":"al"}" data-acc="${d.cierre?"verCi":"hacerCi"}" data-f="${f}">
      <div class="n" style="font-size:24px">${d.cierre?"✓":"—"}</div>
      <div class="l">${d.cierre?"Cierre registrado "+esc(d.cierre.hora):"Cierre sin registrar"}</div>
    </a>
    <a data-ir="conteo"><div class="n">${Object.keys(conteoMes(mesDe(f))).length}</div><div class="l">artículos ya contados este mes</div></a>
    <a class="${negativos.length?"al":""}" data-acc="verNeg"><div class="n">${negativos.length}</div><div class="l">saldos en negativo</div></a>
  </div>

  ${(function(){ const av=avanceConteo(mesDe(f)); if(!av.length) return "";
    return `<div class="bloque"><h2>CONTEO FÍSICO DE ${nomMes(mesDe(f)).toUpperCase()}<span class="der">
      <button class="b chico" data-ir="conteo">Ir a contar</button>
      <button class="b sec chico" data-acc="hojaConteo">Sacar la hoja</button></span></h2>
      <p class="nota" style="padding:12px 18px 0;margin:0">El conteo se hace caminando: se sube a un piso y se recorre
      estante por estante. Acá ves cuánto llevas de cada uno. Los números se pasan a Control diario.</p>
      <div class="tabla-env"><table class="reg">
        <thead><tr><th>Almacén</th><th class="num">Artículos</th><th class="num">Contados</th><th class="num">Faltan</th><th class="num">Con diferencia</th><th></th></tr></thead>
        <tbody>${av.map(x=>{ const falta=x.total-x.contados;
          return `<tr class="${x.dif?"baja":""}"><td><b>${esc(x.alm||"— sin almacén asignado —")}</b></td>
          <td class="num">${x.total}</td><td class="num">${x.contados}</td>
          <td class="num" style="font-weight:700">${falta||"—"}</td>
          <td class="num" style="color:${x.dif?"var(--sello)":"inherit"};font-weight:${x.dif?700:400}">${x.dif||"—"}</td>
          <td class="acc"><span class="et ${falta?(x.contados?"a":"n"):"k"}">${falta?(x.contados?"a medias":"sin empezar"):"listo"}</span></td></tr>`;}).join("")}</tbody>
      </table></div></div>`;})()}

  ${negativos.length?`<div class="aviso-caja rojo"><b>Hay ${negativos.length} ${negativos.length===1?"artículo":"artículos"} con saldo negativo</b>
    Un saldo negativo significa que se registró más salida que entrada. Casi siempre es una guía de ingreso que todavía no se ha pasado al sistema. Revísalo antes de cerrar el mes.</div>`:""}

  <div class="bloque">
    <h2>CUADRE DEL ${fFecha(f).toUpperCase()}<span class="der">
      <span class="et n">${cu.length} ${cu.length===1?"artículo movido":"artículos movidos"}</span>
      <button class="b sec chico" data-acc="impCuadre" data-f="${f}">Imprimir</button>
    </span></h2>
    ${!cu.length ? vacio("Ese día no se movió nada","No hay entradas ni salidas registradas.") :
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>Código</th><th>Artículo</th><th class="num">Al abrir</th><th class="num">Entró</th><th class="num">Salió</th><th class="num">Al cerrar</th></tr></thead>
      <tbody>${cu.map(r=>`<tr>
        <td class="cod">${esc(r.cod)}</td>
        <td>${esc(r.it?r.it.desc:"(fuera del catálogo)")} <span class="nota">${esc(r.it?r.it.uni:"")}</span></td>
        <td class="num">${fmt(r.ini)}</td>
        <td class="num" style="color:var(--ok)">${r.ent?"+"+fmt(r.ent):"—"}</td>
        <td class="num" style="color:var(--sello)">${r.sal?"−"+fmt(r.sal):"—"}</td>
        <td class="num" style="font-weight:700">${fmt(r.fin)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`}
  </div>`;
};

function formAC(f,tipo){
  const es = tipo==="apertura";
  modal(es?"Registrar apertura del almacén":"Registrar cierre del almacén", `
    ${expl("Qué va a quedar guardado",[
      `La fecha, la hora y quién revisó el almacén al ${es?"abrir":"cerrar"}.`,
      "El saldo de todos los artículos en ese momento, congelado como constancia.",
      es?"Si al abrir ya notas algo raro, escríbelo abajo antes de empezar a despachar.":"Si al cerrar falta algo, escríbelo abajo: mañana esa nota es la única prueba."
    ])}
    <div class="campos">
      ${campo("ac-hora","HORA","",`<input type="time" id="ac-hora" value="${ahora()}">`)}
      ${campo("ac-quien","QUIÉN REVISÓ","La persona que recorrió el almacén y dio el visto bueno.",`<select id="ac-quien">${optPersonal("")}</select>`)}
      ${campo("ac-llave","QUIÉN TIENE LA LLAVE","",`<input id="ac-llave" value="${esc(S.meta.almacenero||"")}">`)}
      ${campo("ac-obs","OBSERVACIÓN","",`<textarea id="ac-obs" placeholder="Opcional"></textarea>`)}
    </div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:es?"Registrar apertura":"Registrar cierre",fn:()=>{
      if(!leer("ac-quien")) return toast("Falta decir quién revisó.",true);
      const snap={}; S.catalogo.items.forEach(i=>{ const s=saldo(i.cod); if(s!==0) snap[i.cod]=s; });
      const reg={hora:leer("ac-hora")||ahora(), quien:leer("ac-quien"), llave:leer("ac-llave"), obs:leer("ac-obs"), saldos:snap};
      const d=dia(f); if(es) d.apertura=reg; else d.cierre=reg;
      subirDia(f); cerrar(); pintar(); toast(es?"Apertura registrada.":"Cierre registrado.");
    }}], 720);
}
ACC.hacerAp = d=>formAC(d.f,"apertura");
ACC.hacerCi = d=>formAC(d.f,"cierre");
function verAC(f,tipo){
  const r=dia(f)[tipo]; if(!r) return;
  const n=Object.keys(r.saldos||{}).length;
  modal((tipo==="apertura"?"Apertura":"Cierre")+" del "+fFecha(f), `
    <div class="kcab">
      <div><span>HORA</span><b>${esc(r.hora)}</b></div>
      <div><span>REVISÓ</span><b style="font-size:16px;font-family:var(--f-label)">${esc(nomCargo(r.quien))}</b></div>
      <div><span>LLAVE</span><b style="font-size:16px;font-family:var(--f-label)">${esc(r.llave||"—")}</b></div>
      <div><span>ARTÍCULOS CON SALDO</span><b>${n}</b></div>
    </div>
    ${r.obs?`<p class="nota"><b>Observación:</b> ${esc(r.obs)}</p>`:""}
    <p class="nota">El saldo de los ${n} artículos quedó congelado como constancia de ese momento.</p>`,
    [{t:"Borrar este registro",clase:"peligro",izq:true,fn:()=>{
        cerrar(); confirmar("Borrar","Se borra el registro de "+tipo+" del "+fFecha(f)+".",()=>{
          const d=dia(f); d[tipo]=null; subirDia(f); pintar(); toast("Borrado.");},"Borrar",true);
      }},
     {t:"Cerrar",fn:cerrar}], 700);
}
ACC.verAp = d=>verAC(d.f,"apertura");
ACC.verCi = d=>verAC(d.f,"cierre");
ACC.verNeg = ()=>{
  const l=S.catalogo.items.filter(i=>i.activo!==false && saldo(i.cod)<0);
  modal("Saldos en negativo", !l.length?`<p>No hay ningún saldo negativo. Todo cuadra.</p>`:`
    ${expl("Por qué pasa esto",[
      "El sistema registró más salidas que entradas de ese artículo.",
      "La causa más común: la guía de ingreso todavía no se ha pasado al sistema, pero el material ya se empezó a repartir.",
      "Solución: busca la guía y regístrala en <b>Entradas</b> con su fecha real. El saldo se corrige solo."
    ])}
    <div class="tabla-env"><table class="reg"><thead><tr><th>Código</th><th>Artículo</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Saldo</th></tr></thead>
    <tbody>${l.map(i=>`<tr class="baja"><td class="cod">${esc(i.cod)}</td><td>${esc(i.desc)}</td><td class="num">${fmt(totIng(i.cod))}</td><td class="num">${fmt(totSal(i.cod))}</td><td class="num" style="font-weight:700;color:var(--sello)">${fmt(saldo(i.cod))}</td></tr>`).join("")}</tbody></table></div>`,
    [{t:"Ir a Entradas",clase:"sec",fn:()=>{cerrar();ir("entradas");}},{t:"Cerrar",fn:cerrar}], 820);
};
/* ======================================================================
   HORÓMETRO — parte diario de máquina
   ====================================================================== */
let HO = {fecha:""};
let FOTOS = {ini:null,fin:null};

const maqs = ()=> S.maquinaria.items.filter(m=>m.activo!==false);
const maq  = id=> S.maquinaria.items.find(m=>m.id===id);
function ultimaLectura(maqId,antesDe){
  let mejor=null;
  diasOrden().forEach(f=>{
    if(antesDe && f>=antesDe) return;
    (S.dias[f].horometro||[]).forEach(h=>{ if(h.maqId===maqId && nn(h.fin)>0) mejor={f, v:nn(h.fin)}; });
  });
  return mejor;
}

VISTAS.horometro = function(){
  const f = HO.fecha || hoy();
  const d = dia(f);
  const l = maqs();
  if(!l.length) return expl("Primero registra las máquinas",[
    "Anda a <b>Listas</b> y agrega la minicargadora, la retroexcavadora y los vehículos de la obra.",
    "De cada una hace falta el nombre, la placa o número interno, y si se controla por horas (horómetro) o por kilómetros (odómetro)."
  ])+`<div class="bloque"><div class="pad"><button class="b" data-ir="listas">Ir a Listas</button></div></div>`;

  return `
  ${expl("El parte diario de máquina",[
    "Se llena <b>dos veces</b>: al empezar la labor y al terminarla.",
    "Cada vez se toma <b>foto del tablero</b> con la lectura visible. Esa foto es la prueba de las horas que se facturan o se pagan al operador.",
    "El sistema avisa si la lectura de hoy es menor que la del último parte, porque eso significa que alguien se equivocó al copiar o que la máquina trabajó sin registro."
  ])}
  <div class="bloque"><h2>DÍA</h2><div class="pad">
    <div class="campos">${campo("ho-fecha","FECHA","",`<input type="date" id="ho-fecha" value="${f}" max="${hoy()}">`)}</div>
  </div></div>
  ${l.map(m=>{
    const h=(d.horometro||[]).find(x=>x.maqId===m.id);
    const u=ultimaLectura(m.id,f);
    const un=m.control==="km"?"km":"h";
    const trab = h&&nn(h.fin)>nn(h.ini) ? q2(nn(h.fin)-nn(h.ini)) : 0;
    return `<div class="bloque">
      <h2>${esc(m.nombre)} ${m.placa?`· <span style="font-family:var(--f-mono);font-weight:400">${esc(m.placa)}</span>`:""}
        <span class="der">${h? (nn(h.fin)>0?`<span class="et k">${fmt(trab)} ${un} trabajadas</span>`:`<span class="et a">iniciada, falta cerrar</span>`) : `<span class="et p">sin parte</span>`}</span></h2>
      <div class="pad">
        ${h?`<div class="tabla-env"><table class="reg"><thead><tr><th>Operador</th><th>Frente</th><th class="num">Inicio</th><th class="num">Fin</th><th class="num">${un==="km"?"Km":"Horas"}</th><th class="num">Combustible</th><th>Fotos</th><th></th></tr></thead>
        <tbody><tr>
          <td>${esc(nom(h.operador))}</td>
          <td>${esc(h.area||"—")}</td>
          <td class="num">${esc(h.horaIni||"")}<br><b>${fmt(h.ini)}</b></td>
          <td class="num">${h.fin?esc(h.horaFin||"")+"<br><b>"+fmt(h.fin)+"</b>":"—"}</td>
          <td class="num" style="font-weight:700">${trab?fmt(trab):"—"}</td>
          <td class="num">${nn(h.gal)?fmt(h.gal)+" gal":"—"}</td>
          <td>${["ini","fin"].map(k=>h["foto"+k[0].toUpperCase()+k.slice(1)]?`<img src="${esc(fotoSrc(h["foto"+k[0].toUpperCase()+k.slice(1)]))}" style="width:46px;height:46px;object-fit:cover;border:1px solid var(--regla);margin-right:4px" alt="">`:"").join("")||"—"}</td>
          <td class="acc">
            ${!h.fin?`<button class="b chico" data-acc="horoCerrar" data-f="${f}" data-id="${esc(h.id)}">Cerrar labor</button>`:""}
            <button class="b sec chico" data-acc="horoEditar" data-f="${f}" data-id="${esc(h.id)}">Editar</button>
          </td>
        </tr></tbody></table></div>
        ${h.obs?`<p class="nota"><b>Observación:</b> ${esc(h.obs)}</p>`:""}`
        :`<p class="nota" style="margin:0 0 12px">Última lectura registrada: ${u?`<b>${fmt(u.v)} ${un}</b> el ${fFecha(u.f)}`:"ninguna todavía"}.</p>
          <button class="b" data-acc="horoIniciar" data-f="${f}" data-maq="${esc(m.id)}">Iniciar labor</button>`}
      </div></div>`;
  }).join("")}`;
};

function zonaFoto(k,etq,actual){
  return `<div class="foto"><span>${esc(etq)}</span>
    <div class="marco" id="mf-${k}">${actual?`<img src="${esc(fotoSrc(actual))}" alt="">`:`<span style="font-size:12px;color:var(--texto-2);text-align:center;padding:6px">sin foto</span>`}</div>
    <label class="cargar">Tomar foto<input type="file" accept="image/*" capture="environment" id="ff-${k}"></label></div>`;
}
function enganchaFotos(){
  ["ini","fin"].forEach(k=>{
    const e=$("#ff-"+k); if(!e) return;
    e.onchange=async()=>{
      const fl=e.files&&e.files[0]; if(!fl) return;
      try{
        const dz=await comprimirFoto(fl,760,0.55);
        FOTOS[k]=await guardarFoto(dz);
        const mf=$("#mf-"+k); if(mf) mf.innerHTML=`<img src="${esc(fotoSrc(FOTOS[k]))}" alt="">`;
      }catch(err){ toast("No se pudo usar esa foto.",true); }
    };
  });
}

function formHoro(f,maqId,id,cerrando){
  const d=dia(f);
  const h = id ? (d.horometro||[]).find(x=>x.id===id) : null;
  const m = maq(h?h.maqId:maqId); if(!m) return;
  const un = m.control==="km"?"km":"h";
  const u = ultimaLectura(m.id,f);
  FOTOS = {ini:h?h.fotoIni:null, fin:h?h.fotoFin:null};

  modal((cerrando?"Cerrar labor · ":h?"Editar parte · ":"Iniciar labor · ")+m.nombre, `
    ${expl("Cómo se llena",[
      `La lectura es el número que marca el ${un==="km"?"odómetro":"horómetro"} del tablero, tal cual, sin redondear.`,
      "La foto debe mostrar ese número legible. Si sale borrosa, tómala otra vez.",
      u?`Último registro: <b>${fmt(u.v)} ${un}</b> el ${fFecha(u.f)}.`:"Es el primer parte de esta máquina."
    ])}
    <div class="campos">
      ${campo("hr-op","OPERADOR","Quién manejó la máquina en esta jornada.",`<select id="hr-op">${optPersonal(h?h.operador:"",operadores().length?operadores():activos())}</select>`)}
      ${campo("hr-area","FRENTE O LABOR","En qué estuvo trabajando. Por ejemplo: excavación de zanja tramo 3.",`<input id="hr-area" list="dl-areas" value="${esc(h?h.area:"")}">`)}
      ${campo("hr-hi","HORA DE INICIO","",`<input type="time" id="hr-hi" value="${esc(h?h.horaIni:ahora())}">`)}
      ${campo("hr-li","LECTURA AL INICIAR",`En ${un}.`,`<input id="hr-li" class="mono" inputmode="decimal" value="${h?esc(h.ini):(u?esc(u.v):"")}">`)}
      ${campo("hr-hf","HORA DE TÉRMINO","Déjalo vacío si todavía está trabajando.",`<input type="time" id="hr-hf" value="${esc(h&&h.horaFin?h.horaFin:(cerrando?ahora():""))}">`)}
      ${campo("hr-lf","LECTURA AL TERMINAR",`En ${un}. Vacío si todavía no termina.`,`<input id="hr-lf" class="mono" inputmode="decimal" value="${h&&h.fin?esc(h.fin):""}">`)}
      ${campo("hr-gal","COMBUSTIBLE CARGADO","En galones. Sirve para calcular el rendimiento.",`<input id="hr-gal" class="mono" inputmode="decimal" value="${h&&nn(h.gal)?esc(h.gal):""}" placeholder="0">`)}
      ${campo("hr-obs","OBSERVACIÓN","Fallas, paradas, atascos, lluvia.",`<input id="hr-obs" value="${esc(h?h.obs:"")}">`)}
    </div>
    <div class="corte" style="margin:18px 0"></div>
    <div class="fotos">${zonaFoto("ini","FOTO AL INICIAR",FOTOS.ini)}${zonaFoto("fin","FOTO AL TERMINAR",FOTOS.fin)}</div>
    ${dl("areas")}`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Guardar parte",fn:()=>{
      /* se leen todos los campos antes de cualquier confirmación: la confirmación
         reemplaza el cuerpo del modal y después ya no se podrían leer */
      const reg={ id:(h?h.id:uid("ho")), maqId:m.id, fecha:f,
        operador:leer("hr-op"), area:leer("hr-area"),
        horaIni:leer("hr-hi"), ini:leerN("hr-li"),
        horaFin:leer("hr-hf")||null, fin:(leer("hr-lf")===""?null:leerN("hr-lf")),
        gal:leerN("hr-gal"), obs:leer("hr-obs"),
        fotoIni:FOTOS.ini, fotoFin:FOTOS.fin };
      if(!reg.operador) return toast("Falta el operador.",true);
      if(reg.ini<=0) return toast("Falta la lectura al iniciar.",true);
      if(reg.fin!=null && reg.fin<reg.ini) return toast("La lectura final no puede ser menor que la inicial.",true);
      const seguir = ()=>{
        if(!d.horometro) d.horometro=[];
        const ix=d.horometro.findIndex(x=>x.id===reg.id);
        if(ix>=0) d.horometro[ix]=reg; else d.horometro.push(reg);
        sumaLista("areas",reg.area);
        subirDia(f); cerrar(); pintar(); toast("Parte guardado.");
      };
      if(u && reg.ini<u.v) return confirmar("La lectura bajó",
        `El último parte marcó ${fmt(u.v)} ${un} el ${fFecha(u.f)} y ahora estás poniendo ${fmt(reg.ini)}. Un horómetro no retrocede.<br><br>Revisa el número antes de guardar.`, seguir, "Guardar igual");
      if(u && reg.ini-u.v>60) return confirmar("Hay un salto grande",
        `Entre el último parte (${fmt(u.v)}) y este (${fmt(reg.ini)}) hay ${fmt(reg.ini-u.v)} ${un} sin registrar. Puede ser que falte un parte de por medio.`, seguir, "Guardar igual");
      seguir();
    }}], 860);
  enganchaFotos();
}
ACC.horoIniciar = d=>formHoro(d.f,d.maq,null,false);
ACC.horoCerrar  = d=>formHoro(d.f,null,d.id,true);
ACC.horoEditar  = d=>formHoro(d.f,null,d.id,false);
/* ======================================================================
   REQUERIMIENTOS — lo que el almacén pide a la empresa
   ====================================================================== */
let REQ_ACTIVO = null;

const reqEstado = r => r.estado||"pendiente";
function reqAtendido(r){
  const ing={};
  IX.movs.forEach(m=>{ if(m.sentido==="E" && m.reqId===r.id) (m.items||[]).forEach(l=>{ ing[l.cod]=(ing[l.cod]||0)+nn(l.cant); }); });
  const t=(r.items||[]).length;
  const ok=(r.items||[]).filter(l=>nn(ing[l.cod])>=nn(l.cant)).length;
  return {ing, t, ok, algo:Object.keys(ing).length>0};
}

VISTAS.requerimientos = function(){
  const l=S.requerimientos.items.slice().reverse();
  return `
  ${expl("Qué es un requerimiento",[
    "Es el papel con el que el almacén le pide a la empresa que compre algo. No mueve saldo: solo pide.",
    "El saldo sube cuando el material <b>llega</b> y se registra en <b>Entradas</b>.",
    "<b>AUTORIZA</b> aquí también es quien manda a pedir: el maestro o el residente que dice qué se necesita y para cuándo."
  ])}
  <div class="bloque">
    <h2>REQUERIMIENTOS<span class="der">
      <span class="et p">${l.filter(r=>reqEstado(r)!=="atendido").length} abiertos</span>
      <button class="b sec chico" data-acc="reqDeMinimos">Desde los mínimos</button>
      <button class="b chico" data-acc="reqNuevo">+ Nuevo</button>
    </span></h2>
    ${!l.length ? vacio("Todavía no hay requerimientos","Se generan solos desde la lista de artículos en el mínimo, o puedes crear uno a mano.") :
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>N°</th><th>Fecha</th><th>Para cuándo</th><th>Pide</th><th class="num">Ítems</th><th>Estado</th><th></th></tr></thead>
      <tbody>${l.map(r=>{ const a=reqAtendido(r); const e=reqEstado(r);
        return `<tr>
        <td class="cod">${esc(r.n)}</td>
        <td class="num">${fFecha(r.fecha)}</td>
        <td class="num">${r.para?fFecha(r.para):"—"}</td>
        <td>${esc(nom(r.autoriza))}<br><span class="nota">${esc(r.motivo||"")}</span></td>
        <td class="num">${(r.items||[]).length}</td>
        <td><span class="et ${e==="atendido"?"k":(a.algo?"a":"p")}">${e==="atendido"?"ATENDIDO":(a.algo?"PARCIAL "+a.ok+"/"+a.t:"PENDIENTE")}</span></td>
        <td class="acc">
          <button class="b sec chico" data-acc="reqVer" data-id="${esc(r.id)}">Ver</button>
          ${e!=="atendido"?`<button class="b chico" data-acc="reqEntrada" data-id="${esc(r.id)}">Llegó</button>`:""}
        </td></tr>`;}).join("")}</tbody>
    </table></div>`}
  </div>`;
};

function formReq(pre){
  LIN = (pre&&pre.items||[]).map(l=>Object.assign({},l));
  if(!LIN.length) LIN=[{cod:"",cant:"",precio:"",guia:""}];
  modal("Nuevo requerimiento", `
    <input type="hidden" id="f-sentido" value="R">
    ${expl("Qué se pide y para cuándo",[
      "Escribe la cantidad que falta para que la obra no pare, no la que sobra.",
      "La fecha <b>para cuándo</b> es lo que compras necesita saber para priorizar."
    ])}
    <div class="bloque"><h2>1 · EL PEDIDO</h2><div class="pad"><div class="campos">
      ${campo("rq-n","N° DE REQUERIMIENTO","",`<input id="rq-n" class="mono" value="R-${String(S.meta.proxReq||1).padStart(4,"0")}">`)}
      ${campo("rq-fecha","FECHA DEL PEDIDO","",`<input type="date" id="rq-fecha" value="${hoy()}">`)}
      ${campo("rq-para","SE NECESITA PARA","La fecha en que la obra ya lo necesita en el almacén.",`<input type="date" id="rq-para" value="">`)}
      ${campo("rq-autoriza","AUTORIZA — quién manda a pedir","El maestro, el capataz o el residente que ordena la compra.",`<select id="rq-autoriza">${optPersonal(pre&&pre.autoriza,autorizantes())}</select>`)}
      ${campo("rq-motivo","PARA QUÉ ES","La partida o el frente al que va destinado.",`<input id="rq-motivo" list="dl-areas" value="${esc(pre&&pre.motivo||"")}">`)}
    </div></div></div>
    <div class="bloque"><h2>2 · LO QUE SE PIDE</h2><div class="pad"><div id="zona-lineas">${lineasHTML("R")}</div></div></div>
    ${dl("areas")}`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Guardar requerimiento",fn:()=>{
      leerLineas();
      const items=LIN.filter(l=>l.cod&&nn(l.cant)>0).map(l=>({cod:l.cod,cant:q2(l.cant)}));
      if(!items.length) return toast("Agrega por lo menos un artículo.",true);
      if(!leer("rq-autoriza")) return toast("Falta AUTORIZA: quién manda a pedir.",true);
      const r={id:uid("rq"), n:leer("rq-n"), fecha:leer("rq-fecha"), para:leer("rq-para"),
               autoriza:leer("rq-autoriza"), motivo:leer("rq-motivo"), estado:"pendiente", items};
      S.requerimientos.items.push(r);
      const num=parseInt(String(r.n).replace(/\D/g,""),10); if(num>=nn(S.meta.proxReq)){ S.meta.proxReq=num+1; subir("meta"); }
      sumaLista("areas",r.motivo);
      subir("requerimientos"); cerrar(); pintar(); toast("Requerimiento "+r.n+" guardado.");
    }}], 900);
}
ACC.reqNuevo = ()=>formReq(null);
ACC.reqDeMinimos = ()=>{
  const bm=bajoMinimo();
  if(!bm.length) return toast("Ningún artículo está en el mínimo.");
  formReq({motivo:"Reposición de stock mínimo",
    items:bm.map(i=>({cod:i.cod, cant:q2(Math.max(nn(i.min)*2-saldo(i.cod), nn(i.min))), precio:"",guia:""}))});
};
ACC.reqVer = d=>{
  const r=S.requerimientos.items.find(x=>x.id===d.id); if(!r) return;
  const a=reqAtendido(r);
  modal("Requerimiento "+r.n, `
    <div class="kcab">
      <div class="ident"><span>REQUERIMIENTO</span><b>${esc(r.n)}</b><i>pedido el ${fFecha(r.fecha)}${r.para?" · se necesita para el "+fFecha(r.para):""}</i></div>
      <div><span>AUTORIZA · quién mandó a pedir</span><b style="font-size:16px;font-family:var(--f-label)">${esc(nomCargo(r.autoriza))}</b></div>
      <div><span>PARA QUÉ</span><b style="font-size:16px;font-family:var(--f-label)">${esc(r.motivo||"—")}</b></div>
      <div><span>AVANCE</span><b>${a.ok}/${a.t}</b><i>artículos completos</i></div>
    </div>
    <div class="tabla-env"><table class="reg"><thead><tr><th>Código</th><th>Artículo</th><th class="num">Pedido</th><th class="num">Ya llegó</th><th class="num">Falta</th></tr></thead>
    <tbody>${(r.items||[]).map(l=>{const it=cat(l.cod); const g=nn(a.ing[l.cod]); const fa=q2(nn(l.cant)-g);
      return `<tr class="${fa>0?"":""}"><td class="cod">${esc(l.cod)}</td><td>${esc(it?it.desc:"—")} <span class="nota">${esc(it?it.uni:"")}</span></td>
      <td class="num">${fmt(l.cant)}</td><td class="num">${g?fmt(g):"—"}</td><td class="num" style="font-weight:700;${fa>0?"color:var(--sello)":"color:var(--ok)"}">${fa>0?fmt(fa):"completo"}</td></tr>`;}).join("")}</tbody></table></div>`,
    [{t:"Borrar",clase:"peligro",izq:true,fn:()=>{cerrar();confirmar("Borrar requerimiento","Se borra "+r.n+".",()=>{
        S.requerimientos.items=S.requerimientos.items.filter(x=>x.id!==r.id); subir("requerimientos"); pintar(); toast("Borrado.");},"Borrar",true);}},
     {t:reqEstado(r)==="atendido"?"Volver a abrir":"Marcar atendido",clase:"sec",fn:()=>{
        r.estado = reqEstado(r)==="atendido"?"pendiente":"atendido"; subir("requerimientos"); cerrar(); pintar(); toast("Estado cambiado.");}},
     {t:"Imprimir",clase:"sec",fn:()=>{cerrar();imprimirReq(r.id);}},
     {t:"Cerrar",fn:cerrar}], 860);
};
ACC.reqEntrada = d=>{
  const r=S.requerimientos.items.find(x=>x.id===d.id); if(!r) return;
  const a=reqAtendido(r);
  REQ_ACTIVO = r.id;
  formMov("E", null, {
    motivo:"INGRESO", autoriza:r.autoriza, area:r.motivo||"",
    items:(r.items||[]).map(l=>({cod:l.cod, cant:q2(Math.max(0,nn(l.cant)-nn(a.ing[l.cod]))), guia:"", precio:""})).filter(l=>l.cant>0)
  });
};

/* ======================================================================
   REPORTES
   ====================================================================== */
let RP = {mes:""};

VISTAS.reportes = function(){
  const ym = RP.mes || mesDe(hoy());
  const meses = Array.from(new Set(IX.movs.map(m=>mesDe(m.fecha)).concat([mesDe(hoy())]))).sort().reverse();
  const nd=diasDelMes(ym), desde=fechaDM(ym,1), hasta=fechaDM(ym,nd);
  const sal=movsRango(desde,hasta,"S"), ent=movsRango(desde,hasta,"E");

  /* consumo por frente de trabajo */
  const porArea={};
  sal.filter(m=>m.motivo==="OBRA").forEach(m=>{
    const k=(m.area||"sin frente anotado").toUpperCase();
    const o=porArea[k]||(porArea[k]={cant:0,val:0,docs:0});
    o.docs++; (m.items||[]).forEach(l=>{ o.cant+=nn(l.cant); o.val+=nn(l.cant)*nn(l.precio||(cat(l.cod)||{}).precio); });
  });
  const areas=Object.entries(porArea).sort((a,b)=>b[1].val-a[1].val||b[1].cant-a[1].cant);

  /* quién retira del almacén */
  const porPer={};
  sal.forEach(m=>{ const k=m.persona||"—"; const o=porPer[k]||(porPer[k]={docs:0,uds:0,prest:0}); o.docs++; o.uds+=cantMov(m); if(MOT_RETORNA.includes(m.motivo)) o.prest++; });
  const pers=Object.entries(porPer).sort((a,b)=>b[1].docs-a[1].docs);

  /* consumo por artículo con ritmo */
  const porItem={};
  sal.filter(m=>m.motivo==="OBRA").forEach(m=>(m.items||[]).forEach(l=>{ porItem[l.cod]=(porItem[l.cod]||0)+nn(l.cant); }));
  const ritmo=Object.entries(porItem).map(([c,q])=>{
    const it=cat(c), s=saldo(c), pd=q/nd;
    return {c, it, q:q2(q), s, pd, alcanza: pd>0?Math.floor(s/pd):null};
  }).sort((a,b)=>(a.alcanza==null?9e9:a.alcanza)-(b.alcanza==null?9e9:b.alcanza));

  /* horas de máquina */
  const horas={};
  diasOrden().filter(f=>f>=desde&&f<=hasta).forEach(f=>{
    (S.dias[f].horometro||[]).forEach(h=>{
      if(!nn(h.fin)||nn(h.fin)<=nn(h.ini)) return;
      const o=horas[h.maqId]||(horas[h.maqId]={h:0,gal:0,d:0});
      o.h+=nn(h.fin)-nn(h.ini); o.gal+=nn(h.gal); o.d++;
    });
  });

  /* cumplimiento de apertura y cierre */
  let conAp=0, conCi=0, habiles=0;
  for(let d=1;d<=nd;d++){ const f=fechaDM(ym,d); if(f>hoy()) break; habiles++; const dd=S.dias[f]; if(dd&&dd.apertura) conAp++; if(dd&&dd.cierre) conCi++; }

  const pr=prestamos();

  return `
  <div class="bloque"><h2>PERIODO</h2><div class="pad"><div class="campos">
    ${campo("rp-mes","MES","",`<select id="rp-mes">${meses.map(x=>`<option value="${x}"${ym===x?" selected":""}>${nomMes(x)}</option>`).join("")}</select>`)}
  </div></div></div>

  <div class="kcab">
    <div><span>ENTRADAS DEL MES</span><b class="verde">${ent.length}</b><i>documentos</i></div>
    <div><span>SALIDAS DEL MES</span><b class="rojo">${sal.length}</b><i>documentos</i></div>
    <div><span>VALORIZADO QUE SALIÓ</span><b style="font-size:20px">${soles(Object.values(porArea).reduce((s,o)=>s+o.val,0))}</b><i>solo lo que tiene precio</i></div>
    <div><span>APERTURA Y CIERRE</span><b>${conAp}/${habiles}</b><i>cierres: ${conCi}/${habiles}</i></div>
  </div>

  <div class="bloque"><h2>CONSUMO POR FRENTE DE TRABAJO</h2>
    ${!areas.length?vacio("No hay salidas a obra en el mes","") :
    `<div class="tabla-env"><table class="reg"><thead><tr><th>Frente o área</th><th class="num">Vales</th><th class="num">Unidades</th><th class="num">Valorizado</th></tr></thead>
    <tbody>${areas.map(([k,o])=>`<tr><td>${esc(k)}</td><td class="num">${o.docs}</td><td class="num">${fmt(o.cant)}</td><td class="num">${o.val?soles(o.val):"—"}</td></tr>`).join("")}</tbody></table></div>`}
    <p class="nota" style="padding:0 18px 14px">Si aparece mucho en «sin frente anotado», conviene exigir que el vale diga siempre a qué frente va. Sin eso no se puede saber en qué se gastó el material.</p>
  </div>

  <div class="bloque"><h2>LO QUE SE VA A ACABAR PRIMERO</h2>
    ${!ritmo.length?vacio("Sin consumo en el mes","") :
    `<div class="tabla-env"><table class="reg"><thead><tr><th>Código</th><th>Artículo</th><th class="num">Salió en el mes</th><th class="num">Por día</th><th class="num">Saldo</th><th class="num">Alcanza</th></tr></thead>
    <tbody>${ritmo.slice(0,15).map(r=>`<tr class="${r.alcanza!=null&&r.alcanza<7?"baja":""}">
      <td class="cod">${esc(r.c)}</td><td>${esc(r.it?r.it.desc:"—")}</td>
      <td class="num">${fmt(r.q)}</td><td class="num">${fmt(r.pd)}</td><td class="num">${fmt(r.s)}</td>
      <td class="num" style="font-weight:700">${r.alcanza==null?"—":r.alcanza+" días"}</td></tr>`).join("")}</tbody></table></div>`}
  </div>

  <div class="bloque"><h2>QUIÉN RETIRA DEL ALMACÉN</h2>
    ${!pers.length?vacio("Sin salidas en el mes","") :
    `<div class="tabla-env"><table class="reg"><thead><tr><th>Persona</th><th class="num">Veces</th><th class="num">Unidades</th><th class="num">Préstamos</th></tr></thead>
    <tbody>${pers.map(([k,o])=>`<tr><td>${esc(nomCargo(k))}</td><td class="num">${o.docs}</td><td class="num">${fmt(o.uds)}</td><td class="num">${o.prest||"—"}</td></tr>`).join("")}</tbody></table></div>`}
  </div>

  ${Object.keys(horas).length?`<div class="bloque"><h2>HORAS DE MÁQUINA</h2>
    <div class="tabla-env"><table class="reg"><thead><tr><th>Máquina</th><th class="num">Partes</th><th class="num">Horas o km</th><th class="num">Promedio/día</th><th class="num">Galones</th><th class="num">Rendimiento</th></tr></thead>
    <tbody>${Object.entries(horas).map(([id,o])=>{const m=maq(id); const un=m&&m.control==="km"?"km":"h";
      return `<tr><td>${esc(m?m.nombre:"—")}</td><td class="num">${o.d}</td><td class="num">${fmt(o.h)} ${un}</td><td class="num">${fmt(o.h/o.d)}</td><td class="num">${o.gal?fmt(o.gal):"—"}</td><td class="num">${o.gal?fmt(o.h/o.gal)+" "+un+"/gal":"—"}</td></tr>`;}).join("")}</tbody></table></div>
  </div>`:""}

  ${pr.length?`<div class="bloque"><h2>HERRAMIENTA QUE NO HA VUELTO<span class="der"><button class="b sec chico" data-acc="impPendientes">Imprimir para firma</button></span></h2>
    <div class="tabla-env"><table class="reg"><thead><tr><th>Código</th><th>Artículo</th><th>Lo tiene</th><th class="num">Falta</th><th class="num">Días</th></tr></thead>
    <tbody>${pr.map(p=>{const it=cat(p.l.cod);return `<tr class="${p.diasFuera>=2?"baja":""}"><td class="cod">${esc(p.l.cod)}</td><td>${esc(it?it.desc:"—")}</td><td>${esc(nom(p.m.persona))}</td><td class="num">${fmt(p.pend)}</td><td class="num">${p.diasFuera}</td></tr>`;}).join("")}</tbody></table></div>
  </div>`:""}`;
};
/* ======================================================================
   CATÁLOGO — cada artículo con su ubicación física y su familia
   ====================================================================== */
let FC = {clasif:"", txt:""};

VISTAS.catalogo = function(){
  let l=S.catalogo.items.slice();
  if(FC.clasif) l=l.filter(i=>i.clasif===FC.clasif);
  if(FC.txt){ const t=FC.txt.toUpperCase(); l=l.filter(i=>String(i.cod).toUpperCase().includes(t)||String(i.desc).toUpperCase().includes(t)); }
  l.sort((a,b)=>String(a.cod)<String(b.cod)?-1:1);
  const clasifs=Array.from(new Set(S.catalogo.items.map(i=>i.clasif).filter(Boolean))).sort();

  return `
  ${expl("Cómo se arma el código",[
    "El código dice <b>dónde está guardado</b> el artículo: <code>MA-301</code> es <b>M</b>aterial, estante <b>A</b>, nivel <b>3</b>, casillero <b>01</b>.",
    "Así cualquiera encuentra la cosa sin preguntar, y el conteo físico se hace recorriendo los estantes en orden.",
    "La <b>familia</b> es otra cosa: agrupa por tipo de material para los reportes (construcción, eléctrico, EPP, herramienta…).",
    "El <b>saldo inicial</b> es lo que ya había el día que se abrió el kardex. Se escribe una sola vez."
  ])}
  <div class="bloque">
    <h2>CATÁLOGO<span class="der">
      <span class="et t">${S.catalogo.items.length} artículos</span>
      <button class="b sec chico" data-acc="csvCatalogo">Descargar Excel</button>
      <button class="b chico" data-acc="catNuevo">+ Nuevo artículo</button>
    </span></h2>
    <div class="filtros">
      ${campo("fc-clasif","FAMILIA","",`<select id="fc-clasif"><option value="">Todas</option>${clasifs.map(c=>`<option value="${esc(c)}"${FC.clasif===c?" selected":""}>${esc(c)}</option>`).join("")}</select>`)}
      ${campo("fc-txt","BUSCAR","",`<input id="fc-txt" value="${esc(FC.txt)}" placeholder="Código o descripción">`)}
    </div>
    ${!l.length ? vacio("Todavía no hay artículos","Crea el primero o sube la plantilla desde Ajustes.",
      `<button class="b" data-acc="catNuevo">+ Nuevo artículo</button> <button class="b sec" data-ir="ajustes">Subir plantilla</button>`) :
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>Código</th><th>Artículo</th><th>Und.</th><th>Almacén</th><th>Familia</th><th class="num">Inicial</th><th class="num">Saldo</th><th class="num">Mínimo</th><th class="num">Precio</th><th></th></tr></thead>
      <tbody>${l.map(i=>`<tr class="${i.activo===false?"":""}">
        <td class="cod">${esc(i.cod)}</td>
        <td>${esc(i.desc)}${i.activo===false?` <span class="et n">de baja</span>`:""}${retornable(i)?` <span class="et t">retorna</span>`:""}</td>
        <td>${esc(i.uni)}</td>
        <td>${almDe(i)?`<span class="et n">${esc(almDe(i))}</span>`:`<span class="et p">falta</span>`}</td>
        <td><span class="nota">${esc(i.clasif||"—")}</span></td>
        <td class="num">${fmt(i.inicial)}</td>
        <td class="num" style="font-weight:700">${fmt(saldo(i.cod))}</td>
        <td class="num">${nn(i.min)?fmt(i.min):"—"}</td>
        <td class="num">${nn(i.precio)?soles(i.precio):"—"}</td>
        <td class="acc">
          <button class="b sec chico" data-acc="verKardex" data-cod="${esc(i.cod)}">Kardex</button>
          <button class="b sec chico" data-acc="catEditar" data-id="${esc(i.id)}">Editar</button>
        </td></tr>`).join("")}</tbody>
    </table></div>`}
  </div>`;
};

function formCat(id){
  const it = id ? catId(id) : null;
  const t0 = it ? String(it.cod).charAt(0) : "M";
  const e0 = it ? String(it.cod).charAt(1) : "A";
  const n0 = it ? String(it.cod).charAt(3) : "1";
  const c0 = it ? String(it.cod).slice(4) : String(siguienteCasillero("M","A","1")).padStart(2,"0");
  modal(it?"Editar artículo":"Nuevo artículo", `
    ${expl("El código se arma solo",[
      "Elige el tipo, el estante, el nivel y el casillero donde está guardado. El código sale de ahí.",
      "Si ya tienes el almacén rotulado con otros códigos, puedes escribirlos a mano marcando la casilla de abajo."
    ])}
    <div class="campos">
      ${campo("ct-tipo","TIPO","Primera letra del código.",`<select id="ct-tipo">${opts(Object.entries(TIPO_UB).map(([v,t])=>({v,t:v+" · "+t})),t0,false)}</select>`)}
      ${campo("ct-est","ESTANTE","La letra pintada en el estante.",`<input id="ct-est" class="mono" maxlength="1" value="${esc(e0)}" style="text-transform:uppercase">`)}
      ${campo("ct-niv","NIVEL","De abajo hacia arriba.",`<input id="ct-niv" class="mono" inputmode="numeric" maxlength="1" value="${esc(n0)}">`)}
      ${campo("ct-cas","CASILLERO","",`<input id="ct-cas" class="mono" inputmode="numeric" maxlength="2" value="${esc(c0)}">`)}
      ${campo("ct-cod","CÓDIGO QUE QUEDA","",`<input id="ct-cod" class="mono" value="${esc(it?it.cod:codigoDe(t0,e0,n0,c0))}" style="font-weight:700;font-size:20px">`)}
    </div>
    <div class="corte" style="margin:18px 0"></div>
    <div class="campos">
      ${campo("ct-desc","DESCRIPCIÓN","Escríbelo como lo pide la gente en obra. Va todo en mayúsculas: CEMENTO PACASMAYO TIPO I 42.5 KG.",`<input id="ct-desc" class="mays" value="${esc(it?it.desc:"")}">`)}
      ${campo("ct-uni","UNIDAD DE MEDIDA","",`<select id="ct-uni">${opts(UNIDADES,it?it.uni:"und",false)}</select>`)}
      ${campo("ct-clasif","FAMILIA","Agrupa para los reportes.",`<select id="ct-clasif">${opts(CLASIF,it?it.clasif:"MATERIAL DE CONSTRUCCION",false)}</select>`)}
      ${campo("ct-alm","ALMACÉN","En qué piso está guardado.",`<select id="ct-alm">${optAlm(it?it.alm:"")}</select>`)}
      ${campo("ct-inicial","SALDO INICIAL","Lo que había el día que se abrió el kardex. Después de eso, el saldo lo mueven las entradas y salidas.",`<input id="ct-inicial" class="mono" inputmode="decimal" value="${it?esc(it.inicial||0):"0"}">`)}
      ${campo("ct-min","STOCK MÍNIMO","Cuando el saldo llegue a este número, el sistema avisa. Deja 0 si no aplica.",`<input id="ct-min" class="mono" inputmode="decimal" value="${it?esc(it.min||0):"0"}">`)}
      ${campo("ct-precio","PRECIO REFERENCIAL","Opcional. Sirve para valorizar el almacén y los consumos.",`<input id="ct-precio" class="mono" inputmode="decimal" value="${it&&nn(it.precio)?esc(it.precio):""}" placeholder="0.00">`)}
    </div>
    <div class="campos" style="margin-top:14px">
      <div class="campo"><label class="dupla"><input type="checkbox" id="ct-ret"${(it?retornable(it):false)?" checked":""}> Tiene que volver al almacén</label>
        <span class="ayuda">Márcalo para herramienta y equipo. Así aparece en Préstamos cuando sale y no regresa.</span></div>
      <div class="campo"><label class="dupla"><input type="checkbox" id="ct-act"${(it?it.activo!==false:true)?" checked":""}> Activo</label>
        <span class="ayuda">Desmárcalo para sacarlo de las listas sin borrar su historia.</span></div>
    </div>`,
    [ it?{t:"Borrar",clase:"peligro",izq:true,fn:()=>{
        cerrar(); confirmar("Borrar artículo",
          "Se borra <b>"+esc(it.desc)+"</b> del catálogo. Sus movimientos quedan, pero ya no vas a poder ver su kardex.<br><br>Si solo quieres sacarlo de las listas, mejor desmárcalo como activo.",
          ()=>{ S.catalogo.items=S.catalogo.items.filter(x=>x.id!==it.id); subir("catalogo"); pintar(); toast("Borrado."); },"Borrar",true);
      }}:{t:"",clase:"sec",fn:cerrar,izq:true},
      {t:"Cancelar",clase:"sec",fn:cerrar},
      {t:"Guardar",fn:()=>{
        const cod=leer("ct-cod").toUpperCase(), desc=leer("ct-desc").toUpperCase();
        if(!cod) return toast("Falta el código.",true);
        if(!desc) return toast("Falta la descripción.",true);
        if(S.catalogo.items.some(x=>x.cod===cod && (!it||x.id!==it.id))) return toast("Ya hay otro artículo con el código "+cod+".",true);
        const o = it || {id:uid("it")};
        Object.assign(o,{cod, desc, uni:leer("ct-uni"), clasif:leer("ct-clasif"), alm:leer("ct-alm"),
          inicial:leerN("ct-inicial"), min:leerN("ct-min"), precio:leerN("ct-precio"),
          retorna:$("#ct-ret").checked, activo:$("#ct-act").checked});
        if(!it) S.catalogo.items.push(o);
        subir("catalogo"); cerrar(); pintar(); toast("Artículo guardado.");
      }}].filter(b=>b.t!==""), 880);

  const rec=()=>{ const c=codigoDe(leer("ct-tipo"),leer("ct-est"),leer("ct-niv"),leer("ct-cas")); $("#ct-cod").value=c; };
  ["ct-tipo","ct-est","ct-niv","ct-cas"].forEach(id=>{ const e=$("#"+id); if(e) e.oninput=rec; });
  const t=$("#ct-tipo"), es=$("#ct-est"), nv=$("#ct-niv");
  const auto=()=>{ if(it) return; $("#ct-cas").value=String(siguienteCasillero(t.value,es.value,nv.value)).padStart(2,"0"); rec(); };
  if(t) t.onchange=auto; if(es) es.onblur=auto; if(nv) nv.onblur=auto;
}
ACC.catNuevo = ()=>formCat(null);
ACC.catEditar = d=>formCat(d.id);

/* ======================================================================
   PERSONAL
   ====================================================================== */
VISTAS.personal = function(){
  const l=S.personal.items.slice().sort((a,b)=>(a.apellidos||"")<(b.apellidos||"")?-1:1);
  return `
  ${expl("Por qué hace falta registrar al personal",[
    "Cada movimiento guarda <b>dos nombres</b>: quién <b>autoriza</b> (quién manda a pedir) y quién <b>se lo lleva</b>.",
    "Solo las personas marcadas como <b>puede autorizar</b> aparecen en la lista de AUTORIZA. Normalmente: residente, maestro de obra y capataces.",
    "Si alguien se va de la obra, desmárcalo como activo. Sus movimientos viejos no se pierden."
  ])}
  <div class="bloque">
    <h2>PERSONAL DE OBRA<span class="der">
      <span class="et t">${l.filter(p=>p.activo!==false).length} activos</span>
      <button class="b sec chico" data-acc="csvPersonal">Descargar Excel</button>
      <button class="b chico" data-acc="perNuevo">+ Nueva persona</button>
    </span></h2>
    ${!l.length?vacio("Todavía no hay personal","Empieza por el maestro de obra, los capataces y el residente.",`<button class="b" data-acc="perNuevo">+ Nueva persona</button>`) :
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>Apellidos y nombres</th><th>DNI</th><th>Cargo</th><th>Cuadrilla</th><th>Autoriza</th><th class="num">Pendientes</th><th></th></tr></thead>
      <tbody>${l.map(p=>{ const pe=prestamos().filter(x=>x.m.persona===p.id).length;
        return `<tr><td><b>${esc(p.apellidos)}</b>, ${esc(p.nombres)}${p.activo===false?` <span class="et n">inactivo</span>`:""}</td>
        <td class="cod">${esc(p.dni||"—")}</td><td>${esc(p.cargo||"—")}</td><td>${esc(p.cuadrilla||"—")}</td>
        <td>${(p.puedeAutorizar||AUTORIZA_CARGOS.includes(p.cargo))?`<span class="et k">sí</span>`:`<span class="et n">no</span>`}</td>
        <td class="num">${pe?`<span class="et p">${pe}</span>`:"—"}</td>
        <td class="acc"><button class="b sec chico" data-acc="perEditar" data-id="${esc(p.id)}">Editar</button></td></tr>`;}).join("")}</tbody>
    </table></div>`}
  </div>`;
};
function formPer(id){
  const p = id ? per(id) : null;
  modal(p?"Editar persona":"Nueva persona", `
    <div class="campos">
      ${campo("pr-ap","APELLIDOS","",`<input id="pr-ap" value="${esc(p?p.apellidos:"")}">`)}
      ${campo("pr-no","NOMBRES","",`<input id="pr-no" value="${esc(p?p.nombres:"")}">`)}
      ${campo("pr-dni","DNI","Ocho dígitos. Sirve para el vale y para cualquier descuento.",`<input id="pr-dni" class="mono" inputmode="numeric" maxlength="8" value="${esc(p?p.dni:"")}">`)}
      ${campo("pr-cargo","CARGO","",`<select id="pr-cargo">${opts(CARGOS,p?p.cargo:"Operario",false)}</select>`)}
      ${campo("pr-cua","CUADRILLA O FRENTE","A qué grupo pertenece. Opcional.",`<input id="pr-cua" value="${esc(p?p.cuadrilla:"")}">`)}
      ${campo("pr-tel","TELÉFONO","Opcional.",`<input id="pr-tel" class="mono" inputmode="tel" value="${esc(p?p.tel:"")}">`)}
    </div>
    <div class="campos" style="margin-top:14px">
      <div class="campo"><label class="dupla"><input type="checkbox" id="pr-aut"${(p?(p.puedeAutorizar||AUTORIZA_CARGOS.includes(p.cargo)):false)?" checked":""}> Puede autorizar pedidos</label>
        <span class="ayuda">Aparece en la lista de AUTORIZA de los vales. Es quien manda a pedir.</span></div>
      <div class="campo"><label class="dupla"><input type="checkbox" id="pr-act"${(p?p.activo!==false:true)?" checked":""}> Sigue en la obra</label>
        <span class="ayuda">Desmárcalo cuando se retire. No se borra su historia.</span></div>
    </div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Guardar",fn:()=>{
      if(!leer("pr-ap")||!leer("pr-no")) return toast("Faltan los nombres y apellidos.",true);
      const o = p || {id:uid("pe")};
      Object.assign(o,{apellidos:leer("pr-ap"), nombres:leer("pr-no"), dni:leer("pr-dni"),
        cargo:leer("pr-cargo"), cuadrilla:leer("pr-cua"), tel:leer("pr-tel"),
        puedeAutorizar:$("#pr-aut").checked, activo:$("#pr-act").checked});
      if(!p) S.personal.items.push(o);
      subir("personal"); cerrar(); pintar(); toast("Guardado.");
    }}], 760);
}
ACC.perNuevo=()=>formPer(null);
ACC.perEditar=d=>formPer(d.id);

/* ======================================================================
   LISTAS — frentes, proveedores, destinos y máquinas
   ====================================================================== */
VISTAS.listas = function(){
  const bloqueLista=(k,tit,ay)=>`<div class="bloque"><h2>${tit}<span class="der"><button class="b sec chico" data-acc="listaAdd" data-k="${k}">+ Agregar</button></span></h2><div class="pad">
    <p class="nota" style="margin:0 0 12px">${ay}</p>
    ${lista(k).length?`<div class="chips">${lista(k).map((v,i)=>`<span class="chip">${esc(v)}<button data-acc="listaDel" data-k="${k}" data-i="${i}" aria-label="Quitar">&times;</button></span>`).join("")}</div>`:`<p class="nota">Vacío. Se va llenando solo a medida que escribes en los movimientos.</p>`}
  </div></div>`;

  return `
  ${expl("Listas de apoyo",[
    "Estas listas salen como sugerencia cuando escribes un movimiento, para que todos escriban igual y los reportes agrupen bien.",
    "No hace falta llenarlas de golpe: cada vez que escribes un frente o un proveedor nuevo, se guarda solo."
  ])}
  ${bloqueLista("areas","FRENTES Y ÁREAS DE TRABAJO","Las partes de la obra donde se consume el material: vaciado de vereda, encofrado, mezcladora, trazo topográfico.")}
  ${bloqueLista("proveedores","PROVEEDORES","De dónde viene el material que entra.")}
  ${bloqueLista("almacenes","ALMACENES DE LA OBRA","Los ambientes donde se guarda: 1er piso, 2do piso, el que haya. Cada artículo del catálogo se asigna a uno.")}
  ${bloqueLista("llegadas","PUNTOS DE LLEGADA","Dónde bajan la carga las guías: el almacén de obra, el frente, la cancha. Es el campo que viene impreso en la guía de remisión.")}
  ${bloqueLista("destinos","DESTINOS","A dónde va lo que sale: la obra, otro frente, el taller, la oficina.")}

  <div class="bloque"><h2>MÁQUINAS Y VEHÍCULOS<span class="der"><button class="b chico" data-acc="maqNueva">+ Agregar</button></span></h2>
    ${!S.maquinaria.items.length?`<div class="pad">${vacio("Sin máquinas registradas","Agrega la minicargadora, la retroexcavadora, los volquetes y los furgones.")}</div>` :
    `<div class="tabla-env"><table class="reg"><thead><tr><th>Nombre</th><th>Placa o N° interno</th><th>Tipo</th><th>Se controla por</th><th></th></tr></thead>
    <tbody>${S.maquinaria.items.map(m=>`<tr><td><b>${esc(m.nombre)}</b>${m.activo===false?` <span class="et n">de baja</span>`:""}</td>
      <td class="cod">${esc(m.placa||"—")}</td><td>${m.tipo==="vehiculo"?"Vehículo":"Maquinaria"}</td>
      <td>${m.control==="km"?"Kilómetros":"Horas (horómetro)"}</td>
      <td class="acc"><button class="b sec chico" data-acc="maqEditar" data-id="${esc(m.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div>`}
  </div>`;
};
ACC.listaAdd = d=>{
  const tit={areas:"frente o área",proveedores:"proveedor",destinos:"destino",llegadas:"punto de llegada",almacenes:"almacén"}[d.k];
  modal("Agregar "+tit, `<div class="campos">${campo("li-v","NOMBRE","Escríbelo como lo van a decir en obra.",`<input id="li-v">`)}</div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Agregar",fn:()=>{ const v=leer("li-v"); if(!v) return toast("Escribe el nombre.",true); sumaLista(d.k,v); cerrar(); pintar(); toast("Agregado."); }}],520);
};
ACC.listaDel = d=>{ const l=lista(d.k); l.splice(+d.i,1); subir("listas"); pintar(); };
function formMaq(id){
  const m = id ? maq(id) : null;
  modal(m?"Editar máquina":"Nueva máquina", `
    <div class="campos">
      ${campo("mq-nom","NOMBRE","Como la llaman en obra. Ej.: minicargadora Bobcat.",`<input id="mq-nom" value="${esc(m?m.nombre:"")}">`)}
      ${campo("mq-pla","PLACA O N° INTERNO","",`<input id="mq-pla" class="mono" value="${esc(m?m.placa:"")}">`)}
      ${campo("mq-tipo","TIPO","",`<select id="mq-tipo">${opts([{v:"maquina",t:"Maquinaria"},{v:"vehiculo",t:"Vehículo"}],m?m.tipo:"maquina",false)}</select>`)}
      ${campo("mq-ctrl","SE CONTROLA POR","La maquinaria lleva horómetro; los volquetes y furgones, kilómetros.",`<select id="mq-ctrl">${opts([{v:"horas",t:"Horas (horómetro)"},{v:"km",t:"Kilómetros"}],m?m.control:"horas",false)}</select>`)}
    </div>
    <div class="campos" style="margin-top:14px"><div class="campo"><label class="dupla"><input type="checkbox" id="mq-act"${(m?m.activo!==false:true)?" checked":""}> En obra</label></div></div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Guardar",fn:()=>{
      if(!leer("mq-nom")) return toast("Falta el nombre.",true);
      const o=m||{id:uid("mq")};
      Object.assign(o,{nombre:leer("mq-nom"),placa:leer("mq-pla"),tipo:leer("mq-tipo"),control:leer("mq-ctrl"),activo:$("#mq-act").checked});
      if(!m) S.maquinaria.items.push(o);
      subir("maquinaria"); cerrar(); pintar(); toast("Guardado.");
    }}],700);
}
ACC.maqNueva=()=>formMaq(null);
ACC.maqEditar=d=>formMaq(d.id);
/* ======================================================================
   EXPORTAR A EXCEL (CSV con ; y BOM, para Excel es-PE y Numbers)
   ====================================================================== */
function aCSV(filas){
  return "\ufeff"+filas.map(f=>f.map(c=>{
    const s=String(c==null?"":c);
    return /[;"\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(";")).join("\r\n");
}
function deCSV(txt){
  txt=String(txt).replace(/^\ufeff/,"");
  const sep = (txt.split("\n")[0].match(/;/g)||[]).length >= (txt.split("\n")[0].match(/,/g)||[]).length ? ";" : ",";
  const filas=[]; let f=[], c="", q=false;
  for(let i=0;i<txt.length;i++){
    const ch=txt[i];
    if(q){ if(ch==='"'){ if(txt[i+1]==='"'){c+='"';i++;} else q=false; } else c+=ch; }
    else if(ch==='"') q=true;
    else if(ch===sep){ f.push(c); c=""; }
    else if(ch==="\n"){ f.push(c); filas.push(f); f=[]; c=""; }
    else if(ch!=="\r") c+=ch;
  }
  if(c!==""||f.length){ f.push(c); filas.push(f); }
  return filas.filter(r=>r.some(x=>String(x).trim()!==""));
}
async function descargar(nombre, contenido, tipo){
  try{
    const b=new Blob([contenido],{type:tipo||"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    toast("Archivo descargado: "+nombre);
  }catch(e){ toast("Este navegador no dejó descargar el archivo.",true); }
}
const nomArch = (base,ext)=> base+"_"+hoy().replace(/-/g,"")+"."+(ext||"csv");

ACC.csvStock = ()=>{
  const fu=fueraMapa();
  const f=[["COD.","DESCRIPCION","UNI. MED.","ALMACEN","FAMILIA","SALDO INICIAL","INGRESO TOTAL","SALIDA TOTAL","STOCK ACTUAL","PRESTADO FUERA","STOCK MINIMO","PRECIO UNIT.","VALORIZADO"]];
  S.catalogo.items.filter(i=>i.activo!==false).sort((a,b)=>String(a.cod)<String(b.cod)?-1:1).forEach(i=>{
    const s=saldo(i.cod);
    f.push([i.cod,i.desc,i.uni,almDe(i),i.clasif||"",fmt(i.inicial),fmt(totIng(i.cod)),fmt(totSal(i.cod)),fmt(s),fmt(fu[i.cod]||0),fmt(i.min),nn(i.precio)?fmt(i.precio):"",nn(i.precio)?fmt(s*nn(i.precio)):""]);
  });
  descargar(nomArch("STOCK_ALMACEN"), aCSV(f));
};
ACC.csvKardex = ()=>{
  if(!KX.cod) return toast("Elige primero un artículo.",true);
  const it=cat(KX.cod);
  const desde=KX.mes?KX.mes+"-01":"", hasta=KX.mes?KX.mes+"-31":"";
  let s = desde ? saldoAntes(KX.cod,desde) : nn(it.inicial);
  const f=[["KARDEX",it.cod,it.desc,it.uni],["PERIODO",KX.mes?nomMes(KX.mes):"todo"],[],
           ["FECHA","HORA","TIPO","DOCUMENTO","MOTIVO","PROVEEDOR/DESTINO","FRENTE","AUTORIZA","ENTREGADO A","ENTRADA","SALIDA","SALDO"]];
  f.push(["","","","SALDO ANTERIOR","","","","","","","",fmt(s)]);
  movsItem(KX.cod,desde,hasta).forEach(({m,l})=>{
    const e=m.sentido==="E"?nn(l.cant):0, x=m.sentido==="S"?nn(l.cant):0; s=q2(s+e-x);
    f.push([m.fecha,m.hora||"",m.sentido==="E"?"ENTRADA":"SALIDA",m.tipoDoc+" "+m.nroDoc,m.motivo,m.contra||"",m.area||"",nom(m.autoriza),nom(m.persona),e?fmt(e):"",x?fmt(x):"",fmt(s)]);
  });
  descargar(nomArch("KARDEX_"+KX.cod), aCSV(f));
};
ACC.csvDiario = ()=>{
  const ym=DR.mes||mesDe(hoy());
  const {nd,items,cel}=datosMatriz(ym); const cnt=conteoMes(ym);
  const cab=["COD.","ARTICULO","UND.","ALMACEN","E/S","SALDO INI"];
  for(let d=1;d<=nd;d++) cab.push(String(d));
  cab.push("ENTRADAS","SALIDAS","SALDO","CONTEO REAL","DIFERENCIA","OBSERVACIONES");
  const f=[["CONTROL DIARIO DE ALMACEN",nomMes(ym).toUpperCase()],["OBRA",S.meta.obra+" · "+S.meta.cp],["CUI",S.meta.cui],
           ["ALMACEN",DR.alm?nomAlm(DR.alm):"Los dos pisos"],[],cab];
  items.forEach(i=>{
    const arr=saldoAntes(i.cod,fechaDM(ym,1)); let ing=0,sal=0;
    const rE=[i.cod,i.desc,i.uni,almDe(i),"ENTRADA",fmt(arr)], rS=["","","","","SALIDA",""];
    for(let d=1;d<=nd;d++){ const e=nn(cel[i.cod+"|E|"+d]), x=nn(cel[i.cod+"|S|"+d]); ing+=e; sal+=x; rE.push(e?fmt(e):"0"); rS.push(x?fmt(x):"0"); }
    const fin=q2(arr+ing-sal), co=cnt[i.cod], tiene=co&&co.c!==""&&co.c!=null;
    rE.push(fmt(ing),fmt(sal),fmt(fin),tiene?fmt(co.c):"",tiene?fmt(nn(co.c)-fin):"",(co&&co.o)||"");
    rS.push("","","","","","");
    f.push(rE,rS);
  });
  descargar(nomArch("CONTROL_DIARIO_"+ym), aCSV(f));
};
ACC.csvMovs = d=>{
  const sen=d.s;
  const f=[["FECHA","HORA","TIPO","N DOC","N BOLETA/FACTURA","MOTIVO",sen==="E"?"PROVEEDOR/ORIGEN":"DESTINO",sen==="E"?"PUNTO DE LLEGADA":"FRENTE","AUTORIZA (quien manda a pedir)",sen==="E"?"RECIBIO CONFORME":"ENTREGADO A","ALMACENERO","COD.","ARTICULO","UNI.","CANTIDAD","PRECIO","IMPORTE","OBSERVACION"]];
  IX.movs.filter(m=>m.sentido===sen).forEach(m=>(m.items||[]).forEach(l=>{
    const it=cat(l.cod);
    f.push([m.fecha,m.hora||"",m.tipoDoc,m.nroDoc,m.nroDoc2||"",m.motivo,m.contra||"",(sen==="E"?m.llegada:m.area)||"",nom(m.autoriza),nom(m.persona),m.almacenero||"",
      l.cod,it?it.desc:"",it?it.uni:"",fmt(l.cant),nn(l.precio)?fmt(l.precio):"",nn(l.precio)?fmt(nn(l.precio)*nn(l.cant)):"",m.obs||""]);
  }));
  descargar(nomArch(sen==="E"?"ENTRADAS":"SALIDAS"), aCSV(f));
};
ACC.csvCatalogo = ()=>{
  const f=[["COD.","DESCRIPCION","UNI. MED.","ALMACEN","FAMILIA","SALDO INICIAL","STOCK MINIMO","PRECIO","RETORNA"]];
  S.catalogo.items.forEach(i=>f.push([i.cod,i.desc,i.uni,almDe(i),i.clasif||"",fmt(i.inicial),fmt(i.min),nn(i.precio)?fmt(i.precio):"",retornable(i)?"SI":"NO"]));
  descargar(nomArch("CATALOGO"), aCSV(f));
};
ACC.csvPersonal = ()=>{
  const f=[["APELLIDOS","NOMBRES","DNI","CARGO","CUADRILLA","TELEFONO","PUEDE AUTORIZAR"]];
  S.personal.items.forEach(p=>f.push([p.apellidos,p.nombres,p.dni||"",p.cargo||"",p.cuadrilla||"",p.tel||"",(p.puedeAutorizar||AUTORIZA_CARGOS.includes(p.cargo))?"SI":"NO"]));
  descargar(nomArch("PERSONAL"), aCSV(f));
};

/* ======================================================================
   IMPRESIÓN
   ====================================================================== */
function membrete(tit,sub){
  return `<table style="width:100%;border:0!important;margin-bottom:3mm"><tr>
    <td style="border:0!important;width:62%;padding:0!important">
      <div style="font-size:11pt;font-weight:700">${esc(S.meta.empresa)}</div>
      <div style="font-size:8.5pt">RUC ${esc(S.meta.ruc)} · ${esc(S.meta.direccion)}</div>
      <div style="font-size:9pt;margin-top:1.2mm">OBRA: ${esc(S.meta.obra)} — ${esc(S.meta.cp)}</div>
      <div style="font-size:8.5pt">${esc(S.meta.ubicacion)} · CUI ${esc(S.meta.cui)}${S.meta.metaPres?" · META "+esc(S.meta.metaPres):""}</div>
    </td>
    <td style="border:0!important;text-align:right;padding:0!important;vertical-align:top">
      <div style="font-size:13pt;font-weight:700;letter-spacing:.06em">${esc(tit)}</div>
      <div style="font-size:9pt">${esc(sub||"")}</div>
      <div style="font-size:8pt;margin-top:1mm">Impreso ${fFecha(hoy())} ${ahora()}</div>
    </td></tr></table>`;
}
function firmas(l){
  return `<table style="width:100%;border:0!important;margin-top:10mm"><tr>${l.map(t=>
    `<td style="border:0!important;width:${Math.floor(100/l.length)}%;padding:0 4mm!important"><div class="firma">${esc(t)}</div></td>`).join("")}</tr></table>`;
}
/* El tamaño de página se cambia inyectando la regla @page justo antes de imprimir.
   Es la única forma que respetan por igual Safari, Chrome y el equipo de la imprenta. */
const PAGINAS = {
  a4:     "@page{size:A4 portrait; margin:12mm}",
  a4h:    "@page{size:A4 landscape; margin:8mm}",
  vale:   "@page{size:150mm 150mm; margin:0}",
  valeA4: "@page{size:A4 portrait; margin:10mm}"
};
function paginaImp(k){
  let e=$("#hoja-impresion");
  if(!e){ e=document.createElement("style"); e.id="hoja-impresion"; document.head.appendChild(e); }
  e.textContent = PAGINAS[k]||PAGINAS.a4;
}
function lanzar(html, pagina){
  const z=$("#impresion");
  z.className="cuerpo imp-"+(pagina||"a4");
  paginaImp(pagina||"a4");
  z.innerHTML=html;
  setTimeout(()=>{ window.print(); },120);
}

function imprimirMov(id){
  const m=movPorId(id); if(!m) return;
  const esE=m.sentido==="E";
  if(!esE) return imprimirVale(m);
  const tot=importeMov(m);
  lanzar(`<div class="doc">
    ${membrete(esE?"INGRESO A ALMACÉN":"VALE DE SALIDA DE ALMACÉN", m.tipoDoc+" N° "+m.nroDoc)}
    <table><tr>
      <th style="width:16%">FECHA</th><td>${fFecha(m.fecha)} ${esc(m.hora||"")}</td>
      <th style="width:16%">MOTIVO</th><td>${esc(m.motivo)}</td>
    </tr><tr>
      <th>${esE?"PROVEEDOR / ORIGEN":"DESTINO"}</th><td>${esc(m.contra||"—")}</td>
      <th>FRENTE O ÁREA</th><td>${esc(m.area||"—")}</td>
    </tr></table>
    <table style="margin-top:3mm">
      <thead><tr><th style="width:15%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:9%">UND.</th>${esE?`<th style="width:11%">S/ GUÍA</th>`:""}<th style="width:12%">CANTIDAD</th>${tot>0?`<th style="width:13%">P. UNIT.</th><th style="width:14%">IMPORTE</th>`:""}</tr></thead>
      <tbody>${(m.items||[]).map(l=>{const it=cat(l.cod);
        return `<tr><td style="font-family:monospace">${esc(l.cod)}</td><td>${esc(it?it.desc:"—")}</td><td>${esc(it?it.uni:"")}</td>
        ${esE?`<td style="text-align:right">${nn(l.guia)?fmt(l.guia):"—"}</td>`:""}
        <td style="text-align:right;font-weight:700">${fmt(l.cant)}</td>
        ${tot>0?`<td style="text-align:right">${nn(l.precio)?fmt(l.precio):"—"}</td><td style="text-align:right">${nn(l.precio)?fmt(nn(l.precio)*nn(l.cant)):"—"}</td>`:""}</tr>`;}).join("")}
        ${Array.from({length:Math.max(0,5-(m.items||[]).length)}).map(()=>`<tr><td>&nbsp;</td><td></td><td></td>${esE?"<td></td>":""}<td></td>${tot>0?"<td></td><td></td>":""}</tr>`).join("")}
      </tbody>
      ${tot>0?`<tfoot><tr><th colspan="${esE?5:4}" style="text-align:right">TOTAL</th><th colspan="2" style="text-align:right">S/ ${fmt(tot)}</th></tr></tfoot>`:""}
    </table>
    ${m.obs?`<p style="font-size:9pt;margin:2mm 0 0"><b>OBSERVACIÓN:</b> ${esc(m.obs)}</p>`:""}
    <p style="font-size:8pt;margin:3mm 0 0">Este documento es de un solo uso. Una vez despachado queda archivado en el almacén.</p>
    ${firmas(["AUTORIZA — quien manda a pedir · "+nom(m.autoriza), (esE?"RECIBIÓ Y DESCARGÓ · ":"ENTREGADO A · ")+nom(m.persona), "ALMACENERO · "+(m.almacenero||S.meta.almacenero||"")])}
  </div>`);
}
ACC.impMov = d=>imprimirMov(d.id);

/** Acta para hacer firmar cuando el material llegó sin guía de almacén. */
ACC.impActa = d=>{
  const m=movExige(d.id); if(!m) return;
  const g=provisionales().find(x=>(x.m.grupo||x.m.id)===(m.grupo||m.id));
  const partes=g?g.partes:[m];
  lanzar(`<div class="doc">
    ${membrete("ACTA DE RECEPCIÓN SIN GUÍA DE ALMACÉN", m.nroDoc)}
    <p style="font-size:10pt;margin:0 0 3mm">En la fecha indicada se recibió en el almacén de obra el material
    que se detalla, <b>sin que el proveedor o transportista entregara guía de almacén, guía de remisión
    ni comprobante alguno</b>. Se deja constancia firmada para su posterior regularización.</p>
    <table><tr>
      <th style="width:20%">FECHA DE RECEPCIÓN</th><td>${fFecha(m.fecha)}</td>
      <th style="width:18%">N° PROVISIONAL</th><td style="font-family:monospace">${esc(m.nroDoc)}</td>
    </tr><tr>
      <th>PROVEEDOR / ORIGEN</th><td>${esc(m.contra||"—")}</td>
      <th>PUNTO DE LLEGADA</th><td>${esc(m.llegada||"—")}</td>
    </tr><tr>
      <th>QUIÉN TRAJO LA CARGA</th><td colspan="3">${esc(m.transporte||"—")}</td>
    </tr></table>
    <table style="margin-top:3mm">
      <thead><tr><th style="width:11%">FECHA</th><th style="width:14%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:9%">UND.</th><th style="width:13%">CANTIDAD</th></tr></thead>
      <tbody>${partes.map(pt=>(pt.items||[]).map(l=>{const it=cat(l.cod);
        return `<tr><td>${fFecha(pt.fecha)}</td><td style="font-family:monospace">${esc(l.cod)}</td>
        <td>${esc(it?it.desc:"—")}</td><td>${esc(it?it.uni:"")}</td>
        <td style="text-align:right;font-weight:700">${fmt(l.cant)}</td></tr>`;}).join("")).join("")}
      </tbody></table>
    <p style="font-size:8.5pt;margin:3mm 0 0">Este documento no reemplaza a la guía de almacén. Queda pendiente
    de regularización: cuando el proveedor entregue el documento, este ingreso se formaliza con su número.</p>
    ${firmas(["QUIEN ENTREGÓ LA CARGA · "+(m.transporte||""),"RECIBÍ CONFORME · "+nom(m.persona),"ALMACENERO · "+(m.almacenero||S.meta.almacenero||"")])}
  </div>`);
};

function imprimirReq(id){
  const r=S.requerimientos.items.find(x=>x.id===id); if(!r) return;
  lanzar(`<div class="doc">
    ${membrete("REQUERIMIENTO DE ALMACÉN","N° "+r.n)}
    <table><tr><th style="width:18%">FECHA DEL PEDIDO</th><td>${fFecha(r.fecha)}</td>
      <th style="width:20%">SE NECESITA PARA</th><td>${r.para?fFecha(r.para):"—"}</td></tr>
      <tr><th>PARA QUÉ FRENTE</th><td colspan="3">${esc(r.motivo||"—")}</td></tr></table>
    <table style="margin-top:3mm"><thead><tr><th style="width:8%">N°</th><th style="width:15%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:9%">UND.</th><th style="width:13%">CANTIDAD</th><th style="width:13%">SALDO HOY</th></tr></thead>
    <tbody>${(r.items||[]).map((l,i)=>{const it=cat(l.cod);
      return `<tr><td style="text-align:center">${i+1}</td><td style="font-family:monospace">${esc(l.cod)}</td><td>${esc(it?it.desc:"—")}</td><td>${esc(it?it.uni:"")}</td><td style="text-align:right;font-weight:700">${fmt(l.cant)}</td><td style="text-align:right">${fmt(saldo(l.cod))}</td></tr>`;}).join("")}</tbody></table>
    ${firmas(["AUTORIZA — quien manda a pedir · "+nom(r.autoriza),"ALMACENERO · "+(S.meta.almacenero||""),"RESIDENTE DE OBRA"])}
  </div>`);
}

ACC.impStock = ()=>{
  const fu=fueraMapa();
  let l=S.catalogo.items.filter(i=>i.activo!==false);
  if(FST.alm) l=l.filter(i=>FST.alm==="__" ? !almDe(i) : almDe(i)===FST.alm);
  if(FST.clasif) l=l.filter(i=>i.clasif===FST.clasif);
  l.sort((a,b)=>String(a.cod)<String(b.cod)?-1:1);
  const val=q2(l.reduce((s,i)=>s+saldo(i.cod)*nn(i.precio),0));
  lanzar(`<div class="doc">
    ${membrete("SALDO DE ALMACÉN",[FST.alm==="__"?"Sin almacén asignado":(FST.alm||"Todos los almacenes"),FST.clasif||"Todas las familias"].join(" · "))}
    <table><thead><tr><th style="width:11%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:7%">UND.</th><th style="width:10%">ALMACÉN</th><th style="width:9%">INICIAL</th><th style="width:9%">ENTRADAS</th><th style="width:9%">SALIDAS</th><th style="width:9%">SALDO</th><th style="width:8%">FUERA</th><th style="width:10%">CONTEO</th></tr></thead>
    <tbody>${l.map(i=>`<tr><td style="font-family:monospace">${esc(i.cod)}</td><td>${esc(i.desc)}</td><td>${esc(i.uni)}</td>
      <td>${esc(almDe(i)||"—")}</td>
      <td style="text-align:right">${fmt(i.inicial)}</td><td style="text-align:right">${fmt(totIng(i.cod))}</td><td style="text-align:right">${fmt(totSal(i.cod))}</td>
      <td style="text-align:right;font-weight:700">${fmt(saldo(i.cod))}</td><td style="text-align:right">${nn(fu[i.cod])?fmt(fu[i.cod]):"—"}</td><td></td></tr>`).join("")}</tbody></table>
    ${val>0?`<p style="font-size:10pt;margin-top:2mm"><b>Valorizado del almacén:</b> S/ ${fmt(val)}</p>`:""}
    <p style="font-size:8.5pt">La columna CONTEO se llena a mano al recorrer los estantes y después se pasa a Control diario.</p>
    ${firmas(["ALMACENERO · "+(S.meta.almacenero||""),"RESIDENTE DE OBRA","SUPERVISIÓN"])}
  </div>`);
};
ACC.impKardex = ()=>{
  if(!KX.cod) return toast("Elige primero un artículo.",true);
  const it=cat(KX.cod);
  const desde=KX.mes?KX.mes+"-01":"", hasta=KX.mes?KX.mes+"-31":"";
  let s = desde ? saldoAntes(KX.cod,desde) : nn(it.inicial);
  const mv=movsItem(KX.cod,desde,hasta);
  lanzar(`<div class="doc">
    ${membrete("KARDEX DE ALMACÉN",it.cod+" · "+it.desc)}
    <table><tr><th style="width:18%">ARTÍCULO</th><td>${esc(it.desc)}</td><th style="width:12%">UNIDAD</th><td style="width:12%">${esc(it.uni)}</td></tr>
    <tr><th>FAMILIA</th><td>${esc(it.clasif||"—")}</td><th>PERIODO</th><td>${KX.mes?nomMes(KX.mes):"Completo"}</td></tr></table>
    <table style="margin-top:3mm"><thead><tr><th style="width:9%">FECHA</th><th style="width:13%">DOCUMENTO</th><th style="width:11%">MOTIVO</th><th>PROVEEDOR / DESTINO</th><th>FRENTE</th><th>ENTREGADO A</th><th style="width:8%">ENTRA</th><th style="width:8%">SALE</th><th style="width:9%">SALDO</th></tr></thead>
    <tbody>
      <tr><td colspan="6" style="text-align:right;font-weight:700">SALDO ANTERIOR</td><td></td><td></td><td style="text-align:right;font-weight:700">${fmt(s)}</td></tr>
      ${mv.map(({m,l})=>{const e=m.sentido==="E"?nn(l.cant):0,x=m.sentido==="S"?nn(l.cant):0; s=q2(s+e-x);
        return `<tr><td>${fFecha(m.fecha)}</td><td style="font-family:monospace">${esc(m.tipoDoc)} ${esc(m.nroDoc)}</td><td>${esc(m.motivo)}</td>
        <td>${esc(m.contra||"—")}</td><td>${esc(m.area||"—")}</td><td>${esc(nom(m.persona))}</td>
        <td style="text-align:right">${e?fmt(e):""}</td><td style="text-align:right">${x?fmt(x):""}</td><td style="text-align:right;font-weight:700">${fmt(s)}</td></tr>`;}).join("")}
    </tbody></table>
    ${firmas(["ALMACENERO · "+(S.meta.almacenero||""),"RESIDENTE DE OBRA"])}
  </div>`);
};
ACC.impDiario = ()=>{
  const ym=DR.mes||mesDe(hoy());
  const {nd,items,cel}=datosMatriz(ym); const cnt=conteoMes(ym);
  let cab1="",cab2="";
  for(let d=1;d<=nd;d++){ cab1+=`<th>${d}</th>`; cab2+=`<th>${DSEM[dowDM(ym,d)]}</th>`; }
  lanzar(`<div class="doc ancho">
    ${membrete("CONTROL DIARIO DE ALMACÉN",nomMes(ym).toUpperCase()+(DR.alm?" · "+nomAlm(DR.alm):"")+(DR.clasif?" · "+DR.clasif:""))}
    <table class="mz"><thead>
      <tr><th>COD.</th><th>ARTÍCULO</th><th>UND</th><th>E/S</th><th>SALDO<br>INI</th>${cab1}<th>ENTRA</th><th>SALE</th><th>SALDO</th><th>CONTEO<br>REAL</th><th>DIF</th><th>OBSERVACIONES</th></tr>
      <tr><th></th><th></th><th></th><th></th><th></th>${cab2}<th></th><th></th><th></th><th></th><th></th><th></th></tr>
    </thead><tbody>
    ${items.map(i=>{
      const arr=saldoAntes(i.cod,fechaDM(ym,1)); let ing=0,sal=0,cE="",cS="";
      for(let d=1;d<=nd;d++){ const e=nn(cel[i.cod+"|E|"+d]),x=nn(cel[i.cod+"|S|"+d]); ing+=e; sal+=x;
        cE+=`<td style="text-align:right">${e?fmt(e):""}</td>`; cS+=`<td style="text-align:right">${x?fmt(x):""}</td>`; }
      const fin=q2(arr+ing-sal), co=cnt[i.cod], tiene=co&&co.c!==""&&co.c!=null, dif=tiene?q2(nn(co.c)-fin):null;
      return `<tr><td rowspan="2" style="font-family:monospace">${esc(i.cod)}</td><td rowspan="2">${esc(i.desc)}</td><td rowspan="2">${esc(i.uni)}</td>
        <td>ENT</td><td rowspan="2" style="text-align:right">${fmt(arr)}</td>${cE}<td style="text-align:right">${fmt(ing)}</td>
        <td rowspan="2" style="text-align:right">${fmt(sal)}</td><td rowspan="2" style="text-align:right;font-weight:700">${fmt(fin)}</td>
        <td rowspan="2" style="text-align:right">${tiene?fmt(co.c):""}</td><td rowspan="2" style="text-align:right">${dif===null?"":(dif===0?"OK":fmt(dif))}</td><td rowspan="2">${esc((co&&co.o)||"")}</td></tr>
        <tr><td>SAL</td>${cS}<td style="text-align:right">${fmt(sal)}</td></tr>`;
    }).join("")}
    </tbody></table>
    ${firmas(["ALMACENERO · "+(S.meta.almacenero||""),"RESIDENTE DE OBRA","SUPERVISIÓN"])}
  </div>`, "a4h");
};
ACC.impCuadre = d=>{
  const f=d.f, cu=cuadreDia(f), dd=dia(f);
  lanzar(`<div class="doc">
    ${membrete("CUADRE DIARIO DE ALMACÉN",fFecha(f))}
    <table><tr><th style="width:20%">APERTURA</th><td>${dd.apertura?esc(dd.apertura.hora)+" · "+esc(nom(dd.apertura.quien)):"no registrada"}</td>
      <th style="width:18%">CIERRE</th><td>${dd.cierre?esc(dd.cierre.hora)+" · "+esc(nom(dd.cierre.quien)):"no registrado"}</td></tr></table>
    <table style="margin-top:3mm"><thead><tr><th style="width:13%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:8%">UND.</th><th style="width:12%">AL ABRIR</th><th style="width:11%">ENTRÓ</th><th style="width:11%">SALIÓ</th><th style="width:12%">AL CERRAR</th><th style="width:11%">CONTEO</th></tr></thead>
    <tbody>${cu.map(r=>`<tr><td style="font-family:monospace">${esc(r.cod)}</td><td>${esc(r.it?r.it.desc:"—")}</td><td>${esc(r.it?r.it.uni:"")}</td>
      <td style="text-align:right">${fmt(r.ini)}</td><td style="text-align:right">${r.ent?fmt(r.ent):"—"}</td><td style="text-align:right">${r.sal?fmt(r.sal):"—"}</td>
      <td style="text-align:right;font-weight:700">${fmt(r.fin)}</td><td></td></tr>`).join("")}</tbody></table>
    ${firmas(["ALMACENERO · "+(S.meta.almacenero||""),"MAESTRO DE OBRA","RESIDENTE DE OBRA"])}
  </div>`);
};
ACC.impPendientes = ()=>{
  const pr=prestamos();
  lanzar(`<div class="doc">
    ${membrete("HERRAMIENTA Y EQUIPO SIN DEVOLVER","Al "+fFecha(hoy()))}
    <table><thead><tr><th style="width:12%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:22%">QUIÉN LO TIENE</th><th style="width:14%">DOCUMENTO</th><th style="width:9%">FALTA</th><th style="width:7%">DÍAS</th><th style="width:22%">FIRMA DE CONFORMIDAD</th></tr></thead>
    <tbody>${pr.map(p=>{const it=cat(p.l.cod);
      return `<tr><td style="font-family:monospace">${esc(p.l.cod)}</td><td>${esc(it?it.desc:"—")}</td><td>${esc(nom(p.m.persona))}</td>
      <td style="font-family:monospace">${esc(p.m.tipoDoc)} ${esc(p.m.nroDoc)}</td><td style="text-align:right;font-weight:700">${fmt(p.pend)}</td><td style="text-align:center">${p.diasFuera}</td><td></td></tr>`;}).join("")}</tbody></table>
    <p style="font-size:8.5pt">Cada persona firma al costado confirmando que todavía tiene la herramienta en su poder.</p>
    ${firmas(["ALMACENERO · "+(S.meta.almacenero||""),"MAESTRO DE OBRA"])}
  </div>`);
};
/* ======================================================================
   RESUMEN DE LO QUE SE TIPEÓ DE LAS GUÍAS
   Lo pide el encargado para cotejar contra el taco de papeles físicos.
   Tres formas de la misma hoja:
     · una línea por guía        — para revisar que no falte ninguna
     · el detalle de cada guía   — para cotejar artículo por artículo
     · consolidado por artículo  — cuánto entró en total de cada cosa
   ====================================================================== */
function mesesGuias(){
  const s={}; IX.movs.forEach(m=>{ if(m.sentido==="E" && !m.ref) s[mesDe(m.fecha)]=1; });
  return Object.keys(s).sort().reverse();
}
function guiasPeriodo(ym){
  let l=IX.movs.filter(m=>m.sentido==="E" && !m.ref);
  if(ym) l=l.filter(m=>mesDe(m.fecha)===ym);
  return l.slice().sort((a,b)=> a.fecha!==b.fecha ? (a.fecha<b.fecha?-1:1)
                                                  : (String(a.nroDoc)<String(b.nroDoc)?-1:1));
}
function resumenProveedor(l,conVal){
  const p={};
  l.forEach(m=>{ const k=String(m.contra||"SIN PROVEEDOR").toUpperCase();
    const c=p[k]||(p[k]={g:0,u:0,i:0});
    c.g++; c.u=q2(c.u+cantMov(m)); c.i=q2(c.i+importeMov(m)); });
  const ks=Object.keys(p).sort();
  if(ks.length<2) return "";
  return `<table style="margin-top:4mm"><thead>
    <tr><th colspan="${conVal?4:3}" style="text-align:left">RESUMEN POR PROVEEDOR</th></tr>
    <tr><th>PROVEEDOR</th><th style="width:14%">GUÍAS</th><th style="width:16%">UNIDADES</th>${conVal?`<th style="width:18%">IMPORTE</th>`:""}</tr>
    </thead><tbody>${ks.map(k=>`<tr><td>${esc(k)}</td><td style="text-align:center">${p[k].g}</td>
      <td style="text-align:right;font-weight:700">${fmt(p[k].u)}</td>${conVal?`<td style="text-align:right">${p[k].i?fmt(p[k].i):"—"}</td>`:""}</tr>`).join("")}
    </tbody></table>`;
}
/** Los números de arriba, que son los que el encargado mira primero. */
function totalesGuias(l){
  return { guias:l.length,
           lineas:l.reduce((a,m)=>a+(m.items||[]).length,0),
           unidades:q2(l.reduce((a,m)=>a+cantMov(m),0)),
           valor:q2(l.reduce((a,m)=>a+importeMov(m),0)),
           sinPapel:l.filter(m=>m.provisional).length };
}
ACC.resumenGuias = ()=>{
  const ms=mesesGuias();
  if(!ms.length) return toast("Todavía no hay ninguna guía cargada.",true);
  modal("Resumen de lo cargado",
    `<p class="nota" style="margin:0 0 16px"><b>Descargar PDF</b> te deja el archivo en el equipo:
      ese se lo mandas al encargado por WhatsApp o correo y lo abre en cualquier lado.
      <b>Imprimir</b> abre el cuadro de impresión del navegador, por si lo quieres en papel ahora mismo.
      Las dos sacan la misma hoja, con el membrete de la obra y las firmas al pie.</p>
     <div class="campos">
       ${campo("rg-mes","QUÉ PERIODO","Sale el mes completo, no solo lo de hoy.",
         `<select id="rg-mes">${opts([{v:"",t:"Todo lo cargado"}].concat(ms.map(m=>({v:m,t:nomMes(m)}))), ms[0], false)}</select>`)}
       ${campo("rg-det","CUÁNTO DETALLE","Con detalle sale artículo por artículo de cada guía; el consolidado suma todo por artículo.",
         `<select id="rg-det">${opts([{v:"r",t:"Una línea por guía"},
                                      {v:"d",t:"Con el detalle de cada artículo"},
                                      {v:"c",t:"Consolidado por artículo"}],"r",false)}</select>`)}
     </div>`,
    [{t:"Cancelar",clase:"sec",izq:true,fn:cerrar},
     {t:"Imprimir",clase:"sec",fn:()=>{
        const ym=leer("rg-mes"), det=leer("rg-det")||"r";
        cerrar(); imprimirResumen(ym,det);
     }},
     {t:"Descargar PDF",fn:()=>{
        /* se leen los campos ANTES de cerrar: cerrar puede vaciar el cuerpo del modal */
        const ym=leer("rg-mes"), det=leer("rg-det")||"r";
        cerrar(); ACC.pdfResumen({ym:ym,det:det});
     }}],640);
};
function imprimirResumen(ym,det){
  const l=guiasPeriodo(ym);
  if(!l.length) return toast("No hay guías cargadas en ese periodo.",true);
  const T=totalesGuias(l), val=T.valor>0;
  const per = ym ? nomMes(ym).toUpperCase() : "TODO LO CARGADO";
  const rango = "Del "+fFecha(l[0].fecha)+" al "+fFecha(l[l.length-1].fecha);

  let cuerpo="";
  if(det==="c"){
    const con={};
    l.forEach(m=>(m.items||[]).forEach(x=>{
      const c=con[x.cod]||(con[x.cod]={cant:0,imp:0,gu:{}});
      c.cant=q2(c.cant+nn(x.cant)); c.imp=q2(c.imp+nn(x.cant)*nn(x.precio)); c.gu[m.nroDoc]=1;
    }));
    cuerpo=`<table style="margin-top:3mm"><thead><tr>
      <th style="width:12%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:7%">UND.</th><th style="width:11%">ALMACÉN</th>
      <th style="width:8%">GUÍAS</th><th style="width:12%">RECIBIDO</th><th style="width:11%">SALDO HOY</th>${val?`<th style="width:12%">IMPORTE</th>`:""}</tr></thead>
      <tbody>${Object.keys(con).sort().map(k=>{ const it=cat(k), c=con[k];
        return `<tr><td style="font-family:monospace">${esc(k)}</td><td>${esc(it?it.desc:"—")}</td>
        <td>${esc(it?it.uni:"")}</td><td>${esc(it?(almDe(it)||"—"):"—")}</td>
        <td style="text-align:center">${Object.keys(c.gu).length}</td>
        <td style="text-align:right;font-weight:700">${fmt(c.cant)}</td>
        <td style="text-align:right">${fmt(saldo(k))}</td>${val?`<td style="text-align:right">${c.imp?fmt(c.imp):"—"}</td>`:""}</tr>`;}).join("")}
        <tr><td colspan="5" style="text-align:right;font-weight:700">TOTAL RECIBIDO</td>
          <td style="text-align:right;font-weight:700">${fmt(T.unidades)}</td><td></td>${val?`<td style="text-align:right;font-weight:700">S/ ${fmt(T.valor)}</td>`:""}</tr>
      </tbody></table>`;
  } else if(det==="d"){
    const nc = val?7:5;
    cuerpo=`<table style="margin-top:3mm"><thead><tr>
      <th style="width:10%">FECHA</th><th style="width:13%">CÓDIGO</th><th>ARTÍCULO</th><th style="width:7%">UND.</th>
      <th style="width:12%">CANTIDAD</th>${val?`<th style="width:11%">P. UNIT.</th><th style="width:12%">IMPORTE</th>`:""}</tr></thead>
      <tbody>${l.map(m=>
        `<tr><td colspan="${nc}" style="background:#eceff6;font-weight:700;font-size:9pt">
          ${esc(m.tipoDoc)} ${esc(m.nroDoc)}${m.nroDoc2?" · "+esc(m.nroDoc2):""} — ${esc(m.contra||"sin proveedor")}${m.llegada?" · llegó a "+esc(m.llegada):""} · recibió ${esc(nom(m.persona))}${m.provisional?" · SIN GUÍA DE ALMACÉN":""}${m.deQ>1?" · parte "+m.parte+" de "+m.deQ:""} · ${fmt(cantMov(m))} unid.</td></tr>`
        + (m.items||[]).map(x=>{ const it=cat(x.cod);
            return `<tr><td>${fFecha(m.fecha)}</td><td style="font-family:monospace">${esc(x.cod)}</td>
            <td>${esc(it?it.desc:"—")}</td><td>${esc(it?it.uni:"")}</td>
            <td style="text-align:right;font-weight:700">${fmt(x.cant)}</td>${val?`<td style="text-align:right">${nn(x.precio)?fmt(x.precio):"—"}</td>
            <td style="text-align:right">${nn(x.precio)?fmt(q2(nn(x.cant)*nn(x.precio))):"—"}</td>`:""}</tr>`;}).join("")
      ).join("")}</tbody></table>`;
  } else {
    cuerpo=`<table style="margin-top:3mm"><thead><tr>
      <th style="width:5%">N°</th><th style="width:10%">FECHA</th><th style="width:15%">DOCUMENTO</th><th>PROVEEDOR</th>
      <th style="width:14%">PUNTO DE LLEGADA</th><th style="width:15%">RECIBÍ CONFORME</th>
      <th style="width:6%">ART.</th><th style="width:9%">UNID.</th>${val?`<th style="width:11%">IMPORTE</th>`:""}</tr></thead>
      <tbody>${l.map((m,i)=>`<tr>
        <td style="text-align:center">${i+1}</td><td>${fFecha(m.fecha)}</td>
        <td style="font-family:monospace">${esc(m.tipoDoc)} ${esc(m.nroDoc)}${m.nroDoc2?"<br>"+esc(m.nroDoc2):""}${m.provisional?"<br>SIN PAPEL":""}${m.deQ>1?"<br>parte "+m.parte+" de "+m.deQ:""}</td>
        <td>${esc(m.contra||"—")}</td><td>${esc(m.llegada||"—")}</td><td>${esc(nom(m.persona))}</td>
        <td style="text-align:center">${(m.items||[]).length}</td>
        <td style="text-align:right;font-weight:700">${fmt(cantMov(m))}</td>${val?`<td style="text-align:right">${importeMov(m)?fmt(importeMov(m)):"—"}</td>`:""}</tr>`).join("")}
        <tr><td colspan="6" style="text-align:right;font-weight:700">TOTAL DEL PERIODO</td>
          <td style="text-align:center;font-weight:700">${T.lineas}</td>
          <td style="text-align:right;font-weight:700">${fmt(T.unidades)}</td>${val?`<td style="text-align:right;font-weight:700">S/ ${fmt(T.valor)}</td>`:""}</tr>
      </tbody></table>${resumenProveedor(l,val)}`;
  }

  lanzar(`<div class="doc">
    ${membrete("RESUMEN DE GUÍAS CARGADAS", per+" · "+rango)}
    <table><tr>
      <th style="width:16%">GUÍAS CARGADAS</th><td style="font-weight:700">${T.guias}</td>
      <th style="width:16%">LÍNEAS DE ARTÍCULO</th><td style="font-weight:700">${T.lineas}</td>
      <th style="width:14%">UNIDADES</th><td style="font-weight:700">${fmt(T.unidades)}</td>
    </tr>${val||T.sinPapel?`<tr>
      <th>VALORIZADO</th><td colspan="${T.sinPapel?1:5}">${val?"S/ "+fmt(T.valor):"—"}</td>
      ${T.sinPapel?`<th>SIN GUÍA DE ALMACÉN</th><td colspan="3">${T.sinPapel} ${T.sinPapel===1?"ingreso pendiente de regularizar":"ingresos pendientes de regularizar"}</td>`:""}
    </tr>`:""}</table>
    ${cuerpo}
    <p style="font-size:8.5pt;margin:3mm 0 0">Este resumen sale de lo que se tipeó en el sistema. Cada línea se
    coteja contra su guía de almacén física, archivada por número.</p>
    ${firmas(["ALMACENERO · "+(S.meta.almacenero||""),"ENCARGADO DE MATERIALES","RESIDENTE DE OBRA"])}
  </div>`);
}

/* ======================================================================
   UN PDF SIN LIBRERÍAS
   El encargado no lee Excel: quiere una hoja. Esto arma un PDF A4 de
   verdad, con las fuentes que todo lector ya trae, para mandarlo por
   WhatsApp o correo sin depender del diálogo de imprimir del navegador.
   Todo se mide en milímetros desde arriba a la izquierda, como una hoja.
   ====================================================================== */
const PDF_MM = 2.834645669;                 /* 1 mm en puntos */
const PDF_A4 = {w:210, h:297};
const PDF_WN = "02780278035505560556088906670191033303330389058402780333027802780556055605560556055605560556055605560556027802780584058405840556101506670667072207220667061107780722027805000667055608330722077806670778072206670611072206670944066706670611027802780278046905560333055605560500055605560278055605560222022205000222083305560556055605560333050002780556050007220500050005000334026003340584";
const PDF_WB = "02780333047405560556088907220238033303330389058402780333027802780556055605560556055605560556055605560556033303330584058405840611097507220722072207220667061107780722027805560722061108330722077806670778072206670611072206670944066706670611033302780333058405560333055606110556061105560333061106110278027805560278088906110611061106110389055603330611055607780556055605000389028003890584";
/* las vocales con tilde y la ñ miden como su letra base: para medir alcanza */
const PDF_BASE = {"á":"a","é":"e","í":"i","ó":"o","ú":"u","ü":"u","ñ":"n","Á":"A","É":"E","Í":"I","Ó":"O","Ú":"U","Ñ":"N","°":"o","·":".","—":"-","–":"-","“":'"',"”":'"',"‘":"'","’":"'"};
/* los pocos caracteres de WinAnsi que no coinciden con Unicode */
const PDF_WANSI = {"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159};

/* la plata siempre con dos decimales: es lo que el encargado va a sumar */
const pdfMon = n => { const p=q2(n).toFixed(2).split("."); return p[0].replace(/\B(?=(\d{3})+(?!\d))/g,",")+"."+p[1]; };
function pdfAncho(s,tam,neg){
  const t = neg?PDF_WB:PDF_WN; let w=0;
  s = String(s==null?"":s);
  for(let i=0;i<s.length;i++){
    let ch=s[i];
    if(PDF_BASE[ch]) ch=PDF_BASE[ch][0];
    let c=ch.charCodeAt(0);
    if(c<32||c>126) c=111;
    w += parseInt(t.substr((c-32)*4,4),10);
  }
  return w*tam/1000;
}
function pdfCorta(s,anchoMM,tam,neg){
  s=String(s==null?"":s);
  const lim=anchoMM*PDF_MM;
  if(pdfAncho(s,tam,neg)<=lim) return s;
  let r=s;
  while(r.length>1 && pdfAncho(r+"…",tam,neg)>lim) r=r.slice(0,-1);
  return r+"…";
}
function pdfParte(s,anchoMM,tam,neg,max){
  const lim=anchoMM*PDF_MM, pal=String(s==null?"":s).split(/\s+/), out=[];
  let li="";
  pal.forEach(p=>{
    const t = li?li+" "+p:p;
    if(pdfAncho(t,tam,neg)<=lim) li=t;
    else { if(li) out.push(li); li=p; }
  });
  if(li) out.push(li);
  if(!out.length) out.push("");
  if(max && out.length>max){
    const c=out.slice(0,max);
    c[max-1]=pdfCorta(c[max-1]+" "+out.slice(max).join(" "),anchoMM,tam,neg);
    return c;
  }
  return out;
}
function pdfCad(s){
  s=String(s==null?"":s);
  let o="";
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    if(c===40||c===41||c===92) o+="\\"+s[i];
    else if(c<32) o+=" ";
    else if(c<127) o+=s[i];
    else {
      const w=PDF_WANSI[s[i]];
      const n = w!==undefined ? w : (c<256 ? c : 63);
      o += "\\"+("00"+n.toString(8)).slice(-3);
    }
  }
  return o;
}
function pdfDoc(){
  const pgs=[]; let op=null;
  const X = mm => (mm*PDF_MM).toFixed(2);
  const Y = mm => ((PDF_A4.h-mm)*PDF_MM).toFixed(2);
  const col = c => c ? c.map(v=>(v/255).toFixed(3)).join(" ") : "0 0 0";
  const D = {
    hoja(){ op=[]; pgs.push(op); return D; },
    usar(i){ op=pgs[i]; return D; },
    hojas(){ return pgs.length; },
    txt(x,y,s,o){
      o=o||{};
      const tam=o.tam||9, neg=!!o.neg, t=String(s==null?"":s);
      if(!t) return D;
      let px=x;
      if(o.alin==="d") px = x - pdfAncho(t,tam,neg)/PDF_MM;
      else if(o.alin==="c") px = x - pdfAncho(t,tam,neg)/PDF_MM/2;
      op.push(`BT ${col(o.color)} rg /${neg?"FB":"FN"} ${tam} Tf 1 0 0 1 ${X(px)} ${Y(y)} Tm (${pdfCad(t)}) Tj ET`);
      return D;
    },
    linea(x1,y1,x2,y2,o){
      o=o||{};
      op.push(`${col(o.color)} RG ${(o.gr||.3).toFixed(2)} w ${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);
      return D;
    },
    caja(x,y,w,h,o){
      o=o||{};
      if(o.relleno) op.push(`${col(o.relleno)} rg ${X(x)} ${Y(y+h)} ${(w*PDF_MM).toFixed(2)} ${(h*PDF_MM).toFixed(2)} re f`);
      if(o.borde)  op.push(`${col(o.borde)} RG ${(o.gr||.3).toFixed(2)} w ${X(x)} ${Y(y+h)} ${(w*PDF_MM).toFixed(2)} ${(h*PDF_MM).toFixed(2)} re S`);
      return D;
    },
    bytes(){
      const obj=[]; const push=s=>{ obj.push(s); return obj.length; };
      const nCat=push(null), nPgs=push(null), nFN=push(null), nFB=push(null);
      obj[nFN-1]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
      obj[nFB-1]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
      const kids=[];
      pgs.forEach(ops=>{
        const flujo=ops.join("\n");
        const nC=push(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
        const nP=push(`<< /Type /Page /Parent ${nPgs} 0 R /MediaBox [0 0 ${(PDF_A4.w*PDF_MM).toFixed(2)} ${(PDF_A4.h*PDF_MM).toFixed(2)}] /Resources << /Font << /FN ${nFN} 0 R /FB ${nFB} 0 R >> >> /Contents ${nC} 0 R >>`);
        kids.push(nP);
      });
      obj[nPgs-1]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(k=>k+" 0 R").join(" ")}] >>`;
      obj[nCat-1]=`<< /Type /Catalog /Pages ${nPgs} 0 R >>`;
      let s="%PDF-1.4\n%âãÏÓ\n";
      const pos=[];
      obj.forEach((o,i)=>{ pos.push(s.length); s += (i+1)+" 0 obj\n"+o+"\nendobj\n"; });
      const xr=s.length;
      s += "xref\n0 "+(obj.length+1)+"\n0000000000 65535 f \n";
      pos.forEach(p=>{ s += ("0000000000"+p).slice(-10)+" 00000 n \n"; });
      s += `trailer\n<< /Size ${obj.length+1} /Root ${nCat} 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
      const b=new Uint8Array(s.length);
      for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i)&0xFF;
      return b;
    }
  };
  return D;
}

/* ---------- las piezas que se repiten en toda hoja del sistema ---------- */
const PDF_TINTA=[29,63,124], PDF_GRIS=[90,95,110], PDF_REGLA=[150,155,168], PDF_FONDO=[236,239,246], PDF_ROJO=[179,38,30];
const PDF_M={i:12, d:198, arriba:16, abajo:281};

function pdfMembrete(D,tit,sub){
  D.hoja();
  D.txt(PDF_M.i,PDF_M.arriba+0,S.meta.empresa,{tam:11,neg:true,color:PDF_TINTA});
  D.txt(PDF_M.i,PDF_M.arriba+4.6,"RUC "+S.meta.ruc+" · "+S.meta.direccion,{tam:7.5,color:PDF_GRIS});
  D.txt(PDF_M.i,PDF_M.arriba+9,"OBRA: "+S.meta.obra+" — "+S.meta.cp,{tam:8.5});
  D.txt(PDF_M.i,PDF_M.arriba+13,S.meta.ubicacion+" · CUI "+S.meta.cui,{tam:7.5,color:PDF_GRIS});
  D.txt(PDF_M.d,PDF_M.arriba+0.5,tit,{tam:13,neg:true,alin:"d",color:PDF_TINTA});
  D.txt(PDF_M.d,PDF_M.arriba+5.6,sub||"",{tam:8.5,alin:"d"});
  D.txt(PDF_M.d,PDF_M.arriba+9.6,"Impreso "+fFecha(hoy())+" "+ahora(),{tam:7.5,alin:"d",color:PDF_GRIS});
  D.linea(PDF_M.i,PDF_M.arriba+16.5,PDF_M.d,PDF_M.arriba+16.5,{gr:1,color:PDF_TINTA});
  return PDF_M.arriba+21;
}
function pdfPies(D,nota){
  const n=D.hojas();
  for(let i=0;i<n;i++){
    D.usar(i);
    D.linea(PDF_M.i,PDF_M.abajo+3,PDF_M.d,PDF_M.abajo+3,{gr:.3,color:PDF_REGLA});
    D.txt(PDF_M.i,PDF_M.abajo+6.5,nota||"SICA · Kardex de almacén de obra",{tam:7,color:PDF_GRIS});
    D.txt(PDF_M.d,PDF_M.abajo+6.5,"Hoja "+(i+1)+" de "+n,{tam:7,alin:"d",color:PDF_GRIS});
  }
  D.usar(n-1);
}
function pdfFirmas(D,y,l){
  const an=(PDF_M.d-PDF_M.i)/l.length;
  l.forEach((t,i)=>{
    const x=PDF_M.i+an*i;
    D.linea(x+3,y,x+an-3,y,{gr:.5});
    D.txt(x+3,y+4,pdfCorta(String(t).split("·")[0].trim(),an-6,7.5,true),{tam:7.5,neg:true});
    const n=String(t).split("·")[1];
    if(n) D.txt(x+3,y+7.6,pdfCorta(n.trim(),an-6,7.5,false),{tam:7.5,color:PDF_GRIS});
  });
}
/** Cuadro de cifras grandes arriba de la hoja: lo primero que mira el encargado. */
function pdfCifras(D,y,cel){
  const an=(PDF_M.d-PDF_M.i)/cel.length, alto=13;
  D.caja(PDF_M.i,y,PDF_M.d-PDF_M.i,alto,{relleno:PDF_FONDO,borde:PDF_REGLA,gr:.3});
  cel.forEach((c,i)=>{
    const x=PDF_M.i+an*i;
    if(i) D.linea(x,y,x,y+alto,{gr:.3,color:PDF_REGLA});
    D.txt(x+3,y+4.6,c.e,{tam:6.6,neg:true,color:PDF_GRIS});
    D.txt(x+3,y+10.4,pdfCorta(c.v,an-6,c.rojo?11:11.5,true),{tam:c.rojo?11:11.5,neg:true,color:c.rojo?PDF_ROJO:PDF_TINTA});
  });
  return y+alto+6;
}
/** Tabla con salto de hoja y cabecera que se repite. */
function pdfTabla(D,est,cols,filas){
  const cab=()=>{
    D.caja(PDF_M.i,est.y,PDF_M.d-PDF_M.i,6.5,{relleno:PDF_FONDO});
    let x=PDF_M.i;
    cols.forEach(c=>{
      const px = c.a==="d" ? x+c.w-1.6 : (c.a==="c" ? x+c.w/2 : x+1.6);
      D.txt(px,est.y+4.4,pdfCorta(c.t,c.w-2,6.6,true),{tam:6.6,neg:true,color:PDF_GRIS,alin:c.a==="d"?"d":(c.a==="c"?"c":"i")});
      x+=c.w;
    });
    D.linea(PDF_M.i,est.y+6.5,PDF_M.d,est.y+6.5,{gr:.6,color:PDF_REGLA});
    est.y+=6.5;
  };
  cab();
  filas.forEach(f=>{
    if(f.banda!==undefined){
      const alto=f.banda2?9.6:6;
      if(est.y+alto>PDF_M.abajo){ est.y=pdfMembrete(D,est.tit,est.sub); cab(); }
      D.caja(PDF_M.i,est.y,PDF_M.d-PDF_M.i,alto,{relleno:PDF_FONDO});
      const anD = f.der ? pdfAncho(f.der,7.6,true)/PDF_MM+7 : 0;
      D.txt(PDF_M.i+1.6,est.y+4.1,pdfCorta(f.banda,PDF_M.d-PDF_M.i-3-anD,7.6,true),{tam:7.6,neg:true,color:PDF_TINTA});
      if(f.der) D.txt(PDF_M.d-1.6,est.y+4.1,f.der,{tam:7.6,neg:true,alin:"d",color:PDF_TINTA});
      if(f.banda2) D.txt(PDF_M.i+1.6,est.y+8,pdfCorta(f.banda2,PDF_M.d-PDF_M.i-3,7.2,false),{tam:7.2,color:PDF_GRIS});
      est.y+=alto;
      D.linea(PDF_M.i,est.y,PDF_M.d,est.y,{gr:.3,color:PDF_REGLA});
      return;
    }
    const tam=f.tot?8.2:8;
    const desde=f.desde||0;
    const lin=cols.map((c,i)=> (i<desde) ? [""] :
      (c.parte ? pdfParte(f.c[i],c.w-3.2,tam,!!f.tot||!!c.neg,2) : [String(f.c[i]==null?"":f.c[i])]));
    const nl=Math.max.apply(null,lin.map(l=>l.length));
    const alto=Math.max(6, 2.6+nl*3.6);
    if(est.y+alto>PDF_M.abajo){ est.y=pdfMembrete(D,est.tit,est.sub); cab(); }
    if(f.tot) D.linea(PDF_M.i,est.y,PDF_M.d,est.y,{gr:.6,color:PDF_REGLA});
    if(f.etq){
      let xe=PDF_M.i; for(let k=0;k<desde;k++) xe+=cols[k].w;
      D.txt(xe-1.6,est.y+4.4,f.etq,{tam:tam,neg:true,alin:"d"});
    }
    let x=PDF_M.i;
    cols.forEach((c,i)=>{
      if(i<desde){ x+=c.w; return; }
      const neg=!!f.tot||!!c.neg;
      lin[i].forEach((t,j)=>{
        const s = c.parte ? t : pdfCorta(t,c.w-3.2,tam,neg);
        const px = c.a==="d" ? x+c.w-1.6 : (c.a==="c" ? x+c.w/2 : x+1.6);
        D.txt(px,est.y+4.4+j*3.6,s,{tam:tam,neg:neg,alin:c.a==="d"?"d":(c.a==="c"?"c":"i"),color:f.rojo&&i===f.rojo?PDF_ROJO:null});
      });
      x+=c.w;
    });
    est.y+=alto;
    D.linea(PDF_M.i,est.y,PDF_M.d,est.y,{gr:.25,color:PDF_REGLA});
  });
  est.y+=4;
}
/** Asegura que queden `mm` libres; si no, abre otra hoja. */
function pdfSitio(D,est,mm){
  if(est.y+mm>PDF_M.abajo) est.y=pdfMembrete(D,est.tit,est.sub);
}

/* ---------- el resumen de guías, en PDF ---------- */
function pdfResumen(ym,det){
  const l=guiasPeriodo(ym);
  if(!l.length){ toast("No hay guías cargadas en ese periodo.",true); return null; }
  const T=totalesGuias(l), val=T.valor>0;
  const per = ym ? nomMes(ym).toUpperCase() : "TODO LO CARGADO";
  const sub = per+" · del "+fFecha(l[0].fecha)+" al "+fFecha(l[l.length-1].fecha);
  const D=pdfDoc();
  const est={y:0, tit:"RESUMEN DE GUÍAS CARGADAS", sub:sub};
  est.y=pdfMembrete(D,est.tit,est.sub);

  const cif=[{e:"GUÍAS CARGADAS",v:String(T.guias)},
             {e:"ARTÍCULOS",v:String(T.lineas)},
             {e:"UNIDADES RECIBIDAS",v:fmt(T.unidades)}];
  if(val) cif.push({e:"VALORIZADO",v:"S/ "+pdfMon(T.valor)});
  if(T.sinPapel) cif.push({e:"SIN GUÍA DE ALMACÉN",v:String(T.sinPapel),rojo:true});
  est.y=pdfCifras(D,est.y,cif);

  if(det==="c"){
    const con={};
    l.forEach(m=>(m.items||[]).forEach(x=>{
      const c=con[x.cod]||(con[x.cod]={cant:0,imp:0,gu:{}});
      c.cant=q2(c.cant+nn(x.cant)); c.imp=q2(c.imp+nn(x.cant)*nn(x.precio)); c.gu[m.nroDoc]=1;
    }));
    const cols = val
      ? [{t:"CÓDIGO",w:20},{t:"ARTÍCULO",w:62,parte:1},{t:"UND.",w:12,a:"c"},{t:"ALMACÉN",w:22,parte:1},
         {t:"GUÍAS",w:13,a:"c"},{t:"RECIBIDO",w:20,a:"d",neg:1},{t:"QUEDA HOY",w:19,a:"d"},{t:"IMPORTE S/",w:18,a:"d"}]
      : [{t:"CÓDIGO",w:24},{t:"ARTÍCULO",w:79,parte:1},{t:"UND.",w:14,a:"c"},{t:"ALMACÉN",w:26,parte:1},
         {t:"GUÍAS",w:15,a:"c"},{t:"RECIBIDO",w:15,a:"d",neg:1},{t:"QUEDA HOY",w:13,a:"d"}];
    const filas=Object.keys(con).sort().map(k=>{
      const it=cat(k), c=con[k];
      const b=[k, it?it.desc:"—", it?it.uni:"", it?(almDe(it)||"—"):"—",
               String(Object.keys(c.gu).length), fmt(c.cant), fmt(saldo(k))];
      if(val) b.push(c.imp?pdfMon(c.imp):"—");
      return {c:b};
    });
    const tf=["","","","","",fmt(T.unidades),""];
    if(val) tf.push(pdfMon(T.valor));
    filas.push({c:tf,tot:true,etq:"TOTAL RECIBIDO",desde:5});
    pdfTabla(D,est,cols,filas);
  }
  else if(det==="d"){
    const cols = val
      ? [{t:"FECHA",w:19,a:"c"},{t:"CÓDIGO",w:20},{t:"ARTÍCULO",w:72,parte:1},{t:"UND.",w:13,a:"c"},
         {t:"CANTIDAD",w:19,a:"d",neg:1},{t:"P. UNIT. S/",w:20,a:"d"},{t:"IMPORTE S/",w:23,a:"d"}]
      : [{t:"FECHA",w:20,a:"c"},{t:"CÓDIGO",w:24},{t:"ARTÍCULO",w:106,parte:1},{t:"UND.",w:15,a:"c"},
         {t:"CANTIDAD",w:21,a:"d",neg:1}];
    const filas=[];
    l.forEach(m=>{
      filas.push({
        banda: m.tipoDoc+" "+m.nroDoc+(m.nroDoc2?" · "+m.nroDoc2:"")+" — "+(m.contra||"sin proveedor"),
        banda2: (m.llegada?"Llegó a "+m.llegada+" · ":"")+"recibió "+nom(m.persona)
          +(m.transporte?" · lo trajo "+m.transporte:"")
          +(m.provisional?" · SIN GUÍA DE ALMACÉN, pendiente de regularizar":"")
          +(m.deQ>1?" · parte "+m.parte+" de "+m.deQ:""),
        der: fmt(cantMov(m))+" unid."});
      (m.items||[]).forEach(x=>{
        const it=cat(x.cod);
        const b=[fFecha(m.fecha), x.cod, it?it.desc:"—", it?it.uni:"", fmt(x.cant)];
        if(val){ b.push(nn(x.precio)?pdfMon(x.precio):"—"); b.push(nn(x.precio)?pdfMon(q2(nn(x.cant)*nn(x.precio))):"—"); }
        filas.push({c:b});
      });
    });
    const tf=["","","","",fmt(T.unidades)];
    if(val){ tf.push(""); tf.push(pdfMon(T.valor)); }
    filas.push({c:tf,tot:true,etq:"TOTAL RECIBIDO",desde:4});
    pdfTabla(D,est,cols,filas);
  }
  else{
    const cols = val
      ? [{t:"N°",w:7,a:"c"},{t:"FECHA",w:19,a:"c"},{t:"DOCUMENTO",w:37,parte:1},{t:"PROVEEDOR",w:34,parte:1},
         {t:"LLEGÓ A",w:28,parte:1},{t:"QUIÉN RECIBIÓ",w:21,parte:1},
         {t:"ART.",w:8,a:"c"},{t:"UNID.",w:13,a:"d",neg:1},{t:"IMPORTE S/",w:19,a:"d"}]
      : [{t:"N°",w:8,a:"c"},{t:"FECHA",w:19,a:"c"},{t:"DOCUMENTO",w:40,parte:1},{t:"PROVEEDOR",w:41,parte:1},
         {t:"LLEGÓ A",w:33,parte:1},{t:"QUIÉN RECIBIÓ",w:26,parte:1},
         {t:"ART.",w:9,a:"c"},{t:"UNID.",w:10,a:"d",neg:1}];
    const filas=l.map((m,i)=>{
      const doc=m.tipoDoc+" "+m.nroDoc+(m.nroDoc2?" · "+m.nroDoc2:"")+(m.provisional?" · SIN PAPEL":"")
              +(m.deQ>1?" · parte "+m.parte+"/"+m.deQ:"");
      const b=[String(i+1), fFecha(m.fecha), doc, m.contra||"—", m.llegada||"—", nom(m.persona),
               String((m.items||[]).length), fmt(cantMov(m))];
      if(val) b.push(importeMov(m)?pdfMon(importeMov(m)):"—");
      return {c:b, rojo:m.provisional?2:0};
    });
    const tf=["","","","","","",String(T.lineas),fmt(T.unidades)];
    if(val) tf.push(pdfMon(T.valor));
    filas.push({c:tf,tot:true,etq:"TOTAL DEL PERIODO",desde:6});
    pdfTabla(D,est,cols,filas);

    /* cuánto trajo cada proveedor */
    const p={};
    l.forEach(m=>{ const k=String(m.contra||"SIN PROVEEDOR").toUpperCase();
      const c=p[k]||(p[k]={g:0,u:0,i:0}); c.g++; c.u=q2(c.u+cantMov(m)); c.i=q2(c.i+importeMov(m)); });
    const ks=Object.keys(p).sort();
    if(ks.length>1){
      pdfSitio(D,est,18+ks.length*6);
      D.txt(PDF_M.i,est.y+2,"CUÁNTO TRAJO CADA PROVEEDOR",{tam:8.5,neg:true,color:PDF_TINTA});
      est.y+=5;
      const c2 = val
        ? [{t:"PROVEEDOR",w:110,parte:1},{t:"GUÍAS",w:22,a:"c"},{t:"UNIDADES",w:28,a:"d",neg:1},{t:"IMPORTE S/",w:26,a:"d"}]
        : [{t:"PROVEEDOR",w:128,parte:1},{t:"GUÍAS",w:28,a:"c"},{t:"UNIDADES",w:30,a:"d",neg:1}];
      pdfTabla(D,est,c2,ks.map(k=>{
        const b=[k,String(p[k].g),fmt(p[k].u)];
        if(val) b.push(p[k].i?pdfMon(p[k].i):"—");
        return {c:b};
      }));
    }
  }

  pdfSitio(D,est,30);
  D.txt(PDF_M.i,est.y+3,"Este resumen sale de lo que se tipeó en el sistema. Cada línea se coteja contra su guía de almacén física, archivada por número.",
    {tam:7.2,color:PDF_GRIS});
  pdfFirmas(D,est.y+20,["ALMACENERO · "+(S.meta.almacenero||""),"ENCARGADO DE MATERIALES · ","RESIDENTE DE OBRA · "]);
  pdfPies(D,"SICA · "+S.meta.obra+" — "+S.meta.cp);
  return {bytes:D.bytes(), nombre:"RESUMEN_GUIAS_"+(ym?ym.replace("-",""):"TODO")+"_"+hoy().replace(/-/g,"")+".pdf"};
}
ACC.pdfResumen = d=>{
  const r=pdfResumen(d.ym||"", d.det||"r");
  if(r) descargar(r.nombre, r.bytes, "application/pdf");
};

/* ======================================================================
   EL VALE DE 15 × 15 cm
   Un solo diseño sirve para tres cosas:
     · el vale lleno que se imprime desde el sistema
     · el talonario en blanco que se manda a la imprenta
     · la vista previa en pantalla, a tamaño real
   ====================================================================== */

const VALE_DEF = {lineas:5, devolucion:true, marcas:true};
function cfgVale(){
  if(!S.meta.vale) S.meta.vale=Object.assign({},VALE_DEF);
  return Object.assign({},VALE_DEF,S.meta.vale);
}

function logoJVC(color,w){
  const h=Math.round(w*30/34*100)/100;
  return `<svg width="${w}mm" height="${h}mm" viewBox="0 0 34 30" aria-hidden="true" style="display:block">
    <g fill="${color}">
      <rect x="0" y="21" width="3.4" height="9"/><rect x="4.3" y="14" width="3.4" height="16"/>
      <rect x="8.6" y="9" width="3.4" height="21"/><rect x="12.9" y="16" width="2" height="14" opacity=".55"/>
      <rect x="15.8" y="3" width="4.6" height="27"/><rect x="21.2" y="0" width="3.4" height="30"/>
      <rect x="25.5" y="6" width="3.4" height="24"/><rect x="29.8" y="17" width="3.4" height="13"/>
    </g></svg>`;
}

/** Arma un vale. mov = null → vale en blanco del talonario. */
function valeHTML(mov, num, hoja, deHojas){
  const c=cfgVale();
  const nro = mov ? mov.nroDoc : num;
  const its = mov ? (mov.items||[]) : [];
  const esHerr = mov ? (MOT_RETORNA.includes(mov.motivo) || its.some(l=>retornable(cat(l.cod)))) : false;
  const esMat  = mov ? !esHerr : false;
  const mk = on => on ? `<span class="vk on"></span>` : `<span class="vk"></span>`;
  const lin = v => `<span class="vl">${v==null||v===""?"&nbsp;":esc(v)}</span>`;

  let filas="";
  for(let i=0;i<c.lineas;i++){
    const l=its[i], it=l?cat(l.cod):null;
    filas += `<tr>
      <td class="vc">${l?esc(l.cod):"&nbsp;"}</td>
      <td class="vd">${l?esc(it?it.desc:l.cod):"&nbsp;"}</td>
      <td class="vu">${l&&it?esc(it.uni):"&nbsp;"}</td>
      <td class="vq">${l?fmt(l.cant):"&nbsp;"}</td>
    </tr>`;
  }

  return `<div class="vale">
    ${c.marcas?`<i class="mc a"></i><i class="mc b"></i><i class="mc c"></i><i class="mc d"></i>`:""}
    <div class="vale-in">

      <div class="vh">
        <div class="vh-l">
          ${logoJVC("#1D3F7C",13)}
        </div>
        <div class="vh-c">
          <b>${esc(S.meta.empresa)}</b>
          <span>RUC ${esc(S.meta.ruc)} · ${esc(S.meta.direccion)}</span>
        </div>
        <div class="vh-r"><div class="vnum">${esc(nro||"V-____")}</div></div>
      </div>

      <div class="vt">
        <b>VALE DE SALIDA DE ALMACÉN</b>
        <span>OBRA: ${esc(S.meta.obra)} — ${esc(S.meta.cp)} · CUI ${esc(S.meta.cui)}${deHojas>1?` · HOJA ${hoja} DE ${deHojas}`:""}</span>
      </div>

      <div class="vr1">
        <div class="vf w34"><label>FECHA</label>${lin(mov?fFecha(mov.fecha):"")}</div>
        <div class="vf w20"><label>HORA</label>${lin(mov?mov.hora:"")}</div>
        <div class="vtipo">
          <span>${mk(esHerr)} HERRAMIENTA</span>
          <span>${mk(esMat)} MATERIAL</span>
        </div>
      </div>

      <div class="vr1">
        <div class="vf w100"><label>FRENTE O ÁREA DE TRABAJO</label>${lin(mov?mov.area:"")}</div>
      </div>

      <div class="vzona"><table class="vtab">
        <thead><tr><th class="vc">CÓDIGO</th><th class="vd">ARTÍCULO</th><th class="vu">UND.</th><th class="vq">CANT.</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>

      <div class="vfirmas">
        <div><span class="vfl">${mov?esc(nom(mov.autoriza)):"&nbsp;"}</span><b>AUTORIZA</b><i>quien manda a pedir</i></div>
        <div><span class="vfl">${mov?esc(nom(mov.persona)):"&nbsp;"}</span><b>RECIBE</b><i>quien se lo lleva</i></div>
        <div><span class="vfl">${mov?esc(mov.almacenero||S.meta.almacenero||""):"&nbsp;"}</span><b>ALMACENERO</b><i>quien despacha</i></div>
      </div>

      ${c.devolucion?`<div class="vdev">
        <b>DEVOLUCIÓN</b><span class="vdn">solo herramienta</span>
        <span class="vdc">FECHA ${lin("")}</span>
        <span class="vdc">${mk(false)} BUENO ${mk(false)} OBSERVADO ${mk(false)} DAÑADO</span>
        <span class="vdc vdf">RECIBE ALMACÉN ${lin("")}</span>
      </div>`:""}

      <div class="vpie">Vale de un solo uso. Sin las dos firmas el almacén no despacha. La herramienta vuelve al cierre de labores.</div>
    </div>
  </div>`;
}

function imprimirVale(mov){
  const c=cfgVale();
  const its=mov.items||[];
  const n=Math.max(1,Math.ceil(its.length/c.lineas));
  let h="";
  for(let i=0;i<n;i++){
    const copia=Object.assign({},mov,{items:its.slice(i*c.lineas,(i+1)*c.lineas)});
    h+=valeHTML(copia, mov.nroDoc, i+1, n);
  }
  lanzar(h, VALE_HOJA);
}
let VALE_HOJA="vale";

ACC.impTalonario = d=>{
  const desde = nn(d&&d.desde) || nn(S.meta.proxVale) || 21;
  const n = nn(d&&d.n) || 20;
  let h="";
  for(let i=0;i<n;i++) h+=valeHTML(null,"V-"+String(desde+i).padStart(4,"0"),1,1);
  lanzar(h, VALE_HOJA);
};
ACC.valePrueba = ()=>{
  const ult = IX.movs.filter(m=>m.sentido==="S").slice(-1)[0];
  if(ult) return imprimirVale(ult);
  ACC.impTalonario({desde:S.meta.proxVale||21, n:1});
};
function fijarVale(k,v){
  const c=cfgVale();
  c[k] = k==="lineas" ? Math.max(3,Math.min(8,Math.round(nn(v)))) : !!v;
  S.meta.vale=c; subir("meta"); pintar();
}
ACC.valeSpec = ()=>{
  const c=cfgVale();
  modal("Lo que hay que decirle a la imprenta", `
    ${expl("Copia esto tal cual",[
      "Es la ficha técnica del talonario. Con esto la imprenta no tiene que adivinar nada."
    ])}
    <div class="bloque"><div class="pad" style="font-family:var(--f-mono);font-size:14.5px;line-height:1.75">
      TALONARIO DE VALES DE SALIDA DE ALMACÉN<br>
      ${esc(S.meta.empresa)} — RUC ${esc(S.meta.ruc)}<br>
      Obra: ${esc(S.meta.obra)} — ${esc(S.meta.cp)} · CUI ${esc(S.meta.cui)}<br><br>
      Formato . . . . . 15 × 15 cm (cuadrado)<br>
      Numeración . . . correlativa, impresa, desde V-${String(nn(S.meta.proxVale)||21).padStart(4,"0")}<br>
      Juegos . . . . . . 1 solo original (sin copia)<br>
      Tinta . . . . . . . 1 color: azul Pantone 288 C aprox. (o negro)<br>
      Papel . . . . . . . bond 90 g<br>
      Encuadernado . talonarios de 50 vales, engomados por el borde superior<br>
      Líneas de artículo . ${c.lineas}<br>
      Banda de devolución . ${c.devolucion?"sí, al pie":"no"}<br><br>
      El archivo maestro sale del sistema con «Descargar el vale en PDF».
    </div></div>
    <p class="nota">Si prefieren dos copias (una para el almacén y otra para el maestro), díganlo: hay que pedir papel autocopiativo y sube el costo.</p>`,
    [{t:"Descargar el vale en PDF",clase:"sec",fn:()=>{cerrar(); ACC.valePDF();}},{t:"Cerrar",fn:cerrar}], 760);
};
ACC.valePDF = ()=>{
  VALE_HOJA="vale";
  ACC.impTalonario({desde:S.meta.proxVale||21, n:1});
  toast("En la ventana de impresión elige «Guardar como PDF» y desactiva encabezados.");
};

/* bloque que se inserta en Ajustes */
function bloqueVale(){
  const c=cfgVale();
  return `<div class="bloque"><h2>EL VALE · 15 × 15 cm</h2><div class="pad">
    ${expl("Cómo está armado",[
      "Mide <b>15 × 15 cm</b> exactos, del tamaño que pidieron. Lleva el logo, el RUC y los datos de la obra ya impresos.",
      "Trae lo indispensable y nada más: <b>número</b>, fecha, si es herramienta o material, el frente, hasta ${lineas} artículos y las <b>tres firmas</b>.".replace("${lineas}",c.lineas),
      "Al pie va una banda para anotar la <b>devolución</b> de la herramienta, así el mismo papel sirve de salida y de retorno.",
      "El almacenero se queda con el vale. Ese papel es la prueba de todo."
    ])}
    <div class="campos" style="margin-bottom:16px">
      ${campo("vl-lineas","LÍNEAS DE ARTÍCULO","Cuántos artículos distintos entran en un vale. Con 5 alcanza para casi todo; de 7 para arriba las filas quedan angostas para escribir a mano.",
        `<input id="vl-lineas" class="mono" inputmode="numeric" value="${c.lineas}">`)}
      <div class="campo"><label class="dupla"><input type="checkbox" id="vl-dev"${c.devolucion?" checked":""}> Banda de devolución al pie</label>
        <span class="ayuda">Quítala solo si van a usar un papel aparte para los retornos.</span></div>
      <div class="campo"><label class="dupla"><input type="checkbox" id="vl-mar"${c.marcas?" checked":""}> Marcas de corte</label>
        <span class="ayuda">Las cuatro esquinitas que le sirven a la imprenta para guillotinar.</span></div>
    </div>

    <div class="corte" style="margin:0 0 18px"></div>

    <p class="nota" style="margin:0 0 10px"><b>Vista previa a tamaño real.</b> Así de grande sale en papel.</p>
    <div class="vale-prev">${valeHTML(null,"V-"+String(nn(S.meta.proxVale)||21).padStart(4,"0"),1,1)}</div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button class="b" data-acc="valePrueba">Imprimir un vale de prueba</button>
      <button class="b sec" data-acc="impTalonario" data-n="20">Imprimir talonario (20 vales)</button>
      <button class="b sec" data-acc="valeSpec">Ficha para la imprenta</button>
    </div>
    <div class="tipovale" style="margin-top:14px">
      <label><input type="radio" name="vh" value="vale" ${VALE_HOJA==="vale"?"checked":""}><span class="cuad"></span> Página de 15 × 15 cm</label>
      <label><input type="radio" name="vh" value="valeA4" ${VALE_HOJA==="valeA4"?"checked":""}><span class="cuad"></span> Centrado en hoja A4</label>
    </div>
    <p class="nota">La página de 15 × 15 es la que va a la imprenta. La de A4 es para imprimir en la obra y recortar: entra un vale por hoja.</p>
  </div></div>`;
}
/* ======================================================================
   AJUSTES
   ====================================================================== */
VISTAS.ajustes = function(){
  const nDias=diasOrden().length, nMovs=IX.movs.length;
  let fotos=0; diasOrden().forEach(f=>(S.dias[f].horometro||[]).forEach(h=>{ if(h.fotoIni)fotos++; if(h.fotoFin)fotos++; }));
  const kb = Math.round((JSON.stringify(S).length/1024));

  return `
  <div class="bloque"><h2>DATOS DE LA OBRA</h2><div class="pad">
    <div class="campos">
      ${campo("aj-empresa","EMPRESA","",`<input id="aj-empresa" value="${esc(S.meta.empresa)}">`)}
      ${campo("aj-ruc","RUC","",`<input id="aj-ruc" class="mono" value="${esc(S.meta.ruc)}">`)}
      ${campo("aj-dir","DIRECCIÓN","",`<input id="aj-dir" value="${esc(S.meta.direccion)}">`)}
      ${campo("aj-obra","NOMBRE DE LA OBRA","",`<input id="aj-obra" value="${esc(S.meta.obra)}">`)}
      ${campo("aj-cp","CENTRO POBLADO O LUGAR","",`<input id="aj-cp" value="${esc(S.meta.cp)}">`)}
      ${campo("aj-ubi","DISTRITO, PROVINCIA Y REGIÓN","",`<input id="aj-ubi" value="${esc(S.meta.ubicacion)}">`)}
      ${campo("aj-cui","CUI","",`<input id="aj-cui" class="mono" value="${esc(S.meta.cui)}">`)}
      ${campo("aj-meta","META PRESUPUESTAL","Opcional. Sale impresa en los cuadros.",`<input id="aj-meta" class="mono" value="${esc(S.meta.metaPres||"")}">`)}
      ${campo("aj-alm","ALMACENERO","Sale por defecto en cada movimiento.",`<input id="aj-alm" value="${esc(S.meta.almacenero)}">`)}
    </div>
    <div style="margin-top:16px"><button class="b" data-acc="ajGuardar">Guardar datos de obra</button></div>
  </div></div>

  <div class="bloque"><h2>NUMERACIÓN</h2><div class="pad">
    <p class="nota" style="margin:0 0 14px">El sistema propone el siguiente número, pero puedes escribir otro a mano si el talonario va por otro lado.</p>
    <div class="campos">
      ${campo("aj-vale","PRÓXIMO N° DE VALE","El talonario impreso llega hasta V-0020, así que el sistema arranca en 21.",`<input id="aj-vale" class="mono" inputmode="numeric" value="${esc(S.meta.proxVale)}">`)}
      ${campo("aj-cua","PRÓXIMO N° DE CUADERNO","Para las salidas que solo se anotan en el cuaderno del almacén (CA-0001).",`<input id="aj-cua" class="mono" inputmode="numeric" value="${esc(S.meta.proxCua||1)}">`)}
      ${campo("aj-req","PRÓXIMO N° DE REQUERIMIENTO","",`<input id="aj-req" class="mono" inputmode="numeric" value="${esc(S.meta.proxReq)}">`)}
    </div>
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="b sec" data-acc="ajNum">Guardar numeración</button>
    </div>
  </div></div>

  ${bloqueVale()}

  <div class="bloque"><h2>RESPALDO</h2><div class="pad">
    ${expl("Hazlo todos los viernes",[
      "El respaldo es un archivo con <b>todo</b>: catálogo, personal, movimientos, conteos y fotos. Guárdalo en tu Drive o en un USB.",
      "Si se pierde el celular o la laptop, con ese archivo el almacén vuelve exactamente como estaba.",
      DB?"Además todo se está guardando en la nube de tu cuenta, así que ya hay dos copias.":"En este equipo <b>no</b> hay nube: el respaldo es la única copia. No te lo saltes."
    ])}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="b" data-acc="ajRespaldo">Descargar respaldo</button>
      <button class="b sec" data-acc="ajSumar">Cargar un archivo SIN borrar lo de ahora</button>
      <button class="b sec" data-acc="ajRestaurar">Restaurar desde un respaldo</button>
      ${DB?`<button class="b sec" data-acc="ajSync">Sincronizar con la nube</button>`:""}
    </div>
    <p class="nota">Guardado en este equipo: ${nDias} días · ${nMovs} movimientos · ${fotos} fotos · ${kb} KB${DB?" · con nube":" · sin nube"}</p>
  </div></div>

  <div class="bloque"><h2>CARGAR EL CATÁLOGO DESDE EXCEL</h2><div class="pad">
    ${expl("Para no escribir 300 artículos a mano",[
      "Descarga la plantilla, ábrela en Numbers o Excel, llena una fila por artículo y súbela de vuelta.",
      "Las columnas que importan son <b>COD.</b>, <b>DESCRIPCION</b> y <b>UNI. MED.</b>. Las demás son opcionales.",
      "Si un código ya existe, se actualiza; si es nuevo, se agrega. No se borra nada."
    ])}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="b sec" data-acc="ajPlantCat">Plantilla de catálogo</button>
      <button class="b sec" data-acc="ajPlantPer">Plantilla de personal</button>
      <button class="b" data-acc="ajSubirCat">Subir catálogo</button>
      <button class="b" data-acc="ajSubirPer">Subir personal</button>
    </div>
  </div></div>

  <div class="bloque"><h2>MANTENIMIENTO</h2><div class="pad">
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="b sec" data-acc="ajTema">${S.meta.tema==="dark"?"Modo claro":"Modo oscuro"}</button>
      <button class="b sec" data-acc="ajFotos">Quitar fotos de más de 90 días</button>
      <button class="b sec" data-acc="ajCopia">Guardar copia del programa</button>
      <button class="b peligro" data-acc="ajBorrar">Borrar todo</button>
    </div>
  </div></div>

  <div class="bloque"><h2>CÓMO FUNCIONA EL VALE</h2>
    <ul class="pasos">
      <li><span class="mk">1</span><span class="tx">El <b>maestro de obra</b> llena el vale del talonario y lo firma. Él es quien <b>autoriza</b>: quien manda a pedir.</span></li>
      <li><span class="mk">2</span><span class="tx">El <b>obrero</b> lleva el vale al almacén. Él es quien aparece en <b>entregado a</b>.</span></li>
      <li><span class="mk">3</span><span class="tx">El <b>almacenero</b> verifica, despacha y se queda con el vale. Sin las dos firmas no se despacha.</span></li>
      <li><span class="mk">4</span><span class="tx">Si era herramienta, al cierre de labores vuelve y se registra la <b>devolución</b>.</span></li>
      <li><span class="mk">5</span><span class="tx">El vale se pasa al sistema con el <b>mismo número</b>. Un vale, un solo uso.</span></li>
    </ul>
  </div>`;
};

ACC.ajGuardar = ()=>{
  Object.assign(S.meta,{empresa:leer("aj-empresa"),ruc:leer("aj-ruc"),direccion:leer("aj-dir"),
    obra:leer("aj-obra"),cp:leer("aj-cp"),ubicacion:leer("aj-ubi"),cui:leer("aj-cui"),
    metaPres:leer("aj-meta"),almacenero:leer("aj-alm")});
  subir("meta"); pintar(); toast("Datos de obra guardados.");
};
ACC.ajNum = ()=>{
  S.meta.proxVale=Math.max(1,leerN("aj-vale")); S.meta.proxCua=Math.max(1,leerN("aj-cua")); S.meta.proxReq=Math.max(1,leerN("aj-req"));
  subir("meta"); pintar(); toast("Numeración guardada.");
};
ACC.ajTema = ()=>{
  S.meta.tema = S.meta.tema==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme",S.meta.tema);
  subir("meta"); pintar();
};
ACC.ajSync = ()=>sincronizar(false);
ACC.ajRespaldo = ()=>descargar("RESPALDO_ALMACEN_"+hoy().replace(/-/g,"")+".json", JSON.stringify(S), "application/json");
ACC.ajCopia = ()=>descargar("SICA_almacen.html", document.documentElement.outerHTML, "text/html");

function pedirArchivo(accept,cb){
  const i=document.createElement("input"); i.type="file"; i.accept=accept;
  i.onchange=()=>{ const f=i.files&&i.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>cb(String(r.result)); r.onerror=()=>toast("No se pudo leer el archivo.",true); r.readAsText(f,"utf-8"); };
  i.click();
}
ACC.ajRestaurar = ()=>{
  confirmar("Restaurar desde un respaldo",
    "Todo lo que hay ahora en este equipo se va a <b>reemplazar</b> por el contenido del archivo.<br><br>Descarga primero un respaldo de lo actual, por si acaso.",
    ()=>pedirArchivo(".json,application/json", txt=>{
      try{
        const d=JSON.parse(txt);
        if(!d||!d.meta) throw 0;
        S=Object.assign(VACIO(),d); S.dias=d.dias||{};
        guardarLocal(); indexar();
        LLAVES.forEach(k=>subir(k)); diasOrden().forEach(f=>subirDia(f));
        pintar(); toast("Respaldo restaurado.");
      }catch(e){ toast("Ese archivo no es un respaldo válido.",true); }
    }), "Restaurar", true);
};
/* ---------- cargar un archivo SIN borrar lo que ya hay ----------
   "Restaurar" reemplaza todo y sirve cuando se perdió el equipo. Esto es lo
   contrario: se usa cuando ya estás trabajando y te llega un archivo con más
   guías. Nada de lo que ya está se toca; solo se agrega lo que falta.
   Una guía ya cargada NO se vuelve a cargar: se reconoce por tipo + número
   + fecha, que es como la reconocería cualquiera mirando el papel. --------- */
function normDesc(t){ return String(t||"").trim().toUpperCase().replace(/\s+/g," "); }

function fusionar(d){
  const r = {arts:0, artsYa:0, movs:0, movsYa:0, reqs:0, reqsYa:0, per:0, dias:{}};

  /* --- personal: se reconoce por DNI, y si no hay DNI, por el nombre --- */
  const mapaPer = {};
  (d.personal && d.personal.items || []).forEach(o=>{
    const dni=String(o.dni||"").trim();
    let x = dni ? S.personal.items.find(q=>String(q.dni||"").trim()===dni) : null;
    if(!x) x = S.personal.items.find(q=>normDesc(q.nombres+" "+q.apellidos)===normDesc(o.nombres+" "+o.apellidos));
    if(!x){ x=Object.assign({},o,{id:uid("pe")}); S.personal.items.push(x); r.per++; }
    mapaPer[o.id]=x.id;
  });

  /* --- catálogo: se reconoce por la descripción, que es lo que lee la gente.
         Si el artículo ya existe se reusa su código; si no, nace uno nuevo. --- */
  const mapaCod = {};
  (d.catalogo && d.catalogo.items || []).forEach(o=>{
    const x = S.catalogo.items.find(q=>normDesc(q.desc)===normDesc(o.desc));
    if(x){ mapaCod[o.cod]=x.cod; r.artsYa++; return; }
    const tipo = tipoDeClasif(o.clasif);
    const nuevo = Object.assign({}, o, {id:uid("it"), cod:codigoProvisional(tipo)});
    if(nuevo.retorna===undefined) delete nuevo.retorna;
    S.catalogo.items.push(nuevo);
    mapaCod[o.cod]=nuevo.cod; r.arts++;
  });

  /* --- listas: se juntan sin repetir --- */
  Object.keys(d.listas||{}).forEach(k=>{
    if(k==="_ts" || !Array.isArray(d.listas[k])) return;
    d.listas[k].forEach(v=>sumaLista(k,v));
  });

  /* --- movimientos: uno por uno, saltando los que ya están --- */
  const yaHay = f => (S.dias[f] && S.dias[f].movs || []);
  Object.keys(d.dias||{}).sort().forEach(f=>{
    (d.dias[f].movs||[]).forEach(m=>{
      const igual = yaHay(f).some(q =>
        String(q.tipoDoc||"").toUpperCase()===String(m.tipoDoc||"").toUpperCase() &&
        String(q.nroDoc ||"").toUpperCase()===String(m.nroDoc ||"").toUpperCase() &&
        q.sentido===m.sentido);
      if(igual){ r.movsYa++; return; }
      const o = Object.assign({}, m, {
        id: uid("mv"),
        persona: mapaPer[m.persona] || m.persona || "",
        autoriza: mapaPer[m.autoriza] || m.autoriza || "",
        items: (m.items||[]).map(l=>Object.assign({}, l, {cod: mapaCod[l.cod] || l.cod}))
      });
      o.items = o.items.filter(l=>cat(l.cod));
      if(!o.items.length){ r.movsYa++; return; }
      dia(f).movs.push(o); r.movs++; r.dias[f]=1;
    });
  });

  /* --- requerimientos: se reconocen por su número --- */
  (d.requerimientos && d.requerimientos.items || []).forEach(q=>{
    const num = normDesc(q.n).replace(/^R-?/,"");
    if(S.requerimientos.items.some(x=>normDesc(x.n).replace(/^R-?/,"")===num)){ r.reqsYa++; return; }
    S.requerimientos.items.push(Object.assign({}, q, {
      id: uid("rq"),
      autoriza: mapaPer[q.autoriza] || q.autoriza || "",
      items: (q.items||[]).map(l=>Object.assign({}, l, {cod: mapaCod[l.cod] || l.cod})).filter(l=>cat(l.cod))
    }));
    r.reqs++;
  });
  const mayor = S.requerimientos.items.reduce((a,x)=>Math.max(a, parseInt(String(x.n).replace(/\D/g,""),10)||0), 0);
  if(mayor >= nn(S.meta.proxReq)) S.meta.proxReq = mayor+1;

  return r;
}

ACC.ajSumar = ()=>{
  confirmar("Cargar sin borrar",
    "Se le <b>suma</b> al almacén lo que trae el archivo. Nada de lo que ya tienes se borra ni se cambia.<br><br>"+
    "Las guías que ya estén cargadas <b>no se repiten</b>: se reconocen por su tipo y su número. "+
    "Los artículos que ya existan se reusan por su descripción, así que no se duplica el catálogo.<br><br>"+
    "Aun así, descarga primero un respaldo. Es un minuto.",
    ()=>pedirArchivo(".json,application/json", txt=>{
      let d; try{ d=JSON.parse(txt); }catch(e){ return toast("Ese archivo no se puede leer.",true); }
      if(!d || !d.meta) return toast("Ese archivo no es un respaldo del almacén.",true);
      let r; try{ r=fusionar(d); }
      catch(e){ anotarFalla(e,"fusionar"); return toast("No se pudo cargar: "+e.message,true); }
      guardarLocal(); indexar(); pintar();
      /* se sube de a uno, no todo de golpe: en la obra el internet es flojo
         y 24 subidas al mismo tiempo se caen a la mitad. */
      (async()=>{
        toast("Guardado aquí. Subiendo a la nube…");
        for(const k of LLAVES) await subir(k);
        for(const f of Object.keys(r.dias).sort()) await subirDia(f);
        avisoCarga(r);
      })();
    }), "Cargar sin borrar");
};

function avisoCarga(r){
  modal("Lo que entró", `
    ${expl("Ya está cargado",[
      "Abajo está lo que se agregó y lo que ya estaba. Si algo no cuadra, en Ajustes tienes el respaldo para volver atrás.",
      "Revisa el kardex y el stock antes de seguir trabajando."
    ])}
    <table class="t"><thead><tr><th>QUÉ</th><th class="der">SE AGREGÓ</th><th class="der">YA ESTABA</th></tr></thead>
    <tbody>
      <tr><td>Artículos del catálogo</td><td class="der mono">${r.arts}</td><td class="der mono">${r.artsYa}</td></tr>
      <tr><td>Guías y movimientos</td><td class="der mono">${r.movs}</td><td class="der mono">${r.movsYa}</td></tr>
      <tr><td>Requerimientos</td><td class="der mono">${r.reqs}</td><td class="der mono">${r.reqsYa}</td></tr>
      <tr><td>Personas</td><td class="der mono">${r.per}</td><td class="der mono">—</td></tr>
    </tbody></table>`,
    [{t:"Listo",fn:cerrar}], 620);
  toast(`Cargado: ${r.movs} movimientos y ${r.arts} artículos nuevos.`);
}

ACC.ajFotos = ()=>{
  const corte=new Date(Date.now()-90*864e5).toISOString().slice(0,10);
  let n=0;
  diasOrden().filter(f=>f<corte).forEach(f=>{
    (S.dias[f].horometro||[]).forEach(h=>{
      if(h.fotoIni&&h.fotoIni.k!=="a"){h.fotoIni=null;n++;}
      if(h.fotoFin&&h.fotoFin.k!=="a"){h.fotoFin=null;n++;}
    });
    if(n) subirDia(f);
  });
  pintar(); toast(n?n+" fotos quitadas del equipo.":"No hay fotos viejas guardadas aquí.");
};
ACC.ajBorrar = ()=>{
  confirmar("Borrar todo","Se borra el catálogo, el personal y <b>todos</b> los movimientos de este equipo. No hay vuelta atrás.",
    ()=>confirmar("¿De verdad?","Última confirmación. Descarga el respaldo antes si no lo has hecho.",
      ()=>{ try{localStorage.removeItem(LS);}catch(e){} S=VACIO(); indexar(); guardarLocal(); pintar(); toast("Todo borrado."); },"Sí, borrar todo",true),
    "Borrar todo",true);
};

ACC.ajPlantCat = ()=>descargar("PLANTILLA_CATALOGO.csv", aCSV([
  ["COD.","DESCRIPCION","UNI. MED.","FAMILIA","SALDO INICIAL","STOCK MINIMO","PRECIO","RETORNA"],
  ["MA-101","CEMENTO PACASMAYO TIPO I 42.5 KG","bls","MATERIAL DE CONSTRUCCION","120","40","32.50","NO"],
  ["MA-102","FIERRO CORRUGADO 1/2\" X 9 M ACEROS AREQUIPA","varilla","MATERIAL DE CONSTRUCCION","80","20","38.00","NO"],
  ["MB-201","ARENA GRUESA","m3","AGREGADO","15","5","55.00","NO"],
  ["HA-301","CARRETILLA BUGGY 6 P3","und","HERRAMIENTA MANUAL","6","2","145.00","SI"],
  ["HA-302","PICO DE 6 LB CON MANGO","und","HERRAMIENTA MANUAL","10","3","42.00","SI"],
  ["EA-101","CASCO DE SEGURIDAD 3M BLANCO","und","EPP","24","8","28.00","NO"],
  ["CA-101","PETROLEO DIESEL B5","gal","COMBUSTIBLE Y LUBRICANTE","55","20","16.90","NO"]
]));
ACC.ajPlantPer = ()=>descargar("PLANTILLA_PERSONAL.csv", aCSV([
  ["APELLIDOS","NOMBRES","DNI","CARGO","CUADRILLA","TELEFONO","PUEDE AUTORIZAR"],
  ["RAMOS TINEO","JOSE","41230987","Maestro de obra","","","SI"],
  ["VASQUEZ LOPEZ","CARLOS","45678123","Capataz","Cuadrilla 1","","SI"],
  ["MOZOMBITE RIOS","LUIS","72345678","Operario","Cuadrilla 1","",""],
  ["TAPULLIMA YUMBATO","JUAN","70123456","Operador de maquinaria","","",""]
]));

function buscaCol(cab,alts){
  const norm=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const c=cab.map(norm);
  for(const a of alts){ const i=c.indexOf(norm(a)); if(i>=0) return i; }
  for(const a of alts){ const i=c.findIndex(x=>x.includes(norm(a))); if(i>=0) return i; }
  return -1;
}
ACC.ajSubirCat = ()=>pedirArchivo(".csv,text/csv", txt=>{
  const f=deCSV(txt); if(f.length<2) return toast("El archivo está vacío.",true);
  const cab=f[0];
  const ic=buscaCol(cab,["COD.","CODIGO","COD ALM","COD"]);
  const id_=buscaCol(cab,["DESCRIPCION","DESCRIPCION (ALMACEN)","ARTICULO","NOMBRE"]);
  const iu=buscaCol(cab,["UNI. MED.","UNIDAD","UND","UNI"]);
  const ik=buscaCol(cab,["FAMILIA","CLASIFICACION","CLASIFICACION DE MATERIAL"]);
  const ial=buscaCol(cab,["ALMACEN","PISO","UBICACION"]);
  const ii=buscaCol(cab,["SALDO INICIAL","INICIAL","STOCK INICIAL","SALDO"]);
  const im=buscaCol(cab,["STOCK MINIMO","MINIMO"]);
  const ip=buscaCol(cab,["PRECIO","PRECIO UNIT","P UNIT"]);
  const ir=buscaCol(cab,["RETORNA","RETORNABLE","DEVUELVE"]);
  if(ic<0||id_<0) return toast("No encuentro las columnas COD. y DESCRIPCION.",true);
  const nuevos=[], act=[];
  f.slice(1).forEach(r=>{
    const cod=String(r[ic]||"").trim().toUpperCase(), desc=String(r[id_]||"").trim().toUpperCase();
    if(!cod||!desc) return;
    const o={cod, desc, uni:(iu>=0?String(r[iu]||"und").trim():"und")||"und",
      clasif:ik>=0?String(r[ik]||"").trim().toUpperCase():"",
      alm:ial>=0?String(r[ial]||"").trim().toUpperCase():"",
      inicial:ii>=0?nn(r[ii]):0, min:im>=0?nn(r[im]):0, precio:ip>=0?nn(r[ip]):0,
      retorna: ir>=0 ? /^S|^1|^SI|^X|^V/i.test(String(r[ir]||"")) : undefined, activo:true};
    if(cat(cod)) act.push(o); else nuevos.push(o);
  });
  if(!nuevos.length&&!act.length) return toast("No se pudo leer ninguna fila.",true);
  modal("Revisar antes de cargar", `
    ${expl("Esto es lo que encontré",[
      `<b>${nuevos.length}</b> artículos nuevos y <b>${act.length}</b> que ya existen y se van a actualizar.`,
      "Nada se borra. Los movimientos ya registrados no se tocan."
    ])}
    <div class="tabla-env" style="max-height:44vh;overflow:auto"><table class="reg"><thead><tr><th>Código</th><th>Artículo</th><th>Und.</th><th>Familia</th><th class="num">Inicial</th><th></th></tr></thead>
    <tbody>${nuevos.concat(act).slice(0,120).map(o=>`<tr><td class="cod">${esc(o.cod)}</td><td>${esc(o.desc)}</td><td>${esc(o.uni)}</td><td><span class="nota">${esc(o.clasif||"—")}</span></td><td class="num">${fmt(o.inicial)}</td><td>${cat(o.cod)?`<span class="et a">actualiza</span>`:`<span class="et k">nuevo</span>`}</td></tr>`).join("")}</tbody></table></div>
    ${nuevos.length+act.length>120?`<p class="nota">Se muestran las primeras 120 de ${nuevos.length+act.length}.</p>`:""}`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Cargar "+(nuevos.length+act.length)+" artículos",fn:()=>{
      nuevos.forEach(o=>{ const x=Object.assign({id:uid("it")},o); if(x.retorna===undefined) delete x.retorna; S.catalogo.items.push(x); });
      act.forEach(o=>{ const e=cat(o.cod); const y=Object.assign({},o); if(y.retorna===undefined) delete y.retorna; Object.assign(e,y); });
      subir("catalogo"); cerrar(); pintar(); toast((nuevos.length+act.length)+" artículos cargados.");
    }}], 900);
});
ACC.ajSubirPer = ()=>pedirArchivo(".csv,text/csv", txt=>{
  const f=deCSV(txt); if(f.length<2) return toast("El archivo está vacío.",true);
  const cab=f[0];
  const ia=buscaCol(cab,["APELLIDOS","APELLIDO"]), inm=buscaCol(cab,["NOMBRES","NOMBRE"]);
  const idn=buscaCol(cab,["DNI","DOCUMENTO"]), ig=buscaCol(cab,["CARGO","PUESTO"]);
  const iq=buscaCol(cab,["CUADRILLA","FRENTE","GRUPO"]), it=buscaCol(cab,["TELEFONO","CELULAR"]);
  const iau=buscaCol(cab,["PUEDE AUTORIZAR","AUTORIZA"]);
  if(ia<0||inm<0) return toast("No encuentro las columnas APELLIDOS y NOMBRES.",true);
  let n=0;
  f.slice(1).forEach(r=>{
    const ap=String(r[ia]||"").trim(), no=String(r[inm]||"").trim();
    if(!ap&&!no) return;
    S.personal.items.push({id:uid("pe"), apellidos:ap, nombres:no,
      dni:idn>=0?String(r[idn]||"").trim():"", cargo:ig>=0?String(r[ig]||"Operario").trim():"Operario",
      cuadrilla:iq>=0?String(r[iq]||"").trim():"", tel:it>=0?String(r[it]||"").trim():"",
      puedeAutorizar: iau>=0 ? /^S|^1|^SI|^X/i.test(String(r[iau]||"")) : false, activo:true});
    n++;
  });
  if(!n) return toast("No se pudo leer ninguna fila.",true);
  subir("personal"); pintar(); toast(n+" personas agregadas.");
});

/* ======================================================================
   ARRANQUE
   ====================================================================== */

/* ======================================================================
   CARGA DE GUÍAS — la pantalla para pasar el taco de guías al sistema
   Pensada para tipear rápido: se escribe el artículo, la cantidad y Enter.
   Si el artículo no existe todavía, se crea sin salir de la guía.
   ====================================================================== */

/* estantes del cuarto de materiales, según la distribución de obra */
const ESTANTES = [
  {v:"A", t:"A · EPP y seguridad"},
  {v:"B", t:"B · Herramienta manual"},
  {v:"C", t:"C · Ferretería y fijación"},
  {v:"D", t:"D · Eléctrico y sanitario"},
  {v:"E", t:"E · Equipos y valiosos"},
  {v:"Z", t:"Z · Sin ubicar todavía"}
];

/* la familia decide la primera letra del código */
const CLASIF_TIPO = {
  "HERRAMIENTA MANUAL":"H","EQUIPO A COMBUSTIBLE":"H","EQUIPO ELECTRICO":"H","EQUIPO TOPOGRAFICO":"H",
  "EPP":"E","SEGURIDAD Y SEÑALIZACION":"E",
  "COMBUSTIBLE Y LUBRICANTE":"C","REPUESTO":"R",
  "UTILES DE OFICINA":"O","PRODUCTOS DE LIMPIEZA":"O","TOPICO - ENFERMERIA":"O","SUMINISTROS":"O"
};
const tipoDeClasif = c => CLASIF_TIPO[String(c||"").toUpperCase()] || "M";

/** Código provisional en el estante Z, para lo que todavía no tiene sitio en la repisa. */
function codigoProvisional(tipo){
  for(let niv=1; niv<=9; niv++){
    const c=siguienteCasillero(tipo,"Z",niv);
    if(c<=99) return codigoDe(tipo,"Z",niv,c);
  }
  return codigoDe(tipo,"Z",9,99);
}
const sinUbicar = ()=> S.catalogo.items.filter(i=>i.activo!==false && String(i.cod).charAt(1)==="Z");

/** Reasigna el código de un artículo y reescribe todos sus movimientos, para no romper el kardex. */
function reubicar(codViejo, codNuevo){
  if(codViejo===codNuevo) return true;
  if(cat(codNuevo)) return false;
  const it=cat(codViejo); if(!it) return false;
  it.cod=codNuevo;
  const tocados={};
  for(const f of diasOrden()){
    let cambio=false;
    for(const m of (S.dias[f].movs||[]))
      for(const l of (m.items||[])) if(l.cod===codViejo){ l.cod=codNuevo; cambio=true; }
    if(cambio) tocados[f]=true;
  }
  Object.keys(S.conteos.mes||{}).forEach(ym=>{
    const c=S.conteos.mes[ym];
    if(c && c[codViejo]!==undefined){ c[codNuevo]=c[codViejo]; delete c[codViejo]; }
  });
  S.requerimientos.items.forEach(r=>(r.items||[]).forEach(l=>{ if(l.cod===codViejo) l.cod=codNuevo; }));
  subir("catalogo"); subir("conteos"); subir("requerimientos");
  Object.keys(tocados).forEach(f=>subirDia(f));
  return true;
}

/* ---------- alta rápida de artículo ---------- */
function altaRapida(descIni, cb){
  modal("Artículo nuevo", `
    ${expl("Solo lo indispensable",[
      "Con la descripción, la unidad y la familia alcanza para seguir cargando la guía.",
      "El código sale solo y queda en el <b>estante Z</b>, que quiere decir «todavía sin sitio».",
      "Cuando recorras el almacén le das su estante definitivo en <b>Ubicar</b> y el kardex se acomoda solo."
    ])}
    <div class="campos">
      ${campo("ar-desc","DESCRIPCIÓN","Cópiala como viene en la guía. Se guarda en mayúsculas.",
        `<input id="ar-desc" class="mays" value="${esc(String(descIni||"").toUpperCase())}">`)}
      ${campo("ar-uni","UNIDAD DE MEDIDA","",`<select id="ar-uni">${opts(UNIDADES,"und",false)}</select>`)}
      ${campo("ar-clasif","FAMILIA","De aquí sale la primera letra del código.",
        `<select id="ar-clasif">${opts(CLASIF,"MATERIAL DE CONSTRUCCION",false)}</select>`)}
      ${campo("ar-alm","EN QUÉ ALMACÉN","En cuál de los dos quedó guardado.",
        `<select id="ar-alm">${optAlm("")}</select>`)}
      ${campo("ar-min","STOCK MÍNIMO","Opcional. Deja 0 si todavía no sabes.",
        `<input id="ar-min" class="mono" inputmode="decimal" value="0">`)}
    </div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Crear y seguir",fn:()=>{
      const d=leer("ar-desc").toUpperCase(); if(!d) return toast("Falta la descripción.",true);
      const cl=leer("ar-clasif"), tipo=tipoDeClasif(cl);
      const o={ id:uid("it"), cod:codigoProvisional(tipo), desc:d, uni:leer("ar-uni"),
                clasif:cl, alm:leer("ar-alm"), inicial:0, min:leerN("ar-min"), precio:0, activo:true };
      S.catalogo.items.push(o); subir("catalogo"); cerrar();
      toast("Creado "+o.cod+" · "+o.desc);
      if(cb) cb(o);
    }}], 700);
}

/* ---------- estado de la guía que se está tipeando ----------
   Se guarda un borrador en el equipo cada vez que se toca algo. Si el sistema
   se cuelga, se recarga la página o se corta la luz, la guía a medio escribir
   sigue ahí cuando vuelves. ------------------------------------------------ */
let GU = null;
let GU_BUSCA = "";
let GU_FECHA_LIN = "";
const LS_BORR = "SICA_BORRADOR_GUIA_v1";

function guNueva(conserva){
  const a = conserva && GU ? GU : null;
  GU = { fecha: a?a.fecha:hoy(), tdoc:"G/R", nro:"", sinDoc: a?!!a.sinDoc:false,
         tboleta: a?a.tboleta:"FACTURA", boleta:"",
         prov: a?a.prov:"", llegada: a?a.llegada:"", trajo: a?a.trajo:"",
         recibio: a?a.recibio:"", obs:"", lineas:[] };
  guGuardaBorr();
}
const guTieneAlgo = g => !!(g && (String(g.nro||"").trim() || (g.lineas||[]).length));
const nroSD = ()=> "SD-"+String(nn(S.meta.proxSD)||1).padStart(4,"0");
/** Ingresos que entraron sin guía de almacén y siguen esperando el documento. */
function provisionales(){
  const vistos={}, r=[];
  IX.movs.forEach(m=>{
    if(m.sentido!=="E" || !m.provisional) return;
    const k=m.grupo||m.id;
    if(vistos[k]) { vistos[k].partes.push(m); return; }
    vistos[k]={m, partes:[m], dias:Math.max(0,dias(m.fecha,hoy()))};
    r.push(vistos[k]);
  });
  return r.sort((a,b)=> b.dias-a.dias);
}
function guGuardaBorr(){
  try{
    if(guTieneAlgo(GU)) localStorage.setItem(LS_BORR, JSON.stringify({gu:GU, ts:Date.now()}));
    else localStorage.removeItem(LS_BORR);
  }catch(e){}
}
function guLeeBorr(){
  try{
    const raw=localStorage.getItem(LS_BORR); if(!raw) return null;
    const d=JSON.parse(raw);
    return (d && d.gu && guTieneAlgo(d.gu)) ? d : null;
  }catch(e){ return null; }
}
function guBorraBorr(){ try{ localStorage.removeItem(LS_BORR); }catch(e){} }
/** Hace cuánto se guardó el borrador, en palabras. */
function haceRato(ts){
  const s=Math.max(0,Math.round((Date.now()-ts)/1000));
  if(s<60) return "hace un momento";
  const m=Math.round(s/60); if(m<60) return "hace "+m+(m===1?" minuto":" minutos");
  const h=Math.round(m/60); if(h<24) return "hace "+h+(h===1?" hora":" horas");
  return "hace "+Math.round(h/24)+" días";
}
/** Busca a la persona por nombre escrito. Si no existe, la crea: el que recibe
    conforme tiene que quedar registrado sí o sí. */
function resolverPersona(txt){
  txt=String(txt||"").trim(); if(!txt) return null;
  const up=txt.toUpperCase();
  return S.personal.items.find(p=>(p.nombres+" "+p.apellidos).trim().toUpperCase()===up)
      || S.personal.items.find(p=>(p.apellidos+" "+p.nombres).trim().toUpperCase()===up)
      || S.personal.items.find(p=>String(p.dni||"").trim()===txt)
      || null;
}
function personaOCrear(txt){
  txt=String(txt||"").trim(); if(!txt) return "";
  const p=resolverPersona(txt); if(p) return p.id;
  /* el texto entra tal cual en apellidos para que se muestre como se escribió */
  const o={ id:uid("pe"), apellidos:txt, nombres:"", dni:"", cargo:"Operario",
            cuadrilla:"", tel:"", puedeAutorizar:false, activo:true, aMano:true };
  S.personal.items.push(o); subir("personal");
  return o.id;
}
const dlPersonas = ()=> `<datalist id="dl-personas">`+activos()
  .map(p=>`<option value="${esc((p.nombres+" "+p.apellidos).trim())}">`).join("")+`</datalist>`;

function resolverArt(txt){
  txt=String(txt||"").trim(); if(!txt) return null;
  const up=txt.toUpperCase(), pre=txt.split("·")[0].trim().toUpperCase();
  return S.catalogo.items.find(i=>String(i.cod).toUpperCase()===pre)
      || S.catalogo.items.find(i=>String(i.cod).toUpperCase()===up)
      || S.catalogo.items.find(i=>String(i.desc).toUpperCase()===up)
      || (S.catalogo.items.filter(i=>String(i.desc).toUpperCase().includes(up)).length===1
            ? S.catalogo.items.filter(i=>String(i.desc).toUpperCase().includes(up))[0] : null);
}
const dlCat = ()=> `<datalist id="dl-cat">`+S.catalogo.items.filter(i=>i.activo!==false)
  .sort((a,b)=>String(a.cod)<String(b.cod)?-1:1)
  .map(i=>`<option value="${esc(i.cod+" · "+i.desc)}">`).join("")+`</datalist>`;

/** Las fechas distintas que hay entre las líneas, en orden. */
function guFechas(){
  return Array.from(new Set(GU.lineas.map(l=>l.fecha||GU.fecha))).sort();
}
function lineasGuiaHTML(){
  if(!GU.lineas.length)
    return `<div class="vacio" style="padding:22px"><b>La guía todavía no tiene artículos</b>Escribe el primero arriba y dale Enter.</div>`;
  const tot=q2(GU.lineas.reduce((s,l)=>s+nn(l.recib)*nn(l.precio),0));
  const uds=q2(GU.lineas.reduce((s,l)=>s+nn(l.recib),0));
  const fs=guFechas();
  return `${fs.length>1?`<div class="aviso-caja"><b>Esta nota tiene artículos de ${fs.length} fechas distintas</b>
    ${fs.map(f=>fFecha(f)).join(" · ")}. Se va a guardar como ${fs.length} movimientos con el mismo número,
    uno por fecha, porque el kardex necesita saber qué día entró cada cosa.</div>`:""}
  <div class="tabla-env"><table class="reg">
    <thead><tr><th>#</th><th>Fecha</th><th>Código</th><th>Artículo</th><th>Und.</th><th class="num">S/ guía</th><th class="num">Recibido</th><th class="num">P. unit.</th><th class="num">Importe</th><th></th></tr></thead>
    <tbody>${GU.lineas.map((l,ix)=>{
      const it=cat(l.cod), dif=nn(l.guia)>0 && q2(l.guia)!==q2(l.recib);
      const fl=l.fecha||GU.fecha, otra=fl!==GU.fecha;
      return `<tr class="${dif?"baja":""}">
        <td class="num">${ix+1}</td>
        <td class="num"><input type="date" class="fl-in${otra?" otra":""}" data-ix="${ix}" value="${esc(fl)}"></td>
        <td class="cod">${esc(l.cod)}</td>
        <td>${esc(it?it.desc:"(fuera del catálogo)")}
          ${dif?`<br><span class="et p">faltó ${fmt(nn(l.guia)-nn(l.recib))}</span>`:""}</td>
        <td class="und">${esc(it?it.uni:"—")}</td>
        <td class="num">${nn(l.guia)?fmt(l.guia):"—"}</td>
        <td class="num" style="font-weight:700">${fmt(l.recib)}</td>
        <td class="num">${nn(l.precio)?fmt(l.precio):"—"}</td>
        <td class="num">${nn(l.precio)?soles(nn(l.precio)*nn(l.recib)):"—"}</td>
        <td class="acc"><button class="b sec chico" data-acc="guQuita" data-ix="${ix}">Quitar</button></td>
      </tr>`;}).join("")}</tbody>
    <tfoot><tr>
      <th colspan="6" style="text-align:right">${GU.lineas.length} ${GU.lineas.length===1?"línea":"líneas"}${fs.length>1?" · "+fs.length+" fechas":""}</th>
      <th class="num">${fmt(uds)}</th><th></th>
      <th class="num">${tot>0?soles(tot):"—"}</th><th></th>
    </tr></tfoot>
  </table></div>`;
}
function pintaLineasGuia(){
  const z=$("#gu-lineas"); if(z){
    z.innerHTML=lineasGuiaHTML();
    $$(".fl-in",z).forEach(e=> e.onchange=()=>{
      GU.lineas[+e.dataset.ix].fecha = e.value || GU.fecha;
      guGuardaBorr(); pintaLineasGuia();
    });
  }
  const c=$("#gu-cuenta"); if(c) c.textContent=GU.lineas.length+(GU.lineas.length===1?" línea":" líneas");
  const a=$("#gu-art"); if(a){ a.value=""; a.focus(); }
  const g=$("#gu-cg"); if(g) g.value="";
  const r=$("#gu-cr"); if(r) r.value="";
  const p=$("#gu-cp"); if(p) p.value="";
  const u=$("#gu-uni"); if(u){ u.textContent="—"; u.classList.remove("hay"); }
  const ay=$("#gu-art-ay"); if(ay) ay.textContent="Si no aparece, dale Enter y lo creas al vuelo.";
}

/* ---------- agregar una línea ---------- */
function guAgregar(){
  const txt=leer("gu-art");
  if(!txt) return toast("Escribe el artículo.",true);
  const it=resolverArt(txt);
  if(!it){
    return altaRapida(txt, nuevo=>{
      const a=$("#gu-art"); if(a) a.value=nuevo.cod+" · "+nuevo.desc;
      const g=$("#gu-cg"); if(g) g.focus();
      pintar(); setTimeout(()=>{
        const a2=$("#gu-art"); if(a2) a2.value=nuevo.cod+" · "+nuevo.desc;
        const g2=$("#gu-cg"); if(g2) g2.focus();
      },30);
    });
  }
  const guia=leerN("gu-cg"), recib=leer("gu-cr")===""?guia:leerN("gu-cr");
  if(recib<=0 && guia<=0) return toast("Falta la cantidad.",true);
  const fl=leer("gu-cf")||GU.fecha;
  GU_FECHA_LIN=fl;                       /* se queda puesta para las siguientes líneas */
  /* solo se juntan si son el mismo artículo Y la misma fecha */
  const ya=GU.lineas.findIndex(l=>l.cod===it.cod && (l.fecha||GU.fecha)===fl);
  const linea={cod:it.cod, fecha:fl, guia:q2(guia), recib:q2(recib||guia), precio:leerN("gu-cp")};
  if(ya>=0){
    GU.lineas[ya].guia=q2(nn(GU.lineas[ya].guia)+linea.guia);
    GU.lineas[ya].recib=q2(nn(GU.lineas[ya].recib)+linea.recib);
    if(linea.precio) GU.lineas[ya].precio=linea.precio;
    toast("Se sumó a la línea de "+it.cod+" del "+fFecha(fl)+".");
  } else GU.lineas.push(linea);
  guGuardaBorr();
  pintaLineasGuia();
}
ACC.guAgregar = ()=>guAgregar();
ACC.guQuita   = d=>{ GU.lineas.splice(+d.ix,1); guGuardaBorr(); pintaLineasGuia(); };
ACC.guNueva   = ()=>{
  if(!guTieneAlgo(GU)) { guNueva(true); return pintar(); }
  confirmar("Descartar la guía a medio escribir",
    `Vas a botar ${esc(GU.nro||"la guía sin número")} con ${GU.lineas.length} ${GU.lineas.length===1?"línea":"líneas"}.<br><br>No se puede recuperar.`,
    ()=>{ guBorraBorr(); guNueva(true); pintar(); toast("Descartada."); }, "Descartar", true);
};
ACC.guArtNuevo= ()=>altaRapida(leer("gu-art"), ()=>pintar());
ACC.guLimpiaBusca = ()=>{ GU_BUSCA=""; pintar(); };

/* ---------- guardar la guía ---------- */
function guardarGuia(seguir){
  if(GU.sinDoc && !GU.nro) GU.nro=nroSD();
  if(!GU.nro) return toast("Falta el número de la guía.",true);
  if(!GU.lineas.length) return toast(GU.sinDoc?"No anotaste ningún artículo.":"La guía no tiene ningún artículo.",true);
  if(!GU.prov) return toast("Falta el proveedor o de dónde viene.",true);
  if(GU.sinDoc && !GU.recibio) return toast("Sin papel, quién recibió conforme es obligatorio.",true);
  const tdoc=GU.sinDoc?"SIN DOCUMENTO":GU.tdoc;
  const nro=GU.nro.toUpperCase();

  /* SD-xxxx es el número que pone el propio sistema cuando algo llega sin papel.
     Si alguien lo vuelve a tipear en modo «con guía de almacén», el ingreso se
     duplicaba y salía del listado de pendientes. Eso ya no se deja hacer. */
  if(!GU.sinDoc && /^SD-\s*\d+$/.test(nro))
    return toast(nro+" es el número que pone el sistema para lo que llegó SIN PAPEL. Si querías agregarle un artículo, búscala en la lista de abajo y dale «+ Artículo».",true);

  /* el número manda: no importa si uno dice G/R y el otro GUÍA DE ALMACÉN */
  const choque=IX.movs.find(m=>m.sentido==="E" && !m.ref && String(m.nroDoc||"").toUpperCase()===nro);
  if(choque){
    if(choque.tipoDoc===tdoc || choque.tipoDoc==="SIN DOCUMENTO" || tdoc==="SIN DOCUMENTO")
      return toast(`${choque.tipoDoc} ${nro} ya está cargada el ${fFecha(choque.fecha)} (${choque.contra||"sin proveedor"}). Si te faltó un artículo, búscala abajo y dale «+ Artículo».`,true);
    return confirmar("Ese número ya existe",
      `Ya hay una <b>${esc(choque.tipoDoc)} ${esc(nro)}</b> del ${fFecha(choque.fecha)}, de ${esc(choque.contra||"—")}.<br><br>
       Si a <b>esa</b> guía te faltó un artículo, cancela y dale <b>«+ Artículo»</b> en la lista de abajo.
       Sigue solo si de verdad es otro documento distinto que trae el mismo número.`,
      ()=>guardarGuiaYa(seguir), "Es otro documento");
  }
  guardarGuiaYa(seguir);
}
function guardarGuiaYa(seguir){
  const tdoc=GU.sinDoc?"SIN DOCUMENTO":GU.tdoc;
  const nro=GU.nro.toUpperCase();

  /* Una misma guía puede traer artículos de fechas distintas. El kardex trabaja por día,
     así que se guarda un movimiento por fecha, todos con el mismo número de documento. */
  const fechas=guFechas();
  const quien=personaOCrear(GU.recibio);
  const grupo=uid("gr");
  const comun={
    sentido:"E", hora:ahora(), motivo:"INGRESO", tipoDoc:tdoc, nroDoc:nro,
    tipoDoc2:GU.boleta?GU.tboleta:"", nroDoc2:GU.boleta?GU.boleta.toUpperCase():"",
    contra:GU.prov, llegada:GU.llegada, area:"", transporte:GU.trajo,
    persona:quien, autoriza:"", almacenero:S.meta.almacenero||"", obs:GU.obs
  };

  fechas.forEach((f,i)=>{
    const items=GU.lineas.filter(l=>(l.fecha||GU.fecha)===f).map(l=>{
      const o={cod:l.cod, cant:q2(l.recib)};
      if(nn(l.guia)>0) o.guia=q2(l.guia);
      if(nn(l.precio)>0) o.precio=q2(l.precio);
      return o;
    });
    const mov=Object.assign({id:uid("mv"), fecha:f, items}, comun);
    if(GU.sinDoc) mov.provisional=true;
    if(fechas.length>1){ mov.grupo=grupo; mov.parte=i+1; mov.deQ=fechas.length; }
    dia(f).movs.push(mov);
    subirDia(f);
  });

  sumaLista("proveedores", GU.prov);
  sumaLista("llegadas", GU.llegada);
  if(GU.sinDoc){ S.meta.proxSD=(nn(S.meta.proxSD)||1)+1; subir("meta"); }
  guBorraBorr();
  const n=GU.lineas.length, eraSinDoc=GU.sinDoc;
  guNueva(seguir);
  GU_FECHA_LIN="";
  pintar();
  toast(eraSinDoc
    ? `${nro} guardado sin documento · ${n} ${n===1?"artículo":"artículos"} · queda pendiente de formalizar`
    : (fechas.length>1
      ? `${tdoc} ${nro} guardada en ${fechas.length} fechas · ${n} ${n===1?"artículo":"artículos"}`
      : `${tdoc} ${nro} guardada · ${n} ${n===1?"artículo":"artículos"}`));
}
ACC.guGuardar = ()=>guardarGuia(true);

/* ---------- agregarle un artículo a una guía QUE YA ESTÁ CARGADA ----------
   Antes no se podía y la gente volvía a tipear el número, que creaba una
   guía repetida. Esto le suma la línea al movimiento que ya existe. ------- */
let AGR = null;
ACC.movAdd = d=>{
  const m=movExige(d.id); if(!m) return;
  if(!AGR || AGR.id!==m.id) AGR={id:m.id, cod:"", cant:"", precio:"", fecha:m.fecha};
  abreAgregar(m);
};
function abreAgregar(m){
  modal("Agregar artículo a "+m.tipoDoc+" "+m.nroDoc, `
    ${expl("Qué hace esto",[
      "Le suma un artículo a una guía <b>que ya está cargada</b>. No crea otra guía ni cambia su número.",
      "El saldo del almacén sube al instante, igual que cuando la cargaste.",
      "Si el artículo ya está en la guía, se le suma la cantidad a la línea que ya existe.",
      "Si le pones otra fecha, la guía queda partida en dos partes, una por día, como manda el kardex."
    ])}
    <div class="campos">
      ${campo("ag-art","QUÉ ARTÍCULO","Escribe parte del nombre para encontrarlo. Si no existe, créalo con el botón de abajo.",
        comboArt("#ag-art", AGR.cod))}
      ${campo("ag-cant","CANTIDAD RECIBIDA","Lo que de verdad entró al almacén.",
        `<input id="ag-cant" class="mono" inputmode="decimal" value="${esc(AGR.cant)}">`)}
      ${campo("ag-precio","PRECIO UNITARIO","Opcional. Solo si la guía lo trae.",
        `<input id="ag-precio" class="mono" inputmode="decimal" value="${esc(AGR.precio)}">`)}
      ${campo("ag-fecha","QUÉ DÍA ENTRÓ","Déjala como está si entró el mismo día que el resto.",
        `<input type="date" id="ag-fecha" value="${esc(AGR.fecha)}">`)}
    </div>`,
    [{t:"Crear artículo nuevo",clase:"sec",izq:true,fn:()=>{
        AGR.cod=leer("ag-art"); AGR.cant=leer("ag-cant"); AGR.precio=leer("ag-precio"); AGR.fecha=leer("ag-fecha")||m.fecha;
        altaRapida("", nuevo=>{ AGR.cod=nuevo.cod; abreAgregar(m); });
     }},
     {t:"Cancelar",clase:"sec",fn:()=>{ AGR=null; cerrar(); }},
     {t:"Agregar a la guía",fn:()=>{
        const cod=leer("ag-art"), cant=leerN("ag-cant"), precio=leerN("ag-precio"), f=leer("ag-fecha")||m.fecha;
        if(!cod) return toast("Elige el artículo.",true);
        if(cant<=0) return toast("Falta la cantidad.",true);
        agregarAMov(m,cod,cant,precio,f);
     }}], 760);
}
function agregarAMov(m,cod,cant,precio,f){
  let destino=m;
  if(f!==m.fecha){
    const hermanos=IX.movs.filter(x=>x.sentido==="E" && x.tipoDoc===m.tipoDoc && x.nroDoc===m.nroDoc);
    destino=hermanos.find(x=>x.fecha===f);
    if(!destino){
      const g=m.grupo||uid("gr");
      destino={};
      ["sentido","motivo","tipoDoc","nroDoc","tipoDoc2","nroDoc2","contra","llegada","area",
       "transporte","persona","autoriza","almacenero","provisional","sdOrigen"].forEach(k=>{
        if(m[k]!==undefined) destino[k]=m[k]; });
      destino.id=uid("mv"); destino.fecha=f; destino.hora=ahora(); destino.items=[];
      dia(f).movs.push(destino);
      const todas=hermanos.concat([destino]).sort((a,b)=>a.fecha<b.fecha?-1:1);
      todas.forEach((x,i)=>{ x.grupo=g; x.parte=i+1; x.deQ=todas.length; });
      hermanos.forEach(x=>subirDia(x.fecha));
    }
  }
  if(!destino.items) destino.items=[];
  const ya=destino.items.find(l=>l.cod===cod);
  if(ya){ ya.cant=q2(nn(ya.cant)+cant); if(precio>0) ya.precio=q2(precio); }
  else { const o={cod, cant:q2(cant)}; if(precio>0) o.precio=q2(precio); destino.items.push(o); }
  destino.obs = (destino.obs?destino.obs+" · ":"")+"Se agregó "+cod+" ("+fmt(cant)+") el "+fFecha(hoy())+" "+ahora();
  subirDia(destino.fecha);
  AGR=null; cerrar(); pintar();
  toast("Agregado "+cod+" a "+m.tipoDoc+" "+m.nroDoc+" · ahora hay "+fmt(saldo(cod)));
}
ACC.guModo = d=>{ GU.sinDoc = d.m==="sin"; GU.nro = GU.sinDoc?nroSD():""; guGuardaBorr(); pintar(); };

/* ---------- formalizar: le llega el papel a uno o varios ingresos sin documento ----------
   Lo normal en obra es que el material llegue suelto varios días y después el
   proveedor traiga UNA SOLA guía de almacén que cubre todo lo que fue mandando.
   Por eso formalizar puede ir a una guía nueva o a una que ya está cargada, y
   puede llevarse varios pendientes de una vez.
   La fecha de cada ingreso NO se toca: para el kardex vale el día en que el
   material entró de verdad. Si la guía termina abarcando varios días, queda
   partida en partes, una por día, que es como ya trabaja todo el sistema. ---- */

/** Las guías ya cargadas, una sola vez cada una aunque venga partida en varias fechas. */
function guiasCargadas(){
  const vis={}, r=[];
  IX.movs.slice().reverse().forEach(m=>{
    if(m.sentido!=="E" || m.ref || m.provisional) return;
    const k=m.tipoDoc+"|"+m.nroDoc; if(vis[k]) return;
    vis[k]=1; r.push(m);
  });
  return r;
}
/** Vuelve a numerar las partes de una guía después de moverle ingresos. */
function regruparGuia(td,nr){
  const l=IX.movs.filter(m=>m.sentido==="E" && m.tipoDoc===td && m.nroDoc===nr)
                 .sort((a,b)=> a.fecha<b.fecha?-1:1);
  if(l.length<2){ if(l[0]){ delete l[0].grupo; delete l[0].parte; delete l[0].deQ; } return l; }
  const g=l[0].grupo||uid("gr");
  l.forEach((m,i)=>{ m.grupo=g; m.parte=i+1; m.deQ=l.length; });
  return l;
}
/** Mete los pendientes elegidos dentro de td/nr. El saldo no se mueve.
    Con prov=true siguen sin papel (juntar); sin él quedan formalizados. */
function meterEn(claves,td,nr,tbol,bol,prov){
  const partes=[];
  claves.forEach(k=>{
    const g=provisionales().find(x=>(x.m.grupo||x.m.id)===k);
    if(g) g.partes.forEach(p=>partes.push(p));
  });
  return meterMovsEn(partes,td,nr,tbol,bol,prov);
}
/** El mismo motor, pero recibiendo los movimientos ya elegidos.
    prov=true es «juntar» (no cambia si era provisional o no);
    prov=false es «formalizar» (le quita el provisional y deja el rastro). */
function meterMovsEn(partes,td,nr,tbol,bol,prov){
  if(!partes.length) return null;

  /* dónde va a caer cada fecha: lo que ya existe de esa guía, más lo que se va formalizando */
  const dest={};
  IX.movs.forEach(y=>{ if(y.sentido==="E" && y.tipoDoc===td && y.nroDoc===nr && !dest[y.fecha]) dest[y.fecha]=y; });

  /* si la guía ya estaba cargada, lo que entre después hereda su boleta o factura:
     es el mismo papel, no uno nuevo */
  if(!bol){
    const k=Object.keys(dest).sort()[0];
    if(k && dest[k].nroDoc2){ tbol=dest[k].tipoDoc2||""; bol=dest[k].nroDoc2; }
  }

  const tocado={}, origenes=[], origenesDoc=[], destinoDoc=td+" "+nr;
  partes.forEach(x=>{
    const origen=x.nroDoc, origenDoc=x.tipoDoc+" "+x.nroDoc;
    if(origenes.indexOf(origen)<0) origenes.push(origen);
    if(origenesDoc.indexOf(origenDoc)<0) origenesDoc.push(origenDoc);
    const ya=dest[x.fecha];
    if(ya && ya!==x){
      /* ese día ya hay un movimiento de la guía: las líneas se le suman ahí */
      (x.items||[]).forEach(it=>{
        const l=(ya.items=ya.items||[]).find(z=>z.cod===it.cod);
        if(l){ l.cant=q2(nn(l.cant)+nn(it.cant)); if(nn(it.precio)&&!nn(l.precio)) l.precio=it.precio; }
        else ya.items.push(it);
      });
      if(prov){
        if(origenDoc!==destinoDoc) ya.obs=(ya.obs?ya.obs+" · ":"")+"Se le juntó "+origenDoc+", del "+fFecha(x.fecha)+".";
      } else {
        ya.sdOrigen = ya.sdOrigen ? (String(ya.sdOrigen).indexOf(origen)<0 ? ya.sdOrigen+" + "+origen : ya.sdOrigen) : origen;
        ya.obs=(ya.obs?ya.obs+" · ":"")+"Incluye "+origen+", que había entrado sin papel.";
      }
      const d=dia(x.fecha); d.movs=d.movs.filter(z=>z.id!==x.id);
      tocado[x.fecha]=1;
    } else {
      x.tipoDoc=td; x.nroDoc=nr;
      if(bol){ x.tipoDoc2=tbol; x.nroDoc2=bol; }
      if(prov){
        /* juntar no cambia la condición: lo provisional sigue provisional,
           y una guía ya formalizada sigue formalizada */
        if(origenDoc!==destinoDoc) x.obs=(x.obs?x.obs+" · ":"")+"Venía como "+origenDoc+"; se juntó con "+destinoDoc+".";
      } else {
        x.sdOrigen=origen;
        x.obs=(x.obs?x.obs+" · ":"")+"Formalizado el "+fFecha(hoy())+". Entró sin papel como "+origen+".";
        delete x.provisional;
      }
      dest[x.fecha]=x;
      tocado[x.fecha]=1;
    }
  });
  indexar();
  regruparGuia(td,nr).forEach(m=>{ tocado[m.fecha]=1; });
  indexar();
  Object.keys(tocado).forEach(f=>subirDia(f));
  return {origenes, origenesDoc, partes:regruparGuia(td,nr).length};
}

/* ---------- juntar dos ingresos sin papel en uno solo ----------
   Pasa seguido: el mismo camión descarga en dos días, o se anotó dos veces
   la misma llegada. Se juntan bajo un solo número provisional y, como las
   fechas pueden diferir, el ingreso queda partido en partes, una por día.
   Siguen sin papel: esto no formaliza nada. ---------------------------- */
let JT = null;
ACC.juntarSD = d=>{
  const g=pendExige(d.k); if(!g) return;
  const k=g.m.grupo||g.m.id;
  if(!JT || JT.k!==k) JT={k:k, otros:{}};
  abreJuntar();
};
function abreJuntar(){
  const g=provisionales().find(x=>(x.m.grupo||x.m.id)===JT.k);
  if(!g){ JT=null; return cerrar(); }
  const m=g.m, otros=provisionales().filter(x=>(x.m.grupo||x.m.id)!==JT.k);
  const uds=x=>fmt(q2(x.partes.reduce((a,y)=>a+cantMov(y),0)));
  if(!otros.length){ return toast("Hace falta otro ingreso sin papel para juntarlo con este.",true); }
  modal("Juntar con "+m.nroDoc, `
    ${expl("Qué va a pasar",[
      "Los que marques <b>se meten dentro de "+esc(m.nroDoc)+"</b> y dejan de figurar por separado.",
      "<b>Siguen sin papel</b>: esto no los formaliza. Cuando llegue la guía, los formalizas todos de un tirón.",
      "Si las fechas son distintas, el ingreso queda <b>partido en partes, una por día</b> — el kardex necesita saber qué día entró cada cosa.",
      "Si dos caen el mismo día, sus líneas se juntan en una sola. El saldo no se mueve."
    ])}
    <div class="kcab">
      <div class="ident"><span>SE QUEDA CON ESTE NÚMERO</span><b>${esc(m.nroDoc)}</b>
        <i>${fFecha(m.fecha)} · ${esc(m.contra||"—")} · ${uds(g)} unidades${g.partes.length>1?" · "+g.partes.length+" fechas":""}</i></div>
    </div>
    <label style="font-size:12.5px;font-weight:700;letter-spacing:.055em;color:var(--texto-2)">CUÁLES SE JUNTAN CON ESTE</label>
    <p class="nota" style="margin:2px 0 8px">Marca los que en realidad son la misma llegada o van en la misma guía.</p>
    ${otros.map(x=>`<label class="dupla" style="margin:6px 0">
      <input type="checkbox" class="jt-otro" value="${esc(x.m.grupo||x.m.id)}"${JT.otros[x.m.grupo||x.m.id]?" checked":""}>
      <span><b>${esc(x.m.nroDoc)}</b> · ${fFecha(x.m.fecha)} · ${esc(x.m.contra||"—")} · ${uds(x)} unidades${x.partes.length>1?" · "+x.partes.length+" fechas":""}</span></label>`).join("")}`,
    [{t:"Cancelar",clase:"sec",fn:()=>{JT=null;cerrar();}},
     {t:"Juntar",fn:()=>{
        const marcados=[]; $$(".jt-otro").forEach(e=>{ if(e.checked) marcados.push(e.value); });
        if(!marcados.length) return toast("No marcaste ninguno.",true);
        const r=meterEn([JT.k].concat(marcados), m.tipoDoc, m.nroDoc, "", "", true);
        JT=null; cerrar(); pintar();
        if(!r) return toast("No quedó nada por juntar.",true);
        toast(r.origenes.filter(o=>o!==m.nroDoc).join(" + ")+" ahora son parte de "+m.nroDoc
              +(r.partes>1?" · quedó en "+r.partes+" partes, una por día":""));
     }}], 780);
}

/* ---------- juntar dos guías de almacén que quedaron separadas ----------
   Pasa con lo que entró sin papel: cada SD se formalizó por su lado y la
   obra terminó con dos guías que en realidad son una. También pasa cuando
   el mismo número quedó cargado con dos tipos de documento distintos. ---- */

/** Las entradas agrupadas por documento: una guía es una sola cosa, aunque
    por dentro esté partida en un movimiento por día. */
function entradasAgrupadas(){
  const vis={}, r=[];
  IX.movs.filter(m=>m.sentido==="E" && !m.ref).slice().reverse().forEach(m=>{
    const k=m.tipoDoc+"|"+m.nroDoc;
    if(vis[k]){ vis[k].partes.push(m); return; }
    vis[k]={partes:[m]}; r.push(vis[k]);
  });
  r.forEach(g=>{
    g.partes.sort((a,b)=> a.fecha<b.fecha?-1:1);
    g.m=g.partes[0];
    const cods={}; let sd=[];
    g.partes.forEach(p=>{
      (p.items||[]).forEach(x=>{ cods[x.cod]=1; });
      if(p.sdOrigen) String(p.sdOrigen).split(" + ").forEach(o=>{ if(sd.indexOf(o)<0) sd.push(o); });
    });
    g.arts=Object.keys(cods).length;
    g.uds=q2(g.partes.reduce((a,p)=>a+cantMov(p),0));
    g.sdOrigen=sd.join(" + ");
  });
  return r;
}

/** Unir las partes de UNA guía en un solo día. No junta guías distintas. */
ACC.unirPartes = d=>{
  const m=movExige(d.id); if(!m) return;
  const l=IX.movs.filter(x=>x.sentido==="E" && x.tipoDoc===m.tipoDoc && x.nroDoc===m.nroDoc)
                 .sort((a,b)=> a.fecha<b.fecha?-1:1);
  if(l.length<2) return toast("Esa guía ya está en un solo día.");
  modal("Unir las partes de "+m.tipoDoc+" "+m.nroDoc, `
    ${expl("Qué va a pasar",[
      "Las <b>"+l.length+" partes</b> de esta guía se juntan en <b>un solo movimiento</b>, en el día que elijas.",
      "Esto <b>no junta guías distintas</b>: solo acomoda las partes de esta.",
      "El saldo del almacén <b>no se mueve</b>. Lo que cambia es el día en que el kardex y el Control diario cuentan esa entrada.",
      "Hazlo si las fechas distintas fueron un error de tipeo. Si el material de verdad llegó en días distintos, <b>déjalo partido</b>: así lo pide el kardex."
    ])}
    <div class="campo"><label>EN QUÉ DÍA QUEDA TODO</label>
      <p class="nota" style="margin:2px 0 8px">Normalmente el primero, el día en que llegó la guía.</p>
      ${l.map((x,i)=>`<label class="dupla" style="margin:6px 0">
        <input type="radio" name="up-f" value="${esc(x.fecha)}"${i===0?" checked":""}>
        <span><b>${fFecha(x.fecha)}</b> · ${(x.items||[]).length} ${(x.items||[]).length===1?"artículo":"artículos"} ·
        ${fmt(cantMov(x))} unidades</span></label>`).join("")}
    </div>`,
    [{t:"Dejarla partida",clase:"sec",fn:cerrar},
     {t:"Unir en un día",fn:()=>{
        const sel=$$("input[name=up-f]").filter(e=>e.checked)[0];
        const f=sel?sel.value:l[0].fecha;
        unirPartesEn(m.tipoDoc,m.nroDoc,f);
     }}], 760);
};
function unirPartesEn(td,nr,f){
  const l=IX.movs.filter(x=>x.sentido==="E" && x.tipoDoc===td && x.nroDoc===nr)
                 .sort((a,b)=> a.fecha<b.fecha?-1:1);
  if(l.length<2){ cerrar(); return toast("Esa guía ya está en un solo día."); }
  let base=l.find(x=>x.fecha===f);
  const tocado={};
  if(!base){ base=l[0]; }
  if(base.fecha!==f){ const d=dia(base.fecha); d.movs=d.movs.filter(z=>z.id!==base.id);
    tocado[base.fecha]=1; base.fecha=f; dia(f).movs.push(base); }
  const otras=l.filter(x=>x!==base), dias=[];
  otras.forEach(x=>{
    if(dias.indexOf(x.fecha)<0) dias.push(x.fecha);
    (x.items||[]).forEach(it=>{
      const y=(base.items=base.items||[]).find(z=>z.cod===it.cod);
      if(y){ y.cant=q2(nn(y.cant)+nn(it.cant));
             if(nn(it.guia)) y.guia=q2(nn(y.guia)+nn(it.guia));
             if(nn(it.precio)&&!nn(y.precio)) y.precio=it.precio; }
      else base.items.push(it);
    });
    if(x.obs && String(base.obs||"").indexOf(x.obs)<0) base.obs=(base.obs?base.obs+" · ":"")+x.obs;
    if(x.sdOrigen) base.sdOrigen = base.sdOrigen
      ? (String(base.sdOrigen).indexOf(x.sdOrigen)<0 ? base.sdOrigen+" + "+x.sdOrigen : base.sdOrigen)
      : x.sdOrigen;
    const d=dia(x.fecha); d.movs=d.movs.filter(z=>z.id!==x.id);
    tocado[x.fecha]=1;
  });
  base.obs=(base.obs?base.obs+" · ":"")+"Partes unidas en el "+fFecha(f)+" (venían de "+dias.map(fFecha).join(", ")+").";
  delete base.grupo; delete base.parte; delete base.deQ;
  tocado[f]=1;
  indexar();
  Object.keys(tocado).forEach(x=>subirDia(x));
  cerrar(); pintar();
  toast(td+" "+nr+" quedó en un solo movimiento del "+fFecha(f)+" · el saldo no se movió");
}

/** Entradas que llevan el mismo número con distinto tipo de documento: eso siempre es un error. */
function guiasRepetidas(){
  const porNro={};
  guiasCargadas().forEach(m=>{
    const n=String(m.nroDoc||"").toUpperCase(); if(!n) return;
    (porNro[n]=porNro[n]||[]).push(m);
  });
  /* la que se queda por defecto es la GUÍA DE ALMACÉN — el papel propio de la obra —
     y entre iguales, la que se cargó primero */
  const peso=m=>(m.tipoDoc==="GUÍA DE ALMACÉN"?0:1);
  return Object.keys(porNro).filter(n=>porNro[n].length>1)
    .map(n=>({nro:n, guias:porNro[n].slice().sort((a,b)=> peso(a)-peso(b) || (a.fecha<b.fecha?-1:1))}));
}
let JG = null;
ACC.juntarGuias = d=>{
  const m=movExige(d.id); if(!m) return;
  if(!JG || JG.id!==m.id) JG={id:m.id, txt:"", otras:{}};
  if(d.con){ JG.otras={}; JG.otras[d.con]=1; }
  abreJuntarGuias();
};
function abreJuntarGuias(){
  const m=movPorId(JG.id);
  if(!m){ JG=null; return cerrar(); }
  const yo=m.tipoDoc+"|"+m.nroDoc;
  const uds=g=>fmt(q2(IX.movs.filter(x=>x.sentido==="E"&&x.tipoDoc===g.tipoDoc&&x.nroDoc===g.nroDoc)
                        .reduce((a,x)=>a+cantMov(x),0)));
  const partesDe=g=>IX.movs.filter(x=>x.sentido==="E"&&x.tipoDoc===g.tipoDoc&&x.nroDoc===g.nroDoc).length;
  const t=String(JG.txt||"").trim().toUpperCase();
  let otras=guiasCargadas().filter(g=>(g.tipoDoc+"|"+g.nroDoc)!==yo);
  const mismas=otras.filter(g=>String(g.nroDoc||"").toUpperCase()===String(m.nroDoc||"").toUpperCase());
  if(t) otras=otras.filter(g=>String(g.nroDoc).toUpperCase().includes(t)
                             ||String(g.contra||"").toUpperCase().includes(t)
                             ||String(g.tipoDoc).toUpperCase().includes(t));
  otras=otras.slice(0,40);

  modal("Juntar con "+m.tipoDoc+" "+m.nroDoc, `
    ${expl("Qué va a pasar",[
      "Las que marques <b>se meten dentro de "+esc(m.tipoDoc+" "+m.nroDoc)+"</b> y dejan de figurar por separado.",
      "Si tienen fechas distintas, la guía queda <b>partida en partes, una por día</b>, que es como el kardex necesita verlo.",
      "Si dos caen el mismo día, sus líneas se juntan en una sola. <b>El saldo no se mueve</b>: el material ya está adentro.",
      "Sirve para las guías que se formalizaron por separado cuando en realidad venían en un solo papel."
    ])}
    <div class="kcab">
      <div class="ident"><span>SE QUEDA CON ESTE DOCUMENTO</span><b>${esc(m.tipoDoc)} ${esc(m.nroDoc)}</b>
        <i>${fFecha(m.fecha)} · ${esc(m.contra||"—")} · ${uds(m)} unidades${partesDe(m)>1?" · "+partesDe(m)+" fechas":""}${m.nroDoc2?" · "+esc(m.nroDoc2):""}</i></div>
    </div>
    <p class="nota" style="margin:0 0 14px">¿Debería quedarse el otro documento? Cancela y dale a <b>Juntar</b>
      en la fila de la guía que quieres conservar: siempre manda aquella desde la que abriste este cuadro.</p>
    ${mismas.length?`<div class="aviso-caja"><b>Hay ${mismas.length} ${mismas.length===1?"guía":"guías"} con el mismo número</b>
      ${mismas.map(g=>esc(g.tipoDoc+" "+g.nroDoc)).join(", ")} — casi seguro es la misma guía cargada dos veces. Márcala abajo.</div>`:""}
    <div class="filtros" style="border:0;background:transparent;padding:0 0 10px">
      ${campo("jg-txt","BUSCAR LA OTRA GUÍA","Por número, proveedor o tipo de documento.",
        `<input id="jg-txt" value="${esc(JG.txt)}" placeholder="001-000500">`)}
    </div>
    ${!otras.length?vacio("No hay otra guía que juntar",t?"Prueba con otra palabra.":"Todavía no hay más guías cargadas."):
      otras.map(g=>{ const k=g.tipoDoc+"|"+g.nroDoc, ig=String(g.nroDoc||"").toUpperCase()===String(m.nroDoc||"").toUpperCase();
        return `<label class="dupla" style="margin:6px 0${ig?";background:var(--aviso-bg);padding:6px 8px;border-radius:3px":""}">
        <input type="checkbox" class="jg-otra" value="${esc(k)}"${JG.otras[k]?" checked":""}>
        <span><b>${esc(g.tipoDoc)} ${esc(g.nroDoc)}</b> · ${fFecha(g.fecha)} · ${esc(g.contra||"—")} ·
        ${uds(g)} unidades${partesDe(g)>1?" · "+partesDe(g)+" fechas":""}${ig?' <span class="et a">mismo número</span>':""}</span></label>`;}).join("")}`,
    [{t:"Cancelar",clase:"sec",fn:()=>{JG=null;cerrar();}},
     {t:"Juntar",fn:()=>{
        const marcadas=[]; $$(".jg-otra").forEach(e=>{ if(e.checked) marcadas.push(e.value); });
        if(!marcadas.length) return toast("No marcaste ninguna guía.",true);
        const partes=[];
        marcadas.forEach(k=>{ const p=k.split("|");
          IX.movs.forEach(x=>{ if(x.sentido==="E" && x.tipoDoc===p[0] && x.nroDoc===p[1]) partes.push(x); }); });
        const r=meterMovsEn(partes, m.tipoDoc, m.nroDoc, "", "", true);
        JG=null; cerrar(); pintar();
        if(!r) return toast("No quedó nada por juntar.",true);
        const n=r.origenesDoc.filter(o=>o!==(m.tipoDoc+" "+m.nroDoc));
        toast(n.join(" + ")+(n.length>1?" ahora forman parte de ":" ahora forma parte de ")+m.tipoDoc+" "+m.nroDoc
              +(r.partes>1?" · la guía quedó en "+r.partes+" partes, una por día":""));
     }}], 820);

  const b=$("#jg-txt");
  if(b) b.oninput=()=>{
    JG.otras={}; $$(".jg-otra").forEach(e=>{ if(e.checked) JG.otras[e.value]=1; });
    const p=b.selectionStart; JG.txt=b.value; abreJuntarGuias();
    const n=$("#jg-txt"); if(n){ n.focus(); try{ n.setSelectionRange(p,p); }catch(x){} }
  };
}

let FZ = null;
ACC.formalizar = d=>{
  const g=pendExige(d.k); if(!g) return;
  const k=g.m.grupo||g.m.id;
  if(!FZ || FZ.k!==k) FZ={k:k, modo:"nueva", td:"GUÍA DE ALMACÉN", nr:"", tbol:"FACTURA", bol:"", dest:"", otros:{}};
  abreFormalizar();
};
function abreFormalizar(){
  const g=provisionales().find(x=>(x.m.grupo||x.m.id)===FZ.k);
  if(!g){ FZ=null; return cerrar(); }
  const m=g.m, uds=q2(g.partes.reduce((a,x)=>a+cantMov(x),0));
  const otros=provisionales().filter(x=>(x.m.grupo||x.m.id)!==FZ.k);
  const ya=guiasCargadas();
  const nueva=FZ.modo==="nueva";

  modal("Formalizar "+m.nroDoc, `
    ${expl("Qué va a pasar",[
      "El material ya está en el almacén y el saldo ya subió. Esto <b>no mueve ni un número</b>: solo le pone encima la guía que por fin trajeron.",
      "Puede ir a una <b>guía nueva</b> o a una que <b>ya cargaste</b>: en ese caso el ingreso se le suma a esa guía, como una línea más.",
      "Si tienes varios pendientes que vienen en la misma guía, márcalos abajo y entran todos juntos.",
      "La <b>fecha no se toca</b>: para el kardex vale el día en que el material entró de verdad, no el que diga la guía. Si la guía termina abarcando varios días, queda partida en partes, una por día."
    ])}
    <div class="kcab">
      <div class="ident"><span>INGRESO SIN PAPEL</span><b>${esc(m.nroDoc)}</b>
        <i>${fFecha(m.fecha)} · ${esc(m.contra||"—")} · ${fmt(uds)} unidades · ${g.dias} ${g.dias===1?"día":"días"} esperando el papel${g.partes.length>1?" · "+g.partes.length+" fechas":""}</i></div>
    </div>

    <div class="campo" style="margin-bottom:16px"><label>¿A QUÉ GUÍA VA?</label>
      <div class="tipovale" style="margin-top:6px">
        <label><input type="radio" name="fz-modo" value="nueva"${nueva?" checked":""}><span class="cuad"></span> UNA GUÍA NUEVA</label>
        <label><input type="radio" name="fz-modo" value="ya"${!nueva?" checked":""}${!ya.length?" disabled":""}><span class="cuad"></span> UNA QUE YA CARGUÉ${!ya.length?" (todavía ninguna)":""}</label>
      </div></div>

    ${nueva ? `<div class="campos">
      ${campo("fz-tdoc","TIPO DE DOCUMENTO","El papel que por fin trajeron.",
        `<select id="fz-tdoc">${opts(["GUÍA DE ALMACÉN","G/R","FACTURA","BOLETA"],FZ.td,false)}</select>`)}
      ${campo("fz-nro","N° DEL DOCUMENTO","Tal cual está impreso.",
        `<input id="fz-nro" class="mono" value="${esc(FZ.nr)}" placeholder="001-000123">`)}
      ${campo("fz-tbol","BOLETA O FACTURA","",`<select id="fz-tbol">${opts(["FACTURA","BOLETA","NINGUNA"],FZ.tbol,false)}</select>`)}
      ${campo("fz-bol","N° DE BOLETA / FACTURA","Opcional.",`<input id="fz-bol" class="mono" value="${esc(FZ.bol)}" placeholder="F001-00456">`)}
    </div>`
    : `<div class="campos">
      ${campo("fz-dest","EN QUÉ GUÍA ENTRA","Se le suma a esa guía y queda con su número.",
        `<select id="fz-dest">${opts(ya.map(x=>({v:x.tipoDoc+"|"+x.nroDoc,
           t:x.tipoDoc+" "+x.nroDoc+" · "+fFecha(x.fecha)+" · "+(x.contra||"sin proveedor")})), FZ.dest)}</select>`)}
    </div>`}

    ${otros.length?`<div style="margin-top:20px">
      <label style="font-size:12.5px;font-weight:700;letter-spacing:.055em;color:var(--texto-2)">OTROS PENDIENTES QUE VAN EN LA MISMA GUÍA</label>
      <p class="nota" style="margin:2px 0 8px">Márcalos si el proveedor los está cubriendo con este mismo papel.</p>
      ${otros.map(x=>`<label class="dupla" style="margin:6px 0">
        <input type="checkbox" class="fz-otro" value="${esc(x.m.grupo||x.m.id)}"${FZ.otros[x.m.grupo||x.m.id]?" checked":""}>
        <span><b>${esc(x.m.nroDoc)}</b> · ${fFecha(x.m.fecha)} · ${esc(x.m.contra||"—")} ·
        ${fmt(q2(x.partes.reduce((a,y)=>a+cantMov(y),0)))} unidades</span></label>`).join("")}
    </div>`:""}`,
    [{t:"Cancelar",clase:"sec",fn:()=>{FZ=null;cerrar();}},
     {t:"Formalizar",fn:()=>{
        /* todo se lee ANTES de cualquier confirmación: confirmar vacía el cuerpo del modal */
        FZ.otros={}; $$(".fz-otro").forEach(e=>{ if(e.checked) FZ.otros[e.value]=1; });
        const claves=[FZ.k].concat(Object.keys(FZ.otros));
        let td,nr,tbol="",bol="";
        if(FZ.modo==="nueva"){
          td=leer("fz-tdoc"); nr=leer("fz-nro").toUpperCase();
          FZ.td=td; FZ.nr=nr; FZ.tbol=leer("fz-tbol"); FZ.bol=leer("fz-bol").toUpperCase();
          if(!nr) return toast("Falta el número del documento.",true);
          if(/^SD-\s*\d+$/.test(nr)) return toast("SD-xxxx es el número provisional del sistema, no el del papel.",true);
          tbol=FZ.tbol==="NINGUNA"?"":FZ.tbol; bol=FZ.bol;
          const ch=IX.movs.find(x=>x.sentido==="E" && !x.provisional && x.tipoDoc===td && x.nroDoc===nr);
          if(ch){
            const q=claves.length;
            return confirmar("Esa guía ya está cargada",
              `<b>${esc(td)} ${esc(nr)}</b> ya existe: ${fFecha(ch.fecha)}, ${esc(ch.contra||"sin proveedor")}.<br><br>
               Si es la misma, le sumo ${q===1?"este ingreso":"los "+q+" ingresos"} y queda todo bajo ese número.
               Si te equivocaste de número, cancela y corrígelo.`,
              ()=>cerrarFormalizar(claves,td,nr,tbol,bol), "Sí, es la misma guía");
          }
        } else {
          const p=String(leer("fz-dest")||"").split("|");
          if(!p[1]) return toast("Elige en qué guía entra.",true);
          td=p[0]; nr=p[1]; FZ.dest=leer("fz-dest");
        }
        cerrarFormalizar(claves,td,nr,tbol,bol);
     }}], 820);

  $$("input[name=fz-modo]").forEach(e=> e.onchange=()=>{
    FZ.otros={}; $$(".fz-otro").forEach(c=>{ if(c.checked) FZ.otros[c.value]=1; });
    if(FZ.modo==="nueva"){ FZ.td=leer("fz-tdoc")||FZ.td; FZ.nr=leer("fz-nro").toUpperCase(); FZ.tbol=leer("fz-tbol")||FZ.tbol; FZ.bol=leer("fz-bol").toUpperCase(); }
    else FZ.dest=leer("fz-dest");
    FZ.modo=e.value; abreFormalizar();
  });
}
function cerrarFormalizar(claves,td,nr,tbol,bol){
  const r=meterEn(claves,td,nr,tbol,bol,false);
  FZ=null; cerrar(); pintar();
  if(!r) return toast("No quedó nada por formalizar.",true);
  toast(r.origenes.join(" + ")+(r.origenes.length>1?" quedaron":" quedó")+" dentro de "+td+" "+nr
        +(r.partes>1?" · la guía quedó en "+r.partes+" partes, una por día":""));
}
/* ---------- la pantalla ---------- */
VISTAS.guias = function(){
  /* si el sistema se cayó a media guía, acá vuelve */
  if(!GU){ const b=guLeeBorr(); if(b){ GU=b.gu; if(!GU.lineas) GU.lineas=[]; } else guNueva(false); }
  const hayCat=S.catalogo.items.length>0;
  /* Todo lo que entró y no es una devolución automática de préstamo (esas llevan ref).
     Antes esto filtraba por tipo de documento y las GUÍA DE ALMACÉN se hacían invisibles
     aunque estuvieran bien guardadas. */
  /* Una guía es UNA fila, aunque por dentro esté partida en varios días.
     Antes salía una fila por parte y parecía que estaba cargada dos veces. */
  const ent=entradasAgrupadas();
  const bq=String(GU_BUSCA||"").trim().toUpperCase();
  const filtradas = !bq ? ent : ent.filter(g=>{ const m=g.m;
    return String(m.nroDoc||"").toUpperCase().includes(bq)
      || String(m.nroDoc2||"").toUpperCase().includes(bq)
      || String(m.contra||"").toUpperCase().includes(bq)
      || String(m.llegada||"").toUpperCase().includes(bq)
      || nom(m.persona).toUpperCase().includes(bq);});
  const ultimas=filtradas.slice(0,40);
  const su=sinUbicar().length;
  const borr=guLeeBorr();
  const enProceso=guTieneAlgo(GU);
  const uds=q2(GU.lineas.reduce((a,l)=>a+nn(l.recib),0));

  return `

  ${!hayCat?`<div class="aviso-caja"><b>El catálogo está vacío y no pasa nada</b>
    Empieza a cargar la primera guía igual. Cada artículo que no exista lo vas creando sobre la marcha,
    y al final vas a tener el catálogo armado con lo que de verdad entró a la obra — que es mejor que
    inventarlo antes.</div>`:""}

  <div class="parte ${enProceso?"vivo":""}">
    <div class="parte-i">
      <span class="pe">EN PROCESO DE TIPEO</span>
      ${enProceso
        ? `<b>${esc(GU.tdoc)} ${esc(GU.nro||"(sin número todavía)")}</b>
           <i>${GU.lineas.length} ${GU.lineas.length===1?"línea":"líneas"} · ${fmt(uds)} unidades${GU.prov?" · "+esc(GU.prov):""}</i>
           <span class="gd">✓ guardado en este equipo${borr?" · "+haceRato(borr.ts):""}</span>`
        : `<b>Ninguna guía a medio escribir</b><i>Empieza a llenar la de abajo y se va guardando sola.</i>`}
    </div>
    <div class="parte-i der">
      <span class="pe">GUÍAS YA CARGADAS</span>
      <b class="cif">${ent.length}</b>
      <i>${ent.length?"la última: "+esc(ent[0].nroDoc):"todavía ninguna"}</i>
      ${ent.length?`<button class="b sec chico" style="margin-top:8px" data-acc="resumenGuias">Resumen en PDF para el encargado</button>`:""}
    </div>
  </div>

  <div class="bloque"><h2>1 · LA GUÍA<span class="der">
    <span class="et n" id="gu-cuenta">${GU.lineas.length} ${GU.lineas.length===1?"línea":"líneas"}</span>
  </span></h2><div class="pad">
    <div class="tipovale" style="margin-bottom:20px">
      <label><input type="radio" name="gu-modo" value="con"${!GU.sinDoc?" checked":""}><span class="cuad"></span> CON GUÍA DE ALMACÉN</label>
      <label><input type="radio" name="gu-modo" value="sin"${GU.sinDoc?" checked":""}><span class="cuad"></span> LLEGÓ SIN PAPEL</label>
    </div>
    ${GU.sinDoc?`<div class="aviso-caja"><b>Ingreso sin guía de almacén</b>
      El material entra al almacén igual y el saldo sube: está físicamente ahí. Queda con un número
      provisional <b>${esc(nroSD())}</b> y en la lista de pendientes hasta que llegue el papel.
      Imprime el acta y hazla firmar por quien trajo la carga — sin guía de almacén, esa firma es
      tu única prueba.</div>`:""}
    <div class="campos">
      ${campo("gu-fecha","FECHA DE LA GUÍA","El día que llegó el material, no hoy.",
        `<input type="date" id="gu-fecha" value="${esc(GU.fecha)}">`)}
      ${GU.sinDoc
        ? campo("gu-tdoc","DOCUMENTO","No trajeron papel. Queda como ingreso provisional.",
            `<input id="gu-tdoc" value="SIN DOCUMENTO" readonly style="color:var(--aviso);font-weight:700">`)
        : campo("gu-tdoc","DOCUMENTO","",`<select id="gu-tdoc">${opts(["G/R","FACTURA","BOLETA","GUÍA DE ALMACÉN"],GU.tdoc,false)}</select>`)}
      ${GU.sinDoc
        ? campo("gu-nro","N° PROVISIONAL","Lo pone el sistema. Cuando llegue la guía lo reemplazas.",
            `<input id="gu-nro" class="mono" value="${esc(GU.nro||nroSD())}" readonly style="font-weight:700">`)
        : campo("gu-nro","N° DE GUÍA","Tal cual está impreso: 001-000123.",
            `<input id="gu-nro" class="mono" value="${esc(GU.nro)}" placeholder="001-000123">`)}
    </div>
    <div class="campos" style="margin-top:16px">
      ${campo("gu-llegada","PUNTO DE LLEGADA","Dónde bajaron la carga. Es el campo que viene impreso en la guía de remisión.",
        `<input id="gu-llegada" list="dl-llegadas" value="${esc(GU.llegada||"")}" placeholder="Almacén de obra — C.P. San Francisco">`)}
      ${campo("gu-recibio","RECIBÍ CONFORME","Quién contó y dio conforme cuando bajaron. Si no sale en la lista, <b>escríbelo</b> y se agrega solo al personal.",
        `<input id="gu-recibio" list="dl-personas" value="${esc(GU.recibio||"")}" placeholder="Escribe o elige un nombre">`)}
    </div>
    <div class="corte" style="margin:20px 0"></div>
    <div class="campos">
      ${campo("gu-prov","PROVEEDOR O DE DÓNDE VIENE","Quién lo mandó: la ferretería, la empresa, otra obra.",
        `<input id="gu-prov" list="dl-proveedores" value="${esc(GU.prov)}" placeholder="Aceros Arequipa">`)}
      ${campo("gu-tboleta","BOLETA O FACTURA","El comprobante que vino junto con la guía.",
        `<select id="gu-tboleta">${opts(["FACTURA","BOLETA","NINGUNA"],GU.tboleta,false)}</select>`)}
      ${campo("gu-boleta","N° DE BOLETA / FACTURA","Opcional, pero si lo tienes déjalo anotado.",
        `<input id="gu-boleta" class="mono" value="${esc(GU.boleta)}" placeholder="F001-00456">`)}
      ${campo("gu-trajo","QUIÉN LO TRAJO","Transportista, placa del camión o el nombre del que bajó la carga.",
        `<input id="gu-trajo" value="${esc(GU.trajo)}" placeholder="Volquete EGH-431">`)}
    </div>
  </div></div>

  <div class="bloque"><h2>2 · LOS ARTÍCULOS DE LA GUÍA</h2><div class="pad">
    <div class="fila-rapida">
      <div class="campo fr-art"><label for="gu-art">ARTÍCULO</label>
        <input id="gu-art" list="dl-cat" placeholder="Escribe el código o el nombre" autocomplete="off">
        <span class="ayuda" id="gu-art-ay">Si no aparece, dale Enter y lo creas al vuelo.</span></div>
      <div class="campo fr-u"><label>UND.</label>
        <span class="und-vivo" id="gu-uni">—</span></div>
      <div class="campo fr-n"><label for="gu-cg">SEGÚN GUÍA</label>
        <input id="gu-cg" class="mono" inputmode="decimal" placeholder="0"></div>
      <div class="campo fr-n"><label for="gu-cr">RECIBIDO</label>
        <input id="gu-cr" class="mono" inputmode="decimal" placeholder="igual">
        <span class="ayuda">Vacío = lo mismo</span></div>
      <div class="campo fr-n"><label for="gu-cp">P. UNIT.</label>
        <input id="gu-cp" class="mono" inputmode="decimal" placeholder="—"></div>
      <div class="campo fr-f"><label for="gu-cf">FECHA</label>
        <input type="date" id="gu-cf" value="${esc(GU_FECHA_LIN||GU.fecha)}">
        <span class="ayuda">Se queda puesta</span></div>
      <div class="campo fr-b"><label>&nbsp;</label>
        <button class="b" data-acc="guAgregar">Agregar ↵</button></div>
    </div>
    <div id="gu-lineas" style="margin-top:16px">${lineasGuiaHTML()}</div>
  </div></div>

  <div class="bloque"><div class="pad" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
    <button class="b" data-acc="guGuardar">Guardar y empezar otra</button>
    <button class="b sec" data-acc="guNueva">Descartar y empezar de nuevo</button>
    <span class="nota" style="margin:0">Se conservan proveedor y fecha para la siguiente guía del taco.</span>
  </div></div>

  ${su?`<div class="aviso-caja"><b>${su} ${su===1?"artículo creado":"artículos creados"} sin ubicación</b>
    Están en el estante Z. Cuando recorras el almacén, dales su sitio en <b>Ubicar</b> y el código se
    corrige solo en todo el kardex.</div>`:""}

  ${(function(){ const pv=provisionales(); if(!pv.length) return "";
    return `<div class="bloque"><h2>ESPERANDO LA GUÍA DE ALMACÉN<span class="der">
      <span class="et p">${pv.length} ${pv.length===1?"pendiente":"pendientes"}</span>
    </span></h2>
    <p class="nota" style="padding:12px 18px 0;margin:0">Estos entraron sin papel. El material ya está
    en el almacén y el saldo ya subió; lo que falta es el documento. Cuando llegue la guía, dale
    <b>Formalizar</b>: la guía se crea ahí mismo — o eliges una que ya cargaste — y estos ingresos
    se meten dentro. Si varios vienen en la misma guía, se marcan y entran todos juntos, sin mover el saldo.</p>
    <div class="tabla-env"><table class="reg">
      <thead><tr><th>N° provisional</th><th>Fecha</th><th class="num">Esperando</th><th>Proveedor</th><th>Quién trajo</th><th>Recibió conforme</th><th class="num">Unidades</th><th></th></tr></thead>
      <tbody>${pv.map(g=>{ const m=g.m, uds=q2(g.partes.reduce((a,x)=>a+cantMov(x),0));
        return `<tr class="${g.dias>=3?"baja":""}">
          <td class="cod">${esc(m.nroDoc)}${g.partes.length>1?`<br><span class="nota">${g.partes.length} fechas</span>`:""}</td>
          <td class="num">${fFecha(m.fecha)}</td>
          <td class="num">${g.dias===0?"hoy":g.dias+(g.dias===1?" día":" días")}</td>
          <td>${esc(m.contra||"—")}</td>
          <td>${esc(m.transporte||"—")}</td>
          <td>${esc(nom(m.persona))}</td>
          <td class="num">${fmt(uds)}</td>
          <td class="acc">
            <div class="accs">
            <button class="b chico" data-acc="formalizar" data-k="${esc(m.grupo||m.id)}">Formalizar</button>
            <button class="b sec chico" data-acc="movAdd" data-id="${esc(m.id)}">+ Artículo</button>
            ${pv.length>1?`<button class="b sec chico" data-acc="juntarSD" data-k="${esc(m.grupo||m.id)}">Juntar</button>`:""}
            <button class="b sec chico" data-acc="impActa" data-id="${esc(m.id)}">Acta</button>
            <button class="b sec chico pel" data-acc="movBorrar" data-id="${esc(m.id)}">Anular</button>
            </div>
          </td></tr>`;}).join("")}</tbody>
    </table></div></div>`;})()}

  ${(function(){ const rep=guiasRepetidas(); if(!rep.length) return "";
    return `<div class="aviso-caja rojo"><b>${rep.length===1?"Hay un número cargado dos veces":"Hay "+rep.length+" números cargados dos veces"}</b>
      ${rep.map(r=>`<div style="margin-top:6px">El número <b>${esc(r.nro)}</b> está en
        ${r.guias.map(g=>esc(g.tipoDoc)).join(" y en ")} por separado.
        <button class="b chico" style="margin-left:6px" data-acc="juntarGuias" data-id="${esc(r.guias[0].id)}" data-con="${esc(r.guias[1].tipoDoc+"|"+r.guias[1].nroDoc)}">Juntarlas</button></div>`).join("")}
      <div class="nota" style="margin-top:8px">Casi siempre es la misma guía que entró dos veces — por ejemplo, dos ingresos sin papel que se formalizaron por separado. Juntarlas no mueve el saldo.</div></div>`;})()}

  <div class="bloque"><h2>GUÍAS YA CARGADAS<span class="der">
      <span class="et t">${ent.length} en total</span>
      <button class="b chico" data-acc="resumenGuias">Resumen en PDF</button>
      <button class="b sec chico" data-acc="csvMovs" data-s="E">Descargar Excel</button>
    </span></h2>
    <div class="filtros">
      ${campo("gu-buscar","BUSCAR UNA GUÍA","Por número, comprobante, proveedor, punto de llegada o quién recibió.",
        `<input id="gu-buscar" value="${esc(GU_BUSCA||"")}" placeholder="001-000123">`)}
      ${bq?`<div class="campo" style="min-width:auto"><label>&nbsp;</label>
        <button class="b sec chico" data-acc="guLimpiaBusca">Ver todas</button></div>`:""}
    </div>
    ${!ultimas.length?vacio(bq?"Ninguna guía coincide con «"+esc(GU_BUSCA)+"»":"Todavía no has cargado ninguna guía",
        bq?"Prueba con parte del número.":"La primera que guardes aparece acá."):
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>Documento</th><th>Fecha</th><th>Motivo</th><th>Proveedor</th><th>Punto de llegada</th><th>Recibió conforme</th><th class="num">Artículos</th><th class="num">Unidades</th><th></th></tr></thead>
      <tbody>${ultimas.map(g=>{ const m=g.m, varios=g.partes.length>1;
        return `<tr>
        <td class="cod">${esc(m.tipoDoc)}<br>${esc(m.nroDoc)}${m.nroDoc2?`<br><span class="nota">${esc(m.nroDoc2)}</span>`:""}</td>
        <td class="num">${varios
            ? fFecha(g.partes[0].fecha)+"<br>al "+fFecha(g.partes[g.partes.length-1].fecha)
              +`<br><span class="et a">${g.partes.length} fechas</span>`
            : fFecha(m.fecha)}</td>
        <td><span class="et ${m.provisional?"p":(m.motivo==="INGRESO"?"k":"n")}">${m.provisional?"SIN PAPEL":esc(m.motivo)}</span>${g.sdOrigen?`<br><span class="nota">fue ${esc(g.sdOrigen)}</span>`:""}</td>
        <td>${esc(m.contra||"—")}${m.transporte?`<br><span class="nota">${esc(m.transporte)}</span>`:""}</td>
        <td>${esc(m.llegada||"—")}</td>
        <td>${esc(nom(m.persona))}</td>
        <td class="num">${g.arts}</td>
        <td class="num">${fmt(g.uds)}</td>
        <td class="acc"><div class="accs">
          ${varios?`<button class="b chico" data-acc="unirPartes" data-id="${esc(m.id)}" title="Unir las partes de esta guía en un solo día">Unir días</button>`:""}
          <button class="b sec chico" data-acc="movAdd" data-id="${esc(m.id)}" title="Agregarle un artículo">+ Art.</button>
          <button class="b sec chico" data-acc="movVer" data-id="${esc(m.id)}">Ver</button>
          <button class="b sec chico pel" data-acc="movBorrar" data-id="${esc(m.id)}">Anular</button>
        </div></td>
      </tr>`;}).join("")}</tbody></table></div>
    ${filtradas.length>40?`<p class="nota" style="padding:0 18px 14px">Se muestran 40 de ${filtradas.length}. Busca por número para llegar a una en concreto.</p>`:""}
    ${ultimas.some(g=>g.partes.length>1)?`<p class="nota" style="padding:0 18px 14px">Las que dicen <b>varias fechas</b> están
      partidas por dentro, una parte por día, porque el material llegó en días distintos. Si en realidad todo entró el mismo día,
      dale a <b>Unir en un día</b> y quedan como un solo movimiento.</p>`:""}`}
  </div>
  ${dlCat()}${dl("proveedores")}${dl("llegadas")}${dlPersonas()}`;
};

/* ---------- cableado de la pantalla de guías ---------- */
function enganchaGuias(){
  if(vistaActual!=="guias" || !GU) return;
  const campos={ "gu-fecha":"fecha","gu-tdoc":"tdoc","gu-nro":"nro","gu-tboleta":"tboleta",
                 "gu-boleta":"boleta","gu-prov":"prov","gu-llegada":"llegada",
                 "gu-trajo":"trajo","gu-recibio":"recibio" };
  Object.keys(campos).forEach(id=>{
    const e=$("#"+id); if(!e) return;
    const set=()=>{ GU[campos[id]]=e.value; guGuardaBorr(); };
    e.oninput=set; e.onchange=set;
  });
  $$("input[name=gu-modo]").forEach(e=> e.onchange=()=>{
    GU.sinDoc = e.value==="sin";
    GU.nro = GU.sinDoc ? nroSD() : "";
    guGuardaBorr(); pintar();
  });
  const cf=$("#gu-cf"); if(cf) cf.onchange=()=>{ GU_FECHA_LIN=cf.value||GU.fecha; };
  const bs=$("#gu-buscar");
  if(bs) bs.oninput=()=>{
    GU_BUSCA=bs.value;
    const pos=bs.selectionStart; pintar();
    const b2=$("#gu-buscar"); if(b2){ b2.focus(); try{ b2.setSelectionRange(pos,pos); }catch(e){} }
  };
  const art=$("#gu-art"), cg=$("#gu-cg"), cr=$("#gu-cr"), cp=$("#gu-cp");
  const enter=e=>{ if(e.key==="Enter"){ e.preventDefault(); guAgregar(); } };
  [art,cg,cr,cp].forEach(e=>{ if(e) e.onkeydown=enter; });
  /* la unidad del artículo reconocido se muestra antes de tipear la cantidad:
     así se ve si son bolsas, varillas o kilos antes de escribir el número */
  const verUni=()=>{
    const u=$("#gu-uni"), ay=$("#gu-art-ay"); if(!u) return;
    const it=art?resolverArt(art.value):null;
    if(it){
      u.textContent=it.uni; u.classList.add("hay");
      if(ay) ay.innerHTML="Saldo hoy: <b>"+fmt(saldo(it.cod))+" "+esc(it.uni)+"</b>";
    }else{
      u.textContent="—"; u.classList.remove("hay");
      if(ay) ay.textContent="Si no aparece, dale Enter y lo creas al vuelo.";
    }
  };
  if(art){ art.oninput=verUni; art.onchange=()=>{ verUni(); if(resolverArt(art.value) && cg) cg.focus(); }; }
  verUni();
}

/* ======================================================================
   UBICAR — darle estante a lo que se creó al vuelo
   ====================================================================== */
VISTAS.ubicar = function(){
  const l=sinUbicar();
  return `
  ${expl("Para qué sirve esta pantalla",[
    "Todo lo que creaste mientras cargabas guías quedó en el <b>estante Z</b>, que significa «entró al almacén pero todavía no tiene sitio en la repisa».",
    "Acá le das su estante, nivel y casillero de verdad. El código cambia y <b>el sistema reescribe solo</b> todos los movimientos, el kardex y los conteos.",
    "Hazlo caminando el almacén con el celular en la mano, estante por estante."
  ])}
  <div class="bloque">
    <h2>ARTÍCULOS SIN UBICACIÓN<span class="der"><span class="et ${l.length?"p":"k"}">${l.length}</span></span></h2>
    ${!l.length?vacio("Todo tiene su sitio","No hay artículos en el estante Z."):
    `<div class="tabla-env"><table class="reg">
      <thead><tr><th>Código actual</th><th>Artículo</th><th>Familia</th><th>Almacén</th><th class="num">Saldo</th><th></th></tr></thead>
      <tbody>${l.map(i=>`<tr>
        <td class="cod">${esc(i.cod)}</td>
        <td>${esc(i.desc)} <span class="nota">${esc(i.uni)}</span></td>
        <td><span class="nota">${esc(i.clasif||"—")}</span></td>
        <td>${almDe(i)?esc(almDe(i)):`<span class="et p">falta</span>`}</td>
        <td class="num">${fmt(saldo(i.cod))}</td>
        <td class="acc"><button class="b chico" data-acc="ubicarUno" data-cod="${esc(i.cod)}">Darle sitio</button></td>
      </tr>`).join("")}</tbody></table></div>`}
  </div>
  ${l.length?`<div class="bloque"><h2>LOS ESTANTES DEL CUARTO</h2><div class="pad">
    <div class="chips">${ESTANTES.filter(e=>e.v!=="Z").map(e=>`<span class="chip">${esc(e.t)}</span>`).join("")}</div>
    <p class="nota">Nivel 1 abajo (lo pesado) hasta nivel 4 arriba (lo liviano). Tres casilleros por nivel.</p>
  </div></div>`:""}`;
};

ACC.ubicarUno = d=>{
  const it=cat(d.cod); if(!it) return;
  const tipo=String(it.cod).charAt(0);
  modal("Darle sitio a "+it.desc, `
    ${expl("Qué va a pasar",[
      `El código <code>${esc(it.cod)}</code> se reemplaza por el nuevo en <b>todo</b> el sistema: kardex, control diario, conteos y requerimientos.`,
      "El saldo no se toca. Solo cambia dónde dice que está guardado."
    ])}
    <div class="campos">
      ${campo("ub-tipo","TIPO","Primera letra del código.",
        `<select id="ub-tipo">${opts(Object.keys(TIPO_UB).map(v=>({v,t:v+" · "+TIPO_UB[v]})),tipo,false)}</select>`)}
      ${campo("ub-est","ESTANTE","",`<select id="ub-est">${opts(ESTANTES,"A",false)}</select>`)}
      ${campo("ub-niv","NIVEL","1 abajo, 4 arriba.",`<select id="ub-niv">${opts(["1","2","3","4"],"2",false)}</select>`)}
      ${campo("ub-cas","CASILLERO","",`<input id="ub-cas" class="mono" inputmode="numeric" maxlength="2" value="01">`)}
      ${campo("ub-alm","ALMACÉN","En qué piso quedó guardado.",`<select id="ub-alm">${optAlm(it.alm)}</select>`)}
      ${campo("ub-cod","CÓDIGO QUE QUEDA","",`<input id="ub-cod" class="mono" value="" style="font-weight:700;font-size:20px">`)}
    </div>`,
    [{t:"Cancelar",clase:"sec",fn:cerrar},{t:"Reubicar",fn:()=>{
      const nuevo=leer("ub-cod").toUpperCase();
      if(!nuevo) return toast("Falta el código.",true);
      if(cat(nuevo)) return toast("Ya hay otro artículo con el código "+nuevo+".",true);
      it.alm=leer("ub-alm");
      if(reubicar(it.cod,nuevo)){ cerrar(); pintar(); toast("Ahora es "+nuevo+" en "+it.alm+"."); }
      else toast("No se pudo reubicar.",true);
    }}], 720);
  const rec=()=>{ $("#ub-cod").value=codigoDe(leer("ub-tipo"),leer("ub-est"),leer("ub-niv"),leer("ub-cas")); };
  ["ub-tipo","ub-est","ub-niv","ub-cas"].forEach(id=>{ const e=$("#"+id); if(e) e.oninput=rec; });
  const auto=()=>{ $("#ub-cas").value=String(siguienteCasillero(leer("ub-tipo"),leer("ub-est"),leer("ub-niv"))).padStart(2,"0"); rec(); };
  ["ub-tipo","ub-est","ub-niv"].forEach(id=>{ const e=$("#"+id); if(e) e.onchange=auto; });
  auto();
};

/** Los artículos van en mayúsculas. Lo que se cargó antes se normaliza una sola vez. */
function mayusculizarCatalogo(){
  let n=0;
  S.catalogo.items.forEach(i=>{
    const d=String(i.desc||"");
    if(d && d!==d.toUpperCase()){ i.desc=d.toUpperCase(); n++; }
  });
  if(n){ subir("catalogo"); }
  return n;
}

/* ---------- el papel ahora se llama GUÍA DE ALMACÉN ----------
   Lo que ya estaba cargado como NOTA DE ENTREGA se renombra, para que el
   kardex, los resúmenes y el desplegable digan todos lo mismo. */
function renombrarGuiaAlmacen(){
  const tocado={};
  IX.movs.forEach(m=>{
    if(m.tipoDoc==="NOTA DE ENTREGA"){ m.tipoDoc="GUÍA DE ALMACÉN"; tocado[m.fecha]=1; }
    if(m.tipoDoc2==="NOTA DE ENTREGA"){ m.tipoDoc2="GUÍA DE ALMACÉN"; tocado[m.fecha]=1; }
  });
  /* y la guía que quedó a medio tipear en este equipo */
  try{
    const raw=localStorage.getItem(LS_BORR);
    if(raw){
      const d=JSON.parse(raw);
      if(d && d.gu && d.gu.tdoc==="NOTA DE ENTREGA"){
        d.gu.tdoc="GUÍA DE ALMACÉN"; localStorage.setItem(LS_BORR,JSON.stringify(d));
      }
    }
  }catch(e){}
  const f=Object.keys(tocado);
  if(!f.length) return 0;
  indexar(); f.forEach(x=>subirDia(x));
  return f.length;
}

/* ---------- reparación de una sola vez ----------
   Los ingresos SIN PAPEL que quedaron guardados como G/R u otro documento
   (pasaba al volver a tipear el número SD-xxxx) vuelven a su sitio, y si el
   mismo número quedó repetido el mismo día, las líneas se juntan en uno. */
function repararSinDocumento(){
  const tocado={};
  IX.movs.forEach(m=>{
    if(m.sentido!=="E") return;
    const n=String(m.nroDoc||"").trim().toUpperCase();
    if(!/^SD-\d+$/.test(n)) return;
    if(m.tipoDoc==="SIN DOCUMENTO" && m.provisional) return;
    m.nroDoc=n; m.tipoDoc="SIN DOCUMENTO"; m.provisional=true;
    m.obs=(m.obs?m.obs+" · ":"")+"Corregido: estaba guardado como otro documento";
    tocado[m.fecha]=1;
  });
  /* mismo número y mismo día = una sola guía */
  const porDia={};
  IX.movs.forEach(m=>{ if(m.sentido!=="E"||m.tipoDoc!=="SIN DOCUMENTO") return;
    const k=m.nroDoc+"|"+m.fecha; (porDia[k]=porDia[k]||[]).push(m); });
  Object.keys(porDia).forEach(k=>{
    const l=porDia[k]; if(l.length<2) return;
    const base=l[0];
    l.slice(1).forEach(x=>{
      (x.items||[]).forEach(it=>{
        const ya=(base.items=base.items||[]).find(y=>y.cod===it.cod);
        if(ya) ya.cant=q2(nn(ya.cant)+nn(it.cant)); else base.items.push(it);
      });
      const d=dia(x.fecha); d.movs=d.movs.filter(y=>y.id!==x.id);
      tocado[x.fecha]=1;
    });
    tocado[base.fecha]=1;
  });
  /* mismo número en días distintos = una guía partida por fecha */
  const porNro={};
  IX.movs.forEach(m=>{ if(m.sentido!=="E"||m.tipoDoc!=="SIN DOCUMENTO") return;
    (porNro[m.nroDoc]=porNro[m.nroDoc]||[]).push(m); });
  Object.keys(porNro).forEach(n=>{
    const l=porNro[n].filter(m=>S.dias[m.fecha] && S.dias[m.fecha].movs.indexOf(m)>=0)
                     .sort((a,b)=>a.fecha<b.fecha?-1:1);
    if(l.length<2) return;
    const g=l[0].grupo||uid("gr");
    l.forEach((m,i)=>{ m.grupo=g; m.parte=i+1; m.deQ=l.length; tocado[m.fecha]=1; });
  });
  const f=Object.keys(tocado);
  if(!f.length) return 0;
  indexar(); f.forEach(x=>subirDia(x));
  return f.length;
}

/* ---------- quién entró, arriba a la derecha ---------- */
function pintarQuien(){
  const c=$("#quien"); if(!c) return;
  const se = window.NUBE ? NUBE.sesion : null;
  if(!se){ c.innerHTML=""; return; }
  c.innerHTML = `<div><b>${esc(se.nombre||se.correo)}</b>
    <span class="rol ${se.rol==="admin"?"":"apoyo"}">${se.rol==="admin"?"ADMINISTRADOR":"APOYO DE ALMACÉN"}</span></div>
    <button class="b sec chico" data-acc="salir">Salir</button>`;
}
ACC.salir = ()=>{
  confirmar("Cerrar la sesión",
    "Se cierra tu sesión en este equipo. Los datos quedan guardados en la nube.<br><br>Para volver a entrar necesitas tu correo y contraseña.",
    async ()=>{ await NUBE.salir(); location.reload(); }, "Salir");
};

(async function arrancar(){
  /* 1 · la nube y la sesión, antes que nada */
  try{ await NUBE.iniciar(); }catch(e){}
  if(NUBE.hayNube && !NUBE.sesion){
    NUBE.pintarEntrada();
    engancharEntrada();
    return;                       /* el sistema arranca recién al entrar */
  }
  NUBE.cerrarEntrada();
  arrancarSistema();
})();

/* La pantalla de entrada: se queda esperando hasta que el correo y la
   contraseña sean correctos. Sin sesión no se pinta nada del sistema. */
function engancharEntrada(){
  const f=$("#en-form"), err=$("#en-error"), btn=$("#en-btn");
  const solo=document.querySelector("[data-entrar-solo]");
  if(solo) solo.onclick=()=>{ NUBE.cerrarEntrada(); arrancarSistema(); };
  if(!f) return;
  f.onsubmit = async ev=>{
    ev.preventDefault();
    err.hidden=true; btn.disabled=true; btn.textContent="Entrando…";
    const r = await NUBE.entrar($("#en-correo").value, $("#en-clave").value);
    btn.disabled=false; btn.textContent="Entrar";
    if(!r.ok){ err.textContent=r.msg; err.hidden=false; $("#en-clave").select(); return; }
    NUBE.cerrarEntrada();
    arrancarSistema();
  };
}

function arrancarSistema(){
  cargarLocal();
  mayusculizarCatalogo();
  if(!lista("almacenes").length){ S.listas.almacenes=ALM_DEF.slice(); subir("listas"); }
  if(S.meta.tema) document.documentElement.setAttribute("data-theme",S.meta.tema);
  { const e=$("#ver-n"); if(e) e.textContent=VERSION; }
  indexar();
  renombrarGuiaAlmacen();
  if(repararSinDocumento()) setTimeout(()=>toast("Se corrigieron ingresos sin papel que habían quedado guardados como otro documento. Revísalos en Cargar guía."),900);
  if(!puedeVer(vistaActual)) vistaActual = (MODS()[0]||MOD[0]).k;
  pintarQuien();
  pintar();
  iniciarNube();
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible" && DB && Date.now()-ultimoPull>60000) sincronizar(false);
  });
  window.addEventListener("beforeprint",()=>{ if(!$("#impresion").innerHTML) $("#impresion").innerHTML=""; });
}