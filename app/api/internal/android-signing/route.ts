import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_ISSUER = "https://token.actions.githubusercontent.com";
const EXPECTED_AUDIENCE = "yashflow-android-signing";
const EXPECTED_REPOSITORY = "jaymaxx6702-arch/yashflow";
const EXPECTED_REF = "refs/heads/main";
const ALLOWED_WORKFLOW_PREFIXES = [
  "jaymaxx6702-arch/yashflow/.github/workflows/yashflow-android-apk.yml@",
  "jaymaxx6702-arch/yashflow/.github/workflows/yashflow-android-release.yml@",
];

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  repository?: string;
  ref?: string;
  workflow_ref?: string;
  event_name?: string;
};

type Jwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

function parseJsonPart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

function audienceMatches(aud: JwtPayload["aud"]) {
  if (typeof aud === "string") return aud === EXPECTED_AUDIENCE;
  return Array.isArray(aud) && aud.includes(EXPECTED_AUDIENCE);
}

async function verifyGithubOidc(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parseJsonPart<JwtHeader>(headerPart);
  const payload = parseJsonPart<JwtPayload>(payloadPart);

  if (header.alg !== "RS256" || !header.kid) return false;

  const jwksResponse = await fetch(
    "https://token.actions.githubusercontent.com/.well-known/jwks",
    { cache: "no-store" }
  );

  if (!jwksResponse.ok) return false;

  const jwks = (await jwksResponse.json()) as { keys?: Jwk[] };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);

  if (!jwk) return false;

  const publicKey = createPublicKey({
    key: jwk,
    format: "jwk",
  });

  const signatureValid = verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, "base64url")
  );

  if (!signatureValid) return false;

  const now = Math.floor(Date.now() / 1000);

  if (payload.iss !== EXPECTED_ISSUER) return false;
  if (!audienceMatches(payload.aud)) return false;
  if (!payload.exp || payload.exp <= now) return false;
  if (payload.nbf && payload.nbf > now + 30) return false;
  if (payload.repository !== EXPECTED_REPOSITORY) return false;
  if (payload.ref !== EXPECTED_REF) return false;
  if (
    !payload.workflow_ref ||
    !ALLOWED_WORKFLOW_PREFIXES.some((prefix) =>
      payload.workflow_ref?.startsWith(prefix)
    )
  ) {
    return false;
  }
  if (!payload.workflow_ref.endsWith("@refs/heads/main")) return false;

  return (
    payload.event_name === "push" ||
    payload.event_name === "workflow_dispatch"
  );
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token || !(await verifyGithubOidc(token))) {
      return NextResponse.json(
        { error: "Signing access denied." },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const keystoreBase64 =
      process.env.YASHFLOW_ANDROID_KEYSTORE_BASE64 || "";
    const storePassword =
      process.env.YASHFLOW_ANDROID_KEYSTORE_PASSWORD || "";
    const keyAlias =
      process.env.YASHFLOW_ANDROID_KEY_ALIAS || "";
    const keyPassword =
      process.env.YASHFLOW_ANDROID_KEY_PASSWORD || "";

    if (
      !keystoreBase64 ||
      !storePassword ||
      !keyAlias ||
      !keyPassword
    ) {
      return NextResponse.json(
        { error: "Android signing material is not configured." },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        keystoreBase64,
        storePassword,
        keyAlias,
        keyPassword,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error(
      "Android signing OIDC verification failed:",
      error instanceof Error ? error.message : "unknown error"
    );

    return NextResponse.json(
      { error: "Signing access denied." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
