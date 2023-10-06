const { MongoClient } = require('mongodb');

class DBClient {
  constructor() {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || 27017;
    const dbName = process.env.DB_DATABASE || 'files_manager';
    const uri = `mongodb://${dbHost}:${dbPort}/${dbName}`;

    this.client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    this.isConnected = false;

    this.connect();
  }

  async connect() {
    try {
      await this.client.connect();
      this.isConnected = true;
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('Error connecting to MongoDB:', error);
    }
  }

  isAlive() {
    return this.isConnected;
  }

  async nbUsers() {
    const usersCollection = this.client.db().collection('users');
    const userCount = await usersCollection.countDocuments();
    return userCount;
  }

  async nbFiles() {
    const filesCollection = this.client.db().collection('files');
    const fileCount = await filesCollection.countDocuments();
    return fileCount;
  }
}

const dbClient = new DBClient();
module.exports = dbClient;
