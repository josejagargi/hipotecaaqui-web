// sync-docs-to-drive.js
// Netlify Function to automatically sync Airtable contact attachments to Google Drive

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // CORS preflight response
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Configurations
  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  // Default to Javier's provided folder ID if env is not defined
  const GOOGLE_DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '1T05merbFCba86x3KGZ-jDrATSKtQopcw';

  if (!AIRTABLE_PAT || !BASE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Airtable configuration missing in environment variables.' })
    };
  }

  let contactId;
  try {
    const payload = JSON.parse(event.body || '{}');
    // Webhook could send contactId or recordId or c
    contactId = payload.contactId || payload.recordId || payload.c || payload.id;
    
    // Fallback: Airtable automation custom webhook might send data nested or as a query string parameter
    if (!contactId && event.queryStringParameters) {
      contactId = event.queryStringParameters.contactId || event.queryStringParameters.c;
    }
  } catch (err) {
    console.error('[ERROR] Failed to parse event body:', err);
  }

  if (!contactId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing contactId parameter in payload or query string.' })
    };
  }

  console.log(`[START] Sync process to Google Drive initiated for Contact: ${contactId}`);

  try {
    // ─── 1. FETCH CONTACT DATA FROM AIRTABLE ───────────────────────────────────
    const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/Contacts/${contactId}`;
    const contactRes = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      }
    });

    const contactData = await contactRes.json();
    if (!contactRes.ok) {
      console.error(`[ERROR] Failed to fetch contact ${contactId} from Airtable:`, contactData);
      return {
        statusCode: contactRes.status,
        headers,
        body: JSON.stringify({ error: contactData.error?.message || 'Error fetching contact from Airtable' })
      };
    }

    const fields = contactData.fields || {};
    const clientName = fields['Nombre y apellidos'] ? fields['Nombre y apellidos'].trim() : `Cliente_${contactId}`;
    
    // Check if Documentacion is indeed true/active
    const isDocChecked = !!fields['Documentacion'];
    console.log(`[DEBUG] Contact Name: "${clientName}", Documentacion Check: ${isDocChecked}`);

    // Map attachment fields
    const attachmentFields = {
      'NIF': fields['NIF'] || [],
      'Nominas': fields['Nominas'] || [],
      'Renta': fields['Renta'] || [],
      'Vida laboral': fields['Vida laboral'] || [],
      'Extractos bancarios': fields['Extractos bancarios'] || [],
      'Otros adjuntos': fields['Otros adjuntos'] || [],
      'Cuotas prestamos': fields['Cuotas prestamos'] || []
    };

    // Calculate total attachments to upload
    let totalFiles = 0;
    Object.keys(attachmentFields).forEach(key => {
      totalFiles += attachmentFields[key].length;
    });

    if (totalFiles === 0) {
      console.log(`[INFO] No files found to upload for contact: ${clientName}`);
      
      // Mark Drive checkbox as active even if no files
      await checkAirtableDriveStatus(airtableUrl, AIRTABLE_PAT);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'No attachments found to sync. Drive status updated.' })
      };
    }

    console.log(`[INFO] Found ${totalFiles} total files to sync for contact: ${clientName}`);

    // ─── 2. GENERATE GOOGLE ACCESS TOKEN ───────────────────────────────────────
    let googleAccessToken;
    try {
      googleAccessToken = await getGoogleAccessToken(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN);
    } catch (authError) {
      console.error('[ERROR] Google OAuth Authentication failed:', authError.message);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Google authentication failed', details: authError.message })
      };
    }

    // ─── 3. FIND OR CREATE CLIENT FOLDER IN DRIVE ──────────────────────────────
    const folderName = clientName;
    let clientFolderId;
    try {
      clientFolderId = await findClientFolder(folderName, GOOGLE_DRIVE_ROOT_FOLDER_ID, googleAccessToken);
      if (!clientFolderId) {
        console.log(`[INFO] Client folder "${folderName}" not found under root folder. Creating a new one...`);
        clientFolderId = await createClientFolder(folderName, GOOGLE_DRIVE_ROOT_FOLDER_ID, googleAccessToken);
        console.log(`[SUCCESS] Created new folder with ID: ${clientFolderId}`);
      } else {
        console.log(`[INFO] Found existing client folder with ID: ${clientFolderId}`);
      }
    } catch (folderError) {
      console.error('[ERROR] Drive folder lookup/creation failed:', folderError.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to manage Google Drive folders', details: folderError.message })
      };
    }

    // ─── 4. DOWNLOAD FROM AIRTABLE AND UPLOAD TO GOOGLE DRIVE ──────────────────
    const uploadResults = [];
    
    for (const [fieldName, files] of Object.entries(attachmentFields)) {
      for (const file of files) {
        const originalName = file.filename;
        // Prefix file name with field name to keep it structured! e.g., "NIF - documento.pdf"
        const finalFileName = `${fieldName} - ${originalName}`;
        const fileUrl = file.url;

        console.log(`[PROCESSING] File "${finalFileName}" from field "${fieldName}"`);

        try {
          // Check if file already exists in this folder to avoid duplicates
          const exists = await fileExistsInFolder(finalFileName, clientFolderId, googleAccessToken);
          if (exists) {
            console.log(`[SKIP] File "${finalFileName}" already exists in Google Drive folder.`);
            uploadResults.push({ filename: finalFileName, status: 'skipped', reason: 'Already exists' });
            continue;
          }

          // Upload file
          console.log(`[UPLOADING] Downloading "${originalName}" and uploading to Drive...`);
          await uploadFileToDrive(finalFileName, fileUrl, clientFolderId, googleAccessToken);
          console.log(`[SUCCESS] Uploaded "${finalFileName}" successfully.`);
          
          uploadResults.push({ filename: finalFileName, status: 'uploaded' });
        } catch (uploadErr) {
          console.error(`[ERROR] Failed to process file "${finalFileName}":`, uploadErr.message);
          uploadResults.push({ filename: finalFileName, status: 'failed', error: uploadErr.message });
        }
      }
    }

    // ─── 5. MARK DRIVE CHECKBOX IN AIRTABLE ────────────────────────────────────
    await checkAirtableDriveStatus(airtableUrl, AIRTABLE_PAT);
    console.log('[SUCCESS] Marked Drive checkbox in Airtable.');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Sync completed successfully',
        client: clientName,
        folderId: clientFolderId,
        results: uploadResults
      })
    };

  } catch (error) {
    console.error('[CRITICAL ERROR] Sync process failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
    };
  }
};

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

async function getGoogleAccessToken(clientId, clientSecret, refreshToken) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) are missing in environment variables.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to refresh token');
  }
  return data.access_token;
}

async function findClientFolder(folderName, parentId, accessToken) {
  const query = `name = '${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Folder search failed');
  }
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function createClientFolder(folderName, parentId, accessToken) {
  const url = 'https://www.googleapis.com/drive/v3/files';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Folder creation failed');
  }
  return data.id;
}

async function fileExistsInFolder(fileName, folderId, accessToken) {
  const query = `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'File check failed');
  }
  return data.files && data.files.length > 0;
}

async function uploadFileToDrive(fileName, fileUrl, folderId, accessToken) {
  // Download file from Airtable
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to fetch file content from URL: ${fileUrl}`);
  }
  
  const buffer = await fileRes.arrayBuffer();
  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';

  // Format Multipart upload request body
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const base64Data = Buffer.from(buffer).toString('base64');
  
  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${contentType}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data +
    closeDelimiter;

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(multipartRequestBody).toString()
    },
    body: multipartRequestBody
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Google Drive upload failed');
  }
  return data;
}

async function checkAirtableDriveStatus(airtableUrl, pat) {
  const res = await fetch(airtableUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        'Drive': true
      }
    })
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to update Drive checkbox in Airtable: ${data.error?.message || JSON.stringify(data)}`);
  }
  return data;
}
