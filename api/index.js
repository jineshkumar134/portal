const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'admission_portal_secret_key_123';

app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ──────────────────────────────────────────────────────
let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    isConnected = true;
    console.log('Connected to MongoDB Atlas.');
    
    // Ensure config document exists
    const count = await Config.countDocuments();
    if (count === 0) {
      await Config.create({ businessName: 'Admission Portal', targetValue: 300, businessType: 'school', npsScore: 0 });
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
};

// Connect to DB immediately
connectDB();

// Middleware to ensure DB is connected before handling requests
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// ─── Schemas ─────────────────────────────────────────────────────────────────
const toJSON = {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  }
};

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });
UserSchema.set('toJSON', toJSON);
const User = mongoose.model('User', UserSchema);

const LeadSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  secondary: { type: String, default: '' },
  category:  { type: String, default: '' },
  phone:     { type: String, default: '' },
  email:     { type: String, default: '' },
  notes:     { type: String, default: '' },
  status:    { type: String, required: true, default: 'inquiry' },
  priority:  { type: String, default: 'medium' },
  date:      { type: String, required: true },
  owner:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
LeadSchema.set('toJSON', toJSON);
const Lead = mongoose.model('Lead', LeadSchema);

const CampaignSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  spend:      { type: Number, required: true },
  source:     { type: String, required: true },
  leads:      { type: Number, default: 0 },
  conversion: { type: Number, default: 0 },
  startDate:  { type: String, default: '' },
  status:     { type: String, default: 'active' },
  owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
CampaignSchema.set('toJSON', toJSON);
const Campaign = mongoose.model('Campaign', CampaignSchema);

const TaskSchema = new mongoose.Schema({
  text:     { type: String, required: true },
  checked:  { type: Boolean, default: false },
  priority: { type: String, default: 'medium' },
  dueDate:  { type: String, default: '' },
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
TaskSchema.set('toJSON', toJSON);
const Task = mongoose.model('Task', TaskSchema);

const ConfigSchema = new mongoose.Schema({
  businessName: { type: String, default: 'Admission Portal' },
  businessType: { type: String, default: 'school' },
  targetValue:  { type: Number, default: 300 },
  npsScore:     { type: Number, default: 0 },
  currency:     { type: String, default: 'USD' },
  tagline:      { type: String, default: '' },
  owner:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
ConfigSchema.set('toJSON', toJSON);
const Config = mongoose.model('Config', ConfigSchema);

const StaffSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  role:        { type: String, default: '' },
  conversions: { type: Number, default: 0 },
  target:      { type: Number, default: 0 },
  avatar:      { type: String, default: '' },
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
StaffSchema.set('toJSON', toJSON);
const Staff = mongoose.model('Staff', StaffSchema);

const ContentSchema = new mongoose.Schema({
  title:   { type: String, required: true },
  channel: { type: String, required: true },
  date:    { type: String, required: true },
  notes:   { type: String, default: '' },
  status:  { type: String, default: 'planned' },
  owner:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
ContentSchema.set('toJSON', toJSON);
const Content = mongoose.model('Content', ContentSchema);

// ─── Auth Middleware ─────────────────────────────────────────────────────────
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    req.user = user;
    req.token = token;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: 'Email already registered' });
    
    const hashedPassword = await bcrypt.hash(password, 8);
    user = new User({ name, email, password: hashedPassword });
    await user.save();
    
    await Config.create({ owner: user._id, businessName: 'Admission Portal', businessType: 'school', targetValue: 300 });
    
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid login credentials' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid login credentials' });
    
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  res.json(req.user);
});

