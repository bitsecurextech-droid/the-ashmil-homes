const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: String, required: true },
  location: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['houses', 'land', 'shortlets', 'flats'], 
    required: true 
  },
  bedrooms: { type: Number, default: 0 },
  bathrooms: { type: Number, default: 0 },
  area: { type: String, default: '' },
  images: [{ type: String }], // URLs only
  video: { type: String, default: '' }, // YouTube/Vimeo/direct URL
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Property', propertySchema);