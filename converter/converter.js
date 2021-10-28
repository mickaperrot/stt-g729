const path = require('path');
const fs = require('fs');
const {promisify} = require('util');

const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;

const ffmpeg = require('fluent-ffmpeg');

exports.convert = async (object) => {
    const file = storage.bucket(object.bucket).file(object.name);
    const tempOriginalLocalPath = `/tmp/${path.parse(file.name).base}`;
    const tempConvertedLocalPath = `/tmp/converted-${path.parse(file.name).base}`;

    // Download file from bucket.
    try {
        await file.download({destination: tempOriginalLocalPath});
        console.log(`Downloaded ${file.name} to ${tempOriginalLocalPath}.`);
      } catch (err) {
        throw new Error(`File download failed: ${err}`);
      }

      // Convert audio file to PCM
      try {
        await new Promise((resolve, reject) => {
            ffmpeg(tempOriginalLocalPath)
            // setup event handlers
            .on('end', function() {
              console.log(`${tempOriginalLocalPath} has been converted succesfully`);
              resolve();
            })
            .on('error', function(err) {
              console.log(`An error happened: ${err.message}`);
              reject();
            })
            // save to file
            .save(tempConvertedLocalPath);
          });
      } catch (err) {
        throw new Error(`File conversion failed: ${err}`);
      }
    
      // Upload the Blurred image back into the bucket.
      const gcsPath = `gs://${DESTINATION_BUCKET}/${file.name}`;
      try {
        await storage.bucket(DESTINATION_BUCKET).upload(tempConvertedLocalPath, {destination: file.name});
        console.log(`Uploaded converted file to: ${gcsPath}`);
      } catch (err) {
        throw new Error(`Unable to upload blurred image to ${gcsPath}: ${err}`);
      }
    
      // Delete the temporary files.
      const unlink = promisify(fs.unlink);
      unlink(tempOriginalLocalPath);
      unlink(tempConvertedLocalPath);
      return;
};