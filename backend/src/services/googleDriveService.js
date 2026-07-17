const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_DRIVE_FOLDER_ID = '1MK3Ij9MELNfHnp3MN4T07-UgdgUtDAQp';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

function normalizeDriveFolderId(value = DEFAULT_DRIVE_FOLDER_ID) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  const folderMatch = rawValue.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  const idMatch = rawValue.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  return rawValue;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getPrivateKey() {
  return (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || '')
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');
}

async function getServiceAccountAccessToken() {
  const clientEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || '').trim();
  const privateKey = getPrivateKey();
  if (!clientEmail || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: DRIVE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsignedJwt).sign(privateKey, 'base64');
  const jwt = `${unsignedJwt}.${signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google access token request failed.');
  }
  return payload.access_token;
}

function getOAuthConfig() {
  return {
    clientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    clientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
    redirectUri: (process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:5000/api/google-drive/oauth2callback').trim(),
  };
}

function buildOAuthConsentUrl() {
  const { clientId, redirectUri } = getOAuthConfig();
  if (!clientId) {
    const error = new Error('GOOGLE_OAUTH_CLIENT_ID is not configured.');
    error.status = 503;
    throw error;
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', DRIVE_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

async function exchangeOAuthCode(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    const error = new Error('Google OAuth client ID/secret are not configured.');
    error.status = 503;
    throw error;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const detail = [payload.error, payload.error_description].filter(Boolean).join(': ');
    throw new Error(detail || 'Google OAuth code exchange failed.');
  }
  return payload;
}

async function startDeviceAuthorization() {
  const { clientId } = getOAuthConfig();
  if (!clientId) {
    const error = new Error('GOOGLE_OAUTH_CLIENT_ID is not configured.');
    error.status = 503;
    throw error;
  }

  const response = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: DRIVE_SCOPE,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google device authorization failed.');
  }
  return payload;
}

async function exchangeDeviceCode(deviceCode) {
  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId) {
    const error = new Error('GOOGLE_OAUTH_CLIENT_ID is not configured.');
    error.status = 503;
    throw error;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || 'Google device token exchange failed.');
    error.googleError = payload.error;
    throw error;
  }
  return payload;
}

async function getOAuthAccessToken() {
  const refreshToken = (process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
  if (!refreshToken) return null;

  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    const error = new Error('Google OAuth client ID/secret are not configured.');
    error.status = 503;
    throw error;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const detail = [payload.error, payload.error_description].filter(Boolean).join(': ');
    throw new Error(detail || 'Google OAuth refresh failed.');
  }
  return payload.access_token;
}

function saveRefreshTokenToEnv(refreshToken) {
  const envPath = path.resolve(__dirname, '../../.env');
  const key = 'GOOGLE_DRIVE_REFRESH_TOKEN';
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  const nextLine = `${key}=${refreshToken}`;
  const index = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));

  if (index >= 0) lines[index] = nextLine;
  else lines.push(nextLine);

  fs.writeFileSync(envPath, `${lines.join('\n').replace(/\n+$/, '')}\n`);
  process.env.GOOGLE_DRIVE_REFRESH_TOKEN = refreshToken;
}

async function getAccessToken() {
  const { clientId, clientSecret } = getOAuthConfig();
  try {
    const oauthToken = await getOAuthAccessToken();
    if (oauthToken) return oauthToken;
  } catch (oauthError) {
    const error = new Error(`${oauthError.message} Re-authorize Google Drive at http://localhost:5000/api/google-drive/auth, then restart the backend.`);
    error.status = oauthError.status || 503;
    throw error;
  }

  if (clientId && clientSecret) {
    const error = new Error('Google Drive OAuth is configured but not authorized yet. Open http://localhost:5000/api/google-drive/auth, approve access, then restart the backend.');
    error.status = 503;
    throw error;
  }

  const directToken = (process.env.GOOGLE_DRIVE_ACCESS_TOKEN || '').trim();
  if (directToken) return directToken;

  return getServiceAccountAccessToken();
}

async function uploadFileToDrive({
  buffer,
  fileName,
  mimeType = 'application/octet-stream',
  folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID,
  fileId,
}) {
  const accessToken = await getAccessToken();
  const targetFolderId = normalizeDriveFolderId(folderId);
  if (!accessToken) {
    const error = new Error('Google Drive upload is not configured. Set GOOGLE_DRIVE_ACCESS_TOKEN or service account credentials.');
    error.status = 503;
    throw error;
  }

  let existingFileId = fileId || null;
  if (!existingFileId && targetFolderId) {
    const escapedName = fileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `name = '${escapedName}' and '${targetFolderId}' in parents and trashed = false`;
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('fields', 'files(id,name)');
    searchUrl.searchParams.set('supportsAllDrives', 'true');
    searchUrl.searchParams.set('includeItemsFromAllDrives', 'true');

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const searchPayload = await searchResponse.json();
    if (!searchResponse.ok) {
      throw new Error(searchPayload.error?.message || 'Google Drive file lookup failed.');
    }
    existingFileId = searchPayload.files?.[0]?.id || null;
  }

  const metadata = existingFileId
    ? { name: fileName, mimeType }
    : {
        name: fileName,
        mimeType,
        parents: targetFolderId ? [targetFolderId] : undefined,
      };
  const boundary = `drive-upload-${Date.now()}`;
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const multipartBody = Buffer.concat([
    Buffer.from(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`${delimiter}Content-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(closeDelimiter),
  ]);

  const uploadUrl = new URL(
    existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}`
      : 'https://www.googleapis.com/upload/drive/v3/files'
  );
  uploadUrl.searchParams.set('uploadType', 'multipart');
  uploadUrl.searchParams.set('supportsAllDrives', 'true');
  uploadUrl.searchParams.set('fields', 'id,name,webViewLink,webContentLink');

  const response = await fetch(uploadUrl, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(multipartBody.length),
    },
    body: multipartBody,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Google Drive upload failed.');
  }

  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${payload.id}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'anyone', role: 'reader' }),
    });
  } catch {
    // Public sharing is helpful, but the upload itself is the critical path.
  }

  return {
    id: payload.id,
    name: payload.name,
    webViewLink: payload.webViewLink,
    webContentLink: payload.webContentLink,
    folderId: targetFolderId,
  };
}

