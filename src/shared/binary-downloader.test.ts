/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
	cleanupArchive,
	downloadArchive,
	ensureCacheDir,
	ensureExecutable,
	getCachedBinaryPath,
} from "./binary-downloader"

const testDirs: string[] = []

function createTestDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "binary-downloader-test-"))
	testDirs.push(dir)
	return dir
}

afterEach(() => {
	for (const dir of testDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe("getCachedBinaryPath", () => {
	it("returns full path when binary exists in cache directory", () => {
		//#given
		const cacheDir = createTestDir()
		const binaryName = "my-tool"
		writeFileSync(join(cacheDir, binaryName), "binary-content")

		//#when
		const result = getCachedBinaryPath(cacheDir, binaryName)

		//#then
		expect(result).toBe(join(cacheDir, binaryName))
	})

	it("returns null when binary does not exist in cache directory", () => {
		//#given
		const cacheDir = createTestDir()
		const binaryName = "non-existent-tool"

		//#when
		const result = getCachedBinaryPath(cacheDir, binaryName)

		//#then
		expect(result).toBeNull()
	})

	it("returns null when cache directory does not exist", () => {
		//#given
		const cacheDir = join(tmpdir(), "binary-downloader-test-nonexistent-" + Date.now())
		const binaryName = "my-tool"

		//#when
		const result = getCachedBinaryPath(cacheDir, binaryName)

		//#then
		expect(result).toBeNull()
	})
})

describe("ensureCacheDir", () => {
	it("creates directory when it does not exist", () => {
		//#given
		const rootDir = createTestDir()
		const cacheDir = join(rootDir, "nested", "cache")
		expect(existsSync(cacheDir)).toBe(false)

		//#when
		ensureCacheDir(cacheDir)

		//#then
		expect(existsSync(cacheDir)).toBe(true)
	})

	it("does not throw when directory already exists", () => {
		//#given
		const cacheDir = createTestDir()
		expect(existsSync(cacheDir)).toBe(true)

		//#when
		const callEnsureCacheDir = () => ensureCacheDir(cacheDir)

		//#then
		expect(callEnsureCacheDir).not.toThrow()
		expect(existsSync(cacheDir)).toBe(true)
	})
})

describe("cleanupArchive", () => {
	it("deletes existing file", () => {
		//#given
		const dir = createTestDir()
		const archivePath = join(dir, "archive.tar.gz")
		writeFileSync(archivePath, "archive-data")
		expect(existsSync(archivePath)).toBe(true)

		//#when
		cleanupArchive(archivePath)

		//#then
		expect(existsSync(archivePath)).toBe(false)
	})

	it("does not throw when file does not exist", () => {
		//#given
		const dir = createTestDir()
		const archivePath = join(dir, "non-existent.tar.gz")

		//#when
		const callCleanup = () => cleanupArchive(archivePath)

		//#then
		expect(callCleanup).not.toThrow()
	})
})

describe("ensureExecutable", () => {
	it("sets file permissions to 755 on non-Windows platform", () => {
		//#given
		const dir = createTestDir()
		const binaryPath = join(dir, "my-tool")
		writeFileSync(binaryPath, "binary-content")
		chmodSync(binaryPath, 0o644)

		//#when
		ensureExecutable(binaryPath)

		//#then
		if (process.platform !== "win32") {
			const mode = statSync(binaryPath).mode & 0o777
			expect(mode).toBe(0o755)
		}
	})

	it("does not throw when file does not exist", () => {
		//#given
		const dir = createTestDir()
		const binaryPath = join(dir, "non-existent-tool")

		//#when
		const callEnsureExecutable = () => ensureExecutable(binaryPath)

		//#then
		expect(callEnsureExecutable).not.toThrow()
	})
})

describe("downloadArchive", () => {
	const originalFetch = globalThis.fetch
	let writeSpy: ReturnType<typeof spyOn>

	beforeEach(() => {
		writeSpy = spyOn(Bun, "write").mockResolvedValue(8)
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
		writeSpy.mockRestore()
	})

	it("fetches URL and writes response body to archive path", async () => {
		//#given
		const archivePath = "/tmp/test-archive.tar.gz"
		const downloadUrl = "https://example.com/tool.tar.gz"
		const fakeBuffer = new ArrayBuffer(8)
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				statusText: "OK",
				arrayBuffer: () => Promise.resolve(fakeBuffer),
			})
		) as typeof fetch

		//#when
		await downloadArchive(downloadUrl, archivePath)

		//#then
		expect(globalThis.fetch).toHaveBeenCalledWith(downloadUrl, { redirect: "follow" })
		expect(writeSpy).toHaveBeenCalledWith(archivePath, fakeBuffer)
	})

	it("throws with HTTP status and status text when response is not ok", async () => {
		//#given
		const archivePath = "/tmp/test-archive.tar.gz"
		const downloadUrl = "https://example.com/missing-tool.tar.gz"
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 404,
				statusText: "Not Found",
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
			})
		) as typeof fetch

		//#when
		let errorMessage = ""
		try {
			await downloadArchive(downloadUrl, archivePath)
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}

		//#then
		expect(errorMessage).toBe("HTTP 404: Not Found")
	})

	it("throws with HTTP status for server error responses", async () => {
		//#given
		const archivePath = "/tmp/test-archive.tar.gz"
		const downloadUrl = "https://example.com/broken-tool.tar.gz"
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
			})
		) as typeof fetch

		//#when
		let errorMessage = ""
		try {
			await downloadArchive(downloadUrl, archivePath)
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}

		//#then
		expect(errorMessage).toBe("HTTP 500: Internal Server Error")
	})
})
