// Pure computational core: no DOM access, testable in Node.
export { APP_NAME, APP_VERSION } from "./version";
export { DEFAULT_ZIP_LIMITS, isZip, readZip, ZipError, type ZipEntry, type ZipErrorCode, type ZipLimits, type ZipSkipped } from "./zip";
