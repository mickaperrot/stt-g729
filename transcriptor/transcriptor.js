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

  const recognizeRequestArray = [
      {
          name: "default",
          request: {
            config: {
                languageCode: languageCode,
                model: 'default'
            },
            audio: audio
        }
      },
      {
        name: "phone",
        request: {
            config: {
                languageCode: languageCode,
                model: 'phone_call'
            },
            audio: audio
          }
      },
      {
        name: "phone enhanced",
        request: {
            config: {
                languageCode: languageCode,
                model: 'phone_call',
                useEnhanced: true
            },
            audio: audio
          }
      }
  ];

  // Detects speech in the audio file
let transcriptions = [];

    async function getTranscript(recognizeRequest) {
    let operation;        
        try {
            const longRunningRecognizeOperation = await client.longRunningRecognize(recognizeRequest.request);
            console.log(`Long running operation successfull for: ${recognizeRequest.name}`);
            operation = await longRunningRecognizeOperation[0].promise();
        }
        catch (err) {
            console.log(`Long running operation error for: ${recognizeRequest.name} error:${err}`);
            return Promise.resolve("");
        }

        try {
            const results = operation[0].results;
            // Do something
            const transcript = results
                .map(result => result.alternatives[0].transcript)
                .join('.');
            return Promise.resolve(transcript);
        }
        catch (err) {
            console.log(`Long running operation error for: ${recognizeRequest.name} error:${error}`);
            return Promise.resolve("");
        }
    }
  
  transcriptions = await Promise.all(recognizeRequestArray.map(recognizeRequest => getTranscript(recognizeRequest)));
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