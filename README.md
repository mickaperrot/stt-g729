# Google Cloud Speech-to-Text on G.729 encoded files

Run the Google Cloud Speech-to-Text API over G.729 encoded wav files.

How this works:
1. Upload G.729 encoded wav files to a Google Cloud Storage bucket
2. A Pub/Sub notification is sent to the **converter** running in Cloud Run each time a file is uploaded to the bucket
3. The **converter** converts the G.729 file to PCM and stores the converted file into a Google Cloud Storage bucket
4. A Pub/Sub notification is sent to the **transcriptor** running in Cloud Run each time a file is uploaded to the bucket
5. The **transcriptor** runs the Speech-to-Text API and uploads the transcriptions to a Google Cloud Storage bucket in CSV format  
  
![diagram](img/diagram.png)
## Installation
### Enable the APIs
Enable the Speech-to-Text & Cloud Run APIs:
```
gcloud services enable speech.googleapis.com run.googleapis.com
```
### Create a service account
Create a service account replacing `my-service-account` with a name of your choice:
<pre>
gcloud iam service-accounts create <b>my-service-account</b>
</pre>
Export the service account email to the SERVICE_ACCOUNT_EMAIL environment variable to be reused in subsequent commands replacing `my-service-account` by the name of the service account you set in the precedent step:
<pre>
SERVICE_ACCOUNT_EMAIL=$(gcloud iam service-accounts list --filter="email ~ ^<b>my-service-account</b>" --format='value(email)')
</pre>
### Create the Google Cloud Storage buckets
Set your default region replacing `europe-west1` by the region of your choice and stores the value in the REGION environment variable for use in subsequent commands:
<pre>
REGION=<b>europe-west1</b>
</pre>
Create a bucket for storing original audio files replacing `EUROPE-WEST1` with the region of your choice and `bucket-for-original-audio-files` with a globally unique name:
<pre>
gsutil mb -l $REGION gs://<b>bucket-for-original-audio-files</b>
</pre>
If successful save the bucket name to the ORIGINAL_BUCKET environment variable to be usedin subsequent commands replacing `bucket-for-original-audio-files` by the name given in the previous step, if not retry the previous step with a different name:
<pre>
ORIGINAL_BUCKET=<b>bucket-for-original-audio-files</b>
</pre><br />
Create a bucket for storing converted audio files replacing `EUROPE-WEST1` with the region of your choice and `bucket-for-converted-audio-files` with a globally unique name:
<pre>
gsutil mb -l $REGION gs://<b>bucket-for-converted-audio-files</b>
</pre>
If successful save the bucket name to the CONVERTED_BUCKET environment variable to be used in subsequent commands replacing `bucket-for-converted-audio-files` by the name given in the previous step, if not retry the previous step with a different name:
<pre>
CONVERTED_BUCKET=<b>bucket-for-converted-audio-files</b>
</pre><br />
Create a bucket for storing audio transcription files replacing `EUROPE-WEST1` with the region of your choice and `bucket-for-transcriptions` with a globally unique name:
<pre>
gsutil mb -l $REGION gs://<b>bucket-for-transcriptions</b>
</pre>
If successful save the bucket name to the TRANSCRIPTION_BUCKET environment variable to be used in subsequent commands replacing `bucket-for-transcriptions` by the name given in the previous step, if not retry the previous step with a different name:
<pre>
TRANSCRIPTION_BUCKET=<b>bucket-for-transcriptions</b>
</pre><br />
Grant the service account permission to write to the buckets:
```
gsutil iam ch serviceAccount:$SERVICE_ACCOUNT_EMAIL:roles/storage.objectAdmin gs://$ORIGINAL_BUCKET
gsutil iam ch serviceAccount:$SERVICE_ACCOUNT_EMAIL:roles/storage.objectAdmin gs://$CONVERTED_BUCKET
gsutil iam ch serviceAccount:$SERVICE_ACCOUNT_EMAIL:roles/storage.objectAdmin gs://$TRANSCRIPTION_BUCKET
```
### Deploy the converter in Cloud Run
Deploy the converter image to Cloud Run:
```
gcloud run deploy converter \
   --image=europe-west1-docker.pkg.dev/mickael-public-share/stt-g729/converter \
   --service-account=$SERVICE_ACCOUNT_EMAIL \
   --set-env-vars=DESTINATION_BUCKET=$CONVERTED_BUCKET \
   --region=$REGION \
   --no-allow-unauthenticated
```
Grant the service account access to the Cloud Run deployment:
```
gcloud run services add-iam-policy-binding converter \
   --region=$REGION \
   --member=serviceAccount:$SERVICE_ACCOUNT_EMAIL \
   --role=roles/run.invoker
```
Save the URL endpoint to the CONVERTER_URL environement variable for use in subsequent commands:
```
CONVERTER_URL=$(gcloud run services describe converter --platform managed --region $REGION --format 'value(status.url)')
```
### Deploy the transcriptor in Cloud Run
Deploy the transcriptor image to Cloud Run:
```
gcloud run deploy transcriptor \
   --image=europe-west1-docker.pkg.dev/mickael-public-share/stt-g729/transcriptor \
   --service-account=$SERVICE_ACCOUNT_EMAIL \
   --set-env-vars=DESTINATION_BUCKET=$TRANSCRIPTION_BUCKET \
   --region=$REGION \
   --no-allow-unauthenticated
```
Grant the service account access to the Cloud Run deployment:
```
gcloud run services add-iam-policy-binding transcriptor \
   --region=$REGION \
   --member=serviceAccount:$SERVICE_ACCOUNT_EMAIL \
   --role=roles/run.invoker
```
Save the URL endpoint to the TRANSCRIPTOR_URL environement variable for use in subsequent commands:
```
TRANSCRIPTOR_URL=$(gcloud run services describe transcriptor --platform managed --region $REGION --format 'value(status.url)')
```
### Create the Pub/Sub topic for original audio files
Create the Pub/Sub topic:
```
gcloud pubsub topics create original-files-topic
```
Create the Pub/Sub subscription:
```
gcloud pubsub subscriptions create original-files-subscription --topic original-files-topic \
   --push-endpoint=$CONVERTER_URL \
   --push-auth-service-account=$SERVICE_ACCOUNT_EMAIL \
   --ack-deadline=300 \
   --min-retry-delay=10s \
   --max-retry-delay=10m
```
Enable Google Cloud Storage notifications:
```
gsutil notification create -t original-files-topic -f json -e OBJECT_FINALIZE gs://$ORIGINAL_BUCKET
```
### Create the Pub/Sub topic for converted audio files
Create the Pub/Sub topic:
```
gcloud pubsub topics create converted-files-topic
```
Create the Pub/Sub subscription:
```
gcloud pubsub subscriptions create converted-files-subscription --topic converted-files-topic \
   --push-endpoint=$TRANSCRIPTOR_URL \
   --push-auth-service-account=$SERVICE_ACCOUNT_EMAIL \
   --ack-deadline=300 \
   --min-retry-delay=10s \
   --max-retry-delay=10m
```
Enable Google Cloud Storage notifications:
```
gsutil notification create -t converted-files-topic -f json -e OBJECT_FINALIZE gs://$CONVERTED_BUCKET
```
## Usage
From the Cloud Storage page go to the bucket created for original audio files:  
  
![bucket_list](/img/bucket_list.png)  
  
Create a folder for storing the audio files:  
  
![create_folder](/img/create_folder.png)  
  
Name the folder using the BCP-47 code of the source language making sure it is available in the [supported languages](https://cloud.google.com/speech-to-text/docs/languages) for Cloud Speech-to-Text:  
  
![folder_name](/img/folder_name.png)  
  
Navigate inside the folder:  
  
![folder_view](/img/folder_view.png) 
 
Upload the audio files to be transcripted:  
  
![files_upload](/img/files_upload.png) 
  
The converted audio file will be available in the bucket for converted files shortly after the upload:  
  
![converter](/img/converted.png)  
  
The transcription file will be available in the bucket for transcription files shortly after the upload:  
  
![transcription](/img/transcription.png) 
  
