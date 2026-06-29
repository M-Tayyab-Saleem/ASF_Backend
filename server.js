const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : null;

app.use(cors({ 
  origin: [
    frontendUrl, 
    'http://localhost:5173', 
    'https://asf-frontend-olive.vercel.app',
    'https://ai-security-framework-explorer.vercel.app',
    'https://ai-security-framework.vercel.app'
  ].filter(Boolean)
}));
app.use(express.json());

// Routes
app.use('/api/strategies', require('./routes/strategies'));
app.use('/api/capabilities', require('./routes/capabilities'));
app.use('/api/controls', require('./routes/controls'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/search', require('./routes/search'));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));
