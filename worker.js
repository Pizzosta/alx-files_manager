import fs from 'fs';
import path from 'path';
import Queue from 'bull';
import imageThumbnail from 'image-thumbnail';
import dbClient from './utils/db';

const db = dbClient.client.db(); // Get the MongoDB database instance
const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager'; // Define folderPath
const fileQueue = new Queue('fileQueue');

fileQueue.process('generateThumbnails', async (job) => {
  const { userId, fileId, localPath } = job.data;

  if (!fileId || !userId) {
    throw new Error('Missing fileId or userId');
  }

  const fileDocument = await db.collection('files').findOne({ _id: fileId, userId });

  if (!fileDocument) {
    throw new Error('File not found');
  }

  if (fileDocument.type !== 'image') {
    // This job is for generating thumbnails of images only
    return;
  }

  try {
    // Generate thumbnails with specified sizes
    const thumbnail500 = await imageThumbnail(localPath, { width: 500 });
    const thumbnail250 = await imageThumbnail(localPath, { width: 250 });
    const thumbnail100 = await imageThumbnail(localPath, { width: 100 });

    // Save thumbnails with appropriate names
    const thumbnailPath500 = path.join(folderPath, `${fileId}_500`);
    const thumbnailPath250 = path.join(folderPath, `${fileId}_250`);
    const thumbnailPath100 = path.join(folderPath, `${fileId}_100`);

    await fs.promises.writeFile(thumbnailPath500, thumbnail500);
    await fs.promises.writeFile(thumbnailPath250, thumbnail250);
    await fs.promises.writeFile(thumbnailPath100, thumbnail100);
  } catch (error) {
    console.error('Error generating thumbnails:', error);
  }
});

const userQueue = new Queue('userQueue');

userQueue.process('sendWelcomeEmail', async (job) => {
  const { userId } = job.data;

  if (!userId) {
    throw new Error('Missing userId');
  }

  // Retrieve the user based on the userId from the database
  const user = await db.collection('users').findOne({ _id: userId });

  if (!user) {
    throw new Error('User not found');
  }

  // In a real application, you would send a welcome email here
  console.log(`Welcome ${user.email}!`);
});
