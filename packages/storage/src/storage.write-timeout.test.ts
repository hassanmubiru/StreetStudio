import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Clock } from "@streetstudio/auth";
import {
  StorageRouter,
  type ObjectStream,
  type PutResult,
  type SignedTarget,
  type StorageProvider,
  type StorageFailureRecorder,
  type StorageWriteFailure,
} from "./storage.js";

/* -------------------------------------------------------------------------
 * Write timeout / abort handling (R9.5)
 *
 * A configured provider that does not acknowledge a write within the timeout,
 * or that returns a write failure, MUST have its write aborted; the router MUST
 * surface STORAGE_ERROR and record the failure with the provider identifier and
 * a timestamp. These tests inject a small `writeAckTimeoutMs` and a fixed clock
 * so the timeout path resolves quickly and timestamps are deterministic.
 * ---------------------------------------------------------------------- */

/** A fixed clock so recorded failure timestamps are deterministic. */
function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

/** A recorder that captures every failure handed to it for assertions. */
class CapturingRecorder implements StorageFailureRecorder {
  readonly recorded: StorageWriteFailure[] = [];

  record(failure: StorageWriteFailure): void {
    this.recorded.push(failure);
  }
}

/** A minimal byte stream stand-in; the router only routes the reference. */
function byteStream(): ObjectStream {
  return {} as ObjectStream;
}

/**
 * Behaviour options for the write-path provider double. `putBehaviour` controls
 * how `put` resolves: "never" leaves the write unacknowledged (exercising the
 * timeout), "reject" fails the write. Non-write methods are unused here.
 */
interface WriteProviderOptions {
  readonly id?: string;
  readonly putBehaviour: "never" | "reject";
}

class WriteProvider implements StorageProvider {
  readonly id: string;
  private readonly putBehaviour: "never" | "reject";

  constructor(options: WriteProviderOptions) {
    this.id = options.id ?? "write-provider";
    this.putBehaviour = options.putBehaviour;
  }

  put(_key: string, _data: ObjectStream): Promise<PutResult> {
    if (this.putBehaviour === "reject") {
      return Promise.reject(new Error("backend write rejected"));
    }
    // "never": a promise that never settles, so only the ack timeout can fire.
    return new Promise<PutResult>(() => {});
  }

  async get(_key: string): Promise<ObjectStream> {
    throw new Error("not used");
  }

  async signUploadTarget(_key: string, _ttlSeconds: number): Promise<SignedTarget> {
    throw new Error("not used");
  }

  async healthCheck(): Promise<void> {
    // Always healthy: these tests exercise the write path, not activation.
  }
}

/** Build an activated router wired with the given provider and recorder. */
async function activatedRouter(
  provider: StorageProvider,
  recorder: StorageFailureRecorder,
  timestampIso: string,
): Promise<StorageRouter> {
  const router = new StorageRouter({
    clock: fixedClock(timestampIso),
    failureRecorder: recorder,
    // Small ack timeout keeps the no-ack path fast.
    writeAckTimeoutMs: 20,
  });
  await router.activate(provider);
  return router;
}

describe("StorageRouter write timeout / abort handling (R9.5)", () => {
  it("aborts with STORAGE_ERROR and records a write-timeout when the write is not acknowledged", async () => {
    const recorder = new CapturingRecorder();
    const provider = new WriteProvider({ id: "slow", putBehaviour: "never" });
    const router = await activatedRouter(
      provider,
      recorder,
      "2024-01-01T00:00:00.000Z",
    );

    let thrown: unknown;
    try {
      await router.put("videos/a.mp4", byteStream());
      throw new Error("expected router.put to abort");
    } catch (err) {
      thrown = err;
    }

    // The write is aborted with a storage error surfaced to the caller.
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("STORAGE_ERROR");
    expect((thrown as AppError).details).toMatchObject({
      providerId: "slow",
      key: "videos/a.mp4",
      reason: "write-timeout",
    });

    // The failure is recorded exactly once with reason write-timeout.
    expect(recorder.recorded).toHaveLength(1);
    expect(recorder.recorded[0].reason).toBe("write-timeout");
  });

  it("aborts with STORAGE_ERROR and records a write-failure when the provider rejects", async () => {
    const recorder = new CapturingRecorder();
    const provider = new WriteProvider({ id: "flaky", putBehaviour: "reject" });
    const router = await activatedRouter(
      provider,
      recorder,
      "2024-01-01T00:00:00.000Z",
    );

    let thrown: unknown;
    try {
      await router.put("videos/b.mp4", byteStream());
      throw new Error("expected router.put to abort");
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("STORAGE_ERROR");
    expect((thrown as AppError).details).toMatchObject({
      providerId: "flaky",
      key: "videos/b.mp4",
      reason: "write-failure",
    });

    expect(recorder.recorded).toHaveLength(1);
    expect(recorder.recorded[0].reason).toBe("write-failure");
  });

  it("records the failure with the provider id and the clock's timestamp", async () => {
    const recorder = new CapturingRecorder();
    const provider = new WriteProvider({ id: "prov-42", putBehaviour: "reject" });
    const timestampIso = "2024-06-15T12:34:56.000Z";
    const router = await activatedRouter(provider, recorder, timestampIso);

    await expect(router.put("clips/c.mp4", byteStream())).rejects.toBeInstanceOf(
      AppError,
    );

    expect(recorder.recorded).toHaveLength(1);
    const failure = recorder.recorded[0];
    expect(failure.providerId).toBe("prov-42");
    expect(failure.key).toBe("clips/c.mp4");
    // Timestamp comes from the injected clock (deterministic).
    expect(failure.timestamp).toBe(timestampIso);
    // The recorded provider id also appears on the surfaced error details.
    await router.put("clips/c.mp4", byteStream()).catch((err: AppError) => {
      expect(err.details).toMatchObject({ providerId: "prov-42", timestamp: timestampIso });
    });
  });

  it("still surfaces STORAGE_ERROR to the caller when the failure recorder throws", async () => {
    const throwingRecorder: StorageFailureRecorder = {
      record() {
        throw new Error("recorder sink unavailable");
      },
    };
    const provider = new WriteProvider({ id: "prov", putBehaviour: "reject" });
    const router = new StorageRouter({
      clock: fixedClock("2024-01-01T00:00:00.000Z"),
      failureRecorder: throwingRecorder,
      writeAckTimeoutMs: 20,
    });
    await router.activate(provider);

    // A recorder failure must never mask the original storage error (R9.5).
    await expect(router.put("k", byteStream())).rejects.toMatchObject({
      code: "STORAGE_ERROR",
    });
  });
});
