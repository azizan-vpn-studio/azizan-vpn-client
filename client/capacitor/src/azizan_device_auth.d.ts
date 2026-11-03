export {};

declare global {
  interface Window {
    azizanGetDevicePublicKey?: () => Promise<string>;
    azizanSignDeviceChallenge?: (challenge: string) => Promise<string>;
  }
}