const functions = require("firebase-functions");
const { App, ExpressReceiver } = require("@slack/bolt");
const axios = require("axios");

const SLACK_BOT_TOKEN = functions.config().slack.bot_token;
const SLACK_SIGNING_SECRET = functions.config().slack.signing_secret;
// Slack App 초기화
const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
});
const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver,
});

// Firebase Functions로 ExpressReceiver의 router를 래핑합니다.
exports.slackEvents = functions.https.onRequest((req, res) => {
  receiver.router(req, res);
});

// GitHub Webhook 핸들러
exports.githubWebhook = functions.https.onRequest(async (req, res) => {
  const pr = req.body.pull_request;
  const message = {
    channel: "C0794RURMJ7",
    text: `New PR: ${pr.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New PR:* <${pr.html_url}|${pr.title}>\n${pr.body}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "예정",
            },
            action_id: "mark_complete",
          },
        ],
      },
    ],
  };

  try {
    await app.client.chat.postMessage(message);
    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending message to Slack");
  }
});

// Slack 액션 핸들러
app.action("mark_complete", async ({ body, ack, say }) => {
  await ack();

  try {
    await app.client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: body.message.text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: body.message.blocks[0].text.text,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "완료",
              },
              action_id: "mark_complete",
              style: "primary",
              disabled: true,
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error(error);
  }
});
