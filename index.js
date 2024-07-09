/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const functions = require("firebase-functions");
const axios = require("axios");
const crypto = require("crypto");

// GitHub 사용자명과 Slack 사용자 ID 매핑
const githubToSlackMap = {
  JH8459: "<@U04V9CHPE2F>",
  aksel26: "<@U04UV0MHDFZ>",
  thsuekfk2: "<@U050K7691L0>",
};

const SLACK_WEBHOOK_URL =
  "https://hooks.slack.com/services/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";
const GITHUB_SECRET = "acghr2467!";
const TARGET_BRANCH = "prod";

// GitHub Webhook signature 검증 함수
function verifySignature(req) {
  const signature = `sha256=${crypto
    .createHmac("sha256", GITHUB_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex")}`;
  const githubSignature = req.headers["x-hub-signature-256"];
  return githubSignature === signature;
}

exports.githubWebhook = functions.https.onRequest((req, res) => {
  if (!verifySignature(req)) {
    console.error("Signature mismatch");
    return res.status(401).send("Unauthorized");
  }

  const payload = req.body;

  const pr = payload.pull_request;
  if (
    pr &&
    payload.action === "closed" &&
    pr.requested_reviewers.length >= 0 &&
    pr.base.ref === TARGET_BRANCH
  ) {
    const {
      html_url: prUrl,
      body: prBody,
      user: prUser,
      title: prTitle,
    } = payload.pull_request;
    const repoName = payload.pull_request.head.repo.name;

    function transformTextWithLink(text) {
      const linkPattern =
        /\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\((https?:\/\/[^\)]+)\)/g;
      return text.replace(linkPattern, "<$2|$1>");
    }

    const mentionUser = githubToSlackMap[pr.user.login];

    const message = {
      attachments: [
        {
          mrkdwn_in: ["text", "fields", "author_name"],
          color: "#36a64f",
          title: prTitle,
          title_link: prUrl,
          author_name: prUser.login,
          author_icon: prUser.avatar_url,
          footer: "ACG",
          fields: [
            {
              title: "반영내용",
              value: transformTextWithLink(prBody) || "특이사항 없음",
              short: false,
            },
            {
              title: "반영서버",
              value: repoName,
              short: true,
            },
            {
              title: "기한",
              value: "영업일 기준 다음날 새벽 4시 45분",
              short: true,
            },
            {
              title: "요청자",
              value: mentionUser,
              short: false,
            },
          ],
        },
      ],
    };
    axios
      .post(SLACK_WEBHOOK_URL, message)
      .then(() => {
        console.log("Slack notification sent successfully");
        res.status(200).send("OK");
      })
      .catch((error) => {
        console.error("Error sending Slack notification:", error);
        res.status(500).send("Error");
      });
  }
});
