const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yqkvjccrqzyesojxzjna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxa3ZqY2NycXp5ZXNvanh6am5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjA5NzcsImV4cCI6MjA4NTg5Njk3N30.OviVADPMRFndAJi1NIJtch_J5okhaseXLf0S_WW84tA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: menu_items, error: err1 } = await supabase.from('menu_items').select('id, nombre, organization_id').limit(5);
  console.log('menu_items:', menu_items?.length || 0, 'registros. Error:', err1?.message);
  
  const { data: productos, error: err2 } = await supabase.from('productos').select('id, nombre, organization_id').limit(5);
  console.log('productos:', productos?.length || 0, 'registros. Error:', err2?.message);
}
run();
