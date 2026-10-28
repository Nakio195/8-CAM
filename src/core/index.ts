// Pure computational core: no DOM access, testable in Node.
export { APP_NAME, APP_VERSION } from "./version";
export { isZip, readZip, ZipError, type ZipEntry, type ZipErrorCode, type ZipSkipped } from "./zip";
