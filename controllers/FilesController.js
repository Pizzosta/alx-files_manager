import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const db = dbClient.client.db(); // Get the MongoDB database instance
const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

// Ensure that the folderPath directory exists, or create it
if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

// Helper function to get userId from token
async function getUserIdFromToken(token) {
  try {
    // Implement this function to retrieve the userId based on the token from Redis
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    // Check if the userId is valid (e.g., not null or undefined)
    if (userId) {
      return userId;
    }
    return null; // Invalid token
  } catch (error) {
    console.error('Error in getUserIdFromToken:', error);
    return null; // Error occurred, consider it as an invalid token
  }
}

class FilesController {
  static async postUpload(req, res) {
    try {
      const { 'x-token': token } = req.headers;

      // Retrieve the user based on the token
      const userId = await getUserIdFromToken(token);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const {
        name, type, parentId, isPublic, data,
      } = req.body;

      // Validate request parameters
      if (!name) {
        return res.status(400).json({ error: 'Missing name' });
      }

      if (!type || !['folder', 'file', 'image'].includes(type)) {
        return res.status(400).json({ error: 'Missing or invalid type' });
      }

      if (type !== 'folder' && !data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      // Check if parentId is valid
      if (parentId !== undefined) {
        try {
          const parentObjectID = new ObjectID(parentId); // Convert parentId to ObjectID
          const parentFile = await db.collection('files').findOne({ _id: parentObjectID });

          if (!parentFile) {
            return res.status(400).json({ error: 'Parent not found' });
          }

          if (parentFile.type !== 'folder') {
            return res.status(400).json({ error: 'Parent is not a folder' });
          }
        } catch (error) {
          // Handle any errors when converting parentId to ObjectID
          return res.status(400).json({ error: 'Invalid parent ID format' });
        }
      }

      let localPath = null;

      // Handle file data (if type is not folder)
      if (type !== 'folder') {
        // Generate a unique filename using UUID
        const filename = uuidv4();
        localPath = path.join(folderPath, filename);

        // Decode and save the file content to localPath
        const decodedData = Buffer.from(data, 'base64');
        fs.writeFileSync(localPath, decodedData);
      }

      // Create a new file document in the collection 'files'
      const newFile = {
        userId,
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId || 0,
        localPath,
      };

      const result = await db.collection('files').insertOne(newFile);
      newFile._id = result.insertedId;

      return res.status(201).json(newFile);
    } catch (error) {
      console.error('Error in postUpload:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = FilesController;
