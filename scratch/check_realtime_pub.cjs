const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yqkvjccrqzyesojxzjna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxa3ZqY2NycXp5ZXNvanh6am5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjA5NzcsImV4cCI6MjA4NTg5Njk3N30.OviVADPMRFndAJi1NIJtch_J5okhaseXLf0S_WW84tA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.rpc('get_realtime_tables'); // This might not exist
  
  // Actually, we can check by forcing an insert via REST, and having a long-running realtime channel.
  const channel = supabase.channel('cambios_pos_realtime')
  channel.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
    console.log('REALTIME EVENT CAPTURED:', payload.table, payload.eventType);
  }).subscribe((status, err) => {
    console.log('Status:', status, err ? err : '');
  });

  await new Promise(r => setTimeout(r, 4000));
  
  console.log('Forcing INSERT into mesas');
  await supabase.from('mesas').upsert({
    id: require('crypto').randomUUID(),
    nombre: 'Mesa Realtime Test ' + Date.now(),
    estado: 'libre',
    piso: 'Test',
    capacidad: 2,
    organization_id: '82162246-f102-4db1-899e-c523c12d91c6'
  });

  console.log('Forcing INSERT into comandas');
  await supabase.from('comandas').upsert({
    id: require('crypto').randomUUID(),
    folio: 'TEST-123',
    mesa_id: 'Test',
    mesa_nombre: 'Test',
    estado: 'pendiente',
    organization_id: '82162246-f102-4db1-899e-c523c12d91c6'
  });

  console.log('Forcing INSERT into comanda_items');
  await supabase.from('comanda_items').upsert({
    id: require('crypto').randomUUID(),
    comanda_id: require('crypto').randomUUID(),
    item_id: 'Test',
    nombre: 'Test Item',
    precio: 10,
    cantidad: 1,
    estado: 'pendiente',
    organization_id: '82162246-f102-4db1-899e-c523c12d91c6'
  });

  await new Promise(r => setTimeout(r, 4000));
  console.log('Done.');
  process.exit(0);
}
run();
