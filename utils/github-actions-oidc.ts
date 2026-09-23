import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

const EXPECTED_ISSUER = "https://token.actions.githubusercontent.com";
const EXPECTED_REPOSITORY = "jaymaxx6702-arch/yashflow";
const EXPECTED_REF = "refs/heads/main";

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
  return JSON.parse(
    Buffer.from(part, "base64url").toString("utf8")
  ) as T;
}

function audienceMatches(
  aud: JwtPayload["aud"],
  expectedAudience: string
) {
  if (typeof aud === "string") return aud === expectedAudience;

  return (
    Array.isArray(aud) &&
    aud.includes(expectedAudience)
  );
}

export async function verifyGithubActionsOidc(
  request: Request,
  options: {
    audience: string;
    workflowPaths: string[];
  }
) {
  try {
    const authorization =
      request.headers.get("authorization") || "";

    const token = authorization
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) return false;

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

    const jwks = (await jwksResponse.json()) as {
      keys?: Jwk[];
    };

    const jwk = jwks.keys?.find(
      (key) => key.kid === header.kid
    );

    if (!jwk) return false;

    const publicKey = createPublicKey({
      key: jwk,
      format: "jwk",
    });

    const validSignature = verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      publicKey,
      Buffer.from(signaturePart, "base64url")
    );

    if (!validSignature) return false;

    const now = Math.floor(Date.now() / 1000);

    if (payload.iss !== EXPECTED_ISSUER) return false;
    if (!audienceMatches(payload.aud, options.audience)) return false;
    if (!payload.exp || payload.exp <= now) return false;
    if (payload.nbf && payload.nbf > now + 30) return false;
    if (payload.repository !== EXPECTED_REPOSITORY) return false;
    if (payload.ref !== EXPECTED_REF) return false;

    const allowedWorkflow = options.workflowPaths.some(
      (path) =>
        payload.workflow_ref ===
        `${EXPECTED_REPOSITORY}/${path}@refs/heads/main`
    );

    if (!allowedWorkflow) return false;

    return (
      payload.event_name === "push" ||
      payload.event_name === "workflow_dispatch"
    );
  } catch {
    return false;
  }
}
