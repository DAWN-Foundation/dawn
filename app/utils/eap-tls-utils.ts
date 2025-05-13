import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EAPTLSCredential, generateEAPTLSCredential, TLSVersion, CipherSuite } from './eap';

/**
 * Interface for certificate information
 */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  publicKeyAlgorithm: string;
}

/**
 * Calculate fingerprint (hash) of a certificate for unique identification
 * @param certPath Path to the certificate file
 * @param algorithm Hash algorithm to use (default: sha256)
 * @returns Certificate fingerprint as hex string
 */
export function calculateCertificateFingerprint(
  certPath: string, 
  algorithm = 'sha256'
): string {
  try {
    const certData = fs.readFileSync(certPath);
    const hash = crypto.createHash(algorithm);
    hash.update(certData);
    return hash.digest('hex');
  } catch (error) {
    throw new Error(`Failed to calculate certificate fingerprint: ${error.message}`);
  }
}

/**
 * Extract and verify basic certificate information
 * @param certPath Path to the certificate file
 * @returns Certificate information
 */
export function extractCertificateInfo(certPath: string): CertificateInfo {
  try {
    // In a real implementation, this would use OpenSSL bindings or a crypto library
    // to extract actual certificate information. This is a simplified placeholder.
    
    // For actual implementation, use:
    // - Node.js native crypto module for basic operations
    // - Or libraries like node-forge for more advanced X.509 certificate handling
    
    // Placeholder implementation
    return {
      subject: 'CN=example.com',
      issuer: 'CN=Example CA',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year validity
      fingerprint: calculateCertificateFingerprint(certPath),
      publicKeyAlgorithm: 'RSA',
    };
  } catch (error) {
    throw new Error(`Failed to extract certificate info: ${error.message}`);
  }
}

/**
 * Verify that a certificate and private key match
 * @param certPath Path to the certificate file
 * @param keyPath Path to the private key file
 * @returns True if the key matches the certificate
 */
export function verifyCertKeyPair(certPath: string, keyPath: string): boolean {
  try {
    // In a real implementation, this would verify that the public key in the
    // certificate corresponds to the provided private key.
    
    // This is a simplified placeholder that just checks both files exist
    return fs.existsSync(certPath) && fs.existsSync(keyPath);
  } catch (error) {
    throw new Error(`Failed to verify cert/key pair: ${error.message}`);
  }
}

/**
 * Generate a client EAP-TLS credential from certificate files
 * @param identity Client identity (typically username or email)
 * @param certPath Path to client certificate file
 * @param keyPath Path to private key file
 * @param caPath Optional path to CA certificate
 * @returns EAP-TLS credential object ready for serialization
 */
export function createEAPTLSCredentialFromFiles(
  identity: string,
  certPath: string,
  keyPath: string,
  caPath?: string,
): EAPTLSCredential {
  try {
    // Verify files exist
    if (!fs.existsSync(certPath)) {
      throw new Error(`Certificate file not found: ${certPath}`);
    }
    
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Private key file not found: ${keyPath}`);
    }
    
    if (caPath && !fs.existsSync(caPath)) {
      throw new Error(`CA certificate file not found: ${caPath}`);
    }
    
    // Verify certificate and key match
    if (!verifyCertKeyPair(certPath, keyPath)) {
      throw new Error('Certificate and private key do not match');
    }
    
    // Generate fingerprints for references
    const certFingerprint = calculateCertificateFingerprint(certPath);
    let caFingerprint = undefined;
    
    if (caPath) {
      caFingerprint = calculateCertificateFingerprint(caPath);
    }
    
    // Create EAP-TLS credential
    const credential = generateEAPTLSCredential(
      identity,
      certFingerprint,
      keyPath
    );
    
    // Set chain reference if CA certificate provided
    if (caFingerprint) {
      credential.chainRef = caFingerprint;
    }
    
    return credential;
  } catch (error) {
    throw new Error(`Failed to create EAP-TLS credential: ${error.message}`);
  }
}

/**
 * Get recommended EAP-TLS cipher suites based on security requirements
 * @param highSecurity Whether to use only the most secure ciphers
 * @returns Array of recommended cipher suites
 */
export function getRecommendedCipherSuites(highSecurity = false): CipherSuite[] {
  if (highSecurity) {
    // Only the strongest ciphers with 256-bit encryption
    return [
      CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
      CipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
    ];
  } else {
    // Balanced set of ciphers with good security and compatibility
    return [
      CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
      CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
      CipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
      CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
    ];
  }
} 