import { openDb } from './db.js';
import { buildApp } from './app.js';

const db = openDb();
const app = buildApp(db);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
