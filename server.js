import cluster from 'cluster';
import os from 'os';
import EventEmitter from 'events';
import dotenv from 'dotenv';

dotenv.config();


const MAX_WORKERS = process.env.NODE_ENV === 'development' ? 1 : os.cpus().length;
const eventEmitter = new EventEmitter();
let connectedWorkers = 0;

if (cluster.isPrimary) {
  // console.log(`Primary ${process.pid} is running`);

  for (let i = 0; i < MAX_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    // console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });

  cluster.on('message', (worker, message) => {
    if (message === 'connected') {
      connectedWorkers += 1;
      if (connectedWorkers === MAX_WORKERS) {
        console.log('All workers successfully connected to MongoDB');
      }
    }
  });
} else {
  import('./app.js')
    .then(({ default: app }) => {
      const PORT = process.env.PORT || 4000;
      // console.log port of worker primary
      console.log(`Worker ${process.pid} started on port ${PORT}`);
      app.listen(PORT);
    })
    .catch((err) => {
      console.error(`Worker ${process.pid} failed to start: ${err.message}`);
    });
}
