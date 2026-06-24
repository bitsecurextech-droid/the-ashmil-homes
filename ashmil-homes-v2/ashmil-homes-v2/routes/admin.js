const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Property = require('../models/Property');
const auth = require('../middleware/auth');
const router = express.Router();

const initAdmin = async () => {
  const count = await Admin.countDocuments();
  if (count === 0) {
    const hash = await bcrypt.hash('Admin123!', 10);
    await Admin.create({ email: 'admin@ashmil.com', password: hash });
    console.log('✅ Default admin: admin@ashmil.com / Admin123!');
  }
};
initAdmin();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await admin.comparePassword(password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
});

router.get('/properties', auth, async (req, res) => {
  const properties = await Property.find().sort({ createdAt: -1 });
  res.json(properties);
});

router.post('/properties', auth, async (req, res) => {
  try {
    const { title, description, price, location, category, bedrooms, bathrooms, area, featured, images, video } = req.body;
    if (!title || !description || !price || !location || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const imageArray = Array.isArray(images) ? images : images?.split('\n').map(s => s.trim()).filter(s => s) || [];
    const property = new Property({
      title, description, price, location, category,
      bedrooms: Number(bedrooms) || 0,
      bathrooms: Number(bathrooms) || 0,
      area: area || '',
      featured: featured === 'true',
      images: imageArray,
      video: video || ''
    });
    await property.save();
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/properties/:id', auth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.images) {
      updates.images = typeof updates.images === 'string' 
        ? updates.images.split('\n').map(s => s.trim()).filter(s => s) 
        : updates.images;
    }
    const property = await Property.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/properties/:id', auth, async (req, res) => {
  await Property.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;