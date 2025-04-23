import amqp from "amqplib";
import axios from "axios"; // added axios for API calls

const RABBITMQ_URL = "amqp://localhost";
const QUEUE_NAME = "demo_queue";

export async function publishMessage(message: { [key: string]: any }) {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(message)), { persistent: true });

    console.log(`✅ (1)Message sent: ${JSON.stringify(message)}`);

    setTimeout(() => {
      connection.close();
    }, 500);
  } catch (error) {
    console.error("❌ Error in publisher:", error);
  }
}

const COZY_MANAGER_URL = "https://manager-int.cozycloud.cc/api/public";
const COZY_MANAGER_TOKEN = "AwnV6AH1HaTNxvpQveqTDkgRrucJpydg";
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_RETRIES = 3;

export async function createCozyInstance(user: {
  id: string;
  email: string;
  name: string;
  _id: string;
}) {
  console.log(`🚀 Creating Cozy instance for ${user.email}...`);

  try {
    // Step 1: Create the instance
    const { data: createInstanceData } = await axios.post(
      `${COZY_MANAGER_URL}/instances`,
      {
        offer: "twake",
        slug: user.id,
        domain: "stg.lin-saas.com",
        email: user.email,
        public_name: user.name,
        locale: "fr",
        oidc: user.id,
      },
      {
        headers: {
          Authorization: `Bearer ${COZY_MANAGER_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    const workflowId = createInstanceData.workflow;
    console.log(`✅ Created instance for ${user.email}, workflow ID: ${workflowId}`);

    // Step 2: Check workflow status
    const checkWorkflowStatus = async () => {
      const { data } = await axios.get(`${COZY_MANAGER_URL}/workflows/${workflowId}`, {
        headers: {
          Authorization: `Bearer ${COZY_MANAGER_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      return data.status;
    };

    let attempt = 0;
    let finished = false;

    while (attempt < MAX_RETRIES && !finished) {
      attempt++;
      console.log(
        `🔄 Checking workflow status for ${user.email} (attempt ${attempt}/${MAX_RETRIES})...`,
      );

      const status = await checkWorkflowStatus();

      if (status === "finished") {
        console.log(`🎉 Workflow finished for ${user.email}`);
        finished = true;
      } else {
        console.log(
          `⏳ Workflow not finished yet for ${user.email}, waiting ${POLL_INTERVAL_MS / 1000}s...`,
        );
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }

    if (!finished) {
      console.warn(
        `⚠️ Workflow for ${user.email} did not finish after ${MAX_RETRIES} tries. Moving on.`,
      );
    }
  } catch (error: any) {
    if (error.response) {
      console.error(
        `❌ Error migrating ${user.email}:`,
        error.response.status,
        error.response.data,
      );
    } else {
      console.error(`❌ Error migrating ${user.email}:`, error.message);
    }
    throw error;
  }
}

export async function getDriveToken(slugDomain: string): Promise<{ token: string }> {
  const url = `${COZY_MANAGER_URL}/${slugDomain}/drive_token`;

  try {
    const response = await axios.post(url, null, {
      headers: {
        Authorization: `Bearer ${COZY_MANAGER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    return response.data; // Should be { token: "..." }
  } catch (error: any) {
    console.error(
      `Failed to get drive token for ${slugDomain}`,
      error.response?.data || error.message,
    );
    throw new Error(`Could not retrieve drive token for ${slugDomain}`);
  }
}
