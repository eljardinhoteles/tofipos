const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yqkvjccrqzyesojxzjna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxa3ZqY2NycXp5ZXNvanh6am5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjA5NzcsImV4cCI6MjA4NTg5Njk3N30.OviVADPMRFndAJi1NIJtch_J5okhaseXLf0S_WW84tA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: p, error: e } = await supabase.from('products').select('*').limit(1);
  console.log('Error consulta products:', e?.message || 'OK');
  console.log('Ejemplo de registro en products:', JSON.stringify(p, null, 2));
}
run();
