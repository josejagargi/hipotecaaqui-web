# Deployment script for news-distill-service on Google Cloud Platform (Hipoteca Aqui)
$PROJECT_ID = "hipotecaaqui-501717"
$SERVICE_NAME = "news-distill-service"
$REGION = "europe-west1"
$REPO_NAME = "news-distill-repo"

Write-Host "Configuring GCP Project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Create Artifact Registry Repository if it doesn't exist
$repo_exists = gcloud artifacts repositories list --location=$REGION --filter="name:projects/$PROJECT_ID/locations/$REGION/repositories/$REPO_NAME" --format="value(name)"
if (-not $repo_exists) {
    Write-Host "Creating Artifact Registry Repository..."
    gcloud artifacts repositories create $REPO_NAME `
        --repository-format=docker `
        --location=$REGION `
        --description="Docker repository for news-distill-service"
}

# Function to create or update secret
function Set-Secret {
    param (
        [string]$Name,
        [string]$Value
    )
    $exists = gcloud secrets list --filter="name:$Name" --format="value(name)"
    if (-not $exists) {
        Write-Host "Creating secret $Name..."
        $Value | gcloud secrets create $Name --data-file=-
    } else {
        Write-Host "Secret $Name already exists, adding new version..."
        $Value | gcloud secrets versions add $Name --data-file=-
    }
}

# Secrets values
$CRM_BASE_ID = "appdpPB3CK0d5R2oI"
$CRM_TOKEN = "patapt61z0HwTUIDH.655a5a30d9af22ff222bfb5b53b427613dce343bff42e188665f34e8d5ff5171"
$GEMINI_API_KEY = "AIzaSyAKAPY8M0dqeXv9RkyVobrmSbQcA0E7Qvo"
$YOUTUBE_API_KEY = "AIzaSyC8xZlV6RSGf7Ci5l4HnzoiV7KLLAz6Cyk"

# Set secrets
Set-Secret -Name "NEWS_DISTILL_CRM_BASE_ID" -Value $CRM_BASE_ID
Set-Secret -Name "NEWS_DISTILL_CRM_TOKEN" -Value $CRM_TOKEN
Set-Secret -Name "NEWS_DISTILL_GEMINI_API_KEY" -Value $GEMINI_API_KEY
Set-Secret -Name "NEWS_DISTILL_YOUTUBE_API_KEY" -Value $YOUTUBE_API_KEY

# Get Project Number
Write-Host "Retrieving Project Number..."
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
Write-Host "Project Number is: $PROJECT_NUMBER"

# Grant Secret Manager access to Cloud Run default compute service account
$COMPUTE_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
Write-Host "Granting Secret Access to $COMPUTE_SA..."

gcloud secrets add-iam-policy-binding NEWS_DISTILL_CRM_BASE_ID `
    --member="serviceAccount:$COMPUTE_SA" `
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding NEWS_DISTILL_CRM_TOKEN `
    --member="serviceAccount:$COMPUTE_SA" `
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding NEWS_DISTILL_GEMINI_API_KEY `
    --member="serviceAccount:$COMPUTE_SA" `
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding NEWS_DISTILL_YOUTUBE_API_KEY `
    --member="serviceAccount:$COMPUTE_SA" `
    --role="roles/secretmanager.secretAccessor"

# Build and Deploy using safe string concatenation
$IMAGE_TAG = $REGION + "-docker.pkg.dev/" + $PROJECT_ID + "/" + $REPO_NAME + "/" + $SERVICE_NAME + ":latest"
Write-Host "Building and uploading container image to Artifact Registry ($IMAGE_TAG)..."
gcloud builds submit --tag $IMAGE_TAG

Write-Host "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_TAG `
    --platform managed `
    --region $REGION `
    --no-allow-unauthenticated `
    --update-secrets="CRM_BASE_ID=NEWS_DISTILL_CRM_BASE_ID:latest,CRM_TOKEN=NEWS_DISTILL_CRM_TOKEN:latest,GEMINI_API_KEY=NEWS_DISTILL_GEMINI_API_KEY:latest,YOUTUBE_API_KEY=NEWS_DISTILL_YOUTUBE_API_KEY:latest" `
    --timeout=1800


# Get Cloud Run Service URL
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format="value(status.url)"
Write-Host "Service URL is: $SERVICE_URL"

# Cloud Scheduler setup (Shortened SA name)
$SCHEDULER_SA = "sch-distill-invoker"
$exists_sa = gcloud iam service-accounts list --filter="email:$SCHEDULER_SA@$PROJECT_ID.iam.gserviceaccount.com" --format="value(email)"
if (-not $exists_sa) {
    Write-Host "Creating Scheduler service account..."
    gcloud iam service-accounts create $SCHEDULER_SA --display-name="Scheduler Invoker for News Distill"
}

Write-Host "Granting Run Invoker permission to Scheduler Service Account..."
gcloud run services add-iam-policy-binding $SERVICE_NAME `
    --member="serviceAccount:$SCHEDULER_SA@$PROJECT_ID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --region $REGION

$cron_exists = gcloud scheduler jobs list --location=$REGION --filter="ID:$SERVICE_NAME-cron" --format="value(ID)"
if ($cron_exists) {
    Write-Host "Scheduler job already exists, deleting first..."
    gcloud scheduler jobs delete "$SERVICE_NAME-cron" --location=$REGION --quiet
}

Write-Host "Creating Cloud Scheduler job to run daily at 05:00 AM..."
gcloud scheduler jobs create http "$SERVICE_NAME-cron" `
    --schedule="0 5 * * *" `
    --uri="${SERVICE_URL}/run-task" `
    --http-method=POST `
    --oidc-service-account-email="$SCHEDULER_SA@$PROJECT_ID.iam.gserviceaccount.com" `
    --time-zone="Europe/Madrid" `
    --location=$REGION `
    --attempt-deadline=30m

Write-Host "Deployment Completed Successfully!"
