export type StatusCategory = "Informational" | "Success" | "Redirection" | "Client Error" | "Server Error";

export interface HttpStatus {
  code: number;
  name: string;
  category: StatusCategory;
  description: string;
  usage: string;
}

export function categoryFor(code: number): StatusCategory {
  if (code < 200) return "Informational";
  if (code < 300) return "Success";
  if (code < 400) return "Redirection";
  if (code < 500) return "Client Error";
  return "Server Error";
}

const raw: Array<[number, string, string, string]> = [
  [100, "Continue", "The server received the request headers and the client should send the body.", "Rare in JSON APIs. Used with Expect: 100-continue for large uploads."],
  [101, "Switching Protocols", "The server agrees to switch protocols as requested by the client.", "Response to a WebSocket upgrade handshake."],
  [102, "Processing", "The server has accepted the request but has not completed it yet.", "WebDAV. Prevents client timeouts on long operations."],
  [103, "Early Hints", "Preliminary headers sent before the final response.", "Lets browsers preload assets while the server prepares the page."],
  [200, "OK", "The request succeeded.", "Default for successful GET, PUT and PATCH. Return the resource in the body."],
  [201, "Created", "The request succeeded and a new resource was created.", "POST that creates a resource. Include a Location header and the new object."],
  [202, "Accepted", "The request was accepted for processing but is not complete.", "Async jobs and queues. Return a job ID or status URL to poll."],
  [203, "Non-Authoritative Information", "The response was modified by a proxy from the origin's 200 response.", "Rare. Transforming proxies."],
  [204, "No Content", "The request succeeded but there is no body to return.", "DELETE, or PUT/PATCH when you don't return the updated resource."],
  [205, "Reset Content", "The request succeeded; the client should reset the document view.", "Rare. Clearing a form after submission."],
  [206, "Partial Content", "The server is delivering part of the resource due to a Range header.", "Range requests: video streaming, resumable downloads."],
  [207, "Multi-Status", "Multiple status codes for multiple independent operations.", "WebDAV batch operations."],
  [208, "Already Reported", "Members of a binding have already been enumerated.", "WebDAV. Avoids repeating collections in PROPFIND."],
  [226, "IM Used", "The server fulfilled a GET with instance manipulations applied.", "Delta encoding. Very rare."],
  [300, "Multiple Choices", "The request has more than one possible response.", "Content negotiation. Rarely used in APIs."],
  [301, "Moved Permanently", "The resource has permanently moved to a new URL.", "Domain or path migrations. Clients and search engines cache this. May change POST to GET."],
  [302, "Found", "The resource temporarily resides at a different URL.", "Temporary redirects after login or form submission. May change POST to GET."],
  [303, "See Other", "The response can be found at another URL using GET.", "POST-redirect-GET pattern to avoid duplicate form submissions."],
  [304, "Not Modified", "The cached version is still valid; no body is sent.", "Conditional GET with ETag / If-None-Match or If-Modified-Since."],
  [305, "Use Proxy", "The resource must be accessed through a proxy.", "Deprecated for security reasons. Do not use."],
  [307, "Temporary Redirect", "Temporary redirect that preserves the request method and body.", "Use instead of 302 when POST must stay POST."],
  [308, "Permanent Redirect", "Permanent redirect that preserves the request method and body.", "Use instead of 301 when POST must stay POST, e.g. API endpoint moves."],
  [400, "Bad Request", "The server cannot process the request due to a client error.", "Malformed JSON, missing required fields, invalid parameters. Return field-level errors."],
  [401, "Unauthorized", "Authentication is required or has failed.", "Missing, expired or invalid token. Include a WWW-Authenticate header. Means 'unauthenticated'."],
  [402, "Payment Required", "Reserved for future use; sometimes used for billing limits.", "Some APIs use it when a quota or subscription is exhausted."],
  [403, "Forbidden", "The client is authenticated but not allowed to do this.", "Valid token but insufficient permissions or role. Don't downgrade to 401."],
  [404, "Not Found", "The requested resource does not exist.", "Unknown ID or route. Also used to hide the existence of resources the user can't see."],
  [405, "Method Not Allowed", "The HTTP method is not supported for this resource.", "e.g. DELETE on a read-only endpoint. Include an Allow header."],
  [406, "Not Acceptable", "No representation matches the Accept header.", "Content negotiation failures. Rare in JSON-only APIs."],
  [407, "Proxy Authentication Required", "The client must authenticate with the proxy first.", "Corporate proxies. Rare for app developers."],
  [408, "Request Timeout", "The server timed out waiting for the request.", "Slow clients or idle connections. Client may retry."],
  [409, "Conflict", "The request conflicts with the current state of the resource.", "Duplicate unique key (email already exists), version mismatch, optimistic locking failures."],
  [410, "Gone", "The resource existed but has been permanently removed.", "Deprecated API versions or deleted content, when you want clients to stop retrying."],
  [411, "Length Required", "The request must include a Content-Length header.", "Rare. Some upload endpoints."],
  [412, "Precondition Failed", "A precondition header (If-Match etc.) evaluated to false.", "Optimistic concurrency with ETags: the resource changed since the client read it."],
  [413, "Content Too Large", "The request body exceeds the server's limit.", "File uploads or payloads over the configured size limit."],
  [414, "URI Too Long", "The request URI is longer than the server will interpret.", "Huge query strings. Move data to a POST body."],
  [415, "Unsupported Media Type", "The request's Content-Type is not supported.", "Sending form data to a JSON-only endpoint, or an unsupported file type."],
  [416, "Range Not Satisfiable", "The requested byte range is invalid.", "Range requests past the end of the file."],
  [417, "Expectation Failed", "The Expect header could not be met.", "Rare. Expect: 100-continue handling."],
  [418, "I'm a teapot", "The server refuses to brew coffee because it is a teapot.", "April Fools' joke from RFC 2324. Occasionally used as an easter egg."],
  [421, "Misdirected Request", "The request was sent to a server that cannot produce a response.", "HTTP/2 connection reuse across hosts."],
  [422, "Unprocessable Content", "The request is well-formed but semantically invalid.", "Validation errors: syntactically fine JSON that fails business rules. Common alternative to 400."],
  [423, "Locked", "The resource is locked.", "WebDAV. Also used for locked accounts in some APIs."],
  [424, "Failed Dependency", "The request failed because a previous request failed.", "WebDAV batch operations."],
  [425, "Too Early", "The server is unwilling to process a request that might be replayed.", "TLS 1.3 early data. Rare."],
  [426, "Upgrade Required", "The client must switch to a different protocol.", "Forcing an upgrade to a newer protocol version."],
  [428, "Precondition Required", "The server requires the request to be conditional.", "Forcing clients to use If-Match to avoid lost updates."],
  [429, "Too Many Requests", "The client has sent too many requests in a given time.", "Rate limiting. Include Retry-After and rate limit headers."],
  [431, "Request Header Fields Too Large", "Headers are too large for the server to process.", "Oversized cookies or auth headers."],
  [451, "Unavailable For Legal Reasons", "Access is denied for legal reasons.", "Geo-blocking or content removed by legal demand."],
  [500, "Internal Server Error", "An unexpected condition prevented the server from fulfilling the request.", "Unhandled exceptions. Log the details server-side; return a generic message and a request ID."],
  [501, "Not Implemented", "The server does not support the functionality required.", "Unrecognised HTTP method or a stubbed endpoint."],
  [502, "Bad Gateway", "A gateway or proxy received an invalid response from the upstream server.", "Load balancer can't reach or gets garbage from the app server. Often seen during deploys."],
  [503, "Service Unavailable", "The server is temporarily unable to handle the request.", "Maintenance windows or overload. Include Retry-After. Health checks often return this when not ready."],
  [504, "Gateway Timeout", "A gateway or proxy did not get a timely response from upstream.", "Upstream request exceeded the proxy timeout. Consider async processing."],
  [505, "HTTP Version Not Supported", "The server does not support the HTTP version used.", "Rare."],
  [506, "Variant Also Negotiates", "Internal configuration error in content negotiation.", "Very rare."],
  [507, "Insufficient Storage", "The server cannot store the representation needed to complete the request.", "WebDAV. Disk-full situations."],
  [508, "Loop Detected", "The server detected an infinite loop while processing.", "WebDAV. Circular references."],
  [510, "Not Extended", "Further extensions are required to fulfil the request.", "Obsolete."],
  [511, "Network Authentication Required", "The client must authenticate to gain network access.", "Captive portals on Wi-Fi networks."],
];

export const httpStatusCodes: HttpStatus[] = raw.map(([code, name, description, usage]) => ({
  code,
  name,
  category: categoryFor(code),
  description,
  usage,
}));

export const statusCategories: StatusCategory[] = ["Informational", "Success", "Redirection", "Client Error", "Server Error"];

export function searchStatusCodes(query: string): HttpStatus[] {
  const q = query.trim().toLowerCase();
  if (!q) return httpStatusCodes;
  return httpStatusCodes.filter((s) => {
    if (/^\d+$/.test(q)) return String(s.code).startsWith(q);
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.usage.toLowerCase().includes(q)
    );
  });
}
