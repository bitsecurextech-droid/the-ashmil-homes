const express = require('express');
const Property = require('../models/Property');
const router = express.Router();

router.get('/', async (req, res) => {
  const { category, location, search } = req.query;
  let filter = {};
  if (category) filter.category = category;
  if (location) filter.location = { $regex: new RegExp(location, 'i') };
  if (search) {
    filter.$or = [
      { title: { $regex: new RegExp(search, 'i') } },
      { location: { $regex: new RegExp(search, 'i') } }
    ];
  }
  const properties = await Property.find(filter).sort({ createdAt: -1 });
  res.json(properties);
});

router.get('/:id', async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });
  res.json(property);
});

module.exports = router;