async function uploadZipToDrive({ buffer, fileName, folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID }) {
  return uploadFileToDrive({
    buffer,
    fileName,
    folderId,
    mimeType: 'application/zip',
  });
}

async function updateZipInDrive({
  buffer,
  fileName,
  fileId,
  folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID,
}) {
  return uploadFileToDrive({
    buffer,
    fileName,
    fileId,
    folderId,
    mimeType: 'application/zip',
  });
}

async function trashFiles(files, accessToken) {
  const trashed = [];
  for (const file of files) {
    const trashResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    if (!trashResponse.ok) {
      const payload = await trashResponse.json().catch(() => ({}));
      throw new Error(payload.error?.message || `Google Drive cleanup failed for ${file.name}.`);
    }
    trashed.push(file);
  }
  return trashed;
}

async function cleanupAudioCollectionFolder({
  keepFileIds = [],
  folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID,
}) {
  const accessToken = await getAccessToken();
  const targetFolderId = normalizeDriveFolderId(folderId);
  if (!accessToken || !targetFolderId) return [];

  const query = `'${targetFolderId}' in parents and trashed = false`;
  const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('fields', 'files(id,name,mimeType)');
  searchUrl.searchParams.set('supportsAllDrives', 'true');
  searchUrl.searchParams.set('includeItemsFromAllDrives', 'true');

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchPayload = await searchResponse.json();
  if (!searchResponse.ok) {
    throw new Error(searchPayload.error?.message || 'Google Drive cleanup lookup failed.');
  }

  const keepIds = new Set(keepFileIds.filter(Boolean));
  const filesToTrash = (searchPayload.files || []).filter((file) => {
    if (keepIds.has(file.id)) return false;
    return /\.wav$/i.test(file.name)
      || /\.zip$/i.test(file.name)
      || /^audio\//i.test(file.mimeType || '')
      || file.mimeType === 'application/zip';
  });

  return trashFiles(filesToTrash, accessToken);
}

async function getDriveStatus({ folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID } = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    const error = new Error('Google Drive is not configured.');
    error.status = 503;
    throw error;
  }

  const targetFolderId = normalizeDriveFolderId(folderId);
  const aboutUrl = new URL('https://www.googleapis.com/drive/v3/about');
  aboutUrl.searchParams.set('fields', 'user(emailAddress,displayName),storageQuota(limit,usage,usageInDrive,usageInDriveTrash)');

  const aboutResponse = await fetch(aboutUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const about = await aboutResponse.json();
  if (!aboutResponse.ok) {
    throw new Error(about.error?.message || 'Google Drive account lookup failed.');
  }

  let folder = null;
  if (targetFolderId) {
    const folderUrl = new URL(`https://www.googleapis.com/drive/v3/files/${targetFolderId}`);
    folderUrl.searchParams.set('fields', 'id,name,mimeType,driveId,owners(emailAddress,displayName),capabilities(canAddChildren,canEdit)');
    folderUrl.searchParams.set('supportsAllDrives', 'true');

    const folderResponse = await fetch(folderUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    folder = await folderResponse.json();
    if (!folderResponse.ok) {
      throw new Error(folder.error?.message || 'Google Drive folder lookup failed.');
    }
  }

  return {
    account: about.user,
    storageQuota: about.storageQuota,
    folder,
    folderId: targetFolderId,
  };
}

async function downloadFileFromDrive(fileId) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    const error = new Error('Google Drive download is not configured.');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || 'Google Drive download failed.');
  }

  return Buffer.from(await response.arrayBuffer());
}

module.exports = {
  DEFAULT_DRIVE_FOLDER_ID,
  buildOAuthConsentUrl,
  downloadFileFromDrive,
  exchangeOAuthCode,
  getDriveStatus,
  normalizeDriveFolderId,
  startDeviceAuthorization,
  exchangeDeviceCode,
  saveRefreshTokenToEnv,
  uploadFileToDrive,
  uploadZipToDrive,
  updateZipInDrive,
  cleanupAudioCollectionFolder,
};
