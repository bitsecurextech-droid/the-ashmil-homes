const express = require('express');
const supabase = require('../config/supabase');
const router = express.Router();

router.get('/', async (req, res) => {
  const { category, location, search } = req.query;
  let query = supabase.from('properties').select('*');
  
  if (category) query = query.eq('category', category);
  if (location) query = query.ilike('location', `%${location}%`);
  if (search) {
    query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', req.params.id)
    .single();
  
  if (error) return res.status(404).json({ error: 'Property not found' });
  res.json(data);
});

module.exports = router;