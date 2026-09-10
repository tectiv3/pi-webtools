/**
 * Type shim for impit's error classes.
 *
 * impit 0.14.x provides a classified error hierarchy (thrown by the wrapper entry via
 * `rethrowNativeError`), but the package's root entry does not re-export it at runtime and
 * ships no `errors.d.ts`. The classes live in `impit/errors.js` (CJS, resolvable as a
 * subpath because the package has no `exports` map), so we declare that module here with the
 * subset the port imports. Hierarchy mirrors impit's real `errors.js`.
 */
declare module 'impit/errors.js' {
    export class ImpitError extends Error {}
    export class TransportError extends ImpitError {}
    export class TimeoutError extends TransportError {}
    export class NetworkError extends TransportError {}
    export class ConnectError extends NetworkError {}
    export class ProtocolError extends TransportError {}
    export class DecodingError extends ImpitError {}
    export class UnsupportedProtocol extends TransportError {}
}
