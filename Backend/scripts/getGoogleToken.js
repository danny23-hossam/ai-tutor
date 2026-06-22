// Backend/scripts/getGoogleToken.js
// Run this ONE TIME to get your OAuth refresh token:
//   cd Backend
//   node scripts/getGoogleToken.js
//
// Then copy the REFRESH TOKEN printed at the end into your .env

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3333';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent', // force to always return a refresh token
});

console.log('\n✅ Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for Google to redirect back...\n');

// Start a temporary local server to catch the OAuth redirect
const server = http.createServer(async (req, res) => {
    const qs = new url.URL(req.url, REDIRECT_URI).searchParams;
    const code = qs.get('code');

    if (!code) {
        res.end('No code received. Try again.');
        return;
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        res.end('<h2>✅ Success! You can close this browser tab now.</h2>');
        server.close();

        console.log('\n🎉 Your REFRESH TOKEN (copy this into .env):\n');
        console.log('GOOGLE_OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('\n');
    } catch (err) {
        console.error('Error getting token:', err.message);
        res.end('Error: ' + err.message);
        server.close();
    }
});

server.listen(3333, () => {
    console.log('(Listening on http://localhost:3333 for Google callback)\n');
});
