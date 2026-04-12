import { describe, it, expect } from "bun:test"
import { tokenizeCommand } from "./tools"

describe("tokenizeCommand", () => {
  it("tokenizes a simple command into individual arguments", () => {
    //#given
    const cmd = "send-keys -t session ls"

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["send-keys", "-t", "session", "ls"])
  })

  it("keeps double-quoted argument as a single token without quotes", () => {
    //#given
    const cmd = 'send-keys -t session "echo hello"'

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["send-keys", "-t", "session", "echo hello"])
  })

  it("keeps single-quoted argument as a single token without quotes", () => {
    //#given
    const cmd = "send-keys -t session 'echo hello'"

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["send-keys", "-t", "session", "echo hello"])
  })

  it("handles backslash escape to join words outside quotes", () => {
    //#given
    const cmd = "send-keys -t session echo\\ hello"

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["send-keys", "-t", "session", "echo hello"])
  })

  it("treats backslash-escaped quote inside quotes as literal character", () => {
    //#given
    const cmd = 'send-keys "hello\\"world"'

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["send-keys", 'hello"world'])
  })

  it("collapses multiple spaces between arguments", () => {
    //#given
    const cmd = "a   b   c"

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["a", "b", "c"])
  })

  it("returns empty array for empty string", () => {
    //#given
    const cmd = ""

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual([])
  })

  it("trims leading and trailing spaces", () => {
    //#given
    const cmd = "  send-keys  "

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["send-keys"])
  })

  it("handles mixed single quotes and escaped double quotes", () => {
    //#given
    const cmd = "echo 'hello' \\\"world\\\""

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["echo", "hello", '"world"'])
  })

  it("pushes remaining token when quote is never closed", () => {
    //#given
    const cmd = "echo 'hello"

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["echo", "hello"])
  })

  it("discards trailing backslash with no following character", () => {
    //#given
    const cmd = "echo\\"

    //#when
    const result = tokenizeCommand(cmd)

    //#then
    expect(result).toEqual(["echo"])
  })
})
