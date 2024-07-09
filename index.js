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
const SLACK_BOT_TOKEN = functions.config().slack.bot_token;
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

exports.githubWebhook = functions.https.onRequest(async (req, res) => {
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
          fallback: "배포 상태변경을 실패했습니다.",
          callback_id: `deploy_status_${pr.id}`,
          actions: [
            {
              name: "deploy_status",
              text: "예정",
              type: "button",
              value: "scheduled",
            },
          ],
        },
      ],
    };
    try {
      const response = await axios.post(SLACK_WEBHOOK_URL, message);
      console.log("Slack webhook response:", response.data);
    } catch (error) {
      console.error(
        "Error posting to Slack webhook:",
        error.response ? error.response.data : error.message
      );
    }
  }
  res.status(200).send("OK");
});

// Slack interactive message handler
exports.slackAction = functions.https.onRequest(async (req, res) => {
  console.log(
    "🚀 ~ exports.slackAction=functions.https.onRequest ~ req:",
    req.body
  );
  const payload = JSON.parse(req.body.payload);
  const action = payload.actions[0];
  const originalMessage = payload.original_message;
  const deployStatus = action.value === "scheduled" ? "완료" : "예정";

  const updatedAttachments = originalMessage.attachments.map((attachment) => ({
    ...attachment,
    actions: attachment.actions.map((act) => ({
      ...act,
      text: deployStatus,
      value: deployStatus === "예정" ? "scheduled" : "completed",
    })),
  }));

  const updatePayload = {
    channel: payload.channel.id,
    ts: payload.message_ts,
    attachments: updatedAttachments,
  };

  try {
    const response = await axios.post(
      "https://slack.com/api/chat.update",
      updatePayload,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        },
      }
    );
    console.log("Slack chat.update response:", response.data);
  } catch (error) {
    console.error(
      "Error updating Slack message:",
      error.response ? error.response.data : error.message
    );
  }

  res.status(200).send();
});
