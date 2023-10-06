import sha1 from 'sha1';
import dbClient from '../utils/db';

const db = dbClient.client.db(); // Get the MongoDB database instance

class UsersController {
  static async postNew(req, res) {
    try {
      const { email, password } = req.body;

      // Check if email and password are provided
      if (!email) {
        return res.status(400).json({ error: 'Missing email' });
      }

      if (!password) {
        return res.status(400).json({ error: 'Missing password' });
      }

      // Check if the email already exists in the DB
      const existingUser = await db.collection('users').findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Already exists' });
      }

      // Hash the password using SHA1
      const hashedPassword = sha1(password);

      // Create a new user object
      const newUser = {
        email,
        password: hashedPassword,
      };

      // Insert the new user into the 'users' collection
      const result = await db.collection('users').insertOne(newUser);

      // Return the newly created user with minimal information
      const createdUser = {
        id: result.insertedId,
        email: newUser.email,
      };

      return res.status(201).json(createdUser);
    } catch (error) {
      console.error('Error in postNew:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = UsersController;
