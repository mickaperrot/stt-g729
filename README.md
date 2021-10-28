# Google Cloud Speech-to-Text on G.729 encoded files

Run the Google Cloud Speech-to-Text API over G.729 encoded wav files.

How this works:
1. Upload G.729 encoded wav files to a Google Cloud Storage bucket
2. A Pub/Sub notification is sent to the **converter** running in Cloud Run each time a file is uploaded to the bucket
3. The **converter** converts the G.729 file to PCM and stores the converted file into a Google Cloud Storage bucket
4. A Pub/Sub notification is sent to the **transcriptor** running in Cloud Run each time a file is uploaded to the bucket
5. The **transcriptor** runs the Speech-to-Text API and uploads the transcriptions to a Google Cloud Storage bucket in CSV format

## Enable the Speech-to-Text API

## Create a service account

## Create the Google Cloud Storage buckets

## Deploy the converter in Cloud Run

## Deploy the transcriptor in Cloud Run

## Create the Pub/Sub topic

## Create the Cloud Storage notifications
