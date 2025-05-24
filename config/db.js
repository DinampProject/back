import mongoose from 'mongoose';

const connectDB = () => {
  const connectWithRetry = () => {
    mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 9000, // Increase the timeout to 30 seconds
      })
      .then(() => {
        if (process.send) {
          process.send('connected');
        }
      })
      .catch((error) => {
        setTimeout(connectWithRetry, 5000); // Retry after 5 seconds
      });
  };

  connectWithRetry();

  // Optional: Handle initial connection errors
  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error.message);
  });
};

export default connectDB;
