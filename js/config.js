/* ======================================================================
   CONFIGURACIÓN — ESTE ES EL ÚNICO ARCHIVO QUE TIENES QUE EDITAR

   Pega acá los dos datos que te da Supabase (Settings → API):

     URL      →  algo como  https://abcdefghijk.supabase.co
     ANON KEY →  una cadena larguísima que empieza con  eyJ...

   Mientras estén vacíos, el sistema funciona igual pero SOLO en este
   equipo, sin inicio de sesión y sin compartir nada. Sirve para probar.

   ¿Es secreta la ANON KEY? No. Está hecha para ir a la vista en la
   página. Lo que protege tus datos son las reglas de seguridad de
   Supabase (el archivo sql/01-estructura.sql), no esconder esta llave.
   ====================================================================== */

window.CONFIG = {

  SUPABASE_URL:  "https://lhvzbkfsgxipawhmozwk.supabase.co",
  SUPABASE_ANON: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxodnpia2ZzZ3hpcGF3aG1vendrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NTE5OTEsImV4cCI6MjEwNjEyNzk5MX0.Nhdn1FCceDQ1A9BZBi6bSX1ZPPMtGTmABTpBDBycf6g",

  /* El nombre que sale en la pantalla de inicio de sesión. */
  OBRA: "Tránsito peatonal — C.P. San Francisco",
  EMPRESA: "JVC Consultores y Ejecutores E.I.R.L."
};