// ─── Config Routes ───────────────────────────────────────────────────────────
app.get('/api/config', auth, async (req, res) => {
  try {
    let config = await Config.findOne({ owner: req.user._id });
    if (!config) {
      config = await Config.create({ owner: req.user._id, businessName: 'Admission Portal', businessType: 'school', targetValue: 300 });
    }
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/config', auth, async (req, res) => {
  try {
    let config = await Config.findOne({ owner: req.user._id });
    if (!config) {
      config = new Config({ owner: req.user._id });
    }
    Object.assign(config, req.body);
    await config.save();
    res.json(config);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Leads Routes ────────────────────────────────────────────────────────────
app.get('/api/leads', auth, async (req, res) => {
  try {
    const leads = await Lead.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json(leads);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads', auth, async (req, res) => {
  try {
    const lead = new Lead({ 
      ...req.body, 
      date: req.body.date || new Date().toISOString().split('T')[0],
      owner: req.user._id 
    });
    await lead.save();
    res.status(201).json(lead);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/leads/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, req.body, { new: true });
    if (!lead) return res.status(404).json({ error: 'Not found' });
    res.json(lead);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/leads/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!lead) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Campaigns Routes ────────────────────────────────────────────────────────
app.get('/api/campaigns', auth, async (req, res) => {
  try {
    const camps = await Campaign.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json(camps);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns', auth, async (req, res) => {
  try {
    const camp = new Campaign({ ...req.body, owner: req.user._id });
    await camp.save();
    res.status(201).json(camp);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/campaigns/:id', auth, async (req, res) => {
  try {
    const camp = await Campaign.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, req.body, { new: true });
    if (!camp) return res.status(404).json({ error: 'Not found' });
    res.json(camp);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/campaigns/:id', auth, async (req, res) => {
  try {
    const camp = await Campaign.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!camp) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Tasks Routes ────────────────────────────────────────────────────────────
app.get('/api/tasks', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks', auth, async (req, res) => {
  try {
    const task = new Task({ ...req.body, owner: req.user._id });
    await task.save();
    res.status(201).json(task);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, req.body, { new: true });
    if (!task) return res.status(404).json({ error: 'Not found' });
    res.json(task);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!task) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Staff Routes ────────────────────────────────────────────────────────────
app.get('/api/staff', auth, async (req, res) => {
  try {
    const staff = await Staff.find({ owner: req.user._id }).sort({ conversions: -1 });
    res.json(staff);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/staff', auth, async (req, res) => {
  try {
    const member = new Staff({ ...req.body, owner: req.user._id });
    await member.save();
    res.status(201).json(member);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/staff/:id', auth, async (req, res) => {
  try {
    const member = await Staff.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, req.body, { new: true });
    if (!member) return res.status(404).json({ error: 'Not found' });
    res.json(member);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/staff/:id', auth, async (req, res) => {
  try {
    const member = await Staff.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!member) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Content Calendar Routes ──────────────────────────────────────────────────
app.get('/api/content', auth, async (req, res) => {
  try {
    const items = await Content.find({ owner: req.user._id }).sort({ date: 1 });
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/content', auth, async (req, res) => {
  try {
    const item = new Content({ ...req.body, owner: req.user._id });
    await item.save();
    res.status(201).json(item);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/content/:id', auth, async (req, res) => {
  try {
    const item = await Content.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/content/:id', auth, async (req, res) => {
  try {
    const item = await Content.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Summary Route ───────────────────────────────────────────────────────────
app.get('/api/summary', auth, async (req, res) => {
  try {
    const [leads, campaigns, tasks, config] = await Promise.all([
      Lead.find({ owner: req.user._id }),
      Campaign.find({ owner: req.user._id }),
      Task.find({ owner: req.user._id }),
      Config.findOne({ owner: req.user._id })
    ]);
    const enrolled = leads.filter(l => l.status === 'enrolled').length;
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalCampLeads = campaigns.reduce((s, c) => s + c.leads, 0);
    res.json({
      totalLeads: leads.length,
      enrolled,
      visits: leads.filter(l => ['visit-scheduled','registered','enrolled'].includes(l.status)).length,
      conversionRate: leads.length ? ((enrolled / leads.length) * 100).toFixed(1) : '0.0',
      totalSpend,
      totalCampLeads,
      pendingTasks: tasks.filter(t => !t.checked).length,
      config: config || {}
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Groq AI Insights Route ──────────────────────────────────────────────────
app.get('/api/ai-insights', auth, async (req, res) => {
  try {
    const [leads, config] = await Promise.all([
      Lead.find({ owner: req.user._id }),
      Config.findOne({ owner: req.user._id })
    ]);
    const enrolled = leads.filter(l => l.status === 'enrolled').length;
    const totalLeads = leads.length;
    const cfg = config || {};

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: `You are a top-tier business growth advisor for a ${cfg.businessType || 'business'} called "${cfg.businessName || 'this company'}". 
Analyse the pipeline data and provide 1-2 sentences of sharp, specific, actionable advice. Do not repeat the numbers back. Be direct and tactical.`
          },
          {
            role: 'user',
            content: `Total pipeline contacts: ${totalLeads}
Successfully converted/enrolled: ${enrolled}
Conversion rate: ${totalLeads ? ((enrolled/totalLeads)*100).toFixed(1) : 0}%
Target: ${cfg.targetValue || 'not set'}
NPS Score: ${cfg.npsScore || 0}`
          }
        ],
        max_tokens: 120,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const data = await response.json();
    res.json({ advice: data.choices[0].message.content.trim() });
  } catch (err) {
    const config = await Config.findOne({ owner: req.user._id }) || {};
    const leads = await Lead.find({ owner: req.user._id });
    const enrolled = leads.filter(l => l.status === 'enrolled').length;
    const rate = leads.length ? ((enrolled / leads.length) * 100).toFixed(1) : 0;
    res.json({
      advice: `Your current conversion rate is ${rate}%. Focus on moving contacts from the inquiry stage to meeting/visit-scheduled to improve pipeline velocity.`
    });
  }
});

// Standalone server boot (skipped in Serverless environments)
if (process.env.NODE_ENV !== 'production' && require.main === module) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;
