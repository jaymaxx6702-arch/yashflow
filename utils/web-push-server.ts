import {
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  type JsonWebKey,
} from "node:crypto";

type SupabaseLike = {
  from: (table: string) => any;
};

export type PushSettings = {
  id: number;
  public_key: string;
  private_jwk: JsonWebKey;
  vapid_subject: string;
  process_url: string | null;
  process_token: string;
  cron_enabled: boolean;
};

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function publicKeyFromJwk(jwk: JsonWebKey) {
  if (!jwk.x || !jwk.y) {
    throw new Error("VAPID public JWK is incomplete.");
  }

  return Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
}

export async function ensurePushSettings(
  db: SupabaseLike
): Promise<PushSettings> {
  const { data: existing, error: loadError } = await db
    .from("push_settings")
    .select(
      "id, public_key, private_jwk, vapid_subject, process_url, process_token, cron_enabled"
    )
    .eq("id", 1)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);

  if (existing?.public_key && existing?.private_jwk) {
    return existing as PushSettings;
  }

  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  const privateJwk = privateKey.export({ format: "jwk" }) as JsonWebKey;
  const publicKeyBase64Url = publicKeyFromJwk(publicJwk);

  const payload = {
    id: 1,
    public_key: publicKeyBase64Url,
    private_jwk: privateJwk,
    vapid_subject:
      existing?.vapid_subject || "mailto:admin@yashlaser.in",
    process_url: existing?.process_url || null,
    process_token: existing?.process_token || randomUUID(),
    cron_enabled: Boolean(existing?.cron_enabled),
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error: saveError } = await db
    .from("push_settings")
    .upsert(payload)
    .select(
      "id, public_key, private_jwk, vapid_subject, process_url, process_token, cron_enabled"
    )
    .single();

  if (saveError || !saved) {
    throw new Error(saveError?.message || "Push settings save failed.");
  }

  return saved as PushSettings;
}

function createVapidToken(
  endpoint: string,
  settings: PushSettings
) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlJson({
    typ: "JWT",
    alg: "ES256",
  });

  const payload = base64UrlJson({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: settings.vapid_subject,
  });

  const unsigned = `${header}.${payload}`;

  const key = createPrivateKey({
    key: settings.private_jwk,
    format: "jwk",
  });

  const signature = sign(
    "sha256",
    Buffer.from(unsigned),
    {
      key,
      dsaEncoding: "ieee-p1363",
    }
  ).toString("base64url");

  return `${unsigned}.${signature}`;
}

export class WebPushError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function sendEmptyWebPush(
  endpoint: string,
  settings: PushSettings
) {
  const token = createVapidToken(endpoint, settings);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "120",
      Urgency: "high",
      Authorization: `vapid t=${token}, k=${settings.public_key}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new WebPushError(
      `Push service ${response.status}: ${body || response.statusText}`,
      response.status
    );
  }

  return true;
}
