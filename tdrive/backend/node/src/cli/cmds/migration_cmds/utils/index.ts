/* eslint-disable prettier/prettier */
import axios from "axios";
import config from "config";
import { Readable } from "stream";

export const COZY_DOMAIN = config.get<string>("migration.cozyDomain");
const COZY_MANAGER_URL = config.get<string>("migration.cozyManagerUrl");
const COZY_MANAGER_TOKEN = config.get<string>("migration.cozyManagerToken");
const POLL_INTERVAL_MS = config.get<number>("migration.pollInterval");
const MAX_RETRIES = config.get<number>("migration.maxRetries");

export function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", err => reject(err));
  });
}

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
        domain: COZY_DOMAIN,
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
  const url = `${COZY_MANAGER_URL}/instances/${slugDomain}/drive_token`;

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
      url,
    );
    throw new Error(`Could not retrieve drive token for ${slugDomain}`);
  }
}
