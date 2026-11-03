import Foundation
import CryptoKit
import Security

enum AzizanDeviceAuth {
    private static let service = "com.azizanvpnstudio.voice.device"
    private static let account = "ed25519-v1"

    enum AuthError: LocalizedError {
        case keychain(OSStatus)
        case invalidStoredKey
        case missingKey
        case invalidChallenge

        var errorDescription: String? {
            switch self {
            case .keychain(let status):
                return "Keychain error: \(status)"
            case .invalidStoredKey:
                return "Stored device key is invalid"
            case .missingKey:
                return "Device has not been registered"
            case .invalidChallenge:
                return "Invalid login challenge"
            }
        }
    }

    private static func readKey() throws -> Curve25519.Signing.PrivateKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw AuthError.keychain(status)
        }

        guard let data = result as? Data else {
            throw AuthError.invalidStoredKey
        }

        do {
            return try Curve25519.Signing.PrivateKey(
                rawRepresentation: data
            )
        } catch {
            throw AuthError.invalidStoredKey
        }
    }

    private static func getOrCreateKey() throws -> Curve25519.Signing.PrivateKey {
        if let existing = try readKey() {
            return existing
        }

        let key = Curve25519.Signing.PrivateKey()

        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: key.rawRepresentation,
            kSecAttrAccessible as String:
                kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemAdd(attributes as CFDictionary, nil)

        if status == errSecDuplicateItem {
            if let existing = try readKey() {
                return existing
            }
        }

        guard status == errSecSuccess else {
            throw AuthError.keychain(status)
        }

        return key
    }

    private static func encode(_ data: Data) -> String {
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func publicKey() throws -> String {
        let key = try getOrCreateKey()

        var spki = Data([
            0x30, 0x2a, 0x30, 0x05,
            0x06, 0x03, 0x2b, 0x65,
            0x70, 0x03, 0x21, 0x00
        ])

        spki.append(key.publicKey.rawRepresentation)
        return encode(spki)
    }

    static func signChallenge(_ challenge: String) throws -> String {
        guard challenge.range(
            of: "^[A-Za-z0-9_-]{43}$",
            options: .regularExpression
        ) != nil else {
            throw AuthError.invalidChallenge
        }

        guard let key = try readKey() else {
            throw AuthError.missingKey
        }

        let signature = try key.signature(
            for: Data(challenge.utf8)
        )

        return encode(signature)
    }
}
