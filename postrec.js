#!/usr/bin/env node
/*
 * Copyright (c) 2018 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

/*
 * Craig: A multi-track voice channel recording bot for Discord.
 *
 * This is called at the end of every recording to perform any post-recording
 * steps. Most of the time, there are none.
 */

const fs = require("fs");
const cp = require("child_process");
const readline = require("readline");
const {google} = require("googleapis");

if (process.argv.length !== 6) process.exit(1);
const uid = process.argv[2];
const rid = process.argv[3];
const features = JSON.parse(process.argv[4]);
const info = JSON.parse(process.argv[5]);

// Currently, only Drive auto-upload is supported, so just quit if the feature isn't there
if (!features.drive) process.exit(0);

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const TOKEN_PATH = process.env.HOME + "/craig-drive/" + uid + "-credentials.json";

// Load client secrets
fs.readFile(process.env.HOME + "/craig-drive/client_secret.json", (err, content) => {
    if (err) return console.error("Error loading client secret file:", err);
    // Authorize a client with credentials, then call the Google Drive API.
    authorize(JSON.parse(content), findUploadDir);
});

// Load in the user authorization
function authorize(credentials, callback) {
    const {client_secret, client_id, redirect_uris} = credentials.web;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // If we haven't stored a token, oh well
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return;
        oAuth2Client.setCredentials(JSON.parse(token));
        if (oAuth2Client.isTokenExpiring()) {
            oAuth2Client.refreshToken().then((newToken) => {
                fs.writeFile(TOKEN_PATH, JSON.stringify(newToken), ()=>{});
                callback(oAuth2Client);
            }).catch(()=>{});
        } else {
            callback(oAuth2Client);
        }
    });
}

// Search for or create a Craig directory, then upload to it
function findUploadDir(auth) {
    const drive = google.drive({version: "v3", auth});
    drive.files.list({
        pageSize: 16,
        fields: "nextPageToken, files(id, name)",
    }, (err, data) => {
        if (err) return console.error("The API returned an error: " + err);
        data = data.data;
        const files = data.files;
        var craigDir = files.find((file) => {
            return (file.name.toLowerCase() === "craig");
        });
        if (craigDir) {
            upload(drive, craigDir);
        } else {
            drive.files.create({
                resource: {"name": "Craig", "mimeType": "application/vnd.google-apps.folder"},
                fields: "id"
            }, function (err, craigDir) {
                if (err) {
                    console.error("Failed to create Craig directory: " + err);
                } else {
                    upload(drive, craigDir.data);
                }
            });
        }
    });
}

// Upload the file
function upload(drive, craigDir) {
    // Start the cooker
    var cook = cp.spawn("./cook.sh", [rid], {
        stdio: ["ignore", "pipe", "ignore"]
    });
    drive.files.create({
        resource: {
            "name": info.startTime + "-" + info.channel.replace(/#.*/, "") + "-" + rid + ".zip",
            "parents": [craigDir.id]
        },
        media: {"mimeType": "application/zip", "body": cook.stdout}
    }, function (err, file) {
        if (err)
            console.error("Error upload: " + err);
    });
}
