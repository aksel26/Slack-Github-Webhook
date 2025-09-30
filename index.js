const functions = require("firebase-functions");

const axios = require("axios");
const dotenv = require("dotenv");
const crypto = require("crypto");

dotenv.config();

// GitHub
const GITHUB_SECRET = process.env.GITHUB_SECRET;
const TARGET_BRANCH = "prod";

//Slack
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const githubToSlackMap = {
  aksel26: "<@U04UV0MHDFZ>",
  thsuekfk2: "<@U050K7691L0>",
  snghyun331: "<@U06MGS5DF62>",
  shjeon97: "<@U094J13K22D>",
};

function verifySlackSignature(req) {
  const slackSignature = req.headers["x-slack-signature"];
  const requestBody = req.rawBody.toString();
  const timestamp = req.headers["x-slack-request-timestamp"];
  const sigBaseString = `v0:${timestamp}:${requestBody}`;
  const mySignature = `v0=${crypto.createHmac("sha256", SLACK_SIGNING_SECRET).update(sigBaseString).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(mySignature, "utf8"), Buffer.from(slackSignature, "utf8"));
}
// GitHub Webhook signature 검증 함수
function verifySignature(req) {
  const signature = `sha256=${crypto.createHmac("sha256", GITHUB_SECRET).update(JSON.stringify(req.body)).digest("hex")}`;
  const githubSignature = req.headers["x-hub-signature-256"];
  return githubSignature === signature;
}

// GitHub Webhook 핸들러
exports.githubWebhook = functions.https.onRequest(async (req, res) => {
  // if (!verifySignature(req)) {
  //   console.error("Signature mismatch");
  //   return res.status(401).send("Unauthorized");
  // }

  const payload = req.body;
  const pr = payload.pull_request;

  if (pr && payload.action === "closed" && pr.requested_reviewers.length >= 0 && (pr.base.ref === TARGET_BRANCH || pr.base.ref === "new-prod")) {
    const { html_url: prUrl, body: prBody, user: prUser, title: prTitle } = payload.pull_request;

    const repoName = payload.pull_request.head.repo.name;

    function transformTextWithLink(text) {
      if (text) {
        const linkPattern = /\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\((https?:\/\/[^\)]+)\)/g;
        return text.replace(linkPattern, "<$2|$1>");
      } else {
        return "작성된 내용이 없습니다.";
      }
    }

    const mentionUser = githubToSlackMap[pr.user.login];

    const message = {
      channel: "C0794RURMJ7",
      text: "배포 요청",
      callback_id: "deploy_request",
      blocks: [
        {
          type: "context",
          elements: [
            {
              type: "image",
              image_url: prUser.avatar_url,
              alt_text: "PR User Avatar",
            },
            {
              type: "mrkdwn",
              text: mentionUser,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*PR 제목:*\n<${prUrl}|${prTitle}>`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*반영내용:*\n${transformTextWithLink(prBody)}`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*반영서버:*\n${repoName}`,
            },
            {
              type: "mrkdwn",
              text: "*기한:*\n영업일 기준 다음날 새벽 4시 45분",
            },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "🚀 배포 예정",
                emoji: true,
              },
              value: "pending",
              action_id: "deploy_status",
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "ACG HR Tech",
            },
          ],
        },
        {
          type: "divider",
        },
      ],
    };

    try {
      // Slack으로 메시지 전송
      await axios.post(SLACK_WEBHOOK_URL, message);
      res.status(200).send("Notification sent to Slack successfully");
    } catch (error) {
      console.error("Error sending Slack notification:", error);
      res.status(500).send("Error sending notification to Slack");
    }
    // axios
    //   .post(SLACK_WEBHOOK_URL, message, {
    //     headers: {
    //       Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    //     },
    //   })
    //   .then(() => {
    //     console.log("Slack notification sent successfully");
    //     res.status(200).send("OK");
    //   })
    //   .catch((error) => {
    //     console.error("Error sending Slack notification:", error);
    //     res.status(500).send("Error");
    //   });
  } else {
    res.status(200).send("Not a PR closed event");
  }
});

exports.slackEvents = functions.https.onRequest(async (req, res) => {
  try {
    // if (!verifySlackSignature(req)) {
    //   console.error("Signature mismatch");
    //   return res.status(401).send("Unauthorized");
    // }

    const payload = JSON.parse(req.body.payload);
    const action = payload.actions[0];
    const userId = payload.user.id;
    const response_url = payload.response_url;

    const updateMessageBlocks = (originalBlocks) => {
      return originalBlocks.map((block) => {
        if (block.type === "actions") {
          return {
            ...block,
            elements: block.elements.map((element) => {
              if (element.action_id === "deploy_status") {
                return {
                  ...element,
                  type: "button",
                  action_id: "deploy_status",
                  text: {
                    type: "plain_text",
                    text: element.value === "pending" ? "✅ 배포완료" : "🚀 배포 예정",
                    emoji: true,
                  },
                  value: element.value === "pending" ? "completed" : "pending",
                };
              }
              return element;
            }),
          };
        }
        return block;
      });
    };

    const updatedBlocks = updateMessageBlocks(payload.message.blocks);

    // Immediate response to Slack to avoid 3-second timeout
    // res.status(200).send("Processing");

    // Update the message

    const updateResponse = await axios.post(
      response_url,
      {
        channel: payload.channel.id,
        ts: payload.message.ts,
        blocks: updatedBlocks,
        text: payload.message.text, // 기존 텍스트를 유지하기 위해 추가
      },
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Message Update Response:", updateResponse.data);

    res.status(200).send({
      response_type: "ephemeral",
      text: "배포 상태가 업데이트되었습니다.",
    });
  } catch (error) {
    console.error("Error handling interaction:", error);
    response.status(500).send("Error processing button click");
  }
});
