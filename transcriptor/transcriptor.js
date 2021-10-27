const {promisify} = require('util');

const path = require('path');

const fs = require('fs');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET || "stt-g729-converted-audio";

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
  try{
    const [resultDefault, resultPhone, resultPhoneEnhanced] = await Promise.all([client.recognize(requestArray[0]), client.recognize(requestArray[1]), client.recognize(requestArray[2])]);
    transcriptions.push(resultDefault[0].results
      .map(result => result.alternatives[0].transcript)
      .join('.'));
      transcriptions.push(resultPhone[0].results
        .map(result => result.alternatives[0].transcript)
        .join('.'));
        transcriptions.push(resultPhoneEnhanced[0].results
        .map(result => result.alternatives[0].transcript)
        .join('.'));
    console.log(`Default Transcription: ${transcriptions[0]}\nPhone Transcription: ${transcriptions[1]}\nPhone Enhanced Transcription: ${transcriptions[2]}`);
  } catch (err) {
      throw new Error(`Error while transcripting: ${err}`);
  }

  const csvWriter = createCsvWriter({
    path: `${path.basename(object.name, '.wav')}.csv`,
    header: [
      {id: 'file', title: 'Audio file'},
      {id: 'default', title: 'Default model'},
      {id: 'phone', title: 'Phone call model'},
      {id: 'enhanced', title: 'Enhanced phone call model'}
    ]
  });

  const gcsPath = `gs://${DESTINATION_BUCKET}/${path.basename(object.name, '.wav')}.csv`;

  const data = [
    {
      file: gcsPath,
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
    await storage.bucket(DESTINATION_BUCKET).upload(`${path.basename(object.name, '.wav')}.csv`, {destination: `${object.name.slice(0, -4)}.csv`});
    console.log(`Uploaded CSV file to: ${gcsPath}`);
  } catch (err) {
    throw new Error(`Unable to upload CSV image to ${gcsPath}: ${err}`);
  }

  // Delete the temporary files.
  const unlink = promisify(fs.unlink);
  return unlink(`${path.basename(object.name, '.wav')}.csv`);
};