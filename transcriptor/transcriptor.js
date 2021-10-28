const {promisify} = require('util');

const path = require('path');

const fs = require('fs');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;

const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();

exports.syncRecognizeGCS = async (object) => {
  const gcsUri = `gs://${object.bucket}/${object.name}`;
  let languageCode;
  try{
    languageCode = object.name.split('/').slice(-2, -1)[0];
  } catch (err) {
    throw new Error(`No language code in path: ${err}`);
  }

  const audio = {
    uri: gcsUri
  };

  const requestArray = [
      {
          config: {
              languageCode: languageCode,
              model: 'default'
          },
          audio: audio
      },
      {
        config: {
            languageCode: languageCode,
            model: 'phone_call'
        },
        audio: audio
      },
      {
        config: {
            languageCode: languageCode,
            model: 'phone_call',
            useEnhanced: true
        },
        audio: audio
      }
  ];

  // Detects speech in the audio file
let transcriptions = []; 
const results = await Promise.allSettled([client.recognize(requestArray[0]), client.recognize(requestArray[1]), client.recognize(requestArray[2])]); 
results.forEach(result => {
    if(result.status == "fulfilled"){
        transcriptions.push(result.value[0].results
            .map(result => result.alternatives[0].transcript)
            .join('.'));
    }
    if(result.status == "rejected"){
        console.log(`Error while transcripting: ${result.reason}`);
        transcriptions.push(null);
    }
});

  const tmpFile = `/tmp/${path.basename(object.name, '.wav')}.csv`;

  const csvWriter = createCsvWriter({
    path: tmpFile,
    header: [
      {id: 'file', title: 'Audio file'},
      {id: 'default', title: 'Default model'},
      {id: 'phone', title: 'Phone call model'},
      {id: 'enhanced', title: 'Enhanced phone call model'}
    ]
  });

  const gcsPath = `gs://${DESTINATION_BUCKET}/${object.name.slice(0, -4)}.csv`;

  const data = [
    {
      file: gcsUri,
      default: transcriptions[0],
      phone: transcriptions[1],
      enhanced: transcriptions[2]
    }
  ];

  try{
    await csvWriter
        .writeRecords(data)
  } catch (err) {
      throw new Error(`Error while writing csv: ${err}`);
  }

  // Upload the CSV file into the bucket.
  try {
    await storage.bucket(DESTINATION_BUCKET).upload(tmpFile, {destination: `${object.name.slice(0, -4)}.csv`});
    console.log(`Uploaded CSV file to: ${gcsPath}`);
  } catch (err) {
    throw new Error(`Unable to upload CSV image to ${gcsPath}: ${err}`);
  }

  // Delete the temporary files.
  const unlink = promisify(fs.unlink);
  return unlink(tmpFile);
};