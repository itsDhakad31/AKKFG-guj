import "dotenv/config";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

async function test() {
  console.log("Testing insert with role: Technical");
  const { data, error } = await supabaseAdmin
    .from('registrations')
    .insert({
      name: 'Test Technical User',
      email: 'testtech@example.com',
      role: 'Technical',
      dob: '1990-01-01',
      address_city: 'Ahmedabad',
      gender: 'Male',
      mobile: '1234567890',
      experience: '5 years'
    })
    .select();

  if (error) {
    console.error("Insert failed:", error);
  } else {
    console.log("Insert succeeded:", data);
    // Clean up
    const { error: deleteError } = await supabaseAdmin
      .from('registrations')
      .delete()
      .eq('id', data[0].id);
    if (deleteError) {
      console.error("Cleanup failed:", deleteError);
    } else {
      console.log("Cleanup succeeded!");
    }
  }
}

test();
