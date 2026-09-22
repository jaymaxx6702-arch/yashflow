import { createSign } from "node:crypto";

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): FirebaseServiceAccount | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<FirebaseServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error("Firebase service account JSON is incomplete.");
    }

    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
      token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `FIREBASE_SERVICE_ACCOUNT_JSON invalid: ${error.message}`
        : "FIREBASE_SERVICE_ACCOUNT_JSON invalid."
    );
  }
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(account: FirebaseServiceAccount) {
  const nowMs = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > nowMs + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(nowMs / 1000);
  const header = base64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );
  const payload = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: account.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64Url(signer.sign(account.private_key));
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error_description?: string }
    | null;

  if (!response.ok || !json?.access_token) {
    throw new Error(
      json?.error_description ||
        `Firebase OAuth failed with HTTP ${response.status}.`
    );
  }

  cachedAccessToken = {
    token: json.access_token,
    expiresAt: nowMs + Number(json.expires_in || 3600) * 1000,
  };

  return cachedAccessToken.token;
}

export class FcmError extends Error {
  status: number;
  responseText: string;

  constructor(message: string, status: number, responseText: string) {
    super(message);
    this.name = "FcmError";
    this.status = status;
    this.responseText = responseText;
  }
}

export async function sendNativeFcm(options: {
  token: string;
  title: string;
  body: string;
  notificationId: string;
  relatedType?: string | null;
  relatedId?: string | null;
}) {
  const account = getServiceAccount();
  if (!account) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  }

  const accessToken = await getAccessToken(account);

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      account.project_id
    )}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: options.token,
          notification: {
            title: options.title || "YashFlow",
            body: options.body || "New notification",
          },
          data: {
            notification_id: options.notificationId,
            related_type: options.relatedType || "",
            related_id: options.relatedId || "",
          },
          android: {
            priority: "high",
            notification: {
              channel_id: "yashflow_alerts",
              sound: "yashflow_notification",
              default_vibrate_timings: true,
            },
          },
        },
      }),
      cache: "no-store",
    }
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new FcmError(
      `FCM HTTP ${response.status}: ${responseText.slice(0, 500)}`,
      response.status,
      responseText
    );
  }

  return true;
}
