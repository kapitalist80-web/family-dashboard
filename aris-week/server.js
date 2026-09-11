require('dotenv').config();

const path = require('path');
const express = require('express');
const configStore = require('./src/config');
const { createRouter } = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '0.0.0.0';

configStore.load();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', createRouter());

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Nicht gefunden' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    const child = configStore.get().child.name;
    console.log(`Stundenplan-Display fuer ${child} laeuft auf http://localhost:${PORT}`);
    console.log(`Einstellungen: http://localhost:${PORT}/settings`);
  });
}

module.exports = app;
