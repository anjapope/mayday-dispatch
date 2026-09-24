import { createHash, createHmac, randomUUID } from "node:crypto";

export type DispatchMachineCredential =
  | { bearerToken: string; hmacSecret?: never }
  | { hmacSecret: string; bearerToken?: never };

export type DispatchRequestOptions = {
  correlationId?: string;
  requestId?: string;
  idempotencyKey?: string;
};

export type DispatchHttpTransportOptions = {
  baseUrl: string;
  applicationName: string;
  credential: DispatchMachineCredential;
  fetch?: typeof fetch;
};

export class DispatchHttpTransport {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: DispatchHttpTransportOptions) {
    this.fetchImplementation = options.fetch ?? fetch;
  }

  async send(
    path: string,
    method: string,
    body: unknown,
    requestOptions: DispatchRequestOptions = {},
  ): Promise<{ response: Response; json: unknown }> {
    const serializedBody = body === undefined ? "" : JSON.stringify(body);
    const requestId = requestOptions.requestId ?? randomUUID();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestOptions.correlationId ?? requestId,
      ...(requestOptions.idempotencyKey
        ? { "idempotency-key": requestOptions.idempotencyKey }
        : {}),
      ...this.authenticationHeaders(method, path, serializedBody),
    };
    const response = await this.fetchImplementation(new URL(path, this.options.baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : serializedBody,
    });
    return { response, json: await response.json() };
  }

  private authenticationHeaders(method: string, path: string, body: string): Record<string, string> {
    if ("bearerToken" in this.options.credential) {
      return { authorization: `Bearer ${this.options.credential.bearerToken}` };
    }
    const timestamp = Date.now().toString();
    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    const payload = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    return {
      "x-mayday-app": this.options.applicationName,
      "x-mayday-timestamp": timestamp,
      "x-mayday-signature": createHmac("sha256", this.options.credential.hmacSecret)
        .update(payload, "utf8")
        .digest("hex"),
    };
  }
}
