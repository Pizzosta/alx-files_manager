import sha1 from 'sha1';
// import { ObjectID } from 'mongodb';
import Queue from 'bull';
import dbClient from '../utils/db';
// import redisClient from '../utils/redis';

//const db = dbClient.client.db(); // Get the MongoDB database instance
const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');

class UsersController {
  static postNew(request, response) {
    console.log('DBKLIENT', dbClient);
    console.log('Database Name:', db.databaseName);

    const { email } = request.body;
    const { password } = request.body;

    if (!email) {
      response.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!password) {
      response.status(400).json({ error: 'Missing password' });
      return;
    }

    const users = dbClient.db.collection('users');
    users.findOne({ email }, (err, user) => {
      if (user) {
        response.status(400).json({ error: 'Already exist' });
      } else {
        const hashedPassword = sha1(password);
        users.insertOne(
          {
            email,
            password: hashedPassword,
          },
        ).then((result) => {
          response.status(201).json({ id: result.insertedId, email });
          userQueue.add({ userId: result.insertedId });
        }).catch((error) => console.log(error));
      }
    });
  }
}

module.exports = UsersController;
