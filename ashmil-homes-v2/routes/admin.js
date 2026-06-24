const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const router = express.Router();

// Create default admin if none exists
const initAdmin = async () => {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id')
      .eq('email', 'admin@ashmil.com')
      .single();
    
    if (error || !data) {
      const hash = await bcrypt.hash('Admin123!', 10);
      const { error: insertError } = await supabase
        .from('admins')
        .insert([{ email: 'admin@ashmil.com', password: hash }]);
      
      if (insertError) {
        console.error('❌ Error creating admin:', insertError.message);
      } else {
        console.log('✅ Default admin created: admin@ashmil.com / Admin123!');
      }
    }
  } catch (err) {
    console.error('❌ Admin init error:', err.message);
  }
};
initAdmin();

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error || !admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const match = await bcrypt.compare(password, admin.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign(
    { id: admin.id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
  
  res.json({ token });
});

// Get all properties (admin)
router.get('/properties', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('❌ Error fetching properties:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add property
router.post('/properties', async (req, res) => {
  try {
    console.log('📝 Received property data:', req.body);
    
    const { title, description, price, location, category, bedrooms, bathrooms, area, featured, images, video } = req.body;
    
    if (!title || !description || !price || !location || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const imageArray = Array.isArray(images) ? images : images?.split('\n').map(s => s.trim()).filter(s => s) || [];
    
    const propertyData = {
      title,
      description,
      price,
      location,
      category,
      bedrooms: Number(bedrooms) || 0,
      bathrooms: Number(bathrooms) || 0,
      area: area || '',
      featured: featured === 'true' || featured === true,
      images: imageArray,
      video: video || ''
    };
    
    console.log('📤 Inserting property:', propertyData);
    
    const { data, error } = await supabase
      .from('properties')
      .insert([propertyData])
      .select();
    
    if (error) {
      console.error('❌ Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('✅ Property saved:', data);
    res.status(201).json(data[0]);
  } catch (err) {
    console.error('❌ Error saving property:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update property
router.put('/properties/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.images) {
      updates.images = typeof updates.images === 'string' 
        ? updates.images.split('\n').map(s => s.trim()).filter(s => s) 
        : updates.images;
    }
    
    const { data, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error('❌ Error updating property:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete property
router.delete('/properties/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('❌ Error deleting property:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;