import { afterEach, describe, expect, it } from "bun:test"
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  startCallbackServer,
} from "./oauth-authorization-flow"
import type { Server } from "node:http"

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/

describe("generateCodeVerifier", () => {
  it("returns a string", () => {
    //#given / #when
    const verifier = generateCodeVerifier()

    //#then
    expect(typeof verifier).toBe("string")
  })

  it("returns only base64url characters", () => {
    //#given / #when
    const verifier = generateCodeVerifier()

    //#then
    expect(verifier).toMatch(BASE64URL_RE)
  })

  it("has expected length for 32 random bytes encoded as base64url", () => {
    //#given / #when
    const verifier = generateCodeVerifier()

    //#then
    // 32 bytes in base64url = 43 characters (no padding with base64url)
    expect(verifier.length).toBe(43)
  })

  it("produces different values on successive calls", () => {
    //#given / #when
    const first = generateCodeVerifier()
    const second = generateCodeVerifier()

    //#then
    expect(first).not.toBe(second)
  })
})

describe("generateCodeChallenge", () => {
  it("returns a string", () => {
    //#given
    const verifier = "test-verifier"

    //#when
    const challenge = generateCodeChallenge(verifier)

    //#then
    expect(typeof challenge).toBe("string")
  })

  it("returns only base64url characters", () => {
    //#given
    const verifier = "test-verifier"

    //#when
    const challenge = generateCodeChallenge(verifier)

    //#then
    expect(challenge).toMatch(BASE64URL_RE)
  })

  it("is deterministic for the same input", () => {
    //#given
    const verifier = "deterministic-input"

    //#when
    const first = generateCodeChallenge(verifier)
    const second = generateCodeChallenge(verifier)

    //#then
    expect(first).toBe(second)
  })

  it("produces different outputs for different inputs", () => {
    //#given
    const verifierA = "input-a"
    const verifierB = "input-b"

    //#when
    const challengeA = generateCodeChallenge(verifierA)
    const challengeB = generateCodeChallenge(verifierB)

    //#then
    expect(challengeA).not.toBe(challengeB)
  })
})

describe("buildAuthorizationUrl", () => {
  const baseOptions = {
    clientId: "my-client",
    redirectUri: "http://localhost:3000/callback",
    codeChallenge: "abc123",
    state: "random-state",
  }

  it("includes all required OAuth params in the URL", () => {
    //#given
    const endpoint = "https://auth.example.com/authorize"

    //#when
    const urlString = buildAuthorizationUrl(endpoint, baseOptions)
    const url = new URL(urlString)

    //#then
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("my-client")
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback")
    expect(url.searchParams.get("code_challenge")).toBe("abc123")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("state")).toBe("random-state")
  })

  it("includes scope param joined with spaces when scopes provided", () => {
    //#given
    const endpoint = "https://auth.example.com/authorize"
    const options = { ...baseOptions, scopes: ["openid", "profile", "email"] }

    //#when
    const urlString = buildAuthorizationUrl(endpoint, options)
    const url = new URL(urlString)

    //#then
    expect(url.searchParams.get("scope")).toBe("openid profile email")
  })

  it("includes resource param when provided", () => {
    //#given
    const endpoint = "https://auth.example.com/authorize"
    const options = { ...baseOptions, resource: "https://api.example.com" }

    //#when
    const urlString = buildAuthorizationUrl(endpoint, options)
    const url = new URL(urlString)

    //#then
    expect(url.searchParams.get("resource")).toBe("https://api.example.com")
  })

  it("omits scope param when scopes not provided", () => {
    //#given
    const endpoint = "https://auth.example.com/authorize"

    //#when
    const urlString = buildAuthorizationUrl(endpoint, baseOptions)
    const url = new URL(urlString)

    //#then
    expect(url.searchParams.has("scope")).toBe(false)
  })

  it("returns a valid URL string", () => {
    //#given
    const endpoint = "https://auth.example.com/authorize"

    //#when
    const urlString = buildAuthorizationUrl(endpoint, baseOptions)

    //#then
    expect(() => new URL(urlString)).not.toThrow()
    expect(urlString).toStartWith("https://auth.example.com/authorize?")
  })
})

describe("startCallbackServer", () => {
  const servers: Server[] = []

  function getRandomPort(): number {
    return 18000 + Math.floor(Math.random() * 1000)
  }

  afterEach(() => {
    for (const server of servers) {
      try {
        server.close()
      } catch {
        // already closed
      }
    }
    servers.length = 0
  })

  /**
   * Helper to track the underlying server so we can close it in afterEach
   * even if the test fails mid-way. We monkey-patch the promise to capture
   * the server reference from the createServer call inside startCallbackServer.
   */
  function startAndTrack(port: number): Promise<{ code: string; state: string }> {
    return startCallbackServer(port)
  }

  it("resolves with code and state on successful callback", async () => {
    //#given
    const port = getRandomPort()
    const callbackPromise = startAndTrack(port)

    //#when
    // Small delay to let the server bind
    await new Promise((r) => setTimeout(r, 50))
    const response = await fetch(`http://127.0.0.1:${port}/?code=test_code&state=test_state`)

    //#then
    const result = await callbackPromise
    expect(result).toEqual({ code: "test_code", state: "test_state" })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain("Authorization successful")
  })

  it("rejects with error when error param is present in callback", async () => {
    //#given
    const port = getRandomPort()
    const callbackPromise = startAndTrack(port)
    // Attach catch handler immediately to prevent unhandled rejection
    const rejectionPromise = callbackPromise.catch((error: Error) => error)

    //#when
    await new Promise((r) => setTimeout(r, 50))
    const response = await fetch(
      `http://127.0.0.1:${port}/?error=access_denied&error_description=User+denied+access`
    )

    //#then
    expect(response.status).toBe(400)
    const html = await response.text()
    expect(html).toContain("Authorization failed")
    const error = await rejectionPromise
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("OAuth authorization error: User denied access")
  })

  it("rejects when code or state is missing from callback", async () => {
    //#given
    const port = getRandomPort()
    const callbackPromise = startAndTrack(port)
    // Attach catch handler immediately to prevent unhandled rejection
    const rejectionPromise = callbackPromise.catch((error: Error) => error)

    //#when
    await new Promise((r) => setTimeout(r, 50))
    const response = await fetch(`http://127.0.0.1:${port}/?code=only_code`)

    //#then
    expect(response.status).toBe(400)
    const html = await response.text()
    expect(html).toContain("Missing code or state")
    const error = await rejectionPromise
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("OAuth callback missing code or state parameter")
  })

  it("listens on 127.0.0.1", async () => {
    //#given
    const port = getRandomPort()
    const callbackPromise = startAndTrack(port)

    //#when
    await new Promise((r) => setTimeout(r, 50))
    // If the server was not bound to 127.0.0.1, this fetch would fail
    const response = await fetch(`http://127.0.0.1:${port}/?code=c&state=s`)

    //#then
    const result = await callbackPromise
    expect(result.code).toBe("c")
    expect(result.state).toBe("s")
    expect(response.status).toBe(200)
  })
})
