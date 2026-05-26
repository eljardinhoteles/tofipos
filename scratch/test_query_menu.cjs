const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yqkvjccrqzyesojxzjna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxa3ZqY2NycXp5ZXNvanh6am5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjA5NzcsImV4cCI6MjA4NTg5Njk3N30.OviVADPMRFndAJi1NIJtch_J5okhaseXLf0S_WW84tA';
const orgId = '82162246-f102-4db1-899e-c523c12d91c6';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, nombre, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  
  console.log('Total de productos:', data?.length);
  console.log('Productos:', data);
}
run();
