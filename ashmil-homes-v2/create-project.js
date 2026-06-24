const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, 'ashmil-homes-v2');

const folders = [
  'models',
  'routes',
  'middleware',
  'public',
  'public/admin',
  'public/assets'
];

const files = {
  // Root files
  'server.js': `require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const adminRoutes = require('./routes/admin');
const propertyRoutes = require('./routes/properties');
const contactRoutes = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/admin', adminRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/contact', contactRoutes);

// Frontend routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/properties', (req, res) => res.sendFile(path.join(__dirname, 'public', 'properties.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/property-details', (req, res) => res.sendFile(path.join(__dirname, 'public', 'property-details.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));

// 404
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(\`🚀 Server running on port \${PORT}\`)))
  .catch(err => console.error('MongoDB error:', err));`,

  'package.json': `{
  "name": "ashmil-homes-v2",
  "version": "1.0.0",
  "description": "Premium real estate website with URL-based images and videos",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.0.0",
    "nodemailer": "^6.9.7"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}`,

  '.env': `PORT=5000
MONGODB_URI=mongodb+srv://bitsecurextech_db_user:9579y18vg0R65HQx@cluster0.wb0sm6d.mongodb.net/ashmil_realestate?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_key_change_me
EMAIL_USER=Ashmilhomesnigerialimited@gmail.com
EMAIL_PASS=your_app_password_here`,

  // Models
  'models/Admin.js': `const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });

adminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);`,

  'models/Property.js': `const mongoose = require('mongoose');

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
  images: [{ type: String }],
  video: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Property', propertySchema);`,

  // Routes
  'routes/admin.js': `const express = require('express');
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
    const imageArray = Array.isArray(images) ? images : images?.split('\\n').map(s => s.trim()).filter(s => s) || [];
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
        ? updates.images.split('\\n').map(s => s.trim()).filter(s => s) 
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

module.exports = router;`,

  'routes/properties.js': `const express = require('express');
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

module.exports = router;`,

  'routes/contact.js': `const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

router.post('/', async (req, res) => {
  const { name, email, phone, message } = req.body;
  try {
    await transporter.sendMail({
      from: \`"\${name}" <\${email}>\`,
      to: process.env.EMAIL_USER,
      subject: \`New enquiry from \${name}\`,
      text: \`Name: \${name}\\nPhone: \${phone}\\nEmail: \${email}\\n\\n\${message}\`
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;`,

  // Middleware
  'middleware/auth.js': `const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};`,

  // Public HTML files
  'public/index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ashmil Homes – Premium Real Estate</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Manrope', sans-serif; }
    h1, h2, h3, .font-serif { font-family: 'Fraunces', serif; }
    .bg-navy { background-color: #0A1A2F; }
    .bg-navy-deep { background-color: #051020; }
    .text-gold { color: #D4AF37; }
    .gradient-gold { background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); }
    .hero-gradient { background: linear-gradient(90deg, rgba(5,16,32,0.85) 0%, rgba(5,16,32,0.4) 100%); }
    .shadow-gold { box-shadow: 0 4px 14px rgba(212,175,55,0.3); }
  </style>
</head>
<body class="bg-white">

<div class="min-h-screen flex flex-col">
  <header class="fixed top-0 left-0 right-0 z-50 bg-transparent transition-all duration-300">
    <div class="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" alt="Logo" class="h-11 w-11 md:h-12 md:w-12 rounded-full object-cover ring-2 ring-gold/60 shadow-gold">
        <div class="hidden sm:block">
          <div class="font-serif text-lg md:text-xl font-bold text-white">Ashmil Homes</div>
          <div class="text-[10px] md:text-xs tracking-widest uppercase text-white/80">Nigeria Limited</div>
        </div>
      </a>
      <nav class="hidden md:flex gap-8">
        <a href="/" class="text-sm font-medium text-gold">Home</a>
        <a href="/properties" class="text-sm font-medium text-white hover:text-gold transition">Properties</a>
        <a href="/about" class="text-sm font-medium text-white hover:text-gold transition">About</a>
        <a href="/contact" class="text-sm font-medium text-white hover:text-gold transition">Contact</a>
        <a href="/properties" class="gradient-gold text-navy px-4 py-2 rounded-md text-sm font-semibold shadow-gold flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4"></i> Find a Home
        </a>
      </nav>
    </div>
  </header>

  <main class="flex-1">
    <section class="relative h-[88vh] min-h-[520px] md:h-screen overflow-hidden">
      <div class="absolute inset-0 hero-slide transition-opacity duration-1000 opacity-100">
        <img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/pexels-shox-31656145-scaled.jpg" class="w-full h-full object-cover">
        <div class="absolute inset-0 hero-gradient"></div>
      </div>
      <div class="relative z-10 h-full container mx-auto px-4 flex flex-col justify-center text-white">
        <div class="max-w-3xl">
          <span class="inline-block text-gold text-xs md:text-sm tracking-[0.3em] uppercase mb-4 border border-gold/40 px-3 py-1 rounded-full">Premium Real Estate</span>
          <h1 class="font-serif text-4xl sm:text-5xl md:text-7xl font-bold leading-tight mb-6">Your Dream Home, Delivered</h1>
          <p class="text-base md:text-xl text-white/90 max-w-2xl mb-8">Luxury duplexes and serviced homes built to modern standards across Lagos.</p>
          <div class="flex gap-3">
            <a href="/properties" class="gradient-gold text-navy px-8 py-3 rounded-md shadow-gold font-semibold hover:opacity-90 transition flex items-center gap-2">
              <i data-lucide="search" class="w-5 h-5"></i> Browse Properties
            </a>
            <a href="/contact" class="border border-white text-white px-8 py-3 rounded-md hover:bg-white hover:text-navy transition font-semibold flex items-center gap-2">
              <i data-lucide="phone" class="w-5 h-5"></i> Get In Touch
            </a>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-navy text-white py-12">
      <div class="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        <div><div class="font-serif text-4xl md:text-5xl font-bold text-gold">50+</div><div class="text-xs uppercase tracking-wider mt-2">Homes Delivered</div></div>
        <div><div class="font-serif text-4xl md:text-5xl font-bold text-gold">10+</div><div class="text-xs uppercase tracking-wider mt-2">Years Experience</div></div>
        <div><div class="font-serif text-4xl md:text-5xl font-bold text-gold">8</div><div class="text-xs uppercase tracking-wider mt-2">Lagos Locations</div></div>
        <div><div class="font-serif text-4xl md:text-5xl font-bold text-gold">100%</div><div class="text-xs uppercase tracking-wider mt-2">Client Trust</div></div>
      </div>
    </section>

    <section class="py-20 bg-gray-50">
      <div class="container mx-auto px-4 text-center max-w-2xl mx-auto mb-12">
        <span class="text-gold text-xs uppercase tracking-wider">Why Choose Us</span>
        <h2 class="font-serif text-3xl md:text-5xl font-bold mt-2">Tested. Trusted. Proven.</h2>
      </div>
      <div class="container mx-auto px-4 grid md:grid-cols-3 gap-6">
        <div class="bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition"><div class="h-14 w-14 rounded-lg bg-gradient-gold flex items-center justify-center mb-5"><i data-lucide="award" class="h-7 w-7 text-navy"></i></div><h3 class="font-serif text-xl font-semibold mb-2">Quality Construction</h3><p class="text-gray-600">Reputable engineers, premium materials, modern standards.</p></div>
        <div class="bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition"><div class="h-14 w-14 rounded-lg bg-gradient-gold flex items-center justify-center mb-5"><i data-lucide="shield-check" class="h-7 w-7 text-navy"></i></div><h3 class="font-serif text-xl font-semibold mb-2">Verified Titles</h3><p class="text-gray-600">Genuine documents and transparent processes.</p></div>
        <div class="bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition"><div class="h-14 w-14 rounded-lg bg-gradient-gold flex items-center justify-center mb-5"><i data-lucide="sparkles" class="h-7 w-7 text-navy"></i></div><h3 class="font-serif text-xl font-semibold mb-2">End-to-End Service</h3><p class="text-gray-600">Land, design, build, sale, and shortlets — all in one place.</p></div>
      </div>
    </section>

    <section class="py-20">
      <div class="container mx-auto px-4">
        <div class="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
          <div><span class="text-gold text-xs uppercase tracking-wider">Featured Listings</span><h2 class="font-serif text-3xl md:text-5xl font-bold mt-2">Discover Your Next Home</h2></div>
          <a href="/properties" class="border border-navy text-navy px-4 py-2 rounded-md hover:bg-navy hover:text-white transition flex items-center gap-2">
            View All Properties <i data-lucide="arrow-right" class="w-4 h-4"></i>
          </a>
        </div>
        <div id="featured-properties" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"></div>
      </div>
    </section>

    <section class="relative py-20 bg-navy-deep text-white text-center">
      <div class="container mx-auto px-4 max-w-3xl">
        <i data-lucide="building-2" class="h-16 w-16 text-gold mx-auto mb-4"></i>
        <h2 class="font-serif text-3xl md:text-5xl font-bold mb-4">Build Your Dream Home With Us</h2>
        <p class="text-white/80 mb-8">Whether you're buying land, acquiring a finished home, or building from scratch, we guide you every step of the way.</p>
        <div class="flex flex-wrap justify-center gap-3">
          <a href="/contact" class="gradient-gold text-navy px-8 py-3 rounded-md shadow-gold font-semibold hover:opacity-90 transition flex items-center gap-2">
            <i data-lucide="calendar" class="w-5 h-5"></i> Schedule a Consultation
          </a>
          <a href="/properties" class="border border-white text-white px-8 py-3 rounded-md hover:bg-white hover:text-navy transition font-semibold flex items-center gap-2">
            <i data-lucide="search" class="w-5 h-5"></i> Browse Listings
          </a>
        </div>
      </div>
    </section>
  </main>

  <footer class="bg-navy-deep text-white">
    <div class="container mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
      <div><img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" class="w-14 h-14 rounded-full ring-2 ring-gold/60 mb-4"><h3 class="font-serif text-xl font-bold mb-2">Ashmil Homes</h3><p class="text-sm text-white/70">Turning property dreams into reality across Lagos.</p></div>
      <div><h4 class="font-serif text-gold text-lg mb-4">Quick Links</h4><ul class="space-y-2 text-sm"><li><a href="/" class="hover:text-gold">Home</a></li><li><a href="/properties" class="hover:text-gold">Properties</a></li><li><a href="/about" class="hover:text-gold">About Us</a></li><li><a href="/contact" class="hover:text-gold">Contact</a></li></ul></div>
      <div><h4 class="font-serif text-gold text-lg mb-4">Categories</h4><ul class="space-y-2 text-sm"><li><a href="/properties?category=houses" class="hover:text-gold"><i data-lucide="home" class="inline-block w-4 h-4 mr-1"></i>Houses for Sale</a></li><li><a href="/properties?category=land" class="hover:text-gold"><i data-lucide="trees" class="inline-block w-4 h-4 mr-1"></i>Land for Sale</a></li><li><a href="/properties?category=shortlets" class="hover:text-gold"><i data-lucide="bed-double" class="inline-block w-4 h-4 mr-1"></i>Shortlets</a></li><li><a href="/properties?category=flats" class="hover:text-gold"><i data-lucide="building-2" class="inline-block w-4 h-4 mr-1"></i>Flats & Apartments</a></li></ul></div>
      <div><h4 class="font-serif text-gold text-lg mb-4">Get In Touch</h4><ul class="space-y-2 text-sm"><li><i data-lucide="map-pin" class="inline-block w-4 h-4 mr-1 text-gold"></i>10 Unilag Estate, Ikorodu, Lagos</li><li><i data-lucide="phone" class="inline-block w-4 h-4 mr-1 text-gold"></i>0707 440 4637, 0902 396 7106</li><li><i data-lucide="mail" class="inline-block w-4 h-4 mr-1 text-gold"></i>Ashmilhomesnigerialimited@gmail.com</li></ul></div>
    </div>
    <div class="border-t border-white/10 py-4 text-center text-xs text-white/60">© 2025 Ashmil Homes Nigeria Limited | <a href="/admin/login" class="hover:text-gold">Admin Login</a></div>
  </footer>

  <a href="https://wa.me/2347074404637" target="_blank" class="fixed bottom-5 right-5 bg-[#25D366] rounded-full p-3 shadow-lg z-50"><img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" class="w-8 h-8"></a>

  <script>
    document.addEventListener('DOMContentLoaded', () => lucide.createIcons());
    async function loadFeatured() {
      try {
        const res = await fetch('/api/properties');
        const props = await res.json();
        const container = document.getElementById('featured-properties');
        if (!props.length) { container.innerHTML = '<p class="col-span-full text-center text-gray-500">No properties yet.</p>'; return; }
        container.innerHTML = props.slice(0,3).map(p => \`
          <div class="bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition">
            <div class="relative h-64"><img src="\${p.images?.[0] || 'https://via.placeholder.com/800x600'}" class="w-full h-full object-cover"><span class="absolute top-3 right-3 bg-gold text-navy text-xs font-bold px-3 py-1 rounded-full">\${p.category}</span></div>
            <div class="p-5"><div class="flex justify-between"><h3 class="font-serif text-xl font-bold">\${p.title}</h3><span class="text-gold font-bold">₦\${p.price}</span></div><p class="text-gray-500 text-sm mt-1">\${p.location}</p><p class="text-gray-600 text-sm mt-2 line-clamp-2">\${p.description}</p><a href="/property-details?id=\${p._id}" class="inline-block mt-3 text-gold text-sm font-semibold hover:underline">View details <i data-lucide="arrow-right" class="inline-block w-4 h-4 ml-1"></i></a></div>
          </div>
        \`).join('');
        lucide.createIcons();
      } catch(err) { console.error(err); }
    }
    loadFeatured();
  </script>
</body>
</html>`,

  'public/properties.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Properties – Ashmil Homes</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Manrope', sans-serif; background: #f8fafc; }
    h1, h2, h3, .font-serif { font-family: 'Fraunces', serif; }
    .bg-navy { background-color: #0A1A2F; }
    .text-gold { color: #D4AF37; }
    .gradient-gold { background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); }
  </style>
</head>
<body class="bg-gray-50">

<header class="bg-navy text-white sticky top-0 z-50 shadow-md">
  <div class="container mx-auto px-4 py-3 flex justify-between items-center">
    <a href="/" class="flex items-center gap-2"><img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" class="w-10 h-10 rounded-full ring-2 ring-gold/60"><span class="font-serif font-bold hidden sm:inline">Ashmil Homes</span></a>
    <nav class="hidden md:flex gap-6"><a href="/" class="hover:text-gold">Home</a><a href="/properties" class="text-gold">Properties</a><a href="/about" class="hover:text-gold">About</a><a href="/contact" class="hover:text-gold">Contact</a></nav>
  </div>
</header>

<main class="container mx-auto px-4 py-10">
  <h1 class="text-4xl md:text-5xl font-bold text-navy text-center mb-2">All Properties</h1>
  <p class="text-center text-gray-500 mb-8">Find your dream home, land, or shortlet in Lagos</p>

  <div class="bg-white p-5 rounded-2xl shadow-lg mb-8 flex flex-wrap gap-4 items-end">
    <div class="flex-1 min-w-[150px]"><label class="block text-sm font-semibold mb-1">Category</label><select id="categoryFilter" class="w-full border border-gray-200 rounded-lg p-2.5"><option value="">All Categories</option><option value="houses">Houses for Sale</option><option value="land">Land for Sale</option><option value="shortlets">Shortlets</option><option value="flats">Flats & Apartments</option></select></div>
    <div class="flex-1 min-w-[150px]"><label class="block text-sm font-semibold mb-1">Location</label><select id="locationFilter" class="w-full border border-gray-200 rounded-lg p-2.5"><option value="">All Locations</option><option>Lekki</option><option>Ajah</option><option>Ikeja</option><option>Magodo</option><option>Festac</option><option>Epe</option><option>Ikorodu</option></select></div>
    <div class="flex-1 min-w-[200px]"><label class="block text-sm font-semibold mb-1">Search</label><div class="relative"><input id="searchInput" type="text" placeholder="Title, location..." class="w-full border border-gray-200 rounded-lg p-2.5 pl-9"><i data-lucide="search" class="absolute left-3 top-3 w-4 h-4 text-gray-400"></i></div></div>
    <div><button id="filterBtn" class="gradient-gold text-navy px-6 py-2.5 rounded-lg font-semibold shadow hover:shadow-md transition">Apply Filters</button></div>
  </div>

  <div id="propertiesContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"></div>
</main>

<footer class="bg-navy-deep text-white text-center py-6 text-sm">© 2025 Ashmil Homes Nigeria Limited</footer>

<script>
  document.addEventListener('DOMContentLoaded', () => lucide.createIcons());
  const categoryFilter = document.getElementById('categoryFilter'), locationFilter = document.getElementById('locationFilter'), searchInput = document.getElementById('searchInput'), filterBtn = document.getElementById('filterBtn'), container = document.getElementById('propertiesContainer');
  async function loadProperties() {
    const category = categoryFilter.value, location = locationFilter.value, search = searchInput.value;
    let url = '/api/properties?';
    if(category) url += \`category=\${category}&\`;
    if(location && location !== 'All Locations') url += \`location=\${encodeURIComponent(location)}&\`;
    if(search) url += \`search=\${encodeURIComponent(search)}&\`;
    const res = await fetch(url); const props = await res.json();
    if(!props.length) { container.innerHTML = '<div class="col-span-full text-center py-12"><div class="text-6xl mb-4">🏠</div><p class="text-gray-500">No properties match your criteria.</p></div>'; return; }
    container.innerHTML = props.map(p => \`
      <div class="group bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
        <div class="relative h-64"><img src="\${p.images?.[0] || 'https://via.placeholder.com/800x600'}" class="w-full h-full object-cover group-hover:scale-105 transition duration-700"><div class="absolute top-3 right-3 bg-gold text-navy text-xs font-bold px-3 py-1 rounded-full shadow">\${p.category}</div></div>
        <div class="p-5"><div class="flex justify-between items-start"><h3 class="font-serif text-xl font-bold group-hover:text-gold transition">\${p.title}</h3><span class="text-gold font-bold">₦\${p.price}</span></div><p class="text-gray-500 text-sm mt-1">\${p.location}</p><p class="text-gray-600 text-sm mt-2 line-clamp-2">\${p.description}</p><a href="/property-details?id=\${p._id}" class="inline-flex items-center gap-1 mt-4 text-gold text-sm font-semibold hover:gap-2 transition-all">View details <i data-lucide="arrow-right" class="w-4 h-4"></i></a></div>
      </div>
    \`).join('');
    lucide.createIcons();
  }
  filterBtn.addEventListener('click', loadProperties);
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('category');
  if(catParam) categoryFilter.value = catParam;
  loadProperties();
</script>
</body>
</html>`,

  'public/property-details.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Property Details – Ashmil Homes</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>body{font-family:'Manrope',sans-serif;background:#f8fafc;}.bg-navy{background:#0A1A2F;}.text-gold{color:#D4AF37;}.gradient-gold{background:linear-gradient(135deg,#D4AF37,#B8860B);}</style>
</head>
<body>
<header class="bg-navy text-white sticky top-0 z-50 shadow-md"><div class="container mx-auto px-4 py-3 flex justify-between items-center"><a href="/" class="flex items-center gap-2"><img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" class="w-10 h-10 rounded-full"><span class="font-serif font-bold">Ashmil Homes</span></a><nav class="hidden md:flex gap-6"><a href="/">Home</a><a href="/properties">Properties</a><a href="/about">About</a><a href="/contact">Contact</a></nav></div></header>

<main class="container mx-auto px-4 py-12">
  <div id="details" class="bg-white rounded-2xl shadow-xl overflow-hidden">
    <div class="p-6 md:p-8">
      <div id="loading" class="text-center py-12">Loading property details...</div>
      <div id="error" class="text-center py-12 text-red-500 hidden">Property not found.</div>
      <div id="content" class="grid md:grid-cols-2 gap-8 hidden">
        <div><img id="mainImage" src="" class="w-full h-96 object-cover rounded-xl shadow-md"></div>
        <div><h1 id="title" class="font-serif text-3xl md:text-4xl font-bold mb-2"></h1><p id="location" class="text-gray-500 mb-2">📍 <span id="locationText"></span></p><p id="price" class="text-2xl text-gold font-bold mb-4"></p><div id="specs" class="flex gap-4 mb-4 text-gray-700"></div><p id="description" class="text-gray-600 leading-relaxed mb-6"></p>
          <div id="videoContainer" class="mt-4 hidden"><h3 class="font-serif text-lg font-semibold mb-2"><i data-lucide="video" class="w-5 h-5 inline mr-2"></i>Property Video</h3><div id="videoPlayer"></div></div>
          <div class="border-t pt-6 mt-4"><h3 class="font-serif text-xl font-semibold mb-4">Interested?</h3><p class="text-gray-600 mb-4">Speak directly with our team to schedule an inspection or request more details.</p><div class="flex flex-wrap gap-4"><a href="tel:07074404637" class="gradient-gold text-navy px-5 py-2 rounded-md font-semibold shadow-md flex items-center gap-2"><i data-lucide="phone" class="w-4 h-4"></i> Call us (0707 440 4637)</a><a href="tel:09023967106" class="border border-navy text-navy px-5 py-2 rounded-md font-semibold hover:bg-navy hover:text-white flex items-center gap-2"><i data-lucide="phone" class="w-4 h-4"></i> Alt. line (0902 396 7106)</a><a href="mailto:Ashmilhomesnigerialimited@gmail.com" class="border border-gold text-gold px-5 py-2 rounded-md font-semibold flex items-center gap-2"><i data-lucide="mail" class="w-4 h-4"></i> Email Us</a></div></div>
        </div>
      </div>
    </div>
  </div>
</main>

<footer class="bg-navy-deep text-white text-center py-6 text-sm">© 2025 Ashmil Homes Nigeria Limited</footer>

<script>
  document.addEventListener('DOMContentLoaded', () => lucide.createIcons());
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if(id) {
    fetch(\`/api/properties/\${id}\`).then(res => res.json()).then(p => {
      document.getElementById('title').innerText = p.title;
      document.getElementById('locationText').innerText = p.location;
      document.getElementById('price').innerText = \`₦\${p.price}\`;
      document.getElementById('description').innerText = p.description;
      document.getElementById('mainImage').src = p.images?.[0] || 'https://via.placeholder.com/800x600';
      let specs=''; if(p.bedrooms) specs+=\`<span><i data-lucide="bed-double" class="w-4 h-4 inline mr-1"></i>\${p.bedrooms} beds</span>\`; if(p.bathrooms) specs+=\`<span><i data-lucide="bath" class="w-4 h-4 inline mr-1"></i>\${p.bathrooms} baths</span>\`; if(p.area) specs+=\`<span><i data-lucide="maximize" class="w-4 h-4 inline mr-1"></i>\${p.area}</span>\`; document.getElementById('specs').innerHTML = specs;
      if(p.video) { document.getElementById('videoContainer').classList.remove('hidden'); const match = p.video.match(/(?:youtube\.com\\/embed\\/)([a-zA-Z0-9_-]{11})/); if(match) { document.getElementById('videoPlayer').innerHTML = \`<iframe width="100%" height="315" src="https://www.youtube.com/embed/\${match[1]}" frameborder="0" allowfullscreen class="rounded-xl"></iframe>\`; } else { document.getElementById('videoPlayer').innerHTML = \`<video controls class="w-full rounded-xl" style="max-height:500px;"><source src="\${p.video}" type="video/mp4"></video>\`; } }
      document.getElementById('loading').classList.add('hidden'); document.getElementById('content').classList.remove('hidden');
    }).catch(() => { document.getElementById('loading').classList.add('hidden'); document.getElementById('error').classList.remove('hidden'); });
  }
</script>
</body>
</html>`,

  'public/about.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About Ashmil Homes</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>body{font-family:'Manrope',sans-serif;background:#f8fafc;}.bg-navy{background:#0A1A2F;}.text-gold{color:#D4AF37;}</style>
</head>
<body>
<header class="bg-navy text-white sticky top-0 z-50 shadow-md"><div class="container mx-auto px-4 py-3 flex justify-between"><a href="/" class="flex items-center gap-2"><img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" class="w-10 h-10 rounded-full"><span class="font-serif font-bold">Ashmil Homes</span></a><nav class="hidden md:flex gap-6"><a href="/">Home</a><a href="/properties">Properties</a><a href="/about" class="text-gold">About</a><a href="/contact">Contact</a></nav></div></header>
<main class="container mx-auto px-4 py-12 max-w-4xl"><h1 class="text-4xl md:text-5xl font-bold text-center mb-6">About Ashmil Homes</h1><div class="bg-white p-8 rounded-2xl shadow-md"><p class="text-gray-700 text-lg">Ashmil Homes Nigeria Limited is a premier real estate development company based in Lagos, Nigeria. We specialize in luxury duplexes, serviced apartments, land sales, and short‑let accommodations.</p><p class="text-gray-700 mt-4">With over 10 years of experience, we have delivered 50+ homes and earned the trust of our clients through transparency, quality construction, and end‑to‑end service.</p><p class="text-gray-700 mt-4">Our mission is to turn property dreams into reality by providing verified titles, modern designs, and professional support from land acquisition to handover.</p><div class="bg-gold/10 p-6 rounded-xl mt-8 text-center"><p class="font-serif text-xl italic">"Tested. Trusted. Proven."</p><p class="text-sm text-gray-600 mt-2">– Ashmil Homes Team</p></div></div></main>
<footer class="bg-navy-deep text-white text-center py-6 text-sm">© 2025 Ashmil Homes Nigeria Limited</footer>
</body>
</html>`,

  'public/contact.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact Ashmil Homes</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>body{font-family:'Manrope',sans-serif;background:#f8fafc;}.bg-navy{background:#0A1A2F;}.text-gold{color:#D4AF37;}.gradient-gold{background:linear-gradient(135deg,#D4AF37,#B8860B);}</style>
</head>
<body>
<header class="bg-navy text-white sticky top-0 z-50 shadow-md"><div class="container mx-auto px-4 py-3 flex justify-between"><a href="/" class="flex items-center gap-2"><img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" class="w-10 h-10 rounded-full"><span class="font-serif font-bold">Ashmil Homes</span></a><nav class="hidden md:flex gap-6"><a href="/">Home</a><a href="/properties">Properties</a><a href="/about">About</a><a href="/contact" class="text-gold">Contact</a></nav></div></header>
<main class="container mx-auto px-4 py-12"><h1 class="text-4xl md:text-5xl font-bold text-center mb-2">Get in Touch</h1><p class="text-center text-gray-500 mb-10">We're here to help with your real estate needs</p><div class="grid md:grid-cols-2 gap-8"><div><div class="bg-white p-6 rounded-2xl shadow-md mb-6"><h3 class="font-bold text-xl mb-3 flex items-center gap-2"><i data-lucide="map-pin" class="w-5 h-5 text-gold"></i>Visit Us</h3><p>10 Unilag Estate Main Road, Igboken, Igbe, Ikorodu, Lagos State</p></div><div class="bg-white p-6 rounded-2xl shadow-md"><h3 class="font-bold text-xl mb-3 flex items-center gap-2"><i data-lucide="phone" class="w-5 h-5 text-gold"></i>Contact Info</h3><p>📞 0707 440 4637<br>📞 0902 396 7106<br>✉️ Ashmilhomesnigerialimited@gmail.com</p></div></div><div class="bg-white p-6 rounded-2xl shadow-md"><h3 class="font-bold text-xl mb-4 flex items-center gap-2"><i data-lucide="mail" class="w-5 h-5 text-gold"></i>Send a Message</h3><form id="contactForm" class="space-y-4"><input type="text" name="name" placeholder="Full name" required class="w-full border border-gray-200 rounded-lg p-3"><input type="email" name="email" placeholder="Email" required class="w-full border border-gray-200 rounded-lg p-3"><input type="tel" name="phone" placeholder="Phone" class="w-full border border-gray-200 rounded-lg p-3"><textarea name="message" rows="4" placeholder="Your message" required class="w-full border border-gray-200 rounded-lg p-3"></textarea><button type="submit" class="gradient-gold w-full py-3 rounded-lg font-semibold text-navy shadow hover:shadow-md transition flex items-center justify-center gap-2"><i data-lucide="send" class="w-4 h-4"></i>Send Enquiry</button></form></div></div></main>
<footer class="bg-navy-deep text-white text-center py-6 text-sm">© 2025 Ashmil Homes Nigeria Limited</footer>
<script>document.getElementById('contactForm')?.addEventListener('submit', async(e)=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const res=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await res.json();alert(result.success?'Message sent! We will get back to you soon.':'Error, please try again.');if(result.success)e.target.reset();});</script>
</body>
</html>`,

  'public/404.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>body{font-family:'Manrope',sans-serif;background:#0A1A2F;}.text-gold{color:#D4AF37;}</style>
</head>
<body class="min-h-screen flex items-center justify-center text-white text-center p-4">
  <div><div class="text-8xl font-bold text-gold">404</div><h1 class="font-serif text-3xl md:text-5xl font-bold mt-4">Page Not Found</h1><p class="text-white/70 mt-2">The page you're looking for doesn't exist.</p><a href="/" class="inline-block mt-6 bg-gradient-gold text-navy px-6 py-2 rounded-md font-semibold shadow-gold hover:opacity-90 transition">Return Home</a></div>
</body>
</html>`,

  // Admin files
  'public/admin/login.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>body{font-family:'Manrope',sans-serif;background:linear-gradient(135deg,#0A1A2F,#051020);}.glass-card{background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);border:1px solid rgba(212,175,55,0.2);}.gradient-gold{background:linear-gradient(135deg,#D4AF37,#B8860B);}</style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="glass-card max-w-md w-full rounded-2xl shadow-2xl p-8">
    <div class="text-center mb-6"><img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" class="w-20 h-20 rounded-full mx-auto ring-4 ring-gold/30 shadow-lg mb-3"><h2 class="font-serif text-2xl font-bold text-navy">Ashmil Homes</h2><p class="text-gray-500 text-sm">Administrator Portal</p></div>
    <form id="loginForm" class="space-y-4">
      <div class="relative"><i data-lucide="mail" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"></i><input type="email" id="email" required class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold focus:border-gold transition" placeholder="admin@ashmil.com"></div>
      <div class="relative"><i data-lucide="lock" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"></i><input type="password" id="password" required class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold focus:border-gold transition" placeholder="Enter your password"></div>
      <button type="submit" class="gradient-gold w-full text-navy font-semibold py-2 rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"><i data-lucide="log-in" class="w-4 h-4"></i> Sign In</button>
      <div id="error" class="text-red-500 text-sm text-center mt-2"></div>
    </form>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', () => lucide.createIcons());
    document.getElementById('loginForm').addEventListener('submit', async(e) => {
      e.preventDefault(); const email = document.getElementById('email').value; const password = document.getElementById('password').value;
      try { const res = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email, password }) }); const data = await res.json(); if(res.ok){ localStorage.setItem('adminToken', data.token); window.location.href = '/admin/dashboard'; } else { document.getElementById('error').innerText = data.error || 'Invalid credentials'; } } catch(err){ document.getElementById('error').innerText = 'Network error'; }
    });
  </script>
</body>
</html>`,

  'public/admin/dashboard.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap" rel="stylesheet">
  <style>body{font-family:'Manrope',sans-serif;background:#f1f5f9;}.gradient-gold{background:linear-gradient(135deg,#D4AF37,#B8860B);}</style>
</head>
<body class="bg-gray-100">
<div class="container mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-8">
    <div class="flex items-center gap-3"><img src="https://hotgistloaded.com.ng/wp-content/uploads/2026/05/logo-ashmil-DAwsa8ai.jpg" class="w-12 h-12 rounded-full"><h1 class="font-serif text-2xl font-bold text-navy">Ashmil Homes</h1></div>
    <button onclick="logout()" class="bg-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2"><i data-lucide="log-out" class="w-4 h-4"></i> Logout</button>
  </div>
  <div class="bg-white rounded-2xl shadow-lg p-6 mb-8">
    <h2 class="text-2xl font-semibold mb-4 flex items-center gap-2"><i data-lucide="edit-3" class="w-6 h-6 text-gold"></i> Add / Edit Property</h2>
    <form id="propertyForm" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" id="propertyId">
      <input type="text" id="title" placeholder="Title *" required class="border rounded-lg p-2">
      <input type="text" id="price" placeholder="Price *" required class="border rounded-lg p-2">
      <input type="text" id="location" placeholder="Location *" required class="border rounded-lg p-2">
      <select id="category" required class="border rounded-lg p-2"><option value="houses">Houses for Sale</option><option value="land">Land for Sale</option><option value="shortlets">Shortlets</option><option value="flats">Flats & Apartments</option></select>
      <textarea id="description" placeholder="Description *" rows="3" required class="border rounded-lg p-2 md:col-span-2"></textarea>
      <input type="number" id="bedrooms" placeholder="Bedrooms" class="border rounded-lg p-2"><input type="number" id="bathrooms" placeholder="Bathrooms" class="border rounded-lg p-2"><input type="text" id="area" placeholder="Area" class="border rounded-lg p-2">
      <div class="flex items-center"><input type="checkbox" id="featured"> <label class="ml-2">Featured</label></div>
      <div class="md:col-span-2"><label class="block font-medium mb-1"><i data-lucide="image" class="w-4 h-4 inline mr-1"></i>Image URLs (one per line)</label><textarea id="imageUrls" rows="3" placeholder="https://example.com/image1.jpg" class="border rounded-lg p-2 w-full" oninput="previewImages()"></textarea><div id="imagePreview" class="flex flex-wrap gap-2 mt-2"></div></div>
      <div class="md:col-span-2"><label class="block font-medium mb-1"><i data-lucide="video" class="w-4 h-4 inline mr-1"></i>Video URL</label><input type="url" id="videoUrl" placeholder="https://www.youtube.com/embed/xxx" class="border rounded-lg p-2 w-full" oninput="previewVideo()"><div id="videoPreview" class="mt-2"></div></div>
      <div class="md:col-span-2 flex gap-3"><button type="submit" class="gradient-gold text-navy px-6 py-2 rounded-lg font-semibold flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i> Save</button><button type="button" onclick="resetForm()" class="bg-gray-300 px-4 py-2 rounded-lg">Cancel</button></div>
    </form>
  </div>
  <div class="bg-white rounded-2xl shadow-lg p-6"><h2 class="text-2xl font-semibold mb-4 flex items-center gap-2"><i data-lucide="list" class="w-6 h-6 text-gold"></i> All Properties</h2><div id="propertyList" class="grid md:grid-cols-3 gap-4"></div></div>
</div>
<script>
  const token = localStorage.getItem('adminToken'); if(!token) window.location.href = '/admin/login';
  function previewImages(){ const textarea = document.getElementById('imageUrls'); const preview = document.getElementById('imagePreview'); const urls = textarea.value.split('\\n').filter(s=>s.trim()); preview.innerHTML = ''; urls.forEach(url => { const img = document.createElement('img'); img.src = url.trim(); img.className = 'w-20 h-20 object-cover rounded border'; img.onerror = () => img.src = 'https://via.placeholder.com/80'; preview.appendChild(img); }); }
  function previewVideo(){ const url = document.getElementById('videoUrl').value; const container = document.getElementById('videoPreview'); container.innerHTML = ''; if(!url) return; const match = url.match(/(?:youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]{11})/); if(match){ container.innerHTML = \`<iframe width="100%" height="200" src="https://www.youtube.com/embed/\${match[1]}" frameborder="0" allowfullscreen class="rounded-lg"></iframe>\`; } else { container.innerHTML = \`<video controls class="w-full max-h-48 rounded-lg"><source src="\${url}" type="video/mp4"></video>\`; } }
  async function loadProperties(){ const res = await fetch('/api/admin/properties', { headers: { 'Authorization': \`Bearer \${token}\` } }); const props = await res.json(); const container = document.getElementById('propertyList'); if(!props.length){ container.innerHTML = '<p class="col-span-full text-center text-gray-500">No properties yet.</p>'; return; } container.innerHTML = props.map(p => \`
    <div class="border rounded-xl p-3 shadow-sm"><img src="\${p.images?.[0] || 'https://via.placeholder.com/300'}" class="w-full h-40 object-cover rounded mb-2"><h3 class="font-bold">\${p.title}</h3><p class="text-gold font-bold">₦\${p.price}</p><p class="text-sm text-gray-500">\${p.location}</p>\${p.video ? '<span class="text-blue-600 text-xs"><i data-lucide="video" class="w-3 h-3 inline"></i> Video</span>' : ''}<div class="flex gap-2 mt-2"><button onclick="editProperty('\${p._id}')" class="bg-blue-500 text-white px-3 py-1 rounded text-sm flex items-center gap-1"><i data-lucide="edit-2" class="w-3 h-3"></i> Edit</button><button onclick="deleteProperty('\${p._id}')" class="bg-red-500 text-white px-3 py-1 rounded text-sm flex items-center gap-1"><i data-lucide="trash-2" class="w-3 h-3"></i> Delete</button></div></div>
  \`).join(''); lucide.createIcons(); }
  document.getElementById('propertyForm').addEventListener('submit', async(e) => { e.preventDefault(); const id = document.getElementById('propertyId').value; const imageUrls = document.getElementById('imageUrls').value.split('\\n').filter(s=>s.trim()); const data = { title: document.getElementById('title').value, description: document.getElementById('description').value, price: document.getElementById('price').value, location: document.getElementById('location').value, category: document.getElementById('category').value, bedrooms: document.getElementById('bedrooms').value || 0, bathrooms: document.getElementById('bathrooms').value || 0, area: document.getElementById('area').value || '', featured: document.getElementById('featured').checked, images: imageUrls, video: document.getElementById('videoUrl').value || '' }; const url = id ? \`/api/admin/properties/\${id}\` : '/api/admin/properties'; const method = id ? 'PUT' : 'POST'; const res = await fetch(url, { method, headers: { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if(res.ok){ alert('Saved!'); resetForm(); loadProperties(); } else { alert('Error saving'); } });
  async function editProperty(id){ const res = await fetch(\`/api/properties/\${id}\`); const p = await res.json(); document.getElementById('propertyId').value = p._id; document.getElementById('title').value = p.title; document.getElementById('description').value = p.description; document.getElementById('price').value = p.price; document.getElementById('location').value = p.location; document.getElementById('category').value = p.category; document.getElementById('bedrooms').value = p.bedrooms; document.getElementById('bathrooms').value = p.bathrooms; document.getElementById('area').value = p.area; document.getElementById('featured').checked = p.featured; document.getElementById('imageUrls').value = (p.images || []).join('\\n'); previewImages(); document.getElementById('videoUrl').value = p.video || ''; previewVideo(); window.scrollTo({ top: 0 }); }
  async function deleteProperty(id){ if(confirm('Delete permanently?')){ await fetch(\`/api/admin/properties/\${id}\`, { method: 'DELETE', headers: { 'Authorization': \`Bearer \${token}\` } }); loadProperties(); } }
  function resetForm(){ document.getElementById('propertyForm').reset(); document.getElementById('propertyId').value = ''; document.getElementById('imagePreview').innerHTML = ''; document.getElementById('videoPreview').innerHTML = ''; }
  function logout(){ localStorage.removeItem('adminToken'); window.location.href = '/admin/login'; }
  loadProperties();
</script>
</body>
</html>`
};

// Create project structure
console.log('📁 Creating project structure...');

// Create root directory
if (!fs.existsSync(projectRoot)) {
  fs.mkdirSync(projectRoot);
  console.log(`✅ Created: ${projectRoot}`);
}

// Create folders
folders.forEach(folder => {
  const folderPath = path.join(projectRoot, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`✅ Created: ${folderPath}`);
  }
});

// Create files
Object.entries(files).forEach(([filePath, content]) => {
  const fullPath = path.join(projectRoot, filePath);
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✅ Created: ${fullPath}`);
});

console.log('\n🎉 Project created successfully!');
console.log(`📂 Location: ${projectRoot}`);
console.log('\n🚀 Next steps:');
console.log('1. cd ashmil-homes-v2');
console.log('2. npm install');
console.log('3. npm start');