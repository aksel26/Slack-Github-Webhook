const functions = require("firebase-functions");
const crypto = require("crypto");
const { WebClient } = require("@slack/web-api");
const { App, ExpressReceiver } = require("@slack/bolt");

const SLACK_BOT_TOKEN = functions.config().slack.bot_token;
const SLACK_SIGNING_SECRET = functions.config().slack.signing_secret;
const GITHUB_SECRET = "acghr2467!";
const TARGET_BRANCH = "prod";

// ExpressReceiver 초기화
const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
});

const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver,
});

const web = new WebClient(SLACK_BOT_TOKEN);

const githubToSlackMap = {
  JH8459: "<@U04V9CHPE2F>",
  aksel26: "<@U04UV0MHDFZ>",
  thsuekfk2: "<@U050K7691L0>",
};

// GitHub Webhook signature 검증 함수
function verifySignature(req) {
  const signature = `sha256=${crypto
    .createHmac("sha256", GITHUB_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex")}`;
  const githubSignature = req.headers["x-hub-signature-256"];
  return githubSignature === signature;
}

// GitHub Webhook 함수
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
      const result = await web.chat.postMessage(message);
      console.log("Message sent:", result.ts);
      res.status(200).send("Slack message sent successfully");
    } catch (error) {
      console.error("Error sending message to Slack:", error);
      res.status(500).send("Error sending message to Slack");
    }
  } else {
    res.status(200).send("OK");
  }
});

// Slack 액션 핸들러
app.action("deploy_status", async ({ action, ack, say, body, logger }) => {
  await ack();
  logger.info("Button clicked", {
    user: body.user.id,
    action: action.action_id,
    value: action.value,
  });

  const newText = action.value === "pending" ? "✅ 배포 완료" : "🚀 배포 예정";
  const newState = action.value === "pending" ? "completed" : "pending";

  try {
    await web.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: body.message.blocks.map((block) => {
        if (block.type === "actions") {
          block.elements = block.elements.map((element) => {
            if (element.action_id === action.action_id) {
              return {
                ...element,
                text: {
                  ...element.text,
                  text: newText,
                },
                value: newState,
              };
            }
            return element;
          });
        }
        return block;
      }),
    });
  } catch (error) {
    console.error("Error updating message:", error);
  }
});

// Slack 이벤트 핸들러
exports.slackEvents = functions.https.onRequest((req, res) => {
  console.log("Received Slack event");
  receiver.app(req, res);
});
