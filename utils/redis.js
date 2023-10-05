import { createClient } from 'redis';
import { promisify } from 'util';

// Create the RedisClient class
class RedisClient {
  constructor() {
    // Create a new Redis client
    this.client = redis.createClient();

    // Listen for any errors and display them in the console
    this.client.on('error', (err) => {
      console.log(`Redis client not connected to server: ${err}`);
    });
    this.connected = false;
    this.client.on('connect', () => {
      this.connected = true;
    });
  }

  // Check if the connection to Redis is alive
  isAlive() {
    return this.client.connected;
  }

  // Get a value from Redis
  async get(key) {
    const getAsync = promisify(this.client.get).bind(this.client);
    try {
      const value = await getAsync(key);
      return value;
    } catch (error) {
      console.error(`Error in Redis get operation: ${error.message}`);
      // Handle the error or return a default value if needed
      throw error; // Re-throw the error to propagate it
    }
  }

  // Set a value in Redis with an optional expiration in seconds
  async set(key, value, duration) {
    const setAsync = promisify(this.client.set).bind(this.client);
    try {
      await setAsync(key, value, 'EX', duration);
    } catch (error) {
      console.error(`Error in Redis set operation: ${error.message}`);
      // Handle the error if needed
      throw error; // Re-throw the error to propagate it
    }
  }

  // Delete a key and its value from Redis
  async del(key) {
    const delAsync = promisify(this.client.del).bind(this.client);
    try {
      await delAsync(key);
    } catch (error) {
      console.error(`Error in Redis del operation: ${error.message}`);
      // Handle the error if needed
      throw error; // Re-throw the error to propagate it
    }
  }
}

// Create and export an instance of RedisClient
const redisClient = new RedisClient();
module.exports = redisClient;
