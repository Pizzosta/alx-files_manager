import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ObjectID } from 'mongodb';
import mime from 'mime-types';
import Queue from 'bull';
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
    // User not found, return an error
    throw new Error('User not found');
  } catch (error) {
    console.error('Error in getUserIdFromToken:', error);
    // Handle any errors that occur during token retrieval
    throw new Error('Token retrieval error');
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
          const parentFile = await db.collection('files').findOne({ _id: parentObjectID, userId });

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

        // Start background processing to generate thumbnails
        const fileQueue = new Queue('fileQueue');
        await fileQueue.add('generateThumbnails', { userId, fileId: filename, localPath });
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

  static async getShow(req, res) {
    try {
      const { 'x-token': token } = req.headers;
      const { id } = req.params;

      // Retrieve the user based on the token
      const userId = await getUserIdFromToken(token);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Convert the ID string to an ObjectId
      const fileId = new ObjectID(id);

      // Retrieve the file document based on ID and user
      const file = await db.collection('files').findOne({ _id: fileId, userId });

      // If no file is found, return a 404 error
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // If the file type is 'folder' query the database for files inside this folder
      if (file.type === 'folder') {
        const folderContents = await db.collection('files').find({ parentId: fileId, userId }).toArray();
        return res.json(folderContents);
      }

      // If the file type is not 'folder', return the file data
      return res.json(file);
    } catch (error) {
      console.error('Error in getShow:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // New endpoint to retrieve user file documents with pagination
  static async getIndex(req, res) {
    try {
      const { 'x-token': token } = req.headers;
      const { parentId, page } = req.query;

      // Retrieve the user based on the token
      const userId = await getUserIdFromToken(token);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Set default values for parentId and page if not provided
      const parentObjectId = parentId ? new ObjectID(parentId) : 0;
      const pageNumber = page ? parseInt(page, 10) : 0;
      const pageSize = 20;

      // Use MongoDB aggregation to implement pagination
      const pipeline = [
        { $match: { userId, parentId: parentObjectId } },
        { $skip: pageNumber * pageSize },
        { $limit: pageSize },
      ];

      const files = await db.collection('files').aggregate(pipeline).toArray();

      return res.json(files);
    } catch (error) {
      console.error('Error in getIndex:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putPublish(req, res) {
    try {
      const { 'x-token': token } = req.headers;
      const { id } = req.params;

      // Retrieve the user based on the token
      const userId = await getUserIdFromToken(token);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Convert the ID string to an ObjectId
      const fileId = new ObjectID(id);

      // Retrieve the file document based on ID and user
      const file = await db.collection('files').findOne({ _id: fileId, userId });

      // If no file is found, return a 404 error
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Check if the file is already published
      if (file.isPublic) {
        return res.status(400).json({ error: 'File is already published' });
      }

      // Update the value of isPublic to true
      await db.collection('files').updateOne({ _id: fileId }, { $set: { isPublic: true } });

      // Retrieve the updated file document
      const updatedFile = await db.collection('files').findOne({ _id: fileId });

      // Return the updated file document with a status code 200
      return res.status(200).json(updatedFile);
    } catch (error) {
      console.error('Error in putPublish:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putUnpublish(req, res) {
    try {
      const { 'x-token': token } = req.headers;
      const { id } = req.params;

      // Retrieve the user based on the token
      const userId = await getUserIdFromToken(token);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Convert the ID string to an ObjectId
      const fileId = new ObjectID(id);

      // Retrieve the file document based on ID and user
      const file = await db.collection('files').findOne({ _id: fileId, userId });

      // If no file is found, return a 404 error
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Check if the file is already unpublished
      if (!file.isPublic) {
        return res.status(400).json({ error: 'File is already unpublished' });
      }

      // Update the value of isPublic to false
      await db.collection('files').updateOne({ _id: fileId }, { $set: { isPublic: false } });

      // Retrieve the updated file document
      const updatedFile = await db.collection('files').findOne({ _id: fileId });

      // Return the updated file document with a status code 200
      return res.status(200).json(updatedFile);
    } catch (error) {
      console.error('Error in putUnpublish:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getFile(request, response) {
    try {
      const { id } = request.params;
      const { size } = request.query;
      const files = db.collection('files');
      const idObject = new ObjectID(id);

      // Retrieve the file document based on ID
      const file = await files.findOne({ _id: idObject });

      if (!file) {
        return response.status(404).json({ error: 'Not found' });
      }

      // Check if the file is public or if the user is the owner
      const userId = await FilesController.getUserIdFromToken(request.headers['x-token']);
      if (!file.isPublic && (!userId || userId !== file.userId.toString())) {
        return response.status(404).json({ error: 'Not found' });
      }

      // Check if the type of the file is a folder
      if (file.type === 'folder') {
        return response.status(400).json({ error: "A folder doesn't have content" });
      }

      // Determine the file name and size (if specified)
      let fileName = file.localPath;

      if (size) {
        fileName = `${file.localPath}_${size}`;
      }

      // Check if the file exists
      if (!fs.existsSync(fileName)) {
        return response.status(404).json({ error: 'Not found' });
      }

      // Set the appropriate content type based on the file type
      const contentType = mime.contentType(file.name) || 'application/octet-stream';

      // Stream the file to the response
      const fileStream = fs.createReadStream(fileName);
      fileStream.on('open', () => {
        response.set('Content-Type', contentType);
        fileStream.pipe(response);
      });

      fileStream.on('error', (error) => {
        console.error('Error streaming file:', error);
        return response.status(500).json({ error: 'Internal Server Error' });
      });
    } catch (error) {
      console.error('Error in getFile:', error);
      return response.status(500).json({ error: 'Internal Server Error' });
    }
    return null;
  }
}

module.exports = FilesController;
