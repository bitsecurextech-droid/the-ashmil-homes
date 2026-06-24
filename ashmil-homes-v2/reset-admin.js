require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('./config/supabase');

async function resetAdmin() {
  console.log('🔄 Resetting admin user...');
  
  // First, delete existing admin if any
  const { error: deleteError } = await supabase
    .from('admins')
    .delete()
    .eq('email', 'admin@ashmil.com');
  
  if (deleteError) {
    console.log('⚠️ No existing admin found or delete error:', deleteError.message);
  } else {
    console.log('✅ Existing admin deleted');
  }
  
  // Create new admin with password 'Admin123!'
  const password = 'Admin123!';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const { data, error } = await supabase
    .from('admins')
    .insert([
      { 
        email: 'admin@ashmil.com', 
        password: hashedPassword 
      }
    ])
    .select();
  
  if (error) {
    console.error('❌ Error creating admin:', error.message);
    return;
  }
  
  console.log('✅ Admin created successfully!');
  console.log('📧 Email: admin@ashmil.com');
  console.log('🔑 Password: Admin123!');
  console.log('📋 Data:', data);
}

resetAdmin();