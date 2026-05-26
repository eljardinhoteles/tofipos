const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yqkvjccrqzyesojxzjna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxa3ZqY2NycXp5ZXNvanh6am5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjA5NzcsImV4cCI6MjA4NTg5Njk3N30.OviVADPMRFndAJi1NIJtch_J5okhaseXLf0S_WW84tA';
const orgId = '82162246-f102-4db1-899e-c523c12d91c6';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  // Intentar descargar categorías para tener una válida
  const { data: categorias, error: errCat } = await supabase
    .from('categorias')
    .select('*')
    .eq('organization_id', orgId);

  if (errCat) {
    console.error('Error al descargar categorías:', errCat);
    return;
  }

  console.log('Categorías encontradas:', categorias);
  if (categorias.length === 0) {
    console.error('No hay categorías para la organización.');
    return;
  }

  const catId = categorias[0].id;
  const testProduct = {
    id: require('crypto').randomUUID(),
    nombre: 'Nuevo Producto Test ' + Date.now(),
    precio: 19.50,
    categoria_id: catId,
    activo: true,
    modificadores: [],
    favorito: null,
    descripcion: 'Una descripción de prueba',
    imagen_url: null,
    iva_modalidad: 'sistema',
    iva_porcentaje: null,
    organization_id: orgId
  };

  console.log('Intentando upsert del producto...');
  const { data, error } = await supabase
    .from('menu_items')
    .upsert([testProduct]);

  if (error) {
    console.error('Error al hacer upsert de menu_items:', error);
  } else {
    console.log('Upsert exitoso!');
    // Verificar si realmente existe
    const { data: verificado, error: errVerif } = await supabase
      .from('menu_items')
      .select('*')
      .eq('id', testProduct.id);
    console.log('Verificación del registro insertado:', verificado, 'Error de Verificación:', errVerif);
  }
}

run();
