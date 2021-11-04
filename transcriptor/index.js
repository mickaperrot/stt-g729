const path = require('path');

const express = require('express');
const app = express();
// This middleware is available in Express v4.16.0 onwards
app.use(express.json());

const transcriptor = require('./transcriptor');

app.post('/', async (req, res) => {
    if (!req.body) {
        const msg = 'no Pub/Sub message received';
        console.error(`error: ${msg}`);
        res.status(400).send(`Bad Request: ${msg}`);
        return;
      }
      if (!req.body.message || !req.body.message.data) {
        const msg = 'invalid Pub/Sub message format';
        console.error(`error: ${msg}`);
        res.status(400).send(`Bad Request: ${msg}`);
        return;
      }
    
      // Decode the Pub/Sub message.
      const pubSubMessage = req.body.message;  
      let data;
      try {
        data = Buffer.from(pubSubMessage.data, 'base64').toString().trim();
        data = JSON.parse(data);
      } catch (err) {
        const msg =
          'Invalid Pub/Sub message: data property is not valid base64 encoded JSON';
        console.error(`error: ${msg}: ${err}`);
        res.status(400).send(`Bad Request: ${msg}`);
        return;
      }
    
      // Validate the message is a Cloud Storage event.
      if (!data.name || !data.bucket) {
        const msg =
          'invalid Cloud Storage notification: expected name and bucket properties';
        console.error(`error: ${msg}`);
        res.status(400).send(`Bad Request: ${msg}`);
        return;
      }      
      // Validate this is a wav file.
      if (path.extname(data.name).toLowerCase() != ".wav") {
        const msg =
            'not a valid .wav file';
        console.error(`error: ${msg}: ${data.name}`);
        res.status(204).send(`Bad file format: ${msg}: ${data.name}`);
        return;
      }
      // Transcript the audio file
      try {
        console.log(`Trying to transcript: gs://${data.bucket}/${data.name}`);
        await transcriptor.syncRecognizeGCS(data);
        res.status(204).send();
      } catch (err) {
        console.error(`error: Transcripting audio: ${err}`);
        res.status(500).send();
      }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Transcriptor: listening on port ${port}`);
});