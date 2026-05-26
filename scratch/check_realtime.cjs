const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yqkvjccrqzyesojxzjna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxa3ZqY2NycXp5ZXNvanh6am5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjA5NzcsImV4cCI6MjA4NTg5Njk3N30.OviVADPMRFndAJi1NIJtch_J5okhaseXLf0S_WW84tA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const channel = supabase.channel('test_realtime')
  channel.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
    console.log('Realtime Event Received:', payload.table, payload.eventType);
  }).subscribe((status) => {
    console.log('Status:', status);
    if(status === 'SUBSCRIBED') {
      console.log('Waiting for events...');
    }
  });

  // Force an insert to see if we get the event
  setTimeout(async () => {
    console.log('Forcing insert to trigger realtime...');
    await supabase.from('mesas').upsert({
      id: require('crypto').randomUUID(),
      nombre: 'Mesa Realtime Test',
      estado: 'libre',
      piso: 'Test',
      capacidad: 2,
      organization_id: '82162246-f102-4db1-899e-c523c12d91c6'
    });
  }, 2000);

  // Exit after 6 seconds
  setTimeout(() => {
    console.log('Done testing realtime.');
    process.exit(0);
  }, 6000);
}
run();
