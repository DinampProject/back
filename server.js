// server.js
import cluster from 'cluster';
import os from 'os';
import EventEmitter from 'events';
import dotenv from 'dotenv';

dotenv.config();

const MAX_WORKERS =
  process.env.NODE_ENV === 'development' ? 1 : os.cpus().length;
const bus = new EventEmitter();
let connectedWorkers = 0;

if (cluster.isPrimary) {
  for (let i = 0; i < MAX_WORKERS; i++) cluster.fork();

  cluster.on('exit', (worker, code) => {
    console.error(`⚠️  Worker ${worker.process.pid} died – respawning`);
    cluster.fork();
  });

  cluster.on('message', (_worker, msg) => {
    if (msg === 'ready') {
      connectedWorkers++;
      if (connectedWorkers === MAX_WORKERS)
        console.log('✅ All workers listening on PORT', process.env.PORT || 4000);
    }
  });
} else {
  import('./app.js')
    .then(({ default: app }) => {
      const PORT = process.env.PORT || 4000;
      app.listen(PORT, () => {
        console.log(`🚀 Worker ${process.pid} listening on ${PORT}`);
        process.send?.('ready');   // מודיע ל-primary שה-listen הצליח
      });
    })
    .catch(err => {
      console.error(`❌ Worker ${process.pid} failed:`, err.message);
      process.exit(1);
    });
}